import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const response = NextResponse.redirect(new URL("/member/register", request.url));
  if (/^ref_[a-z0-9]{5,32}$/i.test(code)) {
    response.cookies.set("ref_code", code.toLowerCase(), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  }
  return response;
}