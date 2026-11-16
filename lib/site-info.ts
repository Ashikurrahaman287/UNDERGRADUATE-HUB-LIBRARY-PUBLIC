export const BKASH_NUMBER = "+8801845278579";
export const NAGAD_NUMBER = BKASH_NUMBER;
export const PAYMENT_NUMBER_DISPLAY = "01845278579";

const parseContactEmails = (): string[] => {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAILS ?? process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.includes("@"));
};

export const siteInfo = {
  programName: "Undergraduate Hub Book Reading Program",
  paymentMethod: "bKash/Nagad (Personal)",
  paymentNumber: BKASH_NUMBER,
  paymentDisplayNumber: PAYMENT_NUMBER_DISPLAY,
  paymentNumbers: { bkash: BKASH_NUMBER, nagad: NAGAD_NUMBER },
  address: "East West University, Block A, Road 01, Aftabnagar, Dhaka, Bangladesh",
  phoneNumbers: ["01619617036", "01845278579"],
  facebookUrl: "https://www.facebook.com/undergraduate.hub",
  instagramUrl: "https://instagram.com/undergraduatehub_Com",
  contactEmails: parseContactEmails(),
} as const;

export const libraryContact = {
  address: siteInfo.address,
  phoneNumbers: siteInfo.phoneNumbers,
  paymentNumber: siteInfo.paymentNumber,
  facebook: siteInfo.facebookUrl,
  instagram: siteInfo.instagramUrl,
  contactEmails: siteInfo.contactEmails,
} as const;