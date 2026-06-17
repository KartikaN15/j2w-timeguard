import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/backend/auth.api";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LottiePlayer } from "@/components/LottiePlayer";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · J2W Attendance" }] }),
  component: AuthPage,
});

// Hero animation (file in /public/lottie/json). Swap the name to change it.
const HERO_LOTTIE = "team-working-on-project";

const FONT = "'Poppins', ui-sans-serif, system-ui, sans-serif";

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  if (user) {
    navigate({ to: isAdmin ? "/admin/live" : "/" });
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = mode === "signup"
        ? await signUp(email, password, fullName)
        : await signIn(email, password);
      const resultIsAdmin = result.roles.some((r) => r === "super_admin" || r === "hr_admin");
      navigate({ to: resultIsAdmin ? "/admin/live" : "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  const isSignin = mode === "signin";

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8"
      style={{ fontFamily: FONT, backgroundColor: "#fbe9b8" }}
    >
      {/* Dotted pattern background (like the reference) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(212,155,42,0.35) 1.5px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />
      {/* Soft corner blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, #f6d27e 0%, transparent 70%)", opacity: 0.6 }} />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full" style={{ background: "radial-gradient(circle, #f4c84c 0%, transparent 70%)", opacity: 0.5 }} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md rounded-[28px] bg-white p-7 shadow-[0_20px_60px_-15px_rgba(140,47,82,0.25)] sm:p-9">
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/logo.png"
            alt="Joules to Watts"
            className="h-10 w-auto object-contain"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>

        {/* Hero illustration */}
        <LottiePlayer name={HERO_LOTTIE} className="mx-auto h-44 sm:h-52" />

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#8c2f52] sm:text-[28px]">
            J2W Attendance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Easy way to record &amp; track attendance
          </p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {!isSignin && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</Label>
              <Input id="name" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-12 rounded-xl" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
            <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isSignin ? "current-password" : "new-password"}
                className="h-12 rounded-xl pr-11"
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Primary action — burgundy filled (like reference "Sign up") */}
          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#8c2f52] text-sm font-semibold text-white shadow-md transition-all hover:bg-[#7a2746] active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isSignin ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {busy ? "Please wait…" : isSignin ? "Log in" : "Sign up"}
          </button>
        </form>

        {/* Secondary action — outline (like reference "Log in") */}
        <button
          type="button"
          onClick={() => setMode(isSignin ? "signup" : "signin")}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-full border-2 border-[#8c2f52]/30 text-sm font-semibold text-[#8c2f52] transition-colors hover:bg-[#8c2f52]/5"
        >
          {isSignin ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
