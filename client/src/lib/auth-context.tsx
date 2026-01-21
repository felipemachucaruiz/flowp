import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User, Tenant } from "@shared/schema";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  setTenant: (tenant: Tenant) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth on mount
    const storedUser = localStorage.getItem("pos_user");
    const storedTenant = localStorage.getItem("pos_tenant");
    
    if (storedUser && storedTenant) {
      setUser(JSON.parse(storedUser));
      setTenant(JSON.parse(storedTenant));
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) return false;
      
      const data = await response.json();
      setUser(data.user);
      setTenant(data.tenant);
      localStorage.setItem("pos_user", JSON.stringify(data.user));
      localStorage.setItem("pos_tenant", JSON.stringify(data.tenant));
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setTenant(null);
    localStorage.removeItem("pos_user");
    localStorage.removeItem("pos_tenant");
  };

  return (
    <AuthContext.Provider value={{ user, tenant, isLoading, login, logout, setTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
