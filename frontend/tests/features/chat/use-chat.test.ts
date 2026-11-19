import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type ChatApi, type ChatRequest, type Conversation, type StreamEvent } from "@/lib/api";
import { useChat } from "@/features/chat/use-chat";

/** In-memory ChatApi adapter. `stream` scripts what /api/chat/stream would emit. */
function fakeApi(overrides: Partial<ChatApi> & { stream?: (request: ChatRequest, signal: AbortSignal) => AsyncIterable<StreamEvent> } = {}) {
  const requests: ChatRequest[] = [];
  const conversations: Conversation[] = [];

  const api: ChatApi = {
    listConversations: async () => conversations,
    async renameConversation(threadId, title) {
      const conversation = conversations.find((c) => c.thread_id === threadId);
      if (!conversation) throw new ApiError(404, "Conversation not found.");
      conversation.title = title;
      return { ...conversation };
    },
    getMessages: async () => [],
    uploadDocument: async (_threadId, file) => ({ filename: file.name, chunks: 16, message: "" }),
    streamChat(request, signal) {
      requests.push(request);
      return (overrides.stream ?? tokens("Hello", " there"))(request, signal);
    },
    ...overrides,
  };

  return { api, requests, conversations };
}

function tokens(...parts: string[]) {
  return async function* (): AsyncIterable<StreamEvent> {
    for (const token of parts) yield { token };
    yield { done: true };
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

let counter = 0;
const newId = () => `id-${++counter}`;

function setup(options: Parameters<typeof fakeApi>[0] = {}, storage = memoryStorage()) {
  const fake = fakeApi(options);
  const hook = renderHook(() => useChat({ api: fake.api, storage, newId }));
  return { ...fake, storage, hook };
}

describe("useChat", () => {
  it("streams an answer into one assistant message and starts a thread", async () => {
    const { hook, requests, storage } = setup();

    await act(() => hook.result.current.send("  hi  "));

    const { messages, threadId, phase } = hook.result.current;
    expect(phase).toBe("idle");
    expect(threadId).toBeTruthy();
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "hi"],
      ["assistant", "Hello there"],
    ]);
    expect(messages[1]).toMatchObject({ status: "done" });
    expect(requests[0]).toMatchObject({ message: "hi", thread_id: threadId, model: "gemini-3.1-flash-lite" });
    expect(storage.data.get("zgpt.thread")).toBe(threadId);
  });

  it("keeps the same thread for follow-up messages", async () => {
    const { hook, requests } = setup();

    await act(() => hook.result.current.send("one"));
    await act(() => hook.result.current.send("two"));

    expect(requests[1].thread_id).toBe(requests[0].thread_id);
  });

  it("ignores blank messages", async () => {
    const { hook, requests } = setup();

    await act(() => hook.result.current.send("   "));

    expect(requests).toHaveLength(0);
    expect(hook.result.current.messages).toEqual([]);
  });

  it("shows a server error event on the assistant message", async () => {
    const { hook } = setup({
      stream: async function* () {
        yield { token: "Partial" };
        yield { error: "The assistant failed to answer." };
        yield { done: true };
      },
    });

    await act(() => hook.result.current.send("hi"));

    expect(hook.result.current.messages[1]).toMatchObject({
      content: "Partial",
      status: "error",
      error: "The assistant failed to answer.",
    });
  });

  it("shows a network failure as an error", async () => {
    const { hook } = setup({
      stream: async function* () {
        throw new ApiError(422, "String should have at least 1 character");
      },
    });

    await act(() => hook.result.current.send("hi"));

    expect(hook.result.current.messages[1]).toMatchObject({ status: "error", error: "String should have at least 1 character" });
    expect(hook.result.current.phase).toBe("idle");
  });

  it("stop() keeps the partial answer and ends streaming", async () => {
    let release!: () => void;
    const { hook } = setup({
      stream: async function* (_request, signal) {
        yield { token: "Half an ans" };
        await new Promise<void>((resolve) => (release = resolve));
        signal.throwIfAborted();
        yield { token: "wer" };
      },
    });

    let sending!: Promise<void>;
    act(() => {
      sending = hook.result.current.send("hi");
    });
    await waitFor(() => expect(hook.result.current.messages[1]?.content).toBe("Half an ans"));
    expect(hook.result.current.phase).toBe("streaming");

    act(() => hook.result.current.stop());
    release();
    await act(() => sending);

    expect(hook.result.current.messages[1]).toMatchObject({ content: "Half an ans", status: "done" });
    expect(hook.result.current.phase).toBe("idle");
  });

  it("restores the last open conversation and model on mount", async () => {
    const storage = memoryStorage({ "zgpt.thread": "saved-thread", "zgpt.model": "gemini-2.5-pro" });
    const { hook } = setup(
      {
        getMessages: async (threadId) =>
          threadId === "saved-thread" ? [{ role: "user", content: "earlier" }, { role: "assistant", content: "reply" }] : [],
      },
      storage,
    );

    await waitFor(() => expect(hook.result.current.messages).toHaveLength(2));
    expect(hook.result.current.threadId).toBe("saved-thread");
    expect(hook.result.current.model).toBe("gemini-2.5-pro");
    await waitFor(() => expect(hook.result.current.conversationsLoaded).toBe(true));
  });

  it("newChat() clears the screen and forgets the thread", async () => {
    const { hook, storage } = setup();

    await act(() => hook.result.current.send("hi"));
    act(() => hook.result.current.newChat());

    expect(hook.result.current.messages).toEqual([]);
    expect(hook.result.current.threadId).toBeNull();
    expect(storage.data.has("zgpt.thread")).toBe(false);
  });

  it("upload() reports the indexed passages", async () => {
    const { hook } = setup();

    await act(() => hook.result.current.upload(new File(["text"], "story.pdf")));

    expect(hook.result.current.messages).toEqual([
      expect.objectContaining({ role: "notice", tone: "info", content: "story.pdf is ready · 16 passages indexed" }),
    ]);
    expect(hook.result.current.threadId).toBeTruthy();
  });

  it("upload() shows why a file was rejected", async () => {
    const { hook } = setup({
      uploadDocument: async () => {
        throw new ApiError(415, "Unsupported file type '.exe'.");
      },
    });

    await act(() => hook.result.current.upload(new File(["x"], "tool.exe")));

    expect(hook.result.current.messages[0]).toMatchObject({
      tone: "error",
      content: "Couldn't add tool.exe: Unsupported file type '.exe'.",
    });
  });

  describe("renameConversation()", () => {
    const existing = (): Conversation => ({
      thread_id: "t1",
      title: "hello",
      created_at: "2026-11-19T08:00:00",
      updated_at: "2026-11-19T08:00:00",
    });

    async function withConversation(overrides: Parameters<typeof fakeApi>[0] = {}) {
      const ctx = setup(overrides);
      ctx.conversations.push(existing());
      await act(async () => {
        await ctx.hook.result.current.openConversation("t1");
      });
      // openConversation doesn't reload the list; trigger the refresh that send/upload would.
      await act(() => ctx.hook.result.current.send("load list"));
      return ctx;
    }

    it("renames in the sidebar and on the server", async () => {
      const { hook, conversations } = await withConversation();

      let saved = false;
      await act(async () => {
        saved = await hook.result.current.renameConversation("t1", "  Lighthouse notes ");
      });

      expect(saved).toBe(true);
      expect(hook.result.current.conversations.find((c) => c.thread_id === "t1")?.title).toBe("Lighthouse notes");
      expect(conversations[0].title).toBe("Lighthouse notes");
    });

    it("ignores blank or unchanged titles", async () => {
      const renameConversation = vi.fn();
      const { hook } = await withConversation({ renameConversation });

      await act(async () => {
        expect(await hook.result.current.renameConversation("t1", "   ")).toBe(false);
        expect(await hook.result.current.renameConversation("t1", "hello")).toBe(false);
      });

      expect(renameConversation).not.toHaveBeenCalled();
    });

    it("puts the old title back when the server refuses", async () => {
      const { hook } = await withConversation({
        renameConversation: async () => {
          throw new ApiError(422, "String should have at most 80 characters");
        },
      });

      let saved = true;
      await act(async () => {
        saved = await hook.result.current.renameConversation("t1", "new name");
      });

      expect(saved).toBe(false);
      expect(hook.result.current.conversations.find((c) => c.thread_id === "t1")?.title).toBe("hello");
    });
  });
});
