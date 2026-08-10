import { AuthProvider } from "@/app/components/AuthProvider"
import { Sidebar } from "@/app/components/Sidebar"
import { Topbar } from "@/app/components/Topbar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="shell">
        <Sidebar />
        <div className="shell-main">
          <Topbar />
          <main className="wrap">{children}</main>
        </div>
      </div>
    </AuthProvider>
  )
}