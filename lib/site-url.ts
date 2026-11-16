import "server-only";

export function getSiteUrl(): URL {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSiteUrl) return new URL(configuredSiteUrl);

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return new URL(`https://${vercelUrl}`);

  if (process.env.NODE_ENV !== "production") return new URL("http://localhost:3000");

  throw new Error("NEXT_PUBLIC_SITE_URL must be configured in production.");
}