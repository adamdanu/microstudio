"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuth } from "../../../components/AuthProvider"
import { KeyPoolsPanel } from "../../../components/key-pools/KeyPoolsPanel"

export default function KeyPoolsPage() {
  const { session } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (session && !session.isAdmin) router.replace("/studio")
  }, [session, router])

  return <KeyPoolsPanel />
}