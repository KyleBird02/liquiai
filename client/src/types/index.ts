// Client-side type definitions (mirrors server types for consistency)
export type ChangeType =
  | "CREATE_TABLE"
  | "ALTER_TABLE"
  | "DROP_TABLE"
  | "ADD_INDEX"
  | "DROP_INDEX"
  | "EXECUTE_SQL"
  | "GRID_CONFIG";

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
  _isProposed?: boolean;
  _isPendingDelete?: boolean;
  _isProposedEdit?: boolean;
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

export interface TableDefinition {
  name: string;
  schema: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  primaryKey: string[];
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

export interface SchemaSnapshot {
  capturedAt: string;
  databaseName: string;
  tables: TableDefinition[];
}

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

export interface ColumnModification {
  columnName: string;
  oldDefinition: ColumnDefinition;
  newDefinition: ColumnDefinition;
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

export interface ValidationResult {
  passed: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
  affectedTables: string[];
  dependencyGraph: DependencyEdge[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "foreign_key" | "index";
}

export interface ProposedChange {
  id: string;
  type: ChangeType;
  status: "pending" | "validated" | "rejected";
  payload: any;
  validationResult?: ValidationResult;
  createdAt: string;
  appliedLocally?: boolean;
  sqlPreview?: string;
  edited?: boolean;
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
  removedColumns?: ColumnDefinition[];
  modifiedColumns?: ColumnModification[];
  addedForeignKeys?: ForeignKeyDefinition[];
  removedForeignKeys?: ForeignKeyDefinition[];
}

export interface DropTablePayload {
  tableName: string;
  schema: string;
  cascade?: boolean;
  definition?: TableDefinition;
}

export interface ExecuteSqlPayload {
  sql: string;
}

export interface GridConfigPayload {
  gridId: number;
  gridName: string;
  beforeColumns: GridAttributeWithMeta[];
  afterColumns: GridAttributeWithMeta[];
  diff: GridConfigChange;
}

// Phase 2 - Liquibase Changeset Generation

export interface ChangeReview {
  severity: "low" | "medium" | "high";
  message: string;
}

export interface ChangesetDefinition {
  id: string;
  author: string;
  comment: string | null;
  changeType: "xml" | "sql";
  change: ProposedChange;
  sqlFilePath: string | null;
  sqlFileContent: string | null;
  sqlFiles?: Array<{
    path: string;
    content: string;
  }>;
  xmlContent: string;
  targetApplication: string;
  targetSprint: string;
  edited: boolean;
  reviews?: ChangeReview[];
}

export interface ChangesetBatch {
  changesets: ChangesetDefinition[];
  aggregated: boolean;
  author: string;
  targetApplication: string;
  targetSprint: string;
  prTitle: string;
  prDescription: string;
}

export interface Phase2Session {
  author: string;
  targetApplication: string;
  targetSprint: string;
  branchName?: string;
  proposedChanges: ProposedChange[];
  changesets: ChangesetDefinition[];
  batch?: ChangesetBatch;
}

export interface GitHubPRInput {
  branch: string;
  title: string;
  description: string;
  files: GitHubFileChange[];
}

export interface GitHubFileChange {
  path: string;
  content: string;
  message: string;
  fileType?: "changeset-xml" | "sql-file"; // Type of file being previewed
  newContent?: string; // For changeset.xml, only the new changesets being added
}

// Grid Config Pipeline - Client types

export interface GridColumn {
  id: number;
  column_name: string;
  column_type: string;
}

export interface Grid {
  id: number;
  grid_name: string;
}

export interface GridAttribute {
  id: number;
  grid_id: number;
  column_id: number;
  header_name: string;
  width: number;
  min_width: number;
  max_width: number;
  position: number;
  sortable: boolean;
  resizable: boolean;
  filter: boolean;
  pinned: "left" | "right" | null;
  hide: boolean;
  flex: number | null;
}

export interface GridAttributeWithMeta extends GridAttribute {
  column_name: string;
  column_type: string;
}

export interface GridConfig {
  grid: Grid;
  columns: GridAttributeWithMeta[];
}

export interface WidthSuggestion {
  columnName: string;
  suggestedWidth: number;
  suggestedMinWidth: number;
  suggestedMaxWidth: number;
  confidence: "high" | "low";
  dataPoints: number;
}

export interface GridAttributeModification {
  columnName: string;
  field: keyof GridAttribute;
  before: unknown;
  after: unknown;
}

export interface GridConfigChange {
  type: "NEW_GRID" | "UPDATE_GRID";
  grid: Grid;
  before: GridAttributeWithMeta[] | null;
  after: GridAttributeWithMeta[];
  addedColumns: GridAttributeWithMeta[];
  removedColumns: GridAttributeWithMeta[];
  modifiedAttributes: GridAttributeModification[];
}

export interface SyntheticDataRow {
  [key: string]: string | number | boolean | null;
}

export interface AIAssistantMessage {
  role: "user" | "assistant";
  content: string;
}
