import { connectionManager } from "./connection";
import {
  SchemaSnapshot,
  TableDefinition,
  ColumnDefinition,
  IndexDefinition,
  ForeignKeyDefinition,
} from "../types/index";

/**
 * Introspects a PostgreSQL database and returns a complete schema snapshot
 */
export async function introspectSchema(
  databaseName: string,
): Promise<SchemaSnapshot> {
  // Fetch all tables
  const tablesResult = await connectionManager.query(`
    SELECT 
      table_name as name,
      table_schema as schema
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);

  const tables: TableDefinition[] = [];

  for (const tableRow of tablesResult.rows) {
    const table = await introspectTable(
      tableRow.schema,
      tableRow.name,
      undefined,
    );
    tables.push(table);
  }

  return {
    capturedAt: new Date().toISOString(),
    databaseName,
    tables,
  };
}

/**
 * Introspects a PostgreSQL database using a specific connection string
 * without requiring a pre-established connection
 */
export async function introspectSchemaWithConnection(
  connectionString: string,
  databaseName: string,
): Promise<SchemaSnapshot> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Fetch all tables
    const tablesResult = await client.query(`
      SELECT 
        table_name as name,
        table_schema as schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    const tables: TableDefinition[] = [];

    for (const tableRow of tablesResult.rows) {
      const table = await introspectTable(
        tableRow.schema,
        tableRow.name,
        client,
      );
      tables.push(table);
    }

    return {
      capturedAt: new Date().toISOString(),
      databaseName,
      tables,
    };
  } finally {
    await client.end();
  }
}

/**
 * Introspects a single table and returns its full definition
 */
async function introspectTable(
  schema: string,
  tableName: string,
  client?: any,
): Promise<TableDefinition> {
  // Use provided client or fall back to connection manager
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  // Fetch columns
  const columnsResult = await query(
    `
    SELECT
      column_name as name,
      data_type as type,
      is_nullable = 'YES' as nullable,
      column_default as "defaultValue",
      ordinal_position as "ordinalPosition",
      collation_name as collation,
      character_maximum_length as "charMaxLength",
      numeric_precision as "numericPrecision",
      numeric_scale as "numericScale"
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `,
    [schema, tableName],
  );

  // Fetch primary key columns
  const pkResult = await query(
    `
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid
      AND a.attnum = ANY(i.indkey)
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_class idx ON idx.oid = i.indexrelid
    WHERE t.relname = $1
      AND i.indisprimary
    ORDER BY a.attnum
  `,
    [tableName],
  );

  const primaryKeyColumns = pkResult.rows.map((row: any) => row.attname);

  // Fetch FK columns
  const allFkResult = await query(
    `
    SELECT kcu.column_name
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_schema = $1 AND kcu.table_name = $2
  `,
    [schema, tableName],
  );

  const foreignKeyColumns = allFkResult.rows.map((row: any) => row.column_name);

  // Build column definitions
  const columns: ColumnDefinition[] = columnsResult.rows.map((row: any) => ({
    name: row.name,
    type: row.type,
    nullable: row.nullable,
    defaultValue: row.defaultValue,
    isPrimaryKey: primaryKeyColumns.includes(row.name),
    ordinalPosition: row.ordinalPosition,
    collation: row.collation,
    isForeignKey: foreignKeyColumns.includes(row.name),
    charMaxLength: row.charMaxLength,
    numericPrecision: row.numericPrecision,
    numericScale: row.numericScale,
  }));

  // Fetch foreign keys
  const fkResult = await query(
    `
    SELECT
      rc.constraint_name as "constraintName",
      kcu.column_name as "column",
      ccu.table_name as "referencedTable",
      ccu.column_name as "referencedColumn",
      rc.delete_rule as "onDelete"
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE kcu.table_schema = $1 AND kcu.table_name = $2
  `,
    [schema, tableName],
  );

  const foreignKeys: ForeignKeyDefinition[] = fkResult.rows.map((row: any) => ({
    constraintName: row.constraintName,
    column: row.column,
    referencedTable: row.referencedTable,
    referencedColumn: row.referencedColumn,
    onDelete: row.onDelete,
  }));

  // Fetch indexes (excluding primary key indexes)
  const indexesResult = await query(
    `
    SELECT
      i.relname as name,
      idx.indisunique as unique,
      array_agg(a.attname ORDER BY a.attnum) as columns
    FROM pg_index idx
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_class t ON t.oid = idx.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
    WHERE t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
      AND t.relname = $2
      AND NOT idx.indisprimary
    GROUP BY i.relname, idx.indisunique
  `,
    [schema, tableName],
  );

  const indexes: IndexDefinition[] = indexesResult.rows.map((row: any) => ({
    name: row.name,
    columns: row.columns || [],
    unique: row.unique,
  }));

  return {
    name: tableName,
    schema,
    columns,
    indexes,
    foreignKeys,
    primaryKey: primaryKeyColumns,
  };
}

