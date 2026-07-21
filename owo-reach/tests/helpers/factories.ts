import { eq } from "drizzle-orm";
import { db, newId } from "../../server/db/client";
import { payoutRuns, beneficiaries, type PayoutRun, type Beneficiary } from "../../server/db/schema";

export async function insertRun(overrides: Partial<typeof payoutRuns.$inferInsert> = {}): Promise<string> {
  const id = overrides.id ?? newId("run");
  await db.insert(payoutRuns).values({
    id,
    title: "Test run",
    status: "REVIEW",
    totalAmountKobo: 0,
    totalFeesKobo: 0,
    ...overrides,
  });
  return id;
}

export async function insertBeneficiary(runId: string, overrides: Partial<typeof beneficiaries.$inferInsert> = {}): Promise<string> {
  const id = overrides.id ?? newId("ben");
  await db.insert(beneficiaries).values({
    id,
    runId,
    name: "Test Beneficiary",
    phone: "+2348000000000",
    amountKobo: 100000,
    rail: "BANK",
    bankCode: "058",
    accountNumber: "0123456789",
    status: "PENDING_REVIEW",
    flags: [],
    ...overrides,
  });
  return id;
}

export async function getRun(id: string): Promise<PayoutRun | undefined> {
  const [row] = await db.select().from(payoutRuns).where(eq(payoutRuns.id, id));
  return row;
}

export async function getBeneficiary(id: string): Promise<Beneficiary | undefined> {
  const [row] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, id));
  return row;
}
