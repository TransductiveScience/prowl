# Prowl vs GitNexus — Provenance Audit

**Date:** 2026-02-23
**Prowl:** `/Users/neur0map/prowl/prowl` (Electron desktop app, v0.4.2)
**GitNexus:** `/Users/neur0map/prowl/GitNexus/gitnexus-web/src/` (Vercel web app)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Prowl total source files | ~105 |
| Files traceable to GitNexus | ~65 |
| Exact byte-identical copies | 3 |
| Near-copies (naming/comments only) | ~22 |
| Refactored (same algorithm, different structure) | ~18 |
| Heavily modified (recognizable origin, significant new code) | ~22 |
| Prowl-original files (no GitNexus counterpart) | ~40 |

---

## Systematic Renames (applied across ALL files)

| GitNexus | Prowl |
|----------|-------|
| `KnowledgeGraph` | `CodeGraph` |
| `PipelineProgress` | `IndexingProgress` |
| `PipelineResult` | `IndexingResult` |
| `IngestionWorkerApi` | `IndexerWorkerApi` |
| `CodeRelation` | `CodeEdge` |
| `leiden` (vendor/leiden/) | `louvain` (lib/louvain.ts) |
| `COMMUNITY_COLORS` | `MODULE_PALETTE` |
| `getCommunityColor` | `getModuleColor` |
| `EMBEDDABLE_LABELS` | `VECTORIZABLE_TYPES` |
| `createGraphRAGAgent` | `buildCodeAgent` |
| `createGraphRAGTools` | `buildAnalysisTools` |
| `CodebaseContext` | `ProjectContext` |
| `buildCodebaseContext` | `buildProjectContext` |
| `BASE_SYSTEM_PROMPT` | `SYSTEM_PROMPT` |
| `HybridSearchResult` | `SearchHit` |
| `knowledgeGraphToGraphology` | `toSigmaGraph` |
| `gitnexus-llm-settings` | `prowl-llm-settings` |
| `gitnexus.codePanelWidth` | `prowl.codePanelWidth` |

---

## 1. Byte-Identical Files (3)

| File | Notes |
|------|-------|
| `src/vite-env.d.ts` | Vite boilerplate |
| `tsconfig.json` | Same project references |
| `tsconfig.app.json` | Same compiler options |

---

## 2. Core Ingestion Pipeline (15 files) — NEAR-COPY

All 15 files are functionally equivalent. Same algorithms, data structures, config values.

