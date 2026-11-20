"use client";

/**
 * useChat: everything the chat screen needs, behind one small interface.
 *
 * Callers get the current state plus five actions (send, stop, upload,
 * openConversation, newChat) and a model setter. Streaming, cancellation,
 * thread ids, history loading, upload notices, sidebar refreshes and
 * "remember the last chat" all live here, so components only render.
 *
 * Dependencies are injected (api, storage, newId) so tests can swap adapters.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import { httpChatApi, type ChartSpec, type ChatApi, type Conversation, type StoredMessage } from "@/lib/api";
import { DEFAULT_MODEL, isModelId, type ModelId } from "@/lib/models";

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      status: "streaming" | "done" | "error";
      error?: string;
      /** Charts from tools (e.g. analyze_stock), shown above the answer text. */
      charts: ChartSpec[];
    }
  | { id: string; role: "notice"; content: string; tone: "pending" | "info" | "error" };

export type ChatPhase = "idle" | "loading" | "streaming";

export type ChatState = {
  conversations: Conversation[];
  conversationsLoaded: boolean;
  /** null until the first message or upload of a new chat. */
  threadId: string | null;
  messages: ChatMessage[];
  phase: ChatPhase;
  model: ModelId;
};

export type UseChatOptions = {
  api?: ChatApi;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  newId?: () => string;
};

export type UseChat = ChatState & {
  send(text: string): Promise<void>;
  stop(): void;
  upload(file: File): Promise<void>;
  openConversation(threadId: string): Promise<void>;
  /** Optimistic: the sidebar updates at once and reverts if the server refuses. Resolves to whether it was saved. */
  renameConversation(threadId: string, title: string): Promise<boolean>;
  newChat(): void;
  setModel(model: ModelId): void;
};

const THREAD_KEY = "zgpt.thread";
const MODEL_KEY = "zgpt.model";

type Action =
  | { type: "conversations"; conversations: Conversation[] }
  | { type: "renamed"; threadId: string; title: string }
  | { type: "model"; model: ModelId }
  | { type: "loading" }
  | { type: "opened"; threadId: string; messages: ChatMessage[] }
  | { type: "reset" }
  | { type: "sent"; threadId: string; user: ChatMessage; assistantId: string }
  | { type: "token"; assistantId: string; token: string }
  | { type: "chart"; assistantId: string; chart: ChartSpec }
  | { type: "failed"; assistantId: string; error: string }
  | { type: "finished"; assistantId: string }
  | { type: "notice"; threadId: string; notice: Extract<ChatMessage, { role: "notice" }> }
  | { type: "noticeUpdate"; id: string; content: string; tone: "info" | "error" };

const initialState: ChatState = {
  conversations: [],
  conversationsLoaded: false,
  threadId: null,
  messages: [],
  phase: "idle",
  model: DEFAULT_MODEL,
};

function updateAssistant(
  messages: ChatMessage[],
  id: string,
  update: (message: Extract<ChatMessage, { role: "assistant" }>) => ChatMessage,
): ChatMessage[] {
  return messages.map((message) => (message.id === id && message.role === "assistant" ? update(message) : message));
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "conversations":
      return { ...state, conversations: action.conversations, conversationsLoaded: true };
    case "renamed":
      return {
        ...state,
        conversations: state.conversations.map((c) => (c.thread_id === action.threadId ? { ...c, title: action.title } : c)),
      };
    case "model":
      return { ...state, model: action.model };
    case "loading":
      return { ...state, phase: "loading" };
    case "opened":
      return { ...state, threadId: action.threadId, messages: action.messages, phase: "idle" };
    case "reset":
      return { ...state, threadId: null, messages: [], phase: "idle" };
    case "sent":
      return {
        ...state,
        threadId: action.threadId,
        phase: "streaming",
        messages: [
          ...state.messages,
          action.user,
          { id: action.assistantId, role: "assistant", content: "", status: "streaming", charts: [] },
        ],
      };
    case "token":
      return {
        ...state,
        messages: updateAssistant(state.messages, action.assistantId, (m) => ({ ...m, content: m.content + action.token })),
      };
    case "chart":
      return {
        ...state,
        messages: updateAssistant(state.messages, action.assistantId, (m) => ({ ...m, charts: [...m.charts, action.chart] })),
      };
    case "failed":
      return {
        ...state,
        phase: "idle",
        messages: updateAssistant(state.messages, action.assistantId, (m) => ({ ...m, status: "error", error: action.error })),
      };
    case "finished":
      return {
        ...state,
        phase: "idle",
        messages: updateAssistant(state.messages, action.assistantId, (m) =>
          m.status === "streaming" ? { ...m, status: "done" } : m,
        ),
      };
    case "notice":
      return { ...state, threadId: action.threadId, messages: [...state.messages, action.notice] };
    case "noticeUpdate":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id && m.role === "notice" ? { ...m, content: action.content, tone: action.tone } : m,
        ),
      };
  }
}

function fromStored(messages: StoredMessage[], newId: () => string): ChatMessage[] {
  return messages.map((m) =>
    m.role === "user"
      ? { id: newId(), role: "user", content: m.content }
      : { id: newId(), role: "assistant", content: m.content, status: "done", charts: m.charts ?? [] },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
}

function defaultStorage(): UseChatOptions["storage"] {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // Storage blocked (private mode): run without persistence.
  }
}

/** Mutable state that async work reads after awaits (avoids stale closures). */
type Runtime = {
  api: ChatApi;
  storage: UseChatOptions["storage"];
  newId: () => string;
  threadId: string | null;
  model: ModelId;
  abort: AbortController | null;
};