/**
 * Fetches detailed column information including collation, char length, numeric precision, etc.
 */
export async function getDetailedColumnInfo(
  schema: string,
  tableName: string,
  columnName: string,
  client?: any,
): Promise<any> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `
    SELECT
      ordinal_position,
      column_name as name,
      data_type as type,
      is_nullable = 'YES' as nullable,
      column_default as "defaultValue",
      collation_name as collation,
      character_maximum_length as "charMaxLength",
      numeric_precision as "numericPrecision",
      numeric_scale as "numericScale"
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
  `,
    [schema, tableName, columnName],
  );

  return result.rows[0] || null;
}

/**
 * Fetches constraints for a specific column
 */
export async function getColumnConstraints(
  schema: string,
  tableName: string,
  columnName: string,
  client?: any,
): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `
    SELECT
      constraint_name as name,
      constraint_type as type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.table_schema = $1 AND tc.table_name = $2 AND kcu.column_name = $3
  `,
    [schema, tableName, columnName],
  );

  return result.rows;
}

/**
 * Fetches triggers that affect a table
 */
export async function getTableTriggers(
  schema: string,
  tableName: string,
  client?: any,
): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `
    SELECT
      trigger_name as name,
      event_manipulation as event,
      action_timing as timing,
      action_statement as "function"
    FROM information_schema.triggers
    WHERE event_object_schema = $1 AND event_object_table = $2
  `,
    [schema, tableName],
  );

  return result.rows;
}

/**
 * Fetches RLS policies for a table
 */
export async function getTablePolicies(
  schema: string,
  tableName: string,
  client?: any,
): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `
    SELECT
      polname as name,
      polcmd as type,
      pg_get_expr(polqual::pg_node_tree, reloid) as using,
      pg_get_expr(polwithcheck::pg_node_tree, reloid) as "withCheck"
    FROM pg_policy
    JOIN pg_class ON pg_policy.polrelid = pg_class.oid
    WHERE relname = $1
      AND pg_class.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
  `,
    [tableName, schema],
  );

  return result.rows;
}

/**
 * Fetches indexes that use a specific column
 */
export async function getColumnIndexes(
  schema: string,
  tableName: string,
  columnName: string,
  client?: any,
): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `
    SELECT
      i.relname as name,
      idx.indisunique as unique,
      idx.indisprimary as "isPrimaryKey"
    FROM pg_index idx
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_class t ON t.oid = idx.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = $3
    WHERE t.relname = $1
      AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
      AND a.attnum = ANY(idx.indkey)
  `,
    [tableName, schema, columnName],
  );

  return result.rows;
}

/**
 * Validates that a connection string is valid
 */
export async function testConnection(
  connectionString: string,
): Promise<boolean> {
  try {
    // Create a temporary client to test the connection
    const { Client } = await import("pg");
    const testClient = new Client({ connectionString });
    await testClient.connect();
    await testClient.query("SELECT NOW()");
    await testClient.end();
    return true;
  } catch (error) {
    console.error("Connection test failed:", error);
    return false;
  }
}
