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
  | "DROP_INDEX";

export interface ProposedChange {
  id: string;
  type: ChangeType;
  status: "pending" | "validated" | "rejected";
  payload: CreateTablePayload | AlterTablePayload | DropTablePayload;
  validationResult?: ValidationResult;
  createdAt: string;
}

export interface CreateTablePayload {
  tableName: string;
  schema: string;
  columns: ColumnDefinition[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeyDefinition[];
}

export interface AlterTablePayload {
  tableName: string;
  schema: string;
  addedColumns?: ColumnDefinition[];
  removedColumns?: string[];
  modifiedColumns?: ColumnModification[];
  addedForeignKeys?: ForeignKeyDefinition[];
  removedForeignKeys?: string[];
}

export interface DropTablePayload {
  tableName: string;
  schema: string;
  cascade?: boolean;
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
