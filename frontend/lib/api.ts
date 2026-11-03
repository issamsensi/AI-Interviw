/** Typed client for the FastAPI backend. No secrets live here. */
import { getAccessToken } from "./supabase";
import type {
  AnalyzeResumeResponse,
  EndInterviewResponse,
  ProfileResponse,
  ProfileUser,
  ReportResponse,
  StartInterviewResponse,
  TranscribeResponse,
  UploadResumeResponse,
} from "./types";

export const ANON_STORAGE_KEY = "aiw.anonymousId";
export const RESUME_STORAGE_KEY = "aiw.resumeId";
export const INTERVIEW_STORAGE_KEY = "aiw.interviewId";
export const MODE_STORAGE_KEY = "aiw.interviewMode";

export function apiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, "");
  return "http://localhost:8000";
}

export class ApiError extends Error {
  status: number;
  /** Machine-readable backend code, e.g. GUEST_TRIAL_USED. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function newAnonymousId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Stable per-browser anonymous identity, sent as X-Anonymous-User-ID. */
export function getAnonymousId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(ANON_STORAGE_KEY);
  if (!id) {
    id = newAnonymousId();
    window.localStorage.setItem(ANON_STORAGE_KEY, id);
  }
  return id;
}

function parseErrorBody(status: number, bodyText: string): { message: string; code?: string } {
  if (bodyText) {
    try {
      const data = JSON.parse(bodyText) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail.trim()) return { message: data.detail };
      if (data.detail && typeof data.detail === "object") {
        const detail = data.detail as { code?: unknown; message?: unknown };
        return {
          message: typeof detail.message === "string" && detail.message.trim() ? detail.message : parseErrorMessage(status, ""),
          code: typeof detail.code === "string" ? detail.code : undefined,
        };
      }
    } catch {
      /* fall through to status-based message */
    }
  }
  return { message: parseErrorMessage(status, "") };
}

function parseErrorMessage(status: number, bodyText: string): string {
  if (bodyText) {
    try {
      const data = JSON.parse(bodyText) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
    } catch {
      /* fall through to status-based message */
    }
  }
  switch (status) {
    case 400:
      return "Invalid request. Please check the entered information.";
    case 404:
      return "Item not found. It may have expired — please redo the step.";
    case 413:
      return "File too large for the server.";
    case 415:
      return "Unsupported file format.";
    case 422:
      return "The server could not process this data.";
    case 500:
      return "AI service not configured or unavailable. Please try again later.";
    case 502:
      return "The AI service returned an invalid response. Please retry.";
    case 504:
      return "The AI service is taking too long. Please retry.";
    default:
      return "A network or server error occurred. Please retry.";
  }
}

export interface RequestOptions {
  timeoutMs?: number;
  anonymous?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  const headers = new Headers(init.headers);
  if (options.anonymous !== false) {
    const anon = getAnonymousId();
    if (anon) headers.set("X-Anonymous-User-ID", anon);
  }
  // Signed-in requests also carry the guest id so the backend can claim
  // guest resumes/interviews for the account on first authenticated call.
  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: options.signal ?? controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const parsed = parseErrorBody(response.status, text);
      throw new ApiError(response.status, parsed.message, parsed.code);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(504, "The request timed out. Check your connection and retry.");
    }
    throw new ApiError(0, "Cannot reach the server. Make sure it is running, then retry.");
  } finally {
    clearTimeout(timeout);
  }
}

function postJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
  return request<T>(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    { timeoutMs: 120000, ...options },
  );
}

export const api = {
  uploadResume(file: File): Promise<UploadResumeResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<UploadResumeResponse>(
      "/api/upload-resume",
      { method: "POST", body: form },
      { timeoutMs: 60000 },
    );
  },
  analyzeResume(resumeId: string): Promise<AnalyzeResumeResponse> {
    return request<AnalyzeResumeResponse>(
      `/api/analyze-resume?resume_id=${encodeURIComponent(resumeId)}`,
      { method: "POST" },
      { timeoutMs: 120000 },
    );
  },
  startInterview(input: {
    resume_id: string;
    role: string;
    seniority: string;
    job_description?: string;
    duration_minutes: number;
    interview_type?: string;
    question_count?: number;
  }): Promise<StartInterviewResponse> {
    return postJson("/api/start-interview", input);
  },
  getReport(interviewId: string, options?: RequestOptions): Promise<ReportResponse> {
    return request<ReportResponse>(`/api/report/${encodeURIComponent(interviewId)}`, { method: "GET" }, options);
  },
  transcribeAnswer(wav: Blob): Promise<TranscribeResponse> {
    const form = new FormData();
    form.append("file", wav, "answer.wav");
    return request<TranscribeResponse>(
      "/api/transcribe",
      { method: "POST", body: form },
      { timeoutMs: 120000, anonymous: false },
    );
  },
  submitAnswer(input: { interview_id: string; question_id: string; text: string }): Promise<{ status: string; answer_id: string }> {
    return postJson("/api/submit-answer", input, { anonymous: false });
  },
  endInterview(interviewId: string): Promise<EndInterviewResponse> {
    return postJson("/api/end-interview", { interview_id: interviewId }, { anonymous: false });
  },
  getProfile(): Promise<ProfileResponse> {
    return request<ProfileResponse>("/api/profile", { method: "GET" }, { timeoutMs: 30000 });
  },
  updateProfile(input: { name?: string | null; target_role?: string | null }): Promise<ProfileUser> {
    return request<ProfileUser>(
      "/api/profile",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      { timeoutMs: 30000 },
    );
  },
  checkHealth(): Promise<{ status: string }> {
    return request("/health", { method: "GET" }, { timeoutMs: 8000, anonymous: false });
  },
};
