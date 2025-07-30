import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set. Some features may not work.");
  // Use a fake connection string to prevent crashes
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/placeholder";
}

try {
  export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000, // Timeout quickly
    max: 1 // Limit connections
  });
  export const db = drizzle({ client: pool, schema });
} catch (error) {
  console.error("Database connection failed:", error);
  // Create a mock db object to prevent crashes
  export const pool = null;
  export const db = null;
}
