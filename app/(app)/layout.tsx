import { AuthProvider } from "@/app/components/AuthProvider"
import { Sidebar } from "@/app/components/Sidebar"
import { Topbar } from "@/app/components/Topbar"
import { SideOverlayProvider } from "@/app/components/SideOverlay"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SideOverlayProvider>
        <div className="shell">
          <Sidebar />
          <div className="shell-main">
            <Topbar />
            <main className="wrap">{children}</main>
          </div>
        </div>
      </SideOverlayProvider>
    </AuthProvider>
  )
}