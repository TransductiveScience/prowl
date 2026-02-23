/**
 * DDL definitions for the KuzuDB graph store.
 * Declares per-element node tables, the polymorphic edge table,
 * and the HNSW vector-search table.
 */

/* ── Node table roster ───────────────────────────────── */

export const NODE_TABLES = [
  'File', 'Folder', 'Function', 'Class', 'Interface', 'Method', 'CodeElement', 'Community', 'Process',
  'Struct', 'Enum', 'Macro', 'Typedef', 'Union', 'Namespace', 'Trait', 'Impl',
  'TypeAlias', 'Const', 'Static', 'Property', 'Record', 'Delegate', 'Annotation', 'Constructor', 'Template', 'Module'
] as const;
export type NodeTableName = typeof NODE_TABLES[number];

/* ── Edge table constants ────────────────────────────── */

export const EDGE_TABLE_NAME = 'CodeEdge';

export const REL_TYPES = ['CONTAINS', 'DEFINES', 'IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'MEMBER_OF', 'STEP_IN_PROCESS'] as const;
export type RelType = typeof REL_TYPES[number];

/* ── Vector store table name ─────────────────────────── */

export const VECTOR_TABLE = 'CodeEmbedding';

/* ── DDL generator for generic code-element tables ───── */

function codeElementDDL(tableName: string): string {
  return [
    `CREATE NODE TABLE \`${tableName}\` (`,
    '  id STRING,',
    '  name STRING,',
    '  filePath STRING,',
    '  startLine INT64,',
    '  endLine INT64,',
    '  content STRING,',
    '  PRIMARY KEY (id)',
    ')',
  ].join('\n');
}

/* ── Core node table DDL ─────────────────────────────── */

export const FILE_SCHEMA = `
CREATE NODE TABLE File (
  id STRING,
  name STRING,
  filePath STRING,
  content STRING,
  PRIMARY KEY (id)
)`;

export const FOLDER_SCHEMA = `
CREATE NODE TABLE Folder (
  id STRING,
  name STRING,
  filePath STRING,
  PRIMARY KEY (id)
)`;

export const FUNCTION_SCHEMA = `
CREATE NODE TABLE Function (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  isExported BOOLEAN,
  content STRING,
  PRIMARY KEY (id)
)`;

export const CLASS_SCHEMA = `
CREATE NODE TABLE Class (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  isExported BOOLEAN,
  content STRING,
  PRIMARY KEY (id)
)`;

export const INTERFACE_SCHEMA = `
CREATE NODE TABLE Interface (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  isExported BOOLEAN,
  content STRING,
  PRIMARY KEY (id)
)`;

export const METHOD_SCHEMA = `
CREATE NODE TABLE Method (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  isExported BOOLEAN,
  content STRING,
  PRIMARY KEY (id)
)`;

export const CODE_ELEMENT_SCHEMA = `
CREATE NODE TABLE CodeElement (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  isExported BOOLEAN,
  content STRING,
  PRIMARY KEY (id)
)`;

/* ── Community and process node DDL ──────────────────── */

export const COMMUNITY_SCHEMA = `
CREATE NODE TABLE Community (
  id STRING,
  label STRING,
  heuristicLabel STRING,
  keywords STRING[],
  description STRING,
  enrichedBy STRING,
  cohesion DOUBLE,
  symbolCount INT32,
  PRIMARY KEY (id)
)`;

export const PROCESS_SCHEMA = `
CREATE NODE TABLE Process (
  id STRING,
  label STRING,
  heuristicLabel STRING,
  processType STRING,
  stepCount INT32,
  communities STRING[],
  entryPointId STRING,
  terminalId STRING,
  PRIMARY KEY (id)
)`;

/* ── Extended language element DDL ────────────────────── */

export const STRUCT_SCHEMA = codeElementDDL('Struct');
export const ENUM_SCHEMA = codeElementDDL('Enum');
export const MACRO_SCHEMA = codeElementDDL('Macro');
export const TYPEDEF_SCHEMA = codeElementDDL('Typedef');
export const UNION_SCHEMA = codeElementDDL('Union');
export const NAMESPACE_SCHEMA = codeElementDDL('Namespace');
export const TRAIT_SCHEMA = codeElementDDL('Trait');
export const IMPL_SCHEMA = codeElementDDL('Impl');
export const TYPE_ALIAS_SCHEMA = codeElementDDL('TypeAlias');
export const CONST_SCHEMA = codeElementDDL('Const');
export const STATIC_SCHEMA = codeElementDDL('Static');
export const PROPERTY_SCHEMA = codeElementDDL('Property');
export const RECORD_SCHEMA = codeElementDDL('Record');
export const DELEGATE_SCHEMA = codeElementDDL('Delegate');
export const ANNOTATION_SCHEMA = codeElementDDL('Annotation');
export const CONSTRUCTOR_SCHEMA = codeElementDDL('Constructor');
export const TEMPLATE_SCHEMA = codeElementDDL('Template');
export const MODULE_SCHEMA = codeElementDDL('Module');

/* ── Polymorphic edge table DDL ──────────────────────── */

export const RELATION_SCHEMA = `
CREATE REL TABLE ${EDGE_TABLE_NAME} (
  FROM File TO File,
  FROM File TO Folder,
  FROM File TO Function,
  FROM File TO Class,
  FROM File TO Interface,
  FROM File TO Method,
  FROM File TO CodeElement,
  FROM File TO \`Struct\`,
  FROM File TO \`Enum\`,
  FROM File TO \`Macro\`,
  FROM File TO \`Typedef\`,
  FROM File TO \`Union\`,
  FROM File TO \`Namespace\`,
  FROM File TO \`Trait\`,
  FROM File TO \`Impl\`,
  FROM File TO \`TypeAlias\`,
  FROM File TO \`Const\`,
  FROM File TO \`Static\`,
  FROM File TO \`Property\`,
  FROM File TO \`Record\`,
  FROM File TO \`Delegate\`,
  FROM File TO \`Annotation\`,
  FROM File TO \`Constructor\`,
  FROM File TO \`Template\`,
  FROM File TO \`Module\`,
  FROM Folder TO Folder,
  FROM Folder TO File,
  FROM Function TO Function,
  FROM Function TO Method,
  FROM Function TO Class,
  FROM Function TO Community,
  FROM Function TO \`Macro\`,
  FROM Function TO \`Struct\`,
  FROM Function TO \`Template\`,
  FROM Function TO \`Enum\`,
  FROM Function TO \`Namespace\`,
  FROM Function TO \`TypeAlias\`,
  FROM Function TO \`Module\`,
  FROM Function TO \`Impl\`,
  FROM Function TO Interface,
  FROM Function TO \`Constructor\`,
  FROM Class TO Method,
  FROM Class TO Function,
  FROM Class TO Class,
  FROM Class TO Interface,
  FROM Class TO Community,
  FROM Class TO \`Template\`,
  FROM Class TO \`TypeAlias\`,
  FROM Class TO \`Struct\`,
  FROM Class TO \`Enum\`,
  FROM Class TO \`Constructor\`,
  FROM Method TO Function,
  FROM Method TO Method,
  FROM Method TO Class,
  FROM Method TO Community,
  FROM Method TO \`Template\`,
  FROM Method TO \`Struct\`,
  FROM Method TO \`TypeAlias\`,
  FROM Method TO \`Enum\`,
  FROM Method TO \`Macro\`,
  FROM Method TO \`Namespace\`,
  FROM Method TO \`Module\`,
  FROM Method TO \`Impl\`,
  FROM Method TO Interface,
  FROM Method TO \`Constructor\`,
  FROM \`Template\` TO \`Template\`,
  FROM \`Template\` TO Function,
  FROM \`Template\` TO Method,
  FROM \`Template\` TO Class,
  FROM \`Template\` TO \`Struct\`,
  FROM \`Template\` TO \`TypeAlias\`,
  FROM \`Template\` TO \`Enum\`,
  FROM \`Template\` TO \`Macro\`,
  FROM \`Template\` TO Interface,
  FROM \`Template\` TO \`Constructor\`,
  FROM \`Module\` TO \`Module\`,
  FROM CodeElement TO Community,
  FROM Interface TO Community,
  FROM Interface TO Function,
  FROM Interface TO Method,
  FROM Interface TO Class,
  FROM Interface TO Interface,
  FROM Interface TO \`TypeAlias\`,
  FROM Interface TO \`Struct\`,
  FROM Interface TO \`Constructor\`,
  FROM \`Struct\` TO Community,
  FROM \`Struct\` TO \`Trait\`,
  FROM \`Struct\` TO Function,
  FROM \`Struct\` TO Method,
  FROM \`Enum\` TO Community,
  FROM \`Macro\` TO Community,
  FROM \`Macro\` TO Function,
  FROM \`Macro\` TO Method,
  FROM \`Module\` TO Function,
  FROM \`Module\` TO Method,
  FROM \`Typedef\` TO Community,
  FROM \`Union\` TO Community,
  FROM \`Namespace\` TO Community,
  FROM \`Trait\` TO Community,
  FROM \`Impl\` TO Community,
  FROM \`Impl\` TO \`Trait\`,
  FROM \`Impl\` TO \`Enum\`,
  FROM \`Impl\` TO \`Struct\`,
  FROM \`Impl\` TO Function,
  FROM \`Impl\` TO Method,
  FROM \`TypeAlias\` TO Community,
  FROM \`Const\` TO Community,
  FROM \`Static\` TO Community,
  FROM \`Property\` TO Community,
  FROM \`Record\` TO Community,
  FROM \`Delegate\` TO Community,
  FROM \`Annotation\` TO Community,
  FROM \`Constructor\` TO Community,
  FROM \`Constructor\` TO Interface,
  FROM \`Constructor\` TO Class,
  FROM \`Constructor\` TO Method,
  FROM \`Constructor\` TO Function,
  FROM \`Constructor\` TO \`Constructor\`,
  FROM \`Constructor\` TO \`Struct\`,
  FROM \`Constructor\` TO \`Macro\`,
  FROM \`Constructor\` TO \`Template\`,
  FROM \`Constructor\` TO \`TypeAlias\`,
  FROM \`Constructor\` TO \`Enum\`,
  FROM \`Constructor\` TO \`Impl\`,
  FROM \`Constructor\` TO \`Namespace\`,
  FROM \`Template\` TO Community,
  FROM \`Module\` TO Community,
  FROM Function TO Process,
  FROM Method TO Process,
  FROM Class TO Process,
  FROM Interface TO Process,
  FROM \`Struct\` TO Process,
  FROM \`Constructor\` TO Process,
  FROM \`Module\` TO Process,
  FROM \`Macro\` TO Process,
  FROM \`Impl\` TO Process,
  FROM \`Typedef\` TO Process,
  FROM \`TypeAlias\` TO Process,
  FROM \`Enum\` TO Process,
  FROM \`Union\` TO Process,
  FROM \`Namespace\` TO Process,
  FROM \`Trait\` TO Process,
  FROM \`Const\` TO Process,
  FROM \`Static\` TO Process,
  FROM \`Property\` TO Process,
  FROM \`Record\` TO Process,
  FROM \`Delegate\` TO Process,
  FROM \`Annotation\` TO Process,
  FROM \`Template\` TO Process,
  FROM CodeElement TO Process,
  type STRING,
  confidence DOUBLE,
  reason STRING,
  step INT32
)`;

/* ── Vector embedding table and HNSW index ───────────── */

export const EMBEDDING_SCHEMA = `
CREATE NODE TABLE ${VECTOR_TABLE} (
  nodeId STRING,
  embedding FLOAT[384],
  PRIMARY KEY (nodeId)
)`;

export const CREATE_VECTOR_INDEX_QUERY = `
CALL CREATE_VECTOR_INDEX('${VECTOR_TABLE}', 'code_embedding_idx', 'embedding', metric := 'cosine')
`;

/* ── Ordered execution lists (nodes → edges → vectors) ─ */

export const NODE_SCHEMA_QUERIES = [
  FILE_SCHEMA,
  FOLDER_SCHEMA,
  FUNCTION_SCHEMA,
  CLASS_SCHEMA,
  INTERFACE_SCHEMA,
  METHOD_SCHEMA,
  CODE_ELEMENT_SCHEMA,
  COMMUNITY_SCHEMA,
  PROCESS_SCHEMA,
  STRUCT_SCHEMA,
  ENUM_SCHEMA,
  MACRO_SCHEMA,
  TYPEDEF_SCHEMA,
  UNION_SCHEMA,
  NAMESPACE_SCHEMA,
  TRAIT_SCHEMA,
  IMPL_SCHEMA,
  TYPE_ALIAS_SCHEMA,
  CONST_SCHEMA,
  STATIC_SCHEMA,
  PROPERTY_SCHEMA,
  RECORD_SCHEMA,
  DELEGATE_SCHEMA,
  ANNOTATION_SCHEMA,
  CONSTRUCTOR_SCHEMA,
  TEMPLATE_SCHEMA,
  MODULE_SCHEMA,
];

export const REL_SCHEMA_QUERIES = [
  RELATION_SCHEMA,
];

export const SCHEMA_QUERIES = [
  ...NODE_SCHEMA_QUERIES,
  ...REL_SCHEMA_QUERIES,
  EMBEDDING_SCHEMA,
];
