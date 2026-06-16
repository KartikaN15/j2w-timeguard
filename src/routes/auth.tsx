import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/backend/auth.api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, MapPin, Clock, ShieldCheck, Fingerprint, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · J2W Attendance" }] }),
  component: AuthPage,
});

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "admin@j2w.in", badge: "Admin", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { label: "HRBP", email: "hrbp@joulestowatts.com", badge: "HR", color: "bg-pink-100 text-pink-700 border-pink-200" },
  { label: "GE Healthcare", email: "arjun.mehta@ge.com", badge: "Employee", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "GE Healthcare", email: "priya.nair@ge.com", badge: "Employee", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "TCS", email: "ravi.kumar@tcs.com", badge: "Employee", color: "bg-blue-100 text-blue-700 border-blue-200" },
];

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, refreshUser, isAdmin } = useAuth();

  if (user) {
    navigate({ to: isAdmin ? "/admin/live" : "/" });
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") await signUp(email, password, fullName);
      else await signIn(email, password);
      refreshUser();
      navigate({ to: isAdmin ? "/admin/live" : "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)" }}>
        {/* Animated blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }} />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />
          <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }} />
          <div className="absolute inset-0" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
            backgroundSize: "32px 32px"
          }} />
        </div>

        <div className="relative z-10 flex flex-col h-full p-12 justify-between">
          {/* Logo */}
          <div>
            <img src="/logo.png" alt="Joules to Watts" className="h-12 w-auto object-contain brightness-0 invert"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = "flex";
              }}
            />
            <div className="hidden items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-extrabold text-lg"
                style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>J2W</div>
              <div>
                <div className="font-bold text-white text-lg">Joules to Watts</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">Time Matters</div>
              </div>
            </div>
          </div>

          {/* Main copy */}
          <div className="py-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              GPS-verified attendance system
            </div>
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
              Smart attendance<br />
              <span style={{ background: "linear-gradient(90deg, #818cf8, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                for modern teams
              </span>
            </h1>
            <p className="text-base text-white/50 leading-relaxed max-w-sm">
              No more fake WFH claims. GPS-tagged punches, device binding, and an immutable log HR can actually trust.
            </p>

            <div className="mt-8 space-y-3">
              {[
                { icon: <MapPin className="h-4 w-4" />, text: "Geo-fenced punch — office or home only", color: "text-blue-400" },
                { icon: <Fingerprint className="h-4 w-4" />, text: "Device fingerprint — max 2 per employee", color: "text-purple-400" },
                { icon: <ShieldCheck className="h-4 w-4" />, text: "Append-only log — zero edits, zero deletions", color: "text-green-400" },
                { icon: <Clock className="h-4 w-4" />, text: "Session tracking with late remarks & shortfall", color: "text-amber-400" },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-3">
                  <div className={`${f.color} shrink-0`}>{f.icon}</div>
                  <span className="text-sm text-white/60">{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom stat chips */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "5+ client companies", emoji: "🏢" },
              { label: "GPS-verified daily", emoji: "📍" },
              { label: "Demo-ready", emoji: "✅" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50">
                <span>{s.emoji}</span>{s.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 flex-col justify-center bg-[#f5f7fa] px-6 py-10">
        <div className="mx-auto w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-6 flex justify-center lg:hidden">
            <img src="/logo.png" alt="J2W" className="h-10 w-auto object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-border bg-white p-7 shadow-lg shadow-black/5">
            <h2 className="text-2xl font-bold text-foreground">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin" ? "Sign in to your J2W workspace" : "Register your account"}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</Label>
                  <Input id="name" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-11" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPwd ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={(e) => setPassword(e.target.value)} required minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"} className="h-11 pr-10" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={busy} className="w-full h-11 font-semibold gap-2 mt-1">
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
              {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
