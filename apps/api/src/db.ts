import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@stratin/db";

export type Env = {
  ENVIRONMENT?: string;
  DATABASE_URL?: string;
  SOLANA_RPC_URL?: string;
  REGISTRY_SOLANA_RPC_URL?: string;
  JUPITER_SWAP_API_BASE_URL?: string;
  ENTRY_FEE_BPS?: string;
  REBALANCE_FEE_BPS?: string;
  PROTOCOL_FEE_SHARE_BPS?: string;
  PROTOCOL_TREASURY?: string;
};

export function getDb(env: Env) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return drizzle(neon(env.DATABASE_URL), { schema });
}
