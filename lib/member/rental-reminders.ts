const RENTAL_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function isRentalDueSoon(dueAt: string | null, now = Date.now()): boolean {
  if (!dueAt) return false;
  const dueAtTime = Date.parse(dueAt);
  return Number.isFinite(dueAtTime) && dueAtTime > now && dueAtTime <= now + RENTAL_REMINDER_WINDOW_MS;
}