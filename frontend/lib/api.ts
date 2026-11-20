/**
 * The seam between the UI and the ZacharyGPT FastAPI backend (backend/app/api).
 *
 * `ChatApi` is the interface; `httpChatApi` is the real adapter (cross-origin
 * fetch to NEXT_PUBLIC_API_URL). Tests pass an in-memory adapter instead.
 */

import type { ChartSpec } from "@/lib/chart";
import { createSseParser, type StreamEvent } from "@/lib/sse";

export type { ChartSpec, StreamEvent };

export type Conversation = {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  /** Charts produced by tools during this answer. Missing or empty for most messages. */
  charts?: ChartSpec[];
};

export type UploadResult = {
  filename: string;
  chunks: number;
  message: string;
};

export type ChatRequest = {
  message: string;
  thread_id: string;
  model: string;
};

export interface ChatApi {
  listConversations(): Promise<Conversation[]>;
  /** Rejects with ApiError 404 for unknown threads, 422 for an empty or over-long (80+) title. */
  renameConversation(threadId: string, title: string): Promise<Conversation>;
  /** Unknown thread ids resolve to an empty list. */
  getMessages(threadId: string): Promise<StoredMessage[]>;
  /** Rejects with ApiError (413 too large, 415 wrong type, 422 no text) whose message is user-readable. */
  uploadDocument(threadId: string, file: File): Promise<UploadResult>;
  /** Yields token and chart events, then `{ done: true }`; an `{ error }` event may precede done. Aborting the signal stops it. */
  streamChat(request: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * fetch() that turns "the server isn't there" (browser TypeError: Failed to fetch)
 * into an ApiError with status 0 and a message that says what to do.
 * Aborts are re-thrown untouched so callers can tell a stop from a failure.
 */
async function send(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiError(0, `Can't reach the ZacharyGPT server at ${API_URL}. Make sure the backend is running.`);
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;

  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body?.detail) && typeof body.detail[0]?.msg === "string") {
      message = body.detail[0].msg;
    }
  } catch {
    // Non-JSON error body: keep the generic message.
  }

  return new ApiError(response.status, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(`${API_URL}${path}`, init);

  if (!response.ok) {
    throw await errorFrom(response);
  }

  return (await response.json()) as T;
}

const threadPath = (threadId: string) => `/api/conversations/${encodeURIComponent(threadId)}`;

export const httpChatApi: ChatApi = {
  async listConversations() {
    const data = await request<{ conversations: Conversation[] }>("/api/conversations");
    return data.conversations;
  },

  renameConversation(threadId, title) {
    return request<Conversation>(threadPath(threadId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  },

  async getMessages(threadId) {
    const data = await request<{ messages: StoredMessage[] }>(`${threadPath(threadId)}/messages`);
    return data.messages;
  },

  uploadDocument(threadId, file) {
    const form = new FormData();
    form.append("file", file);
    return request<UploadResult>(`${threadPath(threadId)}/documents`, { method: "POST", body: form });
  },

  async *streamChat(chatRequest, signal) {
    // EventSource can't POST, so read the response body and parse SSE ourselves.
    const response = await send(`${API_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatRequest),
      signal,
    });

    if (!response.ok || !response.body) {
      throw await errorFrom(response);
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const parse = createSseParser();

    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      yield* parse(value);
    }
  },
};