| File | Prowl Lines | GitNexus Lines | Status | Differences |
|------|------------|---------------|--------|-------------|
| `ast-cache.ts` | 49 | 47 | Near-copy | Named internal functions vs inline object return. `treeStore`/`capacity` vs `cache`/`maxSize`. |
| `call-processor.ts` | 268 | 314 | Near-copy | Identical algorithm. Extracted helpers at top vs inlined. `CodeGraph` vs `KnowledgeGraph`. |
| `cluster-enricher.ts` | 210 | 245 | Near-copy | Same enrichment logic. `composePrompt`/`decodeResponse` vs `buildEnrichmentPrompt`/`parseEnrichmentResponse`. `labelModulesBatch` vs `enrichClustersBatch`. |
| `community-processor.ts` | 270 | 354 | Near-copy | Both use undirected graphology + community detection. `louvain` vs `leiden` (same API). `MODULE_PALETTE` vs `COMMUNITY_COLORS`. |
| `entry-point-scoring.ts` | 205 | 281 | Near-copy | Identical scoring algorithm. `PENALTY_PATTERNS`/`POSITIVE_PATTERNS` vs `UTILITY_PATTERNS`/`ENTRY_POINT_PATTERNS`. Same multipliers. |
| `framework-detection.ts` | 224 | 243 | Refactored | Same rules/multipliers. Prowl uses data-driven `PathRule[]` array; GitNexus uses `if/return` chain. |
| `heritage-processor.ts` | 160 | 154 | Near-copy | Same inheritance extraction. Prowl extracts `resolveSymbol`/`resolveExternalSymbol` helpers. |
| `import-processor.ts` | 187 | 236 | Near-copy | Same import resolution. `PROBE_SUFFIXES`/`toConcreteFile` vs inline `extensions`/`resolveImportPath`. |
| `parsing-processor.ts` | 209 | 256 | Near-copy | Same parsing logic. `CAPTURE_LABEL_TABLE` dictionary vs inline `if/else if` chain. |
| `pipeline.ts` | 325 | 304 | Refactored | Same 9-phase pipeline. Prowl uses separate named functions per phase; GitNexus inlines everything. |
| `process-processor.ts` | 332 | 409 | Near-copy | Same BFS-based process detection. Different helper names but same algorithm. |
| `structure-processor.ts` | 47 | 48 | Near-copy | Identical tree-building logic. Minor formatting differences. |
| `symbol-table.ts` | 73 | 79 | Near-copy | Same dual-index table. Prowl uses composite key `"filePath::symbolName"`; GitNexus uses nested `Map`. |
| `tree-sitter-queries.ts` | 315 | 330 | Near-copy | Same S-expression queries for all 9 languages. Only comment text differs. |
| `utils.ts` | 40 | 30 | Refactored | Same `getLanguageFromFilename`. Prowl uses `EXTENSION_MAP` dictionary; GitNexus uses `if/endsWith` chain. |

---

## 3. Core Non-Ingestion Modules (20 files)

### Embeddings (5 files)

| File | Status | Differences |
|------|--------|-------------|
| `embeddings/embedder.ts` | Refactored | Consolidated state into single object, extracted helpers. Same algorithm. |
| `embeddings/embedding-pipeline.ts` | Refactored | `prepareBatchTexts` vs `generateBatchEmbeddingTexts`. Prowl deduplicates nodes by ID, uses `Promise.all`. |
| `embeddings/index.ts` | Near-copy | Comment style only. Same exports. |
| `embeddings/text-generator.ts` | Refactored | `TextProducer` lookup table vs separate generator functions with `switch` dispatch. Same output. |
| `embeddings/types.ts` | Near-copy | `VECTORIZABLE_TYPES` vs `EMBEDDABLE_LABELS`. Same shape. |

### Graph (2 files)

| File | Status | Differences |
|------|--------|-------------|
| `graph/graph.ts` | Refactored | `createCodeGraph` vs `createKnowledgeGraph`. `Record<string,GraphNode>` vs `Map`. Same interface. |
| `graph/types.ts` | Near-copy | `CodeGraph` vs `KnowledgeGraph`. Property order differs. Same fields. |

### KuzuDB (3 files)

| File | Status | Differences |
|------|--------|-------------|
| `kuzu/csv-generator.ts` | Refactored | Different helper names (`quoteField` vs `escapeCSVField`). Same CSV format. |
| `kuzu/kuzu-adapter.ts` | Heavily modified | Prowl (455 lines) adds Electron WASM loading (`resolveWasmUrl`, `loadWasmBytes` via XHR), `QUOTED_TABLE_NAMES`. GitNexus (527 lines) is browser-only. Significant structural divergence. |
| `kuzu/schema.ts` | Refactored | `CodeEdge` vs `CodeRelation`. Prowl adds extra `FROM` clauses. Same overall schema. |

### LLM (8 files in Prowl, 6 in GitNexus)

