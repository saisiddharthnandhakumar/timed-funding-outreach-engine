import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidSession } from "@/lib/auth";

/**
 * Gate every page and API route behind the admin session, except:
 *  - /login
 *  - /api/cron/*  (protected separately by the CRON_SECRET bearer token)
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/cron/")) return NextResponse.next();

  if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === "production") {
    return new NextResponse("ADMIN_PASSWORD is not configured on this deployment.", { status: 503 });
  }
  if (await isValidSession(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
