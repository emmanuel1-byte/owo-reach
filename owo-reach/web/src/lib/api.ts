/** Thin fetch wrapper. Types mirror server/db/schema.ts — keep in sync by hand
 *  (a shared types package is overkill for a 6-day build). */

export interface PayoutRun {
  id: string;
  title: string;
  status: "DRAFT" | "REVIEW" | "EXECUTING" | "COMPLETED" | "PARTIAL" | "FAILED";
  totalAmountKobo: number;
  totalFeesKobo: number;
  preflightBrief: string | null;
  createdAt: number;
}

export interface Beneficiary {
  id: string;
  runId: string;
  name: string;
  phone: string;
  amountKobo: number;
  rail: "BANK" | "PAYCODE";
  accountNumber: string | null;
  bankCode: string | null;
  nameEnquiryName: string | null;
  nameMatch: boolean | null;
  status:
    | "PENDING_REVIEW"
    | "QUEUED"
    | "SENT"
    | "CODE_ISSUED"
    | "COMPLETED"
    | "FAILED"
    | "EXPIRED"
    | "CANCELLED";
  monnifyReference: string | null;
  flags: string[];
  smsBody: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listRuns: () => request<PayoutRun[]>("/api/runs"),
  getRun: (id: string) =>
    request<{ run: PayoutRun; beneficiaries: Beneficiary[]; events: unknown[] }>(`/api/runs/${id}`),
  approveRun: (id: string) => request<{ ok: boolean }>(`/api/runs/${id}/approve`, { method: "POST" }),
};

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
  }).format(kobo / 100);
}
