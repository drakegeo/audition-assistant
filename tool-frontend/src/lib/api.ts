import { supabase } from "./supabase";
import type {
  Script,
  ScriptListItem,
  ScriptStatusResponse,
  ScriptUploadResponse,
} from "@/types/script";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let code = "unknown_error";
  let detail = res.statusText;
  try {
    const body = await res.json();
    code = body?.detail?.error ?? body?.error ?? code;
    detail = body?.detail?.detail ?? body?.detail ?? detail;
  } catch {
    // non-JSON error body — keep defaults
  }
  throw new ApiError(res.status, code, detail);
}

export async function listScripts(): Promise<ScriptListItem[]> {
  const res = await fetch(`${BASE}/scripts`, { headers: await authHeaders() });
  return handleResponse<ScriptListItem[]>(res);
}

export async function getScript(scriptId: string): Promise<Script> {
  const res = await fetch(`${BASE}/scripts/${scriptId}`, {
    headers: await authHeaders(),
  });
  return handleResponse<Script>(res);
}

export async function renameScript(scriptId: string, title: string): Promise<void> {
  const res = await fetch(`${BASE}/scripts/${scriptId}`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return handleResponse<void>(res);
}

export async function uploadScript(
  file: File
): Promise<ScriptUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/scripts`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  return handleResponse<ScriptUploadResponse>(res);
}

export async function getScriptStatus(
  scriptId: string
): Promise<ScriptStatusResponse> {
  const res = await fetch(`${BASE}/scripts/${scriptId}/status`, {
    headers: await authHeaders(),
  });
  return handleResponse<ScriptStatusResponse>(res);
}

export async function getCurrentScript(): Promise<Script | null> {
  const res = await fetch(`${BASE}/scripts/current`, {
    headers: await authHeaders(),
  });
  if (res.status === 404) return null;
  return handleResponse<Script>(res);
}

export async function deleteScript(scriptId: string): Promise<void> {
  const res = await fetch(`${BASE}/scripts/${scriptId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (res.status === 204) return;
  return handleResponse<void>(res);
}
