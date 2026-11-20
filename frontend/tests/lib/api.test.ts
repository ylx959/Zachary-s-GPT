import { afterEach, describe, expect, it, vi } from "vitest";

import { API_URL, ApiError, httpChatApi } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpChatApi", () => {
  it("explains an unreachable backend instead of 'Failed to fetch'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await httpChatApi.listConversations().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
    expect((error as ApiError).message).toContain(API_URL);
  });

  it("passes the backend's error detail through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "File is larger than 20 MB." }), { status: 413 })),
    );

    await expect(httpChatApi.uploadDocument("t1", new File(["x"], "big.pdf"))).rejects.toMatchObject({
      status: 413,
      message: "File is larger than 20 MB.",
    });
  });

  it("re-throws aborts untouched", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const stream = httpChatApi.streamChat({ message: "hi", thread_id: "t1", model: "m" }, controller.signal);

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBe(abortError);
  });
});
