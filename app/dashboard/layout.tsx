import Nav from '@/components/Nav'
import DashboardAuthGate from '@/components/DashboardAuthGate'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardAuthGate>
      <div className="flex flex-col min-h-screen bg-zinc-950">
        <Nav />
        <main className="flex-1 w-full max-w-screen-sm mx-auto">
          {children}
        </main>
      </div>
    </DashboardAuthGate>
  )
}
