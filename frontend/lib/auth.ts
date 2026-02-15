export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("orthogenesis_token");
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("orthogenesis_token", token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("orthogenesis_token");
}
