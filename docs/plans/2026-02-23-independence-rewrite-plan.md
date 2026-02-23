# Prowl Independence Rewrite Plan

**Date:** 2026-02-23
**Goal:** Fully disassociate Prowl from GitNexus — zero identical code, zero identical comments, zero traceable provenance.
**Approach:** Hybrid (C) — full rewrite for small files, deep refactor for large files.
**Reference:** `docs/gitnexus-provenance-audit.md`

---

## Phase 0 — Safety Net

**Before any code changes:**

- [ ] Create branch `independence/full-rewrite`
- [ ] Build the app, confirm clean compilation
- [ ] Run the app, confirm working baseline
- [ ] Commit audit doc as starting point

**Verification gate:** App launches and indexes a test project successfully.

---

## Phase 1 — Near-Copy Purge (22 files, highest risk)

### Strategy A — Full Rewrite (files <100 lines)

Write from scratch. Same functionality, completely new code.

| # | File | Lines | Rewrite Approach |
|---|------|-------|------------------|
| 1 | `core/ingestion/ast-cache.ts` | 49 | LRU class instead of plain object |
| 2 | `core/ingestion/structure-processor.ts` | 47 | Recursive tree builder |
| 3 | `core/ingestion/utils.ts` | 40 | Map-based extension lookup |
| 4 | `core/ingestion/symbol-table.ts` | 73 | Class with different indexing strategy |
| 5 | `core/embeddings/index.ts` | ~10 | New barrel export |
| 6 | `core/embeddings/types.ts` | ~20 | Different type shape |
| 7 | `core/graph/types.ts` | ~30 | New interface definitions |
| 8 | `core/search/index.ts` | ~5 | New barrel export |
| 9 | `hooks/useSettings.ts` | ~30 | Rewrite hook |
| 10 | `lib/utils.ts` | ~40 | New utility implementations |
| 11 | `src/main.tsx` | ~15 | New entry point |

### Strategy B — Deep Refactor (files >100 lines)

Restructure significantly: different control flow, helpers, data patterns.

| # | File | Lines | Refactor Approach |
|---|------|-------|-------------------|
| 1 | `core/ingestion/call-processor.ts` | 268 | Class-based processor, different traversal |
| 2 | `core/ingestion/cluster-enricher.ts` | 210 | Restructure prompt building, new batch strategy |
| 3 | `core/ingestion/community-processor.ts` | 270 | Different graph construction flow |
| 4 | `core/ingestion/entry-point-scoring.ts` | 205 | Configurable scoring pipeline |
| 5 | `core/ingestion/framework-detection.ts` | 224 | Weighted rule engine |
| 6 | `core/ingestion/heritage-processor.ts` | 160 | Different traversal for inheritance chains |
| 7 | `core/ingestion/import-processor.ts` | 187 | Different resolution structure |
| 8 | `core/ingestion/parsing-processor.ts` | 209 | Different dispatch pattern |
| 9 | `core/ingestion/pipeline.ts` | 325 | New phase orchestration pattern |
| 10 | `core/ingestion/process-processor.ts` | 332 | Different BFS implementation |
| 11 | `core/ingestion/tree-sitter-queries.ts` | 315 | Rewrite all comments, reformat S-expressions |

### Phase 1 Rules

- Every comment rewritten (no identical comment text)
- Every internal variable/function name changed
- Different code organization (helper placement, export style)
- Build verification after each file
- Commit after each successful batch of 2-3 files

---

## Phase 2 — Refactored Files (~18 files)

Already structurally different but share algorithms. Push differentiation further.

### Core Modules (11 files)

| # | File | Action |
|---|------|--------|
| 1 | `core/embeddings/embedder.ts` | Class with private methods, different batching |
| 2 | `core/embeddings/embedding-pipeline.ts` | Restructure pipeline stages |
| 3 | `core/embeddings/text-generator.ts` | Builder pattern for text generation |
| 4 | `core/graph/graph.ts` | Different factory pattern with validation |
| 5 | `core/kuzu/csv-generator.ts` | Stream-style CSV building |
| 6 | `core/kuzu/schema.ts` | Reorganize schema definition |
| 7 | `core/llm/context-builder.ts` | Different context assembly strategy |
| 8 | `core/llm/tools.ts` | Factory pattern for tools, new descriptions |
| 9 | `core/llm/types.ts` | Reorganize type hierarchy |
| 10 | `core/search/bm25-index.ts` | New tokenizer, different stop-word handling |
| 11 | `core/search/hybrid-search.ts` | Different fusion parameterization |

