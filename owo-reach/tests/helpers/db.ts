import { sqlite } from "../../server/db/client";

/** Wipe all rows between tests. Schema itself is created once in tests/setup.ts. */
export function resetDb(): void {
  sqlite.exec("DELETE FROM ledger_entries; DELETE FROM events; DELETE FROM beneficiaries; DELETE FROM payout_runs;");
}