| File | Status | Differences |
|------|--------|-------------|
| `llm/agent.ts` | Heavily modified | `buildCodeAgent` (async, dynamic imports, Groq support, `recursionLimit: 100`) vs `createGraphRAGAgent` (sync, static imports, 6 providers, `recursionLimit: 50`). Different system prompt wording. |
| `llm/context-builder.ts` | Refactored | `ProjectContext`/`buildProjectContext` vs `CodebaseContext`/`buildCodebaseContext`. Prowl uses custom tree renderer; GitNexus uses indentation-only. |
| `llm/cypher-translator.ts` | **Prowl-only** | NL-to-Cypher translation. No GitNexus counterpart. |
| `llm/index.ts` | Refactored | Different exports reflecting naming convention and Prowl-only features. |
| `llm/oauth-service.ts` | **Prowl-only** | OAuth integration. No GitNexus counterpart. |
| `llm/settings-service.ts` | Heavily modified | Prowl adds `initSecureStorage` with Electron safeStorage (OS keychain), encrypted API key migration, Groq provider. GitNexus uses plain localStorage only. |
| `llm/tools.ts` | Refactored | `buildAnalysisTools` (1409 lines) vs `createGraphRAGTools` (1503 lines). Same 7 tools, different structure. `CodeEdge` vs `CodeRelation` in Cypher queries. |
| `llm/types.ts` | Refactored | Prowl adds `GroqConfig`, `KUZU_SCHEMA_REF` uses `CodeEdge`. 7 providers vs 6. |

### Search (3 files)

| File | Status | Differences |
|------|--------|-------------|
| `search/bm25-index.ts` | Refactored | `NOISE_TERMS` vs `STOP_WORDS`. `tokenise` function vs inline tokenizer. Same algorithm. |
| `search/hybrid-search.ts` | Refactored | `SearchHit` vs `HybridSearchResult`. Same RRF algorithm (k=60). |
| `search/index.ts` | Near-copy | Export name difference only. |

### Tree-Sitter (1 file)

| File | Status | Differences |
|------|--------|-------------|
| `tree-sitter/parser-loader.ts` | Heavily modified | Prowl adds dynamic import wrapper, `resolveWasmUrl` for Electron `file://` protocol, XHR-based WASM loading. GitNexus uses static import with hardcoded `/wasm/` paths. |

---

## 4. Components (26 Prowl, 17 GitNexus)

**Total lines:** Prowl 8,161 / GitNexus 5,421

All 17 GitNexus components have a Prowl counterpart. No files are identical.

### Matching Components (17)

| Component | Status | Key Differences |
|-----------|--------|-----------------|
| `CodeReferencesPanel.tsx` | Heavily modified | Prowl extracts `SelectedFileViewer`, `CitationCard` subcomponents. `glass` styling vs `bg-surface/95 backdrop-blur-md`. |
| `DropZone.tsx` | Heavily modified | Prowl adds "Folder" tab (Electron-only). `cloneMode` toggle. Compact `glass` style vs large rounded-3xl cards. |
| `EmbeddingStatus.tsx` | Refactored | Prowl extracts render functions per state + `ProgressBar`/`StatusPill` subcomponents. |
| `FileTreePanel.tsx` | Heavily modified | `FsNode`/`kind`/`subtree`/`fullPath` vs `TreeNode`/`type`/`children`/`path`. Prowl adds `LanguageIcon`. |
| `GraphCanvas.tsx` | Heavily modified | `toSigmaGraph` vs `knowledgeGraphToGraphology`. Prowl adds AI highlights toggle, `refreshGraph` with community re-computation. Different control placement. |
| `Header.tsx` | Heavily modified | "Prowl" with `◇` vs "GitNexus" with gradient icon. Prowl adds `onRefreshGraph`, `onOpenRoadmap`, `onOpenFolder`. Draggable app region. |
| `LoadingOverlay.tsx` | Heavily modified | Prowl has `useMatrixLine` hook (ASCII animation). `IndexingProgress` vs `PipelineProgress`. Terminal aesthetic vs modern/polished. |
| `MarkdownRenderer.tsx` | Refactored | Prowl extracts `GroundingLink`/`ExternalLink`/`buildComponentMap`. Adds `INLINE_PATH_REGEX` for auto-linking file paths. Uses `ToolCallPill` vs `ToolCallCard`. |
| `MermaidDiagram.tsx` | Refactored | Prowl uses `useCallback` + `requestAnimationFrame` vs `setTimeout` debounce. Different mermaid themes. |
| `ProcessesPanel.tsx` | Heavily modified | Prowl groups by entry file; GitNexus groups by process type. Different section headers and icons. |
| `ProcessFlowModal.tsx` | Heavily modified | Prowl has `StepPill` component for non-Mermaid rendering. Dark monochrome theme vs cyan/slate theme. |
| `QueryFAB.tsx` | Heavily modified | Prowl adds NL-to-Cypher translation (`translateNLToCypher`). `CodeEdge` vs `CodeRelation` in presets. |
| `RightPanel.tsx` | Heavily modified | Prowl has 3 tabs (chat/processes/agent) vs 2. Resizable panel width. `ToolCallPill` + `ToolCallGroup` collapsing. |
| `SettingsPanel.tsx` | Heavily modified | Prowl adds OAuth integration, secure storage, provider logos. Most divergent file (~69KB diff). |
| `StatusBar.tsx` | Heavily modified | Prowl adds terminal toggle, agent watcher state. GitNexus adds "Sponsor" link. |
| `ToolCallCard.tsx` | Refactored | Same behavior. Prowl extracts `resolveStatusAppearance`/`buildArgsDisplay`/`renderExpandedBody`. |
| `WebGPUFallbackDialog.tsx` | Refactored | Prowl renders as bottom sheet; GitNexus as centered modal with animated emoji. |