### Components (7 files)

| # | File | Action |
|---|------|--------|
| 1 | `EmbeddingStatus.tsx` | Rewrite render logic, new subcomponents |
| 2 | `FileTreePanel.tsx` | Scrub comments, rename internals |
| 3 | `MarkdownRenderer.tsx` | Rewrite component map builder |
| 4 | `MermaidDiagram.tsx` | Different rendering lifecycle |
| 5 | `ToolCallCard.tsx` | Rewrite status resolution |
| 6 | `WebGPUFallbackDialog.tsx` | New layout approach |
| 7 | `ProcessFlowModal.tsx` | Scrub comments, rename internals |

### Config & Services (4 files)

| # | File | Action |
|---|------|--------|
| 1 | `config/ignore-service.ts` | Scrub comments, rename helpers |
| 2 | `config/supported-languages.ts` | Different structure |
| 3 | `services/git-clone.ts` | Scrub comments, rename internals |
| 4 | `services/zip.ts` | Different extraction approach |

### Phase 2 Rules

- All comments rewritten
- Build verification after each batch of 3-4 files
- Commit after each batch

---

## Phase 3 — Heavily Modified Polish (~22 files)

Already significantly different. Comment and string scrub only — no algorithmic changes.

### What Gets Scrubbed

- Any comment text matching GitNexus verbatim
- String literals, error messages, log messages that match
- Variable names still recognizably GitNexus-derived
- JSDoc blocks copied wholesale

### Files

**Core:**
- `core/kuzu/kuzu-adapter.ts`
- `core/llm/agent.ts`
- `core/llm/settings-service.ts`
- `core/tree-sitter/parser-loader.ts`
- `workers/ingestion.worker.ts`

**Root:**
- `App.tsx`
- `index.css`

**Components (10+):**
- `CodeReferencesPanel.tsx`
- `DropZone.tsx`
- `GraphCanvas.tsx`
- `Header.tsx`
- `LoadingOverlay.tsx`
- `ProcessesPanel.tsx`
- `QueryFAB.tsx`
- `RightPanel.tsx`
- `SettingsPanel.tsx`
- `StatusBar.tsx`

### Phase 3 Rules

- No algorithmic changes (low regression risk)
- Side-by-side comment comparison with GitNexus
- Build verification after full phase
- Single commit for phase

---

## Phase 4 — Config & Boilerplate (3 files)

Eliminate "byte-identical" classification.

| File | Action |
|------|--------|
| `src/vite-env.d.ts` | Add Prowl-specific type augmentation |
| `tsconfig.json` | Add distinguishing config or header comment |
| `tsconfig.app.json` | Minor config differentiation |

---

## Phase 5 — Global Scrub

Automated full-repo sweep:

1. **Case-insensitive grep for "gitnexus"** across all source files
2. **Comment fingerprinting** — extract all Prowl comments, compare against GitNexus for exact matches
3. **String literal comparison** — error messages, log strings, UI text
4. **Import block comparison** — verify no file has identical import structure
5. **README / docs cleanup** — remove any GitNexus references

Spot-fix anything caught by the sweep.

---

## Phase 6 — Final Audit

Full provenance re-audit using same methodology as original:

1. Re-run all comparison agents (ingestion, core, components, hooks/lib/services, config)
2. Re-classify every file: EXACT COPY / NEAR-COPY / REFACTORED / HEAVILY MODIFIED / PROWL-ORIGINAL
3. **Target:** Zero EXACT COPY, zero NEAR-COPY
4. Generate new audit document with before/after comparison table
5. Flag and fix anything missed

---

## Execution Order & Verification

```
Phase 0  (Safety net)
  |
Phase 1  (Near-copies — highest risk, most changes)
  |-- Build + manual test after each batch
  |
Phase 2  (Refactored — medium risk)
  |-- Build + manual test after each batch
  |
Phase 3  (Heavily modified — comment scrub, low risk)
  |-- Build after full phase
  |
Phase 4  (Config — trivial)
  |
Phase 5  (Global scrub — automated sweep)
  |-- Build after fixes
  |
Phase 6  (Final audit — verification only)
```

**Total files touched:** ~65
**Estimated commits:** 15-20 (batched by area)
**Risk mitigation:** Dedicated branch, build after every batch, full audit at end
