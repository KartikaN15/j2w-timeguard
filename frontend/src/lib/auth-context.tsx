import * as React from "react";
import {
  getCurrentUser,
  signOut as apiSignOut,
  type SessionUser,
  type Role,
} from "@/backend/auth.api";

export type { Role };

type AuthState = {
  user: SessionUser | null;
  roles: Role[];
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => void;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(() => {
    const current = getCurrentUser();
    setUser(current);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    // Only runs on client — avoids SSR/hydration mismatch
    refresh();
  }, [refresh]);

  const value = React.useMemo<AuthState>(
    () => ({
      user,
      roles: user?.roles ?? [],
      loading,
      isAdmin: (user?.roles ?? []).some(
        (r: Role) => r === "super_admin" || r === "hr_admin",
      ),
      signOut: async () => {
        await apiSignOut();
        setUser(null);
      },
      refreshUser: refresh,
    }),
    [user, loading, refresh],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
