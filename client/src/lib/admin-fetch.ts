export async function adminFetch(url: string, options: RequestInit = {}) {
  // Check for internal admin token first, fall back to checking session-based auth
  const token = localStorage.getItem("internal_admin_token");
  const isInternal = localStorage.getItem("pos_is_internal") === "true";
  
  // If we have a token, use Bearer auth; otherwise rely on session cookies
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
  
  // Handle 401 unauthorized by redirecting to login
  if (response.status === 401) {
    localStorage.removeItem("internal_admin_token");
    localStorage.removeItem("pos_is_internal");
    window.location.href = "/login";
  }
  
  return response;
}
