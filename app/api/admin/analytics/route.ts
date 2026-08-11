import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const DAY_MS = 86400000

const VALID_INTERVALS = ["daily", "weekly", "monthly", "yearly"] as const
type Interval = (typeof VALID_INTERVALS)[number]

const VALID_RANGES: Record<string, number | null> = {
  all: null,
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
}

function parseFrom(from: string | null): Date | null {
  if (from === "today") {
    // calendar today (user-local) — from local midnight
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return start
  }
  const days = VALID_RANGES[from || "all"]
  if (days == null) return null
  return new Date(Date.now() - days * DAY_MS)
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from = parseFrom(searchParams.get("from"))
  const intervalRaw = searchParams.get("interval") || "daily"
  const interval: Interval = VALID_INTERVALS.includes(intervalRaw as Interval) ? intervalRaw as Interval : "daily"

  const where = from ? { createdAt: { gte: from } } : {}

  // ── per-user totals ─────────────────────────────────────────────────────
  const grouped = await prisma.analysisLog.groupBy({
    by: ["userId", "status"],
    where,
    _count: { _all: true },
    _sum: { tokensIn: true, tokensOut: true },
  })
  const userEmails = await prisma.user.findMany({ select: { id: true, email: true } })
  const emailById = new Map(userEmails.map(u => [u.id, u.email]))

  const perUserMap = new Map<string, { userId: string; email: string; requests: number; success: number; failed: number; tokensIn: number; tokensOut: number }>()
  for (const g of grouped) {
    const row = perUserMap.get(g.userId) || { userId: g.userId, email: emailById.get(g.userId) || "?", requests: 0, success: 0, failed: 0, tokensIn: 0, tokensOut: 0 }
    row.requests += g._count._all
    if (g.status === "SUCCESS") row.success += g._count._all
    else row.failed += g._count._all
    row.tokensIn += g._sum.tokensIn ?? 0
    row.tokensOut += g._sum.tokensOut ?? 0
    perUserMap.set(g.userId, row)
  }
  const perUser = Array.from(perUserMap.values()).map(r => ({
    ...r,
    avgTokensPerReq: r.requests ? Math.round(r.tokensIn / r.requests) : 0,
  })).sort((a, b) => b.requests - a.requests)

  // ── aggregate from per-user ─────────────────────────────────────────────
  const requests = perUser.reduce((s, r) => s + r.requests, 0)
  const success = perUser.reduce((s, r) => s + r.success, 0)
  const failed = perUser.reduce((s, r) => s + r.failed, 0)
  const tokensIn = perUser.reduce((s, r) => s + r.tokensIn, 0)
  const tokensOut = perUser.reduce((s, r) => s + r.tokensOut, 0)
  const activeUsers = perUser.length

  const aggregate = {
    requests,
    success,
    failed,
    tokensIn,
    tokensOut,
    successRate: requests ? Math.round((success / requests) * 1000) / 10 : null,
    avgTokensPerReq: requests ? Math.round(tokensIn / requests) : null,
    avgTokensOutPerReq: requests ? Math.round(tokensOut / requests) : null,
    avgRequestsPerUser: activeUsers ? Math.round((requests / activeUsers) * 10) / 10 : null,
    avgSuccessPerUser: activeUsers ? Math.round((success / activeUsers) * 10) / 10 : null,
    avgFailedPerUser: activeUsers ? Math.round((failed / activeUsers) * 10) / 10 : null,
    avgTokensPerUser: activeUsers ? Math.round(tokensIn / activeUsers) : null,
    activeUsers,
  }

  // ── time series (DB-side date_trunc bucketing) ─────────────────────────
  const trunc = interval === "yearly" ? "year" : interval === "monthly" ? "month" : interval === "weekly" ? "week" : "day"
  const seriesRaw: Array<{ bucket: Date; requests: bigint; success: bigint; failed: bigint; tokensIn: bigint; tokensOut: bigint }>
    = await prisma.$queryRawUnsafe(
      `SELECT date_trunc($1, "createdAt") AS bucket,
        COUNT(*) AS requests,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
        COUNT(*) FILTER (WHERE status = 'FAIL') AS failed,
        COALESCE(SUM("tokensIn"),0) AS "tokensIn",
        COALESCE(SUM("tokensOut"),0) AS "tokensOut"
      FROM "AnalysisLog"
      ${from ? `WHERE "createdAt" >= $2` : ""}
      GROUP BY bucket ORDER BY bucket ASC`,
      trunc,
      ...(from ? [from] : []),
    )
  const series = seriesRaw.map(s => ({
    bucket: s.bucket,
    requests: Number(s.requests),
    success: Number(s.success),
    failed: Number(s.failed),
    tokensIn: Number(s.tokensIn),
    tokensOut: Number(s.tokensOut),
  }))

  return NextResponse.json({ aggregate, perUser, series, interval, from })
}