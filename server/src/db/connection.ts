import { Pool, Client, PoolClient } from "pg";

export interface DatabaseConfig {
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

class ConnectionManager {
  private pool: Pool | null = null;
  private connectionString: string | null = null;

  async initialize(connectionString: string): Promise<void> {
    this.connectionString = connectionString;
    this.pool = new Pool({ connectionString });

    // Test the connection
    const client = await this.pool.connect();
    try {
      await client.query("SELECT NOW()");
      console.log("Database connection successful");
    } finally {
      client.release();
    }
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error("Connection not initialized. Call initialize() first.");
    }
    return await this.pool.connect();
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error("Connection not initialized. Call initialize() first.");
    }
    return await this.pool.query(sql, params);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log("Database connection closed");
    }
  }

  isConnected(): boolean {
    return this.pool !== null;
  }
}

export const connectionManager = new ConnectionManager();

// Legacy API for backward compatibility
export const createConnection = async (connectionString: string) => {
  await connectionManager.initialize(connectionString);
};

export const closeConnection = async () => {
  await connectionManager.close();
};
