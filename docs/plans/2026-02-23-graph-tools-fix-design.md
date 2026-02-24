# Graph Tools Fix Design

**Date:** 2026-02-23
**Status:** Planned
**Priority:** High — these bugs make graph traversal (Prowl's core differentiator) unreliable
**Effort:** Medium (~200-250 lines changed across 4 files)

---

## Context

Real-world feedback from an AI coder using Prowl MCP on a 499-node TypeScript project rated it 7/10. The grep and search tools carried the investigation. The graph tools — impact, explore, Cypher — failed on basic lookups. These are the exact failures, root causes, and fixes.

---

## Bug 1: Exported Constants Are Invisible to the Graph

### Symptom
```
prowl_impact(target: "workflowSchema", direction: "upstream")
→ "Could not find workflowSchema in the codebase"
```

`workflowSchema` is an exported `const` assigned to `z.object(...)`, used at 3 call sites. The graph has 499 nodes but can't find it.

### Root Cause
Tree-sitter queries in `src/core/ingestion/tree-sitter-queries.ts` only capture `const`/`let` when the value is an `arrow_function` or `function_expression`:

```typescript
// CAPTURED — becomes a Function node
const handler = () => { ... }
const process = function() { ... }

// NOT CAPTURED — invisible to the graph
const workflowSchema = z.object({ ... })
const DEFAULT_CONFIG = { timeout: 5000 }
const ROUTES = ["/api/users", "/api/posts"]
const logger = winston.createLogger(...)
```

This means exported constants, config objects, Zod schemas, class instances, regex patterns, and every non-function `const`/`let`/`var` assignment is missing from the graph.

### Fix
**File:** `src/core/ingestion/tree-sitter-queries.ts`

Add tree-sitter patterns to capture non-function const/let declarations as `CodeElement` nodes (a general-purpose node type that already exists in the schema):

```typescript
// Capture exported const/let declarations (non-function values)
(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @name))) @definition.const

// Capture top-level const/let declarations (non-function values)
// Only at module scope to avoid capturing loop variables, temporaries, etc.
(program
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: (_) @value)) @definition.const)
```

**File:** `src/core/ingestion/parsing-processor.ts`

The `CAPTURE_TO_LABEL` map already has `'definition.const': 'Const'` but there's no `Const` table in KuzuDB. Two options:

- **Option A (recommended):** Map `definition.const` → `CodeElement`. This table already exists in the schema and is designed for catch-all symbols.
- **Option B:** Create a new `Const` node table. More precise but adds schema migration complexity.

Go with Option A:

```typescript
const CAPTURE_TO_LABEL: Record<string, string> = {
  // ... existing entries ...
  'definition.const': 'CodeElement',  // was 'Const' which has no table
};
```

**Filtering:** To avoid noise, skip const declarations that are:
- Inside function bodies (only capture module-level)
- Destructuring assignments (`const { a, b } = ...`)
- Loop variables (`for (const x of ...)`)

The tree-sitter query scope (`program > lexical_declaration`) handles this naturally — it only matches top-level declarations.

### Expected Result
After fix, `workflowSchema` becomes a `CodeElement` node. `prowl_impact("workflowSchema", "upstream")` finds it and traces consumers via CALLS/IMPORTS edges.

### Impact
Every language gains better symbol coverage. TypeScript/JavaScript projects especially benefit — config objects, schema definitions, constants, and module-level variables all become graph nodes.

---

## Bug 2: `prowl_explore` Can't Handle File Paths

### Symptom
```
prowl_explore(target: "src/schemas/workflow.ts", type: "symbol")
→ { kind: "not_found" }
```

The file exists, Prowl indexed it, `prowl_search` returns it — but explore can't find it.

### Root Cause
When `type: "symbol"`, the query searches by `n.name` and `n.id`:

```typescript
MATCH (n) WHERE n.name = 'src/schemas/workflow.ts' OR n.id = 'src/schemas/workflow.ts'
```

But File nodes have `name: "workflow.ts"` (just the filename) and `id: "File:src/schemas/workflow.ts"`. The full path matches neither field. There's also no `type: "file"` option in `ExploreParams`.

### Fix
**File:** `src/mcp/tool-handlers.ts` — `explore` case (~20 lines)

Auto-detect file paths and search by `filePath` property:

```typescript
case 'explore': {
  const p = params as ExploreParams;
  const escaped = p.target.replace(/'/g, "''");

  // ... existing process and cluster resolution ...

  // Symbol / file resolution
  if (!p.type || p.type === 'symbol') {
    let rows: any[] = [];

    // If target looks like a file path, search by filePath first
    if (p.target.includes('/') || p.target.includes('.')) {
      rows = await api.runQuery(`
        MATCH (n) WHERE n.filePath IS NOT NULL
          AND (n.filePath = '${escaped}' OR n.filePath CONTAINS '${escaped}')
        RETURN n.id AS id, n.name AS name, n.filePath AS filePath, label(n) AS nodeType
        LIMIT 10
      `);
    }

    // If no file match (or target is a symbol name), search by name/id
    if (rows.length === 0) {
      rows = await api.runQuery(`
        MATCH (n) WHERE n.name = '${escaped}' OR n.id = '${escaped}'
        RETURN n.id AS id, n.name AS name, n.filePath AS filePath, label(n) AS nodeType
        LIMIT 10
      `);
    }

    if (rows.length > 0) {
      return { kind: 'symbol', results: rows };
    }
  }

  return { kind: 'not_found', target: p.target };
}
```

**File:** `src/mcp/types.ts`

No change needed to `ExploreParams` — the auto-detection handles file paths without a new type. Keep the interface simple.

### Expected Result
`prowl_explore("src/schemas/workflow.ts")` returns the File node plus all Function/Class/CodeElement nodes defined in that file (via the `filePath CONTAINS` match). The AI coder gets a full picture: what the file defines, what connects to it.

---

## Bug 3: IMPORTS Edges Empty in Cypher Queries

### Symptom
```cypher
MATCH (f:File)-[e:CodeEdge]->(t:File)
WHERE t.filePath = 'src/schemas/workflow.ts'
RETURN f.name, t.name
→ [] (empty)
```

The file is imported by 3 other files. The import processor creates File→File edges. But Cypher returns nothing.

### Root Cause
The import processor in `src/core/ingestion/import-processor.ts` creates edges with IDs like `IMPORTS:src/index.ts->src/schemas/workflow.ts`. These get added to the in-memory graph. But when loading into KuzuDB via CSV, the edge CSV generator may fail to include them due to:

1. **Edge type filtering in CSV generation** — the CSV generator at `src/core/kuzu/csv-generator.ts` may only include certain edge types
2. **Node ID mismatch** — the edge references `File:src/schemas/workflow.ts` but the File node might be stored with a slightly different ID format
3. **Edge direction** — KuzuDB's `CodeEdge` is a directed edge from `ANY` to `ANY`, so direction must match exactly

### Fix
**File:** `src/core/kuzu/csv-generator.ts` (~15 lines)

Add diagnostic logging (dev only) and verify edge generation:

```typescript
// In the edge CSV generator, ensure ALL edge types are included
function edgeCSV(graph: CodeGraph): string {
  const rows: string[] = ['from_id,to_id,type,confidence,reason'];
  const visited = new Set<string>();

  for (const rel of graph.relationships) {
    if (visited.has(rel.id)) continue;
    visited.add(rel.id);

    // Verify both source and target nodes exist in the graph
    const sourceExists = graph.nodes.some(n => n.id === rel.sourceId);
    const targetExists = graph.nodes.some(n => n.id === rel.targetId);
    if (!sourceExists || !targetExists) continue; // Skip dangling edges

    rows.push([
      csvQuote(rel.sourceId),
      csvQuote(rel.targetId),
      csvQuote(rel.type),
      String(rel.confidence ?? 1),
      csvQuote(rel.reason || ''),
    ].join(','));
  }
  return rows.join('\n');
}
```

**File:** `src/core/kuzu/kuzu-adapter.ts` (~5 lines)

After loading edges, run a verification query in dev mode:

```typescript
// After edge loading, verify IMPORTS edges exist
if (import.meta.env.DEV) {
  const importCount = await this.executeQuery(
    "MATCH ()-[e:CodeEdge]->() WHERE e.type = 'IMPORTS' RETURN COUNT(e) AS count"
  );
  console.log(`[prowl:kuzu] IMPORTS edges loaded: ${importCount[0]?.count ?? 0}`);
}
```

**File:** `src/core/ingestion/import-processor.ts` (~5 lines)

Add a guard: verify the target File node exists in the graph before creating the edge:

```typescript
const fromId = generateId('File', src.path);
const toId = generateId('File', target);

// Only create edge if both File nodes exist
if (!graph.hasNode(fromId) || !graph.hasNode(toId)) continue;

graph.addRelationship({ ... });
```

### Expected Result
After fix, `MATCH (f:File)-[e:CodeEdge]->(t:File) WHERE t.filePath = 'src/schemas/workflow.ts' AND e.type = 'IMPORTS'` returns the 3 importing files.

---

## Bug 4: `prowl_impact` on File Paths Returns Empty

### Symptom
```
prowl_impact(target: "src/schemas/workflow.ts", direction: "upstream")
→ { affected: [] }
```

The file is found (via `filePath CONTAINS`), but the impact query returns no affected nodes.

### Root Cause
The impact query at `src/mcp/tool-handlers.ts` line ~199:

```cypher
MATCH (affected)-[r:CodeEdge]->(target {id: 'File:src/schemas/workflow.ts'})
WHERE r.type IN ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS']
RETURN ...
```

This finds the File node, then looks for edges pointing TO it. This should work if IMPORTS edges are loaded correctly (Bug 3). But even with Bug 3 fixed, there's a second issue: **the query only finds direct edges to the exact node, not to symbols defined IN that file**.

If someone calls `workflowSchema.parse()` in `pipeline.ts`, the CALLS edge goes from `Function:pipeline.ts:runPipeline` to `CodeElement:src/schemas/workflow.ts:workflowSchema` — not to the File node. The impact query on the File misses these symbol-level edges.

### Fix
**File:** `src/mcp/tool-handlers.ts` — `impact` case (~25 lines)

When the target is a File, expand the query to include all symbols defined in that file:

```typescript
case 'impact': {
  const p = params as ImpactParams;
  const escaped = p.target.replace(/'/g, "''");
  const dir = p.direction || 'upstream';

  // Step 1: Find the target node(s)
  // If target contains '/', treat as file path — find the File AND all symbols in it
  let targetIds: string[] = [];

  if (p.target.includes('/')) {
    const fileNodes = await api.runQuery(`
      MATCH (n) WHERE n.filePath IS NOT NULL AND n.filePath CONTAINS '${escaped}'
      RETURN n.id AS id
      LIMIT 50
    `);
    targetIds = fileNodes.map(r => r.id);
  } else {
    const symbolNodes = await api.runQuery(`
      MATCH (n) WHERE n.name = '${escaped}'
      RETURN n.id AS id
      LIMIT 10
    `);
    targetIds = symbolNodes.map(r => r.id);
  }

  if (targetIds.length === 0) {
    return { error: `Could not find "${p.target}" in the codebase.` };
  }

  // Step 2: Query impact for ALL matched nodes at once
  const idList = targetIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
  const relTypes = (p.relationTypes || ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS'])
    .map(t => `'${t}'`).join(', ');

  const query = dir === 'upstream'
    ? `MATCH (affected)-[r:CodeEdge]->(target)
       WHERE target.id IN [${idList}] AND r.type IN [${relTypes}]
       RETURN DISTINCT affected.id AS id, affected.name AS name,
              label(affected) AS nodeType, affected.filePath AS filePath, r.type AS edgeType
       LIMIT 100`
    : `MATCH (target)-[r:CodeEdge]->(affected)
       WHERE target.id IN [${idList}] AND r.type IN [${relTypes}]
       RETURN DISTINCT affected.id AS id, affected.name AS name,
              label(affected) AS nodeType, affected.filePath AS filePath, r.type AS edgeType
       LIMIT 100`;

  const affected = await api.runQuery(query);
  return { target: p.target, direction: dir, affected };
}
```

### Expected Result
`prowl_impact("src/schemas/workflow.ts", "upstream")` now finds:
- Files that IMPORT this file (File→File IMPORTS edges)
- Symbols that CALL functions/constants defined in this file (Symbol→Symbol CALLS edges)
- Any symbol that EXTENDS/IMPLEMENTS types from this file

All in one query. The AI coder gets the full blast radius.

---

## Bonus: Improve Cypher Tool Description

### Symptom
AI coder tried `MATCH (f:File)-[:DEFINES]->(s)` — got "Table DEFINES does not exist." The tool description lists DEFINES as an edge type, but it's a `type` property on `CodeEdge`, not a separate table.

### Fix
**File:** `electron/mcp-server/index.ts` — prowl_cypher description (~5 lines)

Update the description to be explicit about syntax:

```typescript
'prowl_cypher',
`Run a Cypher query against the knowledge graph.

Node tables: File, Folder, Function, Class, Interface, Method, CodeElement
Edge table: CodeEdge (single table — filter by type property)

IMPORTANT SYNTAX:
  CORRECT: MATCH (a)-[e:CodeEdge]->(b) WHERE e.type = 'IMPORTS'
  WRONG:   MATCH (a)-[:IMPORTS]->(b)  -- IMPORTS is not a table name

Edge types (filter with e.type): CONTAINS, DEFINES, IMPORTS, CALLS, EXTENDS, IMPLEMENTS
Node properties: name, filePath, startLine, endLine, content, isExported
Edge properties: type, confidence, reason

RULES:
- Never return whole nodes — always project properties: RETURN f.name, f.filePath
- WITH + ORDER BY must include LIMIT
- Use label(n) to get the node type (File, Function, Class, etc.)

Examples:
  Files importing X: MATCH (f:File)-[e:CodeEdge]->(t:File) WHERE t.filePath CONTAINS 'X' AND e.type = 'IMPORTS' RETURN f.filePath
  Functions in file:  MATCH (n) WHERE n.filePath = 'src/foo.ts' AND label(n) <> 'File' RETURN n.name, label(n)
  Call graph:         MATCH (a)-[e:CodeEdge]->(b) WHERE e.type = 'CALLS' RETURN a.name, b.name LIMIT 20`
```

---

## Files Changed Summary

| File | Lines | What |
|:-----|:-----:|:-----|
| `src/core/ingestion/tree-sitter-queries.ts` | ~15 | Add const/let capture patterns for non-function values |
| `src/core/ingestion/parsing-processor.ts` | ~5 | Map `definition.const` → `CodeElement` |
| `src/mcp/tool-handlers.ts` | ~60 | Fix explore (file path detection) + impact (file expansion) |
| `src/core/kuzu/csv-generator.ts` | ~15 | Add dangling edge guard, dev logging |
| `src/core/ingestion/import-processor.ts` | ~5 | Guard against edges to non-existent nodes |
| `electron/mcp-server/index.ts` | ~20 | Improve Cypher tool description with correct syntax |
| **Total** | **~120** | |

---

## Testing Plan

### Bug 1 — Const capture
1. Index a project with `const schema = z.object(...)` exports
2. Verify `prowl_search("schema")` returns the const as a CodeElement node
3. Verify `prowl_impact("schema", "upstream")` finds consumers

### Bug 2 — Explore file paths
1. `prowl_explore("src/schemas/workflow.ts")` → returns File + all symbols in file
2. `prowl_explore("workflowSchema")` → returns the CodeElement node
3. `prowl_explore("nonexistent")` → returns not_found

### Bug 3 — IMPORTS edges
1. Index a project with known import chains
2. Run `MATCH (f:File)-[e:CodeEdge]->(t:File) WHERE e.type = 'IMPORTS' RETURN COUNT(e)`
3. Verify count matches expected import count
4. Query a specific file's importers → non-empty result

### Bug 4 — File impact
1. `prowl_impact("src/schemas/workflow.ts", "upstream")` → returns importing files + calling symbols
2. `prowl_impact("src/schemas/workflow.ts", "downstream")` → returns files/symbols this file depends on
3. Compare results with manual grep for validation

### Bonus — Cypher description
1. AI coder reads tool description → uses `WHERE e.type = 'IMPORTS'` syntax (not `[:IMPORTS]`)
2. Example queries in description all execute successfully

---

## Expected Outcome

After these fixes, the same investigation that scored 7/10 should score 9/10:

| Tool | Before | After |
|:-----|:------:|:-----:|
| `prowl_impact("workflowSchema")` | "Could not find" | Returns 3 consumer files |
| `prowl_explore("src/schemas/workflow.ts")` | not_found | Returns file + all exports + connections |
| Cypher IMPORTS query | Empty | Returns import edges |
| `prowl_impact("src/schemas/workflow.ts")` | Empty | Returns importers + callers |
| `prowl_grep` | Worked | Still works |
| `prowl_search` | Worked | Still works, now also returns const symbols |

The graph tools become the reliable relationship traversal layer they're meant to be. Grep becomes the fallback, not the primary tool.
