import { prisma } from "@/lib/prisma"

// Record one analysis outcome (success/fail + token usage) for analytics.
export async function recordAnalysis(userId: string, status: "SUCCESS" | "FAIL", tokensIn: number, tokensOut: number): Promise<void> {
  try {
    await prisma.analysisLog.create({
      data: {
        userId,
        status,
        tokensIn: Math.max(0, Math.round(tokensIn || 0)),
        tokensOut: Math.max(0, Math.round(tokensOut || 0)),
      },
    })
  } catch { /* best-effort */ }
}