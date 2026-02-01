import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User, Tenant } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  isInternal: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; redirectTo?: string }>;
  logout: () => void;
  setTenant: (tenant: Tenant) => void;
  refreshTenant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    // Check for stored auth on mount
    const storedUser = localStorage.getItem("pos_user");
    const storedTenant = localStorage.getItem("pos_tenant");
    const storedIsInternal = localStorage.getItem("pos_is_internal");
    
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      if (storedTenant) {
        setTenant(JSON.parse(storedTenant));
      }
      setIsInternal(storedIsInternal === "true");
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; redirectTo?: string }> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) return { success: false };
      
      const data = await response.json();
      setUser(data.user);
      setTenant(data.tenant);
      setIsInternal(data.isInternal || false);
      
      localStorage.setItem("pos_user", JSON.stringify(data.user));
      if (data.tenant) {
        localStorage.setItem("pos_tenant", JSON.stringify(data.tenant));
      }
      localStorage.setItem("pos_is_internal", data.isInternal ? "true" : "false");
      
      // Store internal admin token if provided (for API authentication)
      if (data.token) {
        localStorage.setItem("internal_admin_token", data.token);
      }
      
      // For new tenants that haven't completed onboarding, redirect to wizard
      let redirectTo = data.redirectTo;
      if (!redirectTo) {
        if (data.isInternal) {
          redirectTo = "/admin";
        } else if (data.tenant && !data.tenant.onboardingComplete) {
          redirectTo = "/onboarding";
        } else {
          redirectTo = "/pos";
        }
      }
      
      return { 
        success: true, 
        redirectTo
      };
    } catch {
      return { success: false };
    }
  };

  const logout = () => {
    setUser(null);
    setTenant(null);
    setIsInternal(false);
    localStorage.removeItem("pos_user");
    localStorage.removeItem("pos_tenant");
    localStorage.removeItem("pos_is_internal");
    localStorage.removeItem("internal_admin_token");
    // Clear all cached data to prevent showing data from previous company
    queryClient.clear();
  };

  const refreshTenant = async () => {
    if (!tenant) return;
    try {
      const response = await fetch("/api/auth/tenant", {
        headers: { "x-tenant-id": tenant.id },
      });
      if (response.ok) {
        const updatedTenant = await response.json();
        setTenant(updatedTenant);
        localStorage.setItem("pos_tenant", JSON.stringify(updatedTenant));
      }
    } catch (error) {
      console.error("Failed to refresh tenant:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, tenant, isLoading, isInternal, login, logout, setTenant, refreshTenant }}>
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
