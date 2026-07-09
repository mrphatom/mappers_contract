import {
  SubmitRequest,
  SubmitResponse,
  OracleHealthResponse,
  OracleJobResponse,
} from "./types.js";

// ─── ORACLE CLIENT ────────────────────────────────────────────────────────────

export interface OracleClientOptions {
  apiKey?:        string; // sent as x-api-key on every request
  timeoutMs?:     number; // request timeout in ms (default 30 000)
}

export class OracleClient {
  private readonly baseUrl:   string;
  private readonly apiKey:    string | undefined;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, options: OracleClientOptions = {}) {
    this.baseUrl   = baseUrl.replace(/\/$/, "");
    this.apiKey    = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url        = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers,
        ...init,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new OracleError(
        message.includes("abort") ? `Request to ${path} timed out after ${this.timeoutMs}ms` : message,
        0
      );
    } finally {
      clearTimeout(timer);
    }

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

  /** Look up a pending job by its escrow account pubkey (base58). */
  async getJob(escrowPubkey: string): Promise<OracleJobResponse> {
    return this.request<OracleJobResponse>(`/jobs/${encodeURIComponent(escrowPubkey)}`);
  }

  /**
   * Submit a deliverable for AI consensus verification.
   *
   * The oracle now requires a valid ed25519 signature proving the submission
   * came from the on-chain freelancer. Pass a `signMessage` callback that
   * signs arbitrary bytes — compatible with both a raw Keypair and a
   * wallet-adapter's `signMessage`.
   *
   * The canonical message format is:
   *   `mappers-submit:{escrowPubkey}:{sha256Hex(deliverable)}:{timestamp}`
   */
  async submitDeliverable(
    payload: Omit<SubmitRequest, "signature" | "timestamp">,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<SubmitResponse> {
    const timestamp = Math.floor(Date.now() / 1000);

    // SHA-256 of the deliverable — works in both Node 18+ and browsers
    const deliverableBytes   = new TextEncoder().encode(payload.deliverable);
    const hashBuffer         = await crypto.subtle.digest("SHA-256", deliverableBytes);
    const deliverableHashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const message      = `mappers-submit:${payload.escrowPubkey}:${deliverableHashHex}:${timestamp}`;
    const messageBytes = new TextEncoder().encode(message);
    const sigBytes     = await signMessage(messageBytes);

    // Encode signature as base58
    const { default: bs58 } = await import("bs58");
    const signature = bs58.encode(sigBytes);

    return this.request<SubmitResponse>("/submit", {
      method: "POST",
      body:   JSON.stringify({ ...payload, signature, timestamp } satisfies SubmitRequest),
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
