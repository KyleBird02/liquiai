// Schema Snapshot - Represents the full introspected state of a database
export interface SchemaSnapshot {
  capturedAt: string;
  databaseName: string;
  tables: TableDefinition[];
}

export interface TableDefinition {
  name: string;
  schema: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  primaryKey: string[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  // Extended column information
  ordinalPosition?: number;
  collation?: string | null;
  isForeignKey?: boolean;
  charMaxLength?: number | null;
  numericPrecision?: number | null;
  numericScale?: number | null;
}

export interface ColumnDetails extends ColumnDefinition {
  // Additional details
  constraints: ConstraintDefinition[];
  triggers: TriggerDefinition[];
  policies: PgPolicy[];
  permissions: ColumnPermission[];
  dependencies: ColumnDependency[];
  isPartOf?: string; // partition name if any
}

export interface ConstraintDefinition {
  name: string;
  type: string; // UNIQUE, CHECK, FOREIGN KEY, etc.
  definition: string;
}

export interface TriggerDefinition {
  name: string;
  event: string; // INSERT, UPDATE, DELETE
  timing: string; // BEFORE, AFTER
  function: string;
}

export interface PgPolicy {
  name: string;
  type: string; // SELECT, INSERT, UPDATE, DELETE
  using?: string;
  withCheck?: string;
}

export interface ColumnPermission {
  grantee: string;
  privilege: string; // SELECT, INSERT, UPDATE, DELETE, REFERENCES
}

export interface ColumnDependency {
  objectType: string; // TABLE, VIEW, INDEX, TRIGGER, etc.
  objectName: string;
  dependencyType: string; // REFERENCES, PART_OF, USES, etc.
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKeyDefinition {
  constraintName: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
}

// Proposed Change
export type ChangeType =
  | "CREATE_TABLE"
  | "ALTER_TABLE"
  | "DROP_TABLE"
  | "ADD_INDEX"
  | "DROP_INDEX"
  | "EXECUTE_SQL"
  | "GRID_CONFIG";

export interface ProposedChange {
  id: string;
  type: ChangeType;
  status: "pending" | "validated" | "rejected";
  payload:
    | CreateTablePayload
    | AlterTablePayload
    | DropTablePayload
    | ExecuteSqlPayload
    | GridConfigPayload;
  validationResult?: ValidationResult;
  createdAt: string;
  appliedLocally?: boolean;
  sqlPreview?: string;
  edited?: boolean;
}

export interface ExecuteSqlPayload {
  sql: string;
  fileName?: string;
}

export interface GridConfigPayload {
  gridId: number;
  gridName: string;
  beforeColumns: GridAttributeWithMeta[];
  afterColumns: GridAttributeWithMeta[];
  diff: GridConfigChange;
}

export interface CreateTablePayload {
  tableName: string;
  schema: string;
  columns: ColumnDefinition[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeyDefinition[];
  seedData?: Array<Record<string, string | number | boolean | null>>;
}

export interface AlterTablePayload {
  tableName: string;
  schema: string;
  addedColumns?: ColumnDefinition[];
  removedColumns?: ColumnDefinition[]; // Object so we can restore
  modifiedColumns?: ColumnModification[];
  addedForeignKeys?: ForeignKeyDefinition[];
  removedForeignKeys?: ForeignKeyDefinition[]; // Object so we can restore
}

export interface DropTablePayload {
  tableName: string;
  schema: string;
  cascade?: boolean;
  definition?: TableDefinition; // To recreate if reverted
}

export interface ColumnModification {
  columnName: string;
  oldDefinition: ColumnDefinition;
  newDefinition: ColumnDefinition;
}

// Validation
export interface ValidationResult {
  passed: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
  affectedTables: string[];
  dependencyGraph: DependencyEdge[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "foreign_key" | "index";
}

// Schema Diff
export interface SchemaDiff {
  before: TableDefinition | null;
  after: TableDefinition | null;
  addedColumns: ColumnDefinition[];
  removedColumns: ColumnDefinition[];
  modifiedColumns: ColumnModification[];
  addedConstraints: ForeignKeyDefinition[];
  removedConstraints: ForeignKeyDefinition[];
  isDestructive: boolean;
  destructiveReasons: string[];
}

// Phase 2 - Liquibase Changeset Generation

export interface ChangeReview {
  severity: "low" | "medium" | "high";
  message: string;
}

export interface ChangesetDefinition {
  id: string; // e.g. "trade-124"
  author: string;
  comment: string | null;
  changeType: "xml" | "sql"; // inline XML or SQL file reference
  change: ProposedChange;
  sqlFilePath: string | null; // relative path if changeType === 'sql'
  sqlFileContent: string | null; // generated SQL if changeType === 'sql'
  sqlFiles?: Array<{
    path: string;
    content: string;
  }>;
  xmlContent: string; // the full rendered changeset XML block
  targetApplication: string; // folder name e.g. "trade-service"
  targetSprint: string; // sprint folder e.g. "sprint-42"
  edited: boolean; // true if user manually edited XML/SQL
  reviews?: ChangeReview[];
}

export interface ChangesetBatch {
  changesets: ChangesetDefinition[];
  aggregated: boolean; // true if merged into one changeset
  author: string;
  targetApplication: string;
  targetSprint: string;
  prTitle: string;
  prDescription: string;
}

export interface Phase2Session {
  author: string; // GitHub username
  targetApplication: string; // e.g. "trade-service"
  targetSprint: string; // e.g. "sprint-42"
  branchName?: string; // e.g. "OCDEV-admin-feature"
  proposedChanges: ProposedChange[]; // from Phase 1
  changesets: ChangesetDefinition[];
  prReviewerAppendix?: {
    digest: string;
    markdown: string;
  };
  batch?: ChangesetBatch;
}

export interface GitHubPRInput {
  branch: string; // e.g. "migration/trade-service/sprint-42/add-settlement-columns"
  title: string;
  description: string;
  files: GitHubFileChange[]; // changeset.xml + any .sql files
}

export interface GitHubFileChange {
  path: string; // relative path in repo
  message: string; // commit message for this file
  content?: string; // file content to commit
  fileType?: "changeset-xml" | "sql-file"; // Type of file
  newContent?: string; // For changeset.xml, only the new changesets being added
}

// Grid Config Pipeline - Phase 2

// Database grid column registry
export interface GridColumn {
  id: number;
  column_name: string; // camelCase logical name e.g. "tradePrice"
  column_type: string; // postgres type e.g. "integer", "varchar"
}

// Database grid registry
export interface Grid {
  id: number;
  grid_name: string; // e.g. "tradeGrid"
}

// Database grid attributes - one row per column in a grid
export interface GridAttribute {
  id: number;
  grid_id: number; // FK → grid.id
  column_id: number; // FK → grid_columns.id
  header_name: string; // display label e.g. "Trade Price"
  width: number; // pixels
  min_width: number;
  max_width: number;
  position: number; // column order (0-indexed)
  sortable: boolean;
  resizable: boolean;
  filter: boolean;
  pinned: "left" | "right" | null;
  hide: boolean;
  flex: number | null; // AG Grid flex sizing — null if fixed width
}

// Full resolved grid config (joined view used by the editor)
export interface GridAttributeWithMeta extends GridAttribute {
  column_name: string; // joined from grid_columns
  column_type: string; // joined from grid_columns
}

export interface GridConfig {
  grid: Grid;
  columns: GridAttributeWithMeta[];
}

// Width suggestion returned by AI assistant
export interface WidthSuggestion {
  columnName: string;
  suggestedWidth: number;
  suggestedMinWidth: number;
  suggestedMaxWidth: number;
  confidence: "high" | "low";
  dataPoints: number; // how many other grids had this column
}

// Tracks modifications to a grid attribute
export interface GridAttributeModification {
  columnName: string;
  field: keyof GridAttribute;
  before: unknown;
  after: unknown;
}

// Grid configuration change for changeset generation
export interface GridConfigChange {
  type: "NEW_GRID" | "UPDATE_GRID";
  grid: Grid;
  before: GridAttributeWithMeta[] | null; // null for NEW_GRID
  after: GridAttributeWithMeta[];
  addedColumns: GridAttributeWithMeta[];
  removedColumns: GridAttributeWithMeta[];
  modifiedAttributes: GridAttributeModification[];
}

// Extended changeset definition to support grid config
export interface GridChangesetDefinition {
  id: string; // e.g. "trade-125"
  author: string;
  comment: string | null;
  changeType: "loadData" | "loadUpdateData";
  change: GridConfigChange;
  csvFiles: Array<{
    tableName: string;
    path: string; // relative path e.g. "trade-service/sprint-42/grid_trade_grid.csv"
    content: string; // CSV content
  }>;
  xmlContent: string; // the full rendered changeset XML block
  targetApplication: string;
  targetSprint: string;
  edited: boolean;
}

// Synthetic data for grid preview
export interface SyntheticDataRow {
  [key: string]: string | number | boolean | null;
}

// AI assistant chat message
export interface AIAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

// AI assistant chat request
export interface AIAssistantChatRequest {
  gridConfig: GridConfig;
  messages: AIAssistantMessage[];
}
