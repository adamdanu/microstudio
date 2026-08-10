import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyCookieToken } from "@/lib/auth"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isApi = pathname.startsWith("/api/")
  const authApi = /^\/api\/auth\/(login|logout|forgot|reset|profile)$/.test(pathname)
  if (isApi && !authApi) {
    const token = request.cookies.get("microstudio_session")?.value
    if (!verifyCookieToken(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  if (pathname.startsWith("/studio") || pathname.startsWith("/profile")) {
    const token = request.cookies.get("microstudio_session")?.value
    if (!verifyCookieToken(token)) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      if (pathname !== "/studio") url.searchParams.set("next", pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/studio/:path*", "/profile/:path*", "/api/:path*"],
}