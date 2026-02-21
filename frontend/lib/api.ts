const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export async function uploadXrays(payload: FormData, token?: string) {
  const response = await fetch(`${API_URL}/upload/xrays`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: payload
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.detail || data.error || "Upload failed");
    } catch {
      throw new Error(text || "Upload failed");
    }
  }
  return response.json();
}

export async function reconstruct(caseId: number, token?: string) {
  const response = await fetch(`${API_URL}/reconstruct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ case_id: caseId })
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.detail || data.error || "Reconstruction failed");
    } catch {
      throw new Error(text || "Reconstruction failed");
    }
  }
  return response.json();
}

export async function getModel(modelId: number) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}`);
  if (!response.ok) {
    throw new Error("Model not found");
  }
  return response.json();
}

export async function exportModel(modelId: number, format: string, token?: string) {
  const response = await fetch(
    `${API_URL}/reconstruct/model/${modelId}/export?format=${format}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }
  );
  if (!response.ok) {
    throw new Error("Export failed");
  }
  const data = await response.json();
  if (data.download_url?.startsWith("/")) {
    data.download_url = `${API_URL}${data.download_url}`;
  }
  return data;
}

export function getModelFileUrl(modelId: number) {
  return `${API_URL}/reconstruct/model/${modelId}/file`;
}

export async function login(email: string, password: string) {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  if (!response.ok) {
    throw new Error("Login failed");
  }
  return response.json();
}

export async function register(payload: {
  email: string;
  full_name: string;
  password: string;
  role?: string;
}) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Registration failed");
  }
  return response.json();
}
