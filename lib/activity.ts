import { prisma } from "@/lib/prisma"

// Record an activity entry (login, analyze, admin actions, password change, etc.)
export async function recordActivity(userId: string, action: string, detail?: string, ip?: string): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { userId, action, detail: detail || null, ip: ip || null },
    })
  } catch { /* best-effort */ }
}

export async function getActivity(userId?: string, page = 1, pageSize = 20) {
  const where = userId ? { userId } : {}
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { email: true, role: true } } },
    }),
    prisma.activityLog.count({ where }),
  ])
  return { items, total, page, pageSize }
}