### Prowl-Only Components (9)

| Component | Description |
|-----------|-------------|
| `AgentPanel.tsx` | Agent/agentic mode panel (Electron-only) |
| `CodeEditorPanel.tsx` | Integrated Monaco code editor panel |
| `ContextBridge.tsx` | Context bridging for agent mode |
| `LanguageIcon.tsx` | Language-specific file type icons |
| `RoadmapPanel.tsx` | Project roadmap panel |
| `SplashScreen.tsx` | Splash/loading screen on cold start |
| `TerminalDrawer.tsx` | Integrated xterm.js terminal drawer |
| `ToolCallPill.tsx` | Compact pill-style tool call display |
| `UpdateBanner.tsx` | App update notification banner |

---

## 5. Hooks, Lib, Services, Config, Types, Workers

### Hooks (4 Prowl, 3 GitNexus)

| File | Status | Differences |
|------|--------|-------------|
| `useAppState.tsx` | Heavily modified | Adds `ViewMode: 'startup'`, agent watcher, snapshot persistence, lazy worker, secure storage, OAuth. |
| `useSettings.ts` | Near-copy | Prowl adds `useMemo` wrapper. |
| `useSigma.ts` | Refactored | Prowl adds `animateNodes`, `NodeTriangleProgram`. Renames display types. Major reducer refactor. |
| `useAgentWatcher.ts` | **Prowl-only** | File watcher integration for agent mode. |

### Lib (6 Prowl, 4 GitNexus)

| File | Status | Differences |
|------|--------|-------------|
| `constants.ts` | Heavily modified | Completely different color palettes. Prowl: earthy tones. GitNexus: vibrant Tailwind. Different node sizes. `MODULE_PALETTE` vs `COMMUNITY_COLORS`. |
| `graph-adapter.ts` | Refactored | `toSigmaGraph` vs `knowledgeGraphToGraphology`. Grid-based cluster layout vs golden-angle spiral. `EDGE_PALETTE` Map vs `EDGE_STYLES` object. |
| `mermaid-generator.ts` | Refactored | Extracted helpers. Apple-dark styling vs slate/Tailwind styling. |
| `utils.ts` | Near-copy | `const SEPARATOR = ':'` + string concatenation vs template literal. |
| `file-icons.ts` | **Prowl-only** | File type icon mappings. |
| `louvain.ts` | **Prowl-only** | Community detection algorithm (replaces GitNexus's `vendor/leiden/`). |

### Services (3 Prowl, 2 GitNexus)

| File | Status | Differences |
|------|--------|-------------|
| `git-clone.ts` | Refactored | Prowl dynamic imports for CJS/ESM interop. No CORS proxy (Electron). `createVirtualFS`/`collectFiles`/`purgeDirectory` vs `initFS`/`readAllFiles`/`removeDirectory`. |
| `zip.ts` | Refactored | Prowl dynamic JSZip import. Frequency-map heuristic vs strict `allSameRoot`. |
| `persistent-clone.ts` | **Prowl-only** | Persistent git clone service. |

### Config (2 files each — matching)

| File | Status | Differences |
|------|--------|-------------|
| `ignore-service.ts` | Refactored | Prowl uses typed `Matcher[]` array with pre-compiled RegExp. GitNexus uses flat `Set<string>` objects. Same coverage. |
| `supported-languages.ts` | Near-copy | Prowl adds `LANGUAGE_DISPLAY_NAMES`. Same enum values. |

### Root `src/` Files

| File | Status | Differences |
|------|--------|-------------|
| `App.tsx` | Heavily modified | Prowl adds `SplashScreen`, `RoadmapPanel`, `CodeEditorPanel`, `TerminalDrawer`, `UpdateBanner`, keyboard shortcuts, folder loading, snapshot detect, auto-restore. |
| `main.tsx` | Near-copy | CJS/ESM interop for Buffer import. |
| `index.css` | Heavily modified | Completely different color schemes. Prowl: Apple "liquid glass" (warm grays, blue accent). GitNexus: deep-dark purple-accent theme. Prowl adds `@font-face` and `.glass` utilities. |

### Types (2 files each)

| File | Status | Differences |
|------|--------|-------------|
| `types/kuzu-wasm.d.ts` | Refactored | Prowl adds `KuzuModule`/`VirtualFS` interfaces. Same type shapes. |
| `types/pipeline.ts` | Refactored | All types renamed: `Pipeline*` to `Indexing*`. Adds `IndexingStats`, `isPipelineComplete` helper. |

### Workers (1 file each)

| File | Status | Differences |
|------|--------|-------------|
| `ingestion.worker.ts` | Heavily modified | Prowl lazy-imports all modules, adds `warmEmbeddingModel`, snapshot methods (`restoreFromSnapshot`, `incrementalUpdate`, `collectAndSerialize`), `setProjectPath`. `IndexerWorkerApi` vs `IngestionWorkerApi`. |

---

## 6. Build & Config Files

| File | Status | Differences |
|------|--------|-------------|
| `tsconfig.json` | Identical | — |
| `tsconfig.app.json` | Identical | — |
| `tsconfig.node.json` | Near-identical | `include` differs: `electron.vite.config.ts` + `electron/**/*.ts` vs `vite.config.ts` |
| `package.json` | Different | Name/version/scripts differ. Prowl-only deps: `@monaco-editor/react`, `@xterm/*`, `chokidar`, `msgpackr`, `node-pty`, `ws`, `electron`, `electron-builder`, `electron-vite`. GitNexus-only: `@vercel/node`. ~80% shared deps. |
| `vite config` | Very different | `electron.vite.config.ts` (3-target build, custom ESM plugin, manual chunks, 50+ explicit optimizeDeps) vs `vite.config.ts` (single-target, CORS headers). Same core plugins. |
| `index.html` | Near-identical | Title and font loading differ. |
| `.gitignore` | Different | Prowl comprehensive; GitNexus minimal. |
| `electron-builder.yml` | **Prowl-only** | Electron packaging config. |
| `vercel.json` | **GitNexus-only** | Cross-Origin Isolation headers. |

---

## 7. Prowl-Only Systems (no GitNexus counterpart)

### Electron Main Process (11 files)

| File | Purpose |
|------|---------|
| `electron/main.ts` | Electron main process entry |
| `electron/preload.ts` | Preload script (contextBridge) |
| `electron/watcher.ts` | File system watcher |
| `electron/terminal-manager.ts` | PTY terminal management |
| `electron/process-file-monitor.ts` | Process file monitoring |
| `electron/diff-detector.ts` | File diff detection |
| `electron/claude-log-watcher.ts` | Claude log file watcher |
| `electron/snapshot-io.ts` | Snapshot read/write to disk |
| `electron/parser.ts` | Native file parser |
| `electron/openclaw-ws-client.ts` | WebSocket client |
| `electron/update-checker.ts` | Auto-update checker |

### Snapshot Persistence (8 files)

| File | Purpose |
|------|---------|
| `core/snapshot/collector.ts` | Collect graph state for serialization |
| `core/snapshot/incremental-updater.ts` | Incremental graph updates |
| `core/snapshot/index.ts` | Module exports |
| `core/snapshot/kuzu-restorer.ts` | Restore KuzuDB from snapshot |
| `core/snapshot/manifest-builder.ts` | Build file manifest |
| `core/snapshot/restorer.ts` | Restore graph from snapshot |
| `core/snapshot/serializer.ts` | Binary serialization (msgpackr) |
| `core/snapshot/types.ts` | Snapshot type definitions |

### CJS/ESM Wrapper Shims (18 files)

All in `src/utils/` — small wrappers for CJS libraries to work in Electron's ESM renderer.

### Custom Rendering

| File | Purpose |
|------|---------|
| `src/rendering/node-triangle/index.ts` | Custom sigma.js triangle node program |

---

## 8. Code Style Patterns

| Aspect | Prowl | GitNexus |
|--------|-------|----------|
| Helper functions | Extracted to top of file as named functions | Inlined in main function or placed after |
| Comments | Terse, `/* */` style | Verbose JSDoc with `@param`/`@returns`, emoji section headers |
| Module loading | Lazy `await import()` with CJS fallback | Static `import` at top |
| Parallelism | `Promise.all` for independent operations | Sequential `for` loops |
| Logging | `[prowl:module]` prefix, no emoji | Emoji-heavy debug logs |
| Semicolons | Consistent | Sometimes omitted |
| Loops | `while` + manual index, `for...of` | `forEach`, arrow functions |
| Color palette | Earthy warm tones (gold, teal, rust) | Vibrant Tailwind colors (purple, blue, yellow) |
| UI theme | Apple "liquid glass" (translucent overlays, blue accent) | Deep-dark purple-accent with vibrant gradients |

---

## 9. Highest-Risk Areas for Independence

**Priority 1 — Near-copies (minimal differentiation):**
- All 15 `core/ingestion/` files
- `core/embeddings/index.ts`, `core/embeddings/types.ts`
- `core/graph/types.ts`
- `core/search/index.ts`
- `hooks/useSettings.ts`
- `lib/utils.ts`
- `src/main.tsx`

**Priority 2 — Refactored but same algorithm:**
- `core/embeddings/embedder.ts`, `embedding-pipeline.ts`, `text-generator.ts`
- `core/graph/graph.ts`
- `core/kuzu/csv-generator.ts`, `schema.ts`
- `core/llm/tools.ts`, `context-builder.ts`, `types.ts`
- `core/search/bm25-index.ts`, `hybrid-search.ts`
- All matching `components/` files

**Priority 3 — Already heavily modified (lower risk):**
- `core/kuzu/kuzu-adapter.ts` (Electron-specific WASM loading)
- `core/llm/agent.ts`, `settings-service.ts` (OAuth, secure storage, Groq)
- `core/tree-sitter/parser-loader.ts` (Electron `file://` support)
- `workers/ingestion.worker.ts` (snapshot persistence)
- `App.tsx`, `index.css`, most components
