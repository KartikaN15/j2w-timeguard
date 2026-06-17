import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import {
  LayoutDashboard, Clock, Umbrella, History, Menu, X,
  LogOut, ChevronDown, ChevronRight, Shield, Activity,
  CheckSquare, Smartphone, Users, FileText,
  Building2, Home, BarChart3, Settings,
} from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3] px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
          <a href="/" className="rounded-lg border px-4 py-2 text-sm font-medium">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppShell() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const routerState = useRouterState();
  const isAuthPage = routerState.location.pathname === "/auth";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth page: render without layout
  if (isAuthPage || (!user && !loading)) {
    return <Outlet />;
  }
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3]">
      <div className="h-7 w-7 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>;
  }


  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f5f3]">
      {/* ── Sidebar (desktop only) ── */}
      <aside className="hidden lg:flex w-60 flex-col bg-white border-r border-border shadow-sm lg:sticky lg:top-0 lg:h-screen lg:shrink-0">
        {/* Logo */}
        <div className="relative flex items-center justify-center border-b border-border px-4 py-4 shrink-0">
          <img src="/logo.png" alt="Joules to Watts" className="h-12 w-full max-w-[150px] object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }} />
          <div className="hidden items-center gap-2 justify-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-white font-extrabold text-sm">J2W</div>
            <div className="leading-tight">
              <div className="font-bold text-xs text-foreground">Joules to Watts</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Time Matters</div>
            </div>
          </div>
          <button className="absolute right-3 top-1/2 -translate-y-1/2 lg:hidden p-1 text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* User profile */}
        {user && (
          <div className="border-b border-border px-4 py-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg,#8c2f52,#b8456e)" }}>
                {user.user_metadata.full_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground">Welcome back,</div>
                <div className="text-sm font-semibold text-foreground truncate">{user.user_metadata.full_name.split(" ")[0]}</div>
              </div>
            </div>
          </div>
        )}

        {/* Nav — scrollable */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {isAdmin ? (
            <>
              <div className="mb-2 px-3 pt-1 flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-primary/70" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">HR Portal</span>
              </div>
              <NavItem to="/admin/live" icon={<Activity className="h-4 w-4" />} label="Dashboard" />
              <NavItem to="/admin/users" icon={<Users className="h-4 w-4" />} label="User Management" />
              <NavItem to="/admin/employees" icon={<Building2 className="h-4 w-4" />} label="Configuration" />
              <NavItem to="/admin/leaves" icon={<CheckSquare className="h-4 w-4" />} label="Leave Approvals" />
              <NavItem to="/admin/devices" icon={<Smartphone className="h-4 w-4" />} label="Devices" />
            </>
          ) : (
            <>
              <NavItem to="/" icon={<LayoutDashboard className="h-4 w-4" />} label="Home" exact />
              <NavSection label="Leave" icon={<Umbrella className="h-4 w-4" />} defaultOpen>
                <NavSubItem to="/leaves" search={{ tab: "apply" }} label="Apply Leave" icon={<FileText className="h-3.5 w-3.5" />} />
                <NavSubItem to="/leaves" search={{ tab: "balances" }} label="Leave Balances" icon={<BarChart3 className="h-3.5 w-3.5" />} />
                <NavSubItem to="/leaves" search={{ tab: "history" }} label="Leave History" icon={<History className="h-3.5 w-3.5" />} />
              </NavSection>
              <NavSection label="Attendance" icon={<Clock className="h-4 w-4" />} defaultOpen>
                <NavSubItem to="/history" label="Attendance Logs" icon={<History className="h-3.5 w-3.5" />} />
              </NavSection>
              <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
            </>
          )}
        </nav>

        {/* Sign out — bottom */}
        <div className="shrink-0 border-t border-border px-3 py-3">
          <button onClick={() => signOut()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          <div className="mt-1 px-3 text-center text-[10px] text-muted-foreground/40">
            Demo · resets on refresh
          </div>
        </div>
      </aside>

      {/* ── Main content (scrollable) ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Scrollable page content (extra bottom padding on mobile for the tab bar) */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* ── Bottom tab bar (mobile only) ── */}
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}

// ── Bottom tab bar (mobile) ───────────────────────────────────────────────────

function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const items = isAdmin
    ? [
        { to: "/admin/live", icon: Activity, label: "Home", exact: false },
        { to: "/admin/users", icon: Users, label: "Users", exact: false },
        { to: "/admin/leaves", icon: CheckSquare, label: "Leaves", exact: false },
        { to: "/admin/devices", icon: Smartphone, label: "Devices", exact: false },
      ]
    : [
        { to: "/", icon: LayoutDashboard, label: "Home", exact: true },
        { to: "/leaves", icon: Umbrella, label: "Leave", exact: false },
        { to: "/history", icon: History, label: "Logs", exact: false },
        { to: "/settings", icon: Settings, label: "Settings", exact: false },
      ];

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_-8px_rgba(140,47,82,0.15)]">
      <div className="flex items-stretch justify-around px-1.5 py-1.5">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            activeOptions={{ exact: it.exact }}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground transition-colors"
            activeProps={{ className: "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold text-primary bg-primary/10" }}
          >
            <it.icon className="h-5 w-5" />
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ── Nav components ────────────────────────────────────────────────────────────

function NavItem({ to, icon, label, exact }: { to: string; icon: ReactNode; label: string; exact?: boolean }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      activeProps={{ className: "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary bg-primary/8 border-l-2 border-primary" }}
    >
      {icon}
      {label}
    </Link>
  );
}

function NavSubItem({ to, icon, label, search }: { to: string; icon: ReactNode; label: string; search?: Record<string, string> }) {
  return (
    <Link
      to={to as "/leaves" | "/history"}
      search={search as any}
      className="flex items-center gap-2 rounded-lg py-1.5 pl-9 pr-3 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      activeProps={{ className: "flex items-center gap-2 rounded-lg py-1.5 pl-9 pr-3 text-[13px] font-semibold text-primary bg-primary/8" }}
      activeOptions={{ exact: true, includeSearch: !!search }}
    >
      {icon}
      {label}
    </Link>
  );
}

function NavSection({ label, icon, children, defaultOpen }: {
  label: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}
