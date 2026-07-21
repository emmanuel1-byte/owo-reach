import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../env";
import * as schema from "./schema";

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

export const sqlite = new Database(env.DATABASE_PATH);
sqlite.exec("PRAGMA journal_mode = WAL;"); // fast concurrent reads while webhooks write

export const db = drizzle(sqlite, { schema });

/** Prefixed, URL-safe, sortable-enough ids: run_x9f2…, ben_k3jd…, ldg_a1b2… */
export function newId(prefix: "run" | "ben" | "ldg"): string {
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${prefix}_${rand}`;
}
