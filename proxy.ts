import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

function contentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";
  let supabaseOrigin = "";
  let supabaseSocketOrigin = "";
  try {
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (supabaseUrl.protocol === "https:" || (isDevelopment && supabaseUrl.protocol === "http:")) {
      supabaseOrigin = supabaseUrl.origin;
      supabaseSocketOrigin = `${supabaseUrl.protocol === "https:" ? "wss:" : "ws:"}//${supabaseUrl.host}`;
    }
  } catch {
    // Keep external connections blocked until the Supabase URL is configured.
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: ${supabaseOrigin} https://substackcdn.com https://pbs.twimg.com`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${supabaseOrigin} ${supabaseSocketOrigin}${isDevelopment ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const adminRoot = "/ashik-loves-jannat";
  if (pathname === adminRoot || pathname.startsWith(`${adminRoot}/`)) {
    const loginPath = `${adminRoot}/login`;
    if (pathname !== loginPath && !request.cookies.has("uhl-admin-session")) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const securedResponse = NextResponse.next({ request: { headers: requestHeaders } });
  securedResponse.headers.set("Content-Security-Policy", csp);
  const authCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
  for (const cookie of request.cookies.getAll()) {
    if (/^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(cookie.name)) {
      securedResponse.cookies.set(cookie.name, cookie.value, authCookieOptions);
    }
  }
  if (pathname !== "/member" && !pathname.startsWith("/member/")) return securedResponse;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return securedResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          securedResponse.cookies.set(name, value, { ...options, ...authCookieOptions });
        });
      },
    },
  });

  await supabase.auth.getClaims();

  return securedResponse;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
