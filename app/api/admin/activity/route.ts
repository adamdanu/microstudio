import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { getActivity } from "@/lib/activity"

// GET /api/admin/activity?page=&pageSize= -> all activity (admin only)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20))

  const { items, total } = await getActivity(undefined, page, pageSize)
  return NextResponse.json({ items, total, page, pageSize })
}