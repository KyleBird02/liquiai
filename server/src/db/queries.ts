import { connectionManager } from "./connection.js";
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

// Grid Config Pipeline - Database queries

/**
 * Fetches all grids from the database
 */
export async function getAllGrids(client?: any): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    "SELECT id, grid_name FROM grid ORDER BY grid_name",
  );
  return result.rows;
}

/**
 * Fetches a single grid by ID with all its attributes (joined with column info)
 */
export async function getGridWithAttributes(
  gridId: number,
  client?: any,
): Promise<any> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const gridResult = await query(
    "SELECT id, grid_name FROM grid WHERE id = $1",
    [gridId],
  );

  if (gridResult.rows.length === 0) {
    return null;
  }

  const attributesResult = await query(
    `
    SELECT 
      ga.id, 
      ga.grid_id, 
      ga.column_id, 
      ga.header_name, 
      ga.width, 
      ga.min_width, 
      ga.max_width, 
      ga.position, 
      ga.sortable, 
      ga.resizable, 
      ga.filter, 
      ga.pinned, 
      ga.hide, 
      ga.flex,
      gc.column_name,
      gc.column_type
    FROM grid_attributes ga
    JOIN grid_columns gc ON ga.column_id = gc.id
    WHERE ga.grid_id = $1
    ORDER BY ga.position ASC
  `,
    [gridId],
  );

  return {
    grid: gridResult.rows[0],
    columns: attributesResult.rows,
  };
}

/**
 * Fetches all grid columns (the registry of available columns)
 */
export async function getAllGridColumns(client?: any): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    "SELECT id, column_name, column_type FROM grid_columns ORDER BY column_name",
  );
  return result.rows;
}

/**
 * Creates a new grid
 */
export async function createGrid(gridName: string, client?: any): Promise<any> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  await query(
    `SELECT setval(
      pg_get_serial_sequence('grid', 'id'),
      (SELECT COALESCE(MAX(id), 0) + 1 FROM grid),
      false
    )`,
  );

  const result = await query(
    "INSERT INTO grid (grid_name) VALUES ($1) RETURNING id, grid_name",
    [gridName],
  );
  return result.rows[0];
}

/**
 * Creates a new grid column in the column registry
 */
export async function createGridColumn(
  columnName: string,
  columnType: string,
  client?: any,
): Promise<any> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  await query(
    `SELECT setval(
      pg_get_serial_sequence('grid_columns', 'id'),
      (SELECT COALESCE(MAX(id), 0) + 1 FROM grid_columns),
      false
    )`,
  );

  const result = await query(
    `INSERT INTO grid_columns (column_name, column_type)
     VALUES ($1, $2)
     RETURNING id, column_name, column_type`,
    [columnName, columnType],
  );

  return result.rows[0];
}

/**
 * Creates a new grid attribute (column in a grid)
 */
export async function createGridAttribute(
  gridId: number,
  columnId: number,
  headerName: string,
  width: number,
  minWidth: number,
  maxWidth: number,
  position: number,
  sortable: boolean,
  resizable: boolean,
  filter: boolean,
  pinned: "left" | "right" | null,
  hide: boolean,
  flex: number | null,
  client?: any,
): Promise<any> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `INSERT INTO grid_attributes 
    (grid_id, column_id, header_name, width, min_width, max_width, position, sortable, resizable, filter, pinned, hide, flex) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      gridId,
      columnId,
      headerName,
      width,
      minWidth,
      maxWidth,
      position,
      sortable,
      resizable,
      filter,
      pinned,
      hide,
      flex,
    ],
  );
  return result.rows[0];
}

export async function deleteGrid(gridId: number, client?: any): Promise<void> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  await query("DELETE FROM grid_attributes WHERE grid_id = $1", [gridId]);
  await query("DELETE FROM grid WHERE id = $1", [gridId]);
}

/**
 * Updates a grid attribute
 */
export async function updateGridAttribute(
  attributeId: number,
  updates: Partial<any>,
  client?: any,
): Promise<any> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const fields = Object.keys(updates);
  const values = Object.values(updates);

  if (fields.length === 0) {
    return null;
  }

  const setClause = fields
    .map((field, idx) => `${field} = $${idx + 1}`)
    .join(", ");
  const sql = `UPDATE grid_attributes SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`;

  const result = await query(sql, [...values, attributeId]);
  return result.rows[0];
}

/**
 * Deletes a grid attribute
 */
export async function deleteGridAttribute(
  attributeId: number,
  client?: any,
): Promise<void> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  await query("DELETE FROM grid_attributes WHERE id = $1", [attributeId]);
}

/**
 * Fetches existing usage of a column_name across all grids for width suggestions
 */
export async function getColumnUsageForWidthSuggestion(
  columnName: string,
  client?: any,
): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  const result = await query(
    `
    SELECT 
      ga.width, 
      ga.min_width, 
      ga.max_width
    FROM grid_attributes ga
    JOIN grid_columns gc ON ga.column_id = gc.id
    WHERE gc.column_name = $1
    ORDER BY ga.width
  `,
    [columnName],
  );
  return result.rows;
}

/**
 * Fetches sample data from a table column for synthetic data generation
 */
export async function getSampleColumnData(
  schema: string,
  tableName: string,
  columnName: string,
  limit: number = 20,
  client?: any,
): Promise<any[]> {
  const query = client
    ? (sql: string, params?: any[]) => client.query(sql, params)
    : (sql: string, params?: any[]) => connectionManager.query(sql, params);

  try {
    const result = await query(
      `SELECT ${columnName} FROM ${schema}.${tableName} WHERE ${columnName} IS NOT NULL LIMIT $1`,
      [limit],
    );
    return result.rows.map((row: any) => row[columnName]);
  } catch (error) {
    // Column or table doesn't exist
    return [];
  }
}
