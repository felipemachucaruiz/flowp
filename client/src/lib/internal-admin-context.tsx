import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface InternalUser {
  id: string;
  email: string;
  role: "superadmin" | "supportagent" | "billingops";
  name: string | null;
}

interface InternalAdminContextValue {
  user: InternalUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (allowedRoles: string[]) => boolean;
}

const InternalAdminContext = createContext<InternalAdminContextValue | undefined>(undefined);

const STORAGE_USER_KEY = "internalAdminUser";
const STORAGE_TOKEN_KEY = "internalAdminToken";

export function internalAdminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY);
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Content-Type", "application/json");

  return fetch(url, {
    ...options,
    headers,
  });
}

export function InternalAdminProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<InternalUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem(STORAGE_USER_KEY);
    const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch {
        localStorage.removeItem(STORAGE_USER_KEY);
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/internal-admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (data.success && data.user && data.user.token) {
        const userData = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
        };
        
        setUser(userData);
        setToken(data.user.token);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
        localStorage.setItem(STORAGE_TOKEN_KEY, data.user.token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  };

  const hasPermission = (allowedRoles: string[]): boolean => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <InternalAdminContext.Provider value={{ user, token, loading, login, logout, hasPermission }}>
      {children}
    </InternalAdminContext.Provider>
  );
}

export function useInternalAdmin() {
  const context = useContext(InternalAdminContext);
  if (!context) {
    throw new Error("useInternalAdmin must be used within InternalAdminProvider");
  }
  return context;
}
