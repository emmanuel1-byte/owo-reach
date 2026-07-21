import { db } from "../db/client";
import { beneficiaries } from "../db/schema";
import { getTransferStatus } from "../monnify/transfers";
import { transition } from "./execution";

const STALE_AFTER_MS = 5 * 60 * 1000; // only chase items that have sat in-flight this long

/**
 * Webhooks drive every state change; this is only the fallback for ones that
 * go missing. Polls beneficiaries stuck in an in-flight state for a while:
 * SENT → re-check transfer status; CODE_ISSUED past its expiry → mark
 * EXPIRED (Monnify may not always emit an expiry webhook).
 */
export async function reconcileStaleBeneficiaries(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const all = await db.select().from(beneficiaries);

  for (const b of all) {
    if (b.updatedAt > cutoff) continue;

    if (b.status === "SENT" && b.monnifyReference) {
      try {
        const status = await getTransferStatus(b.monnifyReference);
        if (status.status === "SUCCESS") await transition(b.id, "COMPLETED", { via: "reconciliation" });
        else if (status.status === "FAILED" || status.status === "REVERSED") {
          await transition(b.id, "FAILED", { via: "reconciliation", monnifyStatus: status.status });
        }
      } catch {
        // transient lookup failure — leave it for the next sweep
      }
    }

    if (b.status === "CODE_ISSUED" && b.paycodeExpiresAt && b.paycodeExpiresAt <= new Date()) {
      await transition(b.id, "EXPIRED", { via: "reconciliation" });
    }
  }
}