function persist(runtime: Runtime, key: string, value: string | null) {
  try {
    if (value) runtime.storage?.setItem(key, value);
    else runtime.storage?.removeItem(key);
  } catch {
    // Persistence is a convenience; ignore storage failures.
  }
}

function read(runtime: Runtime, key: string): string | null {
  try {
    return runtime.storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setThread(runtime: Runtime, threadId: string | null) {
  runtime.threadId = threadId;
  persist(runtime, THREAD_KEY, threadId);
}

function abortStream(runtime: Runtime) {
  runtime.abort?.abort();
  runtime.abort = null;
}

function ensureThread(runtime: Runtime): string {
  const threadId = runtime.threadId ?? runtime.newId();
  setThread(runtime, threadId);
  return threadId;
}

export function useChat({ api = httpChatApi, storage, newId }: UseChatOptions = {}): UseChat {
  const [state, dispatch] = useReducer(reducer, initialState);

  const runtimeRef = useRef<Runtime>({
    api,
    storage: storage === undefined ? defaultStorage() : storage,
    newId: newId ?? (() => crypto.randomUUID()),
    threadId: null,
    model: DEFAULT_MODEL,
    abort: null,
  });

  const refreshConversations = useCallback(async () => {
    try {
      dispatch({ type: "conversations", conversations: await runtimeRef.current.api.listConversations() });
    } catch {
      dispatch({ type: "conversations", conversations: [] });
    }
  }, []);

  const openConversation = useCallback(async (threadId: string) => {
    const runtime = runtimeRef.current;
    abortStream(runtime);
    setThread(runtime, threadId);
    dispatch({ type: "loading" });

    let messages: ChatMessage[];
    try {
      messages = fromStored(await runtime.api.getMessages(threadId), runtime.newId);
    } catch (error) {
      messages = [{ id: runtime.newId(), role: "notice", tone: "error", content: errorMessage(error) }];
    }

    // Ignore the result if the user switched chats while it loaded.
    if (runtime.threadId === threadId) {
      dispatch({ type: "opened", threadId, messages });
    }
  }, []);

  const newChat = useCallback(() => {
    const runtime = runtimeRef.current;
    abortStream(runtime);
    setThread(runtime, null);
    dispatch({ type: "reset" });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const runtime = runtimeRef.current;
      const message = text.trim();
      if (!message || runtime.abort) return;

      const threadId = ensureThread(runtime);
      const assistantId = runtime.newId();
      const controller = new AbortController();
      runtime.abort = controller;

      dispatch({ type: "sent", threadId, user: { id: runtime.newId(), role: "user", content: message }, assistantId });

      try {
        const events = runtime.api.streamChat({ message, thread_id: threadId, model: runtime.model }, controller.signal);
        for await (const event of events) {
          if ("token" in event) dispatch({ type: "token", assistantId, token: event.token });
          else if ("chart" in event) dispatch({ type: "chart", assistantId, chart: event.chart });
          else if ("error" in event) dispatch({ type: "failed", assistantId, error: event.error });
        }
        dispatch({ type: "finished", assistantId });
      } catch (error) {
        if (controller.signal.aborted) dispatch({ type: "finished", assistantId });
        else dispatch({ type: "failed", assistantId, error: errorMessage(error) });
      } finally {
        if (runtime.abort === controller) runtime.abort = null;
        void refreshConversations();
      }
    },
    [refreshConversations],
  );

  const stop = useCallback(() => abortStream(runtimeRef.current), []);

  const upload = useCallback(
    async (file: File) => {
      const runtime = runtimeRef.current;
      const threadId = ensureThread(runtime);
      const id = runtime.newId();

      dispatch({ type: "notice", threadId, notice: { id, role: "notice", tone: "pending", content: `Reading ${file.name}…` } });

      try {
        const result = await runtime.api.uploadDocument(threadId, file);
        const unit = result.chunks === 1 ? "passage" : "passages";
        dispatch({ type: "noticeUpdate", id, tone: "info", content: `${result.filename} is ready · ${result.chunks} ${unit} indexed` });
        void refreshConversations();
      } catch (error) {
        dispatch({ type: "noticeUpdate", id, tone: "error", content: `Couldn't add ${file.name}: ${errorMessage(error)}` });
      }
    },
    [refreshConversations],
  );

  const conversationsRef = useRef(state.conversations);
  useEffect(() => {
    conversationsRef.current = state.conversations;
  }, [state.conversations]);

  const renameConversation = useCallback(async (threadId: string, title: string) => {
    const next = title.trim();
    const previous = conversationsRef.current.find((c) => c.thread_id === threadId)?.title;
    if (!next || next === previous) return false;

    dispatch({ type: "renamed", threadId, title: next });
    try {
      const saved = await runtimeRef.current.api.renameConversation(threadId, next);
      dispatch({ type: "renamed", threadId, title: saved.title });
      return true;
    } catch {
      if (previous !== undefined) dispatch({ type: "renamed", threadId, title: previous });
      return false;
    }
  }, []);

  const setModel = useCallback((model: ModelId) => {
    runtimeRef.current.model = model;
    persist(runtimeRef.current, MODEL_KEY, model);
    dispatch({ type: "model", model });
  }, []);

  // On mount: restore the saved model and last open chat, then load the sidebar.
  useEffect(() => {
    const runtime = runtimeRef.current;
    const savedModel = read(runtime, MODEL_KEY);
    const savedThread = read(runtime, THREAD_KEY);

    queueMicrotask(() => {
      if (isModelId(savedModel)) setModel(savedModel);
      if (savedThread) void openConversation(savedThread);
      void refreshConversations();
    });

    return () => abortStream(runtime);
  }, [openConversation, refreshConversations, setModel]);

  return { ...state, send, stop, upload, openConversation, renameConversation, newChat, setModel };
}
