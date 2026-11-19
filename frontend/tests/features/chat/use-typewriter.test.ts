import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nextRevealLength, useTypewriter } from "@/features/chat/use-typewriter";

describe("nextRevealLength", () => {
  it("types at a steady pace when there is little backlog", () => {
    expect(nextRevealLength(0, 20, 16)).toBe(1);
    expect(nextRevealLength(0, 20, 100)).toBe(8);
  });

  it("speeds up when text piles up", () => {
    const small = nextRevealLength(0, 50, 16);
    const large = nextRevealLength(0, 5000, 16);
    expect(large).toBeGreaterThan(small * 10);
  });

  it("always moves forward and never passes the end", () => {
    expect(nextRevealLength(5, 6, 0)).toBe(6);
    expect(nextRevealLength(0, 10, 10_000)).toBe(8);
    expect(nextRevealLength(9, 10, 100)).toBe(10);
  });
});

describe("useTypewriter", () => {
  let frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  let now = 0;

  const advance = (ms: number, count = 1) => {
    for (let i = 0; i < count; i++) {
      now += ms;
      const pending = [...frames.values()];
      frames = new Map();
      act(() => pending.forEach((callback) => callback(now)));
    }
  };

  beforeEach(() => {
    frames = new Map();
    nextId = 0;
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows history text immediately", () => {
    const { result } = renderHook(() => useTypewriter("already answered", false));
    expect(result.current).toBe("already answered");
  });

  it("reveals streamed text gradually, then completely", () => {
    const text = "A lighthouse keeper trimmed the wick every evening.";
    const { result } = renderHook(() => useTypewriter(text, true));

    expect(result.current).toBe("");
    advance(50);
    expect(result.current.length).toBeGreaterThan(0);
    expect(result.current.length).toBeLessThan(text.length);
    expect(text.startsWith(result.current)).toBe(true);

    advance(50, 40);
    expect(result.current).toBe(text);
  });

  it("keeps typing new chunks as they arrive", () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriter(text, true), {
      initialProps: { text: "First chunk." },
    });
    advance(50, 20);
    expect(result.current).toBe("First chunk.");

    rerender({ text: "First chunk. Second chunk." });
    advance(50);
    expect(result.current.length).toBeGreaterThan("First chunk.".length);
    advance(50, 20);
    expect(result.current).toBe("First chunk. Second chunk.");
  });

  it("skips the animation when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { result } = renderHook(() => useTypewriter("no animation", true));
    expect(result.current).toBe("no animation");
  });
});
