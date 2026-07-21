import { monnify } from "./client";
import { MONNIFY } from "./config";

export interface Bank {
  name: string;
  code: string;
}

export async function getBanks(): Promise<Bank[]> {
  return monnify<Bank[]>(MONNIFY.BANKS);
}

const BANK_NAME_STOPWORDS = new Set(["bank", "of", "the", "plc", "nigeria", "limited", "ltd"]);

/**
 * Resolve free-text bank names from ingestion (e.g. "GTBank", "GTB", "058")
 * against the real bank list. Exact code match, then substring match either
 * direction, then a fall back to the bank name's initials — abbreviations
 * like "GTBank" for "Guaranty Trust Bank" aren't a substring of either name.
 */
export function resolveBankCode(raw: string, banks: Bank[]): string | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;

  const byCode = banks.find((b) => b.code === raw.trim());
  if (byCode) return byCode.code;

  const byName = banks.find(
    (b) => b.name.toLowerCase().includes(needle) || needle.includes(b.name.toLowerCase()),
  );
  if (byName) return byName.code;

  const needleLetters = needle.replace(/[^a-z]/g, "");
  const byInitials = banks.find((b) => {
    const initials = b.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => !BANK_NAME_STOPWORDS.has(w))
      .map((w) => w[0])
      .join("");
    return initials.length >= 2 && needleLetters.startsWith(initials);
  });
  return byInitials?.code ?? null;
}

export interface NameEnquiryResult {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

/** Verify that an account number resolves, and to whom. */
export async function nameEnquiry(accountNumber: string, bankCode: string) {
  return monnify<NameEnquiryResult>(MONNIFY.NAME_ENQUIRY, {
    query: { accountNumber, bankCode },
  });
}

/**
 * Loose match between the name a beneficiary gave us and the bank's record.
 * Nigerian bank records vary in name ordering and often include a middle name,
 * so exact string equality is useless — token overlap is the pragmatic check.
 */
export function namesLooselyMatch(provided: string, bankRecord: string): boolean {
  const tokens = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter((t) => t.length > 1),
    );
  const a = tokens(provided);
  const b = tokens(bankRecord);
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return overlap >= Math.min(2, a.size); // at least two shared name tokens (or all, if fewer)
}
