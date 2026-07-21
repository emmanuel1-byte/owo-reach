/**
 * Demo seed: the "Green Harvest Co-op July stipends" run used in the demo
 * video and available to judges immediately after setup. Includes one
 * deliberate name mismatch and one duplicate so the review screen has
 * something real to show.
 */
import { db, newId } from "./client";
import { payoutRuns, beneficiaries, events } from "./schema";

const runId = newId("run");

await db.insert(payoutRuns).values({
  id: runId,
  title: "Green Harvest Co-op — July stipends",
  status: "REVIEW",
  totalAmountKobo: 128_000_00,
  totalFeesKobo: 3 * 100_00,
});

const rows: (typeof beneficiaries.$inferInsert)[] = [
  {
    id: newId("ben"),
    runId,
    name: "Chidi Okonkwo",
    phone: "+2348031234567",
    amountKobo: 25_000_00,
    rail: "BANK",
    accountNumber: "0123456789",
    bankCode: "058",
    nameEnquiryName: "CHIDI EMEKA OKONKWO",
    nameMatch: true,
    status: "PENDING_REVIEW",
  },
  {
    id: newId("ben"),
    runId,
    name: "Amina Yusuf",
    phone: "+2348029876543",
    amountKobo: 20_000_00,
    rail: "PAYCODE", // no bank account — the demo's protagonist
    status: "PENDING_REVIEW",
  },
  {
    id: newId("ben"),
    runId,
    name: "Tunde Bakare",
    phone: "+2347011112222",
    amountKobo: 25_000_00,
    rail: "BANK",
    accountNumber: "0987654321",
    bankCode: "057",
    nameEnquiryName: "OLUWASEUN ADEBAYO", // deliberate mismatch → flag
    nameMatch: false,
    flags: ["Bank record name does not match: OLUWASEUN ADEBAYO"],
    status: "PENDING_REVIEW",
  },
  {
    id: newId("ben"),
    runId,
    name: "Ngozi Eze",
    phone: "+2348055556666",
    amountKobo: 18_000_00,
    rail: "PAYCODE",
    status: "PENDING_REVIEW",
  },
  {
    id: newId("ben"),
    runId,
    name: "Ngozi Eze",
    phone: "+2348055556666", // deliberate duplicate → flag
    amountKobo: 18_000_00,
    rail: "PAYCODE",
    flags: ["Possible duplicate of another beneficiary in this run"],
    status: "PENDING_REVIEW",
  },
  {
    id: newId("ben"),
    runId,
    name: "Ibrahim Musa",
    phone: "+2349091237654",
    amountKobo: 22_000_00,
    rail: "PAYCODE",
    status: "PENDING_REVIEW",
  },
];

await db.insert(beneficiaries).values(rows);
await db.insert(events).values({
  runId,
  type: "run.created",
  payload: { source: "seed", beneficiaries: rows.length },
});

console.log(`Seeded run ${runId} with ${rows.length} beneficiaries (1 mismatch, 1 duplicate).`);
