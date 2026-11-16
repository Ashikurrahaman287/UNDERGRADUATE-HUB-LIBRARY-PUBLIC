import "server-only";

export const authorizedAdminPhones = [
  "+8801619617036",
  "+8801845278579",
  "+8801615419428",
] as const;

export const authorizedAdminEmails = [
  "nishuthetomlover@gmail.com",
  "jannat@undergraduatehub.com",
  "ashik@undergraduatehub.com",
  "asnujushde@gmail.com",
] as const;

export function isAuthorizedAdminPhone(phone: string): boolean {
  return authorizedAdminPhones.some((authorizedPhone) => authorizedPhone === phone);
}

export function isAuthorizedAdminEmail(email: string): boolean {
  return authorizedAdminEmails.some((authorizedEmail) => authorizedEmail === email);
}

export function maskAuthorizedAdminPhone(phone: string): string {
  return `${phone.slice(0, 5)}${"*".repeat(Math.max(0, phone.length - 9))}${phone.slice(-4)}`;
}

export function maskAuthorizedAdminEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  return `${localPart?.slice(0, 1) ?? "*"}${"*".repeat(Math.max(2, (localPart?.length ?? 1) - 1))}@${domain ?? ""}`;
}
