# Live Reindexing Design

**Date:** 2026-02-23
**Status:** Planned
**Effort:** Medium (~150-175 lines new, ~20 refactored)

---

## Problem

Prowl indexes a project on open and freezes the snapshot. When an AI coder (or the user) edits files, the knowledge graph, search index, file contents, and embeddings stay stale. MCP tools return outdated data. The file watcher detects changes but only triggers a 3-second visual highlight — nothing gets re-indexed.

**Current state of each layer after a file edit:**

| Layer | Live? | Notes |
|:------|:-----:|:------|
| Chokidar watcher | Yes | Detects write/add/remove |
| Node highlight (visual) | Yes | 3s glow on graph |
| `storedFileContents` | No | Frozen from initial load |
| BM25 keyword index | No | Frozen from initial load |
| KuzuDB graph | No | Frozen from initial load |
| Vector embeddings | No | Frozen from initial load |
| Communities / processes | No | Frozen from initial load |

**Impact:** Every MCP tool (`prowl_search`, `prowl_grep`, `prowl_read_file`, `prowl_impact`, `prowl_ask`, etc.) returns stale results after any edit.

---

## Solution

Wire chokidar events into a debounced batch updater that refreshes every data layer incrementally.

### Architecture

```
Chokidar (already working)
    |
    +-- file:write --+
    +-- file:add  ---+  IPC to renderer (existing: visual highlight)
    +-- file:remove -+
    |                    +----------------------------+
    +-- NEW: also ------>| LiveUpdater (worker)       |
         IPC to worker   | - debounce 800ms           |
                         | - batch changed paths      |
                         | - re-read file from disk   |
                         | - tree-sitter re-parse     |
                         | - graph patch (add/remove) |
                         | - BM25 rebuild             |
                         | - KuzuDB reload            |
                         | - embedding re-compute     |
                         +----------------------------+
```

---

## Event Flow

### Main Process (electron/main.ts)

On each chokidar event, read the file content from disk and send it to the renderer alongside the existing visual event:

```
file:write("src/auth.ts")
    |
    +-- send 'agent:file-activity' (existing: visual highlight)
    |
    +-- NEW: read file from disk
         |
         +-- send 'mcp:file-changed' {
               filepath: "src/auth.ts",
               type: "write",
               content: "<full source>"
             }
```

For `file:remove`: send `content: null`.
For `file:add`: same as write — read content, send to worker.

### Renderer Debounce (useAppState.tsx)

```
'mcp:file-changed' events arrive
    |
    v
pendingChanges Map<filepath, {type, content}>
    |  (accumulates for 800ms after last event)
    v  debounce fires
    |
    workerApi.liveUpdate(pendingChanges)
    |
    v  worker processes batch
    |
    done — MCP tools now return fresh data
```

**Why 800ms?** Chokidar already debounces at 100ms (`awaitWriteFinish`). The extra 800ms ensures rapid AI bursts (10-30 files in 2s) get batched into one update. Fast enough to feel live.

---

## Worker Update Pipeline

When `liveUpdate(changes)` fires in `ingestion.worker.ts`:

| Step | What | Time (10 files) | Blocking? |
|:-----|:-----|:---------------:|:---------:|
| 1 | Update `storedFileContents` map | ~0ms | No |
| 2 | Tree-sitter re-parse changed files, patch graph nodes/edges | ~50-200ms | Yes |
| 3 | Rebuild BM25 index (full, MiniSearch has no incremental API) | ~100ms | Yes |
| 4 | Reload KuzuDB (full, WASM has no incremental API) | ~200ms | Yes |
| 5 | Re-embed changed file chunks | ~500ms-2s | **Async** |
| 6 | Communities & processes | **Skipped** | — |

**Steps 1-4 (~300-500ms):** MCP tools return fresh data.
**Step 5 (async):** Semantic search catches up in background. Non-blocking.
**Step 6 (skipped):** Louvain clustering + process tracing is too expensive for live updates (~2-5s). Only runs on full reindex or snapshot restore. Existing clusters stay valid for small edits.

### Graph Patching (Step 2 detail)

Reuse the existing logic from `incremental-updater.ts`:

1. Remove all nodes where `filePath` matches a changed/deleted file
2. Remove all edges touching those nodes
3. For changed/added files: run tree-sitter parse (structure, imports, calls, heritage)
4. Insert new nodes and edges into the in-memory graph

This is already implemented in `incrementalUpdate()` — extract it into a shared function that both `incrementalUpdate()` and `liveUpdate()` call.

---

## Snapshot Strategy

### While Prowl is open
Live updater keeps everything fresh in memory. No snapshot writes during normal use.

### On app close (window close / quit)
Save a fresh snapshot to disk:
- graph, fileContents, BM25 data, embeddings, communities, processes
- Same format as current snapshot
- Includes git commit hash for where we left off

### On next open
Restore snapshot (instant), then:
```
git diff from saved commit -> HEAD
    |
    +-- No changes? -> Ready immediately
    |
    +-- Changes found? -> Run existing incrementalUpdate()
         (catches edits made while Prowl was closed)
         then live updater takes over
```

### Crash safety
Auto-save snapshot every 5 minutes of idle. On crash recovery:
```
Last auto-save (<=5min old) -> restore -> git diff catches gap -> live updater resumes
```

---

## Files to Change

### electron/main.ts (~30 lines)
- In existing `file:write`/`file:add` handlers: read file content from disk, send `mcp:file-changed` IPC event with content
- In `file:remove` handler: send `mcp:file-changed` with `content: null`
- Add `before-quit` handler to trigger snapshot save via IPC

### electron/preload.ts (~5 lines)
- Expose `onFileChanged` listener mapping `mcp:file-changed` IPC to renderer callback

### src/workers/ingestion.worker.ts (~80-100 lines)
- New `liveUpdate(changes: Map<string, {type, content}>)` method
  - Steps 1-5 from pipeline above
- New `saveSnapshot()` method (wraps existing snapshot serialization)
- Auto-save timer: save snapshot every 5 minutes if changes occurred since last save

### src/hooks/useAppState.tsx (~40 lines)
- Listen for `mcp:file-changed` events via `window.prowl.onFileChanged()`
- Accumulate changes in a `Map<string, {type, content}>`
- 800ms debounce timer: on fire, call `workerApi.liveUpdate(pendingChanges)` and clear map
- On app close: call `workerApi.saveSnapshot()`

### src/core/snapshot/incremental-updater.ts (~20 lines refactored)
- Extract per-file re-parse logic (remove old nodes, parse, insert new nodes) into a shared function
- Both `incrementalUpdate()` and the new `liveUpdate()` call this shared function
- No duplication

### No changes needed
- `src/core/search/bm25-index.ts` — `buildBM25Index()` already does full rebuild
- `src/core/kuzu/kuzu-adapter.ts` — `loadGraphToKuzu()` already does full reload
- `electron/watcher.ts` — already emits the right events
- `src/hooks/useAgentWatcher.ts` — visual highlighting continues working as-is

---

## What This Fixes

After implementation, every layer stays current:

| Layer | Before | After |
|:------|:------:|:-----:|
| `storedFileContents` | Stale | Live |
| BM25 keyword index | Stale | Live |
| KuzuDB graph | Stale | Live |
| Vector embeddings | Stale | Live (async) |
| Communities / processes | Stale | On reindex only |
| `prowl_read_file` | Returns old content | Returns current content |
| `prowl_grep` | Misses new code | Finds new code |
| `prowl_search` | Misses new symbols | Finds new symbols |
| `prowl_impact` | Missing new edges | Includes new edges |
| `prowl_ask` / `prowl_investigate` | Answers from stale data | Answers from current data |

---

## Edge Cases

**Rapid file creation (AI scaffolding 50 files):** 800ms debounce batches them. Worker processes all 50 in one pass. Worst case ~1-2s for the batch.

**File renamed:** Chokidar fires `remove` + `add`. Both land in same debounce batch. Old entry removed, new entry added.

**Binary files / ignored extensions:** Chokidar already ignores these (`.png`, `.wasm`, etc). No change needed.

**Worker busy with previous batch:** Queue the next batch. Process sequentially. No concurrent graph mutations.

**Large files (>1MB):** Same as initial indexing — tree-sitter handles it. Could add a size cap later if needed.

**Project not loaded yet:** Guard: if `storedFileContents` is null or worker not initialized, ignore events.
