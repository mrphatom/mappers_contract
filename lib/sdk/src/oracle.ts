import {
  SubmitRequest,
  SubmitResponse,
  OracleHealthResponse,
  OracleJobResponse,
} from "./types.js";

// ─── ORACLE CLIENT ────────────────────────────────────────────────────────────

export class OracleClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });

    const text = await res.text();

    let body: T & { error?: string };
    try {
      body = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new OracleError(
        !res.ok
          ? `HTTP ${res.status}: ${text.slice(0, 200)}`
          : `Unexpected non-JSON response from oracle: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    if (!res.ok) {
      const message = body.error ?? `HTTP ${res.status}`;
      throw new OracleError(message, res.status);
    }

    return body;
  }

  async health(): Promise<OracleHealthResponse> {
    return this.request<OracleHealthResponse>("/health");
  }

  async getJob(jobId: string): Promise<OracleJobResponse> {
    return this.request<OracleJobResponse>(`/jobs/${encodeURIComponent(jobId)}`);
  }

  async submitDeliverable(payload: SubmitRequest): Promise<SubmitResponse> {
    return this.request<SubmitResponse>("/submit", {
      method:  "POST",
      body:    JSON.stringify(payload),
    });
  }
}

// ─── ORACLE ERROR ─────────────────────────────────────────────────────────────

export class OracleError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name       = "OracleError";
    this.statusCode = statusCode;
  }
}
