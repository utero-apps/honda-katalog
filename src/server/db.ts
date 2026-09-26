import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getEnv } from "@/server/env";

export type UserRole = "owner" | "admin" | "cashier" | "mechanic" | "warehouse" | "finance";

export interface DbIdentity {
  userId: string;
  role: UserRole;
  requestId: string;
}

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    const env = getEnv();
    pool = new Pool(env.DATABASE_URL ? {
      connectionString: env.DATABASE_URL,
      max: 12,
      idleTimeoutMillis: 30_000,
    } : {
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      database: env.DATABASE_NAME,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      max: 12,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

async function withClient<T>(configure: (client: PoolClient) => Promise<void>, work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await configure(client);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function withActorTransaction<T>(identity: DbIdentity, work: (client: PoolClient) => Promise<T>) {
  return withClient(async (client) => {
    await client.query("SELECT set_config('app.user_id', $1, true)", [identity.userId]);
    await client.query("SELECT set_config('app.user_role', $1, true)", [identity.role]);
    await client.query("SELECT set_config('app.request_id', $1, true)", [identity.requestId]);
  }, work);
}

export function withSystemTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  return withClient(async (client) => {
    await client.query("SELECT set_config('app.system_auth', 'true', true)");
  }, work);
}

export async function queryHealth<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return getPool().query<T>(text, values);
}
