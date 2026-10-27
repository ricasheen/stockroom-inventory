import { Pool } from "pg";

const globalForPool = globalThis as unknown as { stockroomPool?: Pool };

export const db =
  globalForPool.stockroomPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForPool.stockroomPool = db;
}
