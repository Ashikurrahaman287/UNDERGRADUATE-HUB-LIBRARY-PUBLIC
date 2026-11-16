export function normalizeBangladeshPhone(rawPhone: string): string {
  const cleaned = rawPhone.replace(/\s+/g, "").replace(/[-()]/g, "").trim();
  if (!cleaned) return "";

  if (/^\+?8801\d{9}$/.test(cleaned)) {
    const digits = cleaned.replace(/^\+?880/, "");
    return `+880${digits}`;
  }

  if (/^01\d{9}$/.test(cleaned)) {
    return `+88${cleaned}`;
  }

  if (/^8801\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export function isValidBangladeshPhone(rawPhone: string): boolean {
  const normalized = normalizeBangladeshPhone(rawPhone);
  return /^\+8801\d{9}$/.test(normalized);
}
