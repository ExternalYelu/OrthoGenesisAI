const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export type JobPayload = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  eta_seconds?: number | null;
  attempts: number;
  max_attempts: number;
  error?: string | null;
  result_json?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export type AnnotationComment = {
  id: number;
  author: string;
  message: string;
  created_at: string;
};

export type AnnotationRecord = {
  id: number;
  reconstruction_id: number;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved";
  anchor: [number, number, number];
  created_at: string;
  updated_at: string;
  comments: AnnotationComment[];
};

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

export async function getJob(jobId: string) {
  const response = await fetch(`${API_URL}/reconstruct/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error("Job not found");
  }
  return (await response.json()) as JobPayload;
}

export function getJobStreamUrl(jobId: string) {
  return `${API_URL}/reconstruct/jobs/${jobId}/stream`;
}

export async function retryJob(jobId: string) {
  const response = await fetch(`${API_URL}/reconstruct/jobs/${jobId}/retry`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error("Retry failed");
  }
  return (await response.json()) as JobPayload;
}

export async function getModel(modelId: number) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}`);
  if (!response.ok) {
    throw new Error("Model not found");
  }
  return response.json();
}

export async function getModelConfidence(modelId: number) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}/confidence`);
  if (!response.ok) {
    throw new Error("Confidence report unavailable");
  }
  return response.json();
}

export async function exportModel(
  modelId: number,
  format: string,
  token?: string,
  asyncMode = true,
  options?: { preset?: "draft" | "clinical" | "print" | "web"; units?: "mm" | "cm" | "in"; tolerance_mm?: number }
) {
  const params = new URLSearchParams({
    format,
    async_mode: asyncMode ? "true" : "false",
    preset: options?.preset || "clinical",
    units: options?.units || "mm",
    tolerance_mm: String(options?.tolerance_mm ?? 0.25)
  });
  const response = await fetch(
    `${API_URL}/reconstruct/model/${modelId}/export?${params.toString()}`,
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

export async function exportBundle(
  modelId: number,
  payload: {
    formats: string[];
    preset: "draft" | "clinical" | "print" | "web";
    units: "mm" | "cm" | "in";
    tolerance_mm: number;
  }
) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}/export-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Bundle export failed");
  }
  const data = await response.json();
  if (data.download_url?.startsWith("/")) {
    data.download_url = `${API_URL}${data.download_url}`;
  }
  return data as { download_url: string; manifest: Record<string, unknown> };
}

export async function listAnnotations(modelId: number) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}/annotations`);
  if (!response.ok) {
    throw new Error("Failed to load annotations");
  }
  return (await response.json()) as AnnotationRecord[];
}

export async function createAnnotation(
  modelId: number,
  payload: {
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    status: "open" | "in_review" | "resolved";
    anchor: [number, number, number];
    comment?: { author: string; message: string };
  }
) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to create annotation");
  }
  return (await response.json()) as AnnotationRecord;
}

export async function updateAnnotation(
  modelId: number,
  annotationId: number,
  payload: {
    title?: string;
    severity?: "low" | "medium" | "high" | "critical";
    status?: "open" | "in_review" | "resolved";
  }
) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}/annotations/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to update annotation");
  }
  return (await response.json()) as AnnotationRecord;
}

export async function addAnnotationComment(
  modelId: number,
  annotationId: number,
  payload: { author: string; message: string }
) {
  const response = await fetch(
    `${API_URL}/reconstruct/model/${modelId}/annotations/${annotationId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  if (!response.ok) {
    throw new Error("Failed to add comment");
  }
  return (await response.json()) as AnnotationRecord;
}

export async function deleteAnnotation(modelId: number, annotationId: number) {
  const response = await fetch(`${API_URL}/reconstruct/model/${modelId}/annotations/${annotationId}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error("Failed to delete annotation");
  }
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
