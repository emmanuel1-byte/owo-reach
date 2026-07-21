// Turns a raw row from the append-only `events` table into a short,
// human-readable line for the activity feed / audit trail. No fabricated
// detail — only what the event actually carries.
export function describeEvent(e, beneficiaryMap = {}) {
  const b = e.beneficiaryId ? beneficiaryMap[e.beneficiaryId] : null;
  const who = b ? b.name : null;

  if (e.type === "run.created") return "Run created";
  if (e.type === "run.approved") return "Batch authorised — execution started";
  if (e.type.startsWith("beneficiary.")) {
    const state = e.type.replace("beneficiary.", "").replace(/_/g, " ");
    return who ? `${who} · ${state}` : `Beneficiary · ${state}`;
  }
  if (e.type.startsWith("webhook.")) return `Webhook received · ${e.type.replace("webhook.", "")}`;
  return e.type;
}
