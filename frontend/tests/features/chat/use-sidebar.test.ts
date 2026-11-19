import { act, renderHook, waitFor } from "@testing-library/react";
import type { KeyboardEvent, PointerEvent } from "react";
import { describe, expect, it } from "vitest";

import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, useSidebar } from "@/features/chat/use-sidebar";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

const pointer = (clientX: number) =>
  ({
    button: 0,
    clientX,
    pointerId: 1,
    preventDefault() {},
    currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
  }) as unknown as PointerEvent<HTMLElement>;

const key = (name: string) => ({ key: name, preventDefault() {} }) as unknown as KeyboardEvent<HTMLElement>;

function setup(storage = memoryStorage()) {
  return { storage, hook: renderHook(() => useSidebar({ storage })) };
}

function dragBy(hook: ReturnType<typeof setup>["hook"], from: number, to: number) {
  act(() => hook.result.current.handleProps.onPointerDown(pointer(from)));
  act(() => hook.result.current.handleProps.onPointerMove(pointer(to)));
  act(() => hook.result.current.handleProps.onPointerUp(pointer(to)));
}

describe("useSidebar", () => {
  it("starts expanded at the default width", () => {
    const { hook } = setup();

    expect(hook.result.current).toMatchObject({ width: SIDEBAR_DEFAULT, collapsed: false, resizing: false });
  });

  it("resizes by dragging and remembers the width", () => {
    const { hook, storage } = setup();

    dragBy(hook, 300, 380);

    expect(hook.result.current.width).toBe(380);
    expect(hook.result.current.resizing).toBe(false);
    expect(storage.data.get("zgpt.sidebar.width")).toBe("380");
  });

  it("keeps the width within its limits", () => {
    const { hook } = setup();

    dragBy(hook, 300, 900);
    expect(hook.result.current.width).toBe(SIDEBAR_MAX);

    dragBy(hook, SIDEBAR_MAX, 200);
    expect(hook.result.current.width).toBe(SIDEBAR_MIN);
    expect(hook.result.current.collapsed).toBe(false);
  });

  it("collapses when dragged far enough left, and expands when dragged back out", () => {
    const { hook, storage } = setup();

    dragBy(hook, 300, 100);
    expect(hook.result.current.collapsed).toBe(true);
    expect(storage.data.get("zgpt.sidebar.collapsed")).toBe("1");

    dragBy(hook, 0, 260);
    expect(hook.result.current).toMatchObject({ collapsed: false, width: 260 });
  });

  it("toggle() hides and shows it, keeping the width", () => {
    const { hook } = setup();
    dragBy(hook, 300, 350);

    act(() => hook.result.current.toggle());
    expect(hook.result.current.collapsed).toBe(true);

    act(() => hook.result.current.toggle());
    expect(hook.result.current).toMatchObject({ collapsed: false, width: 350 });
  });

  it("responds to the keyboard on the handle", () => {
    const { hook } = setup();
    const press = (name: string) => act(() => hook.result.current.handleProps.onKeyDown(key(name)));

    press("ArrowRight");
    expect(hook.result.current.width).toBe(SIDEBAR_DEFAULT + 16);
    press("Home");
    expect(hook.result.current.width).toBe(SIDEBAR_MIN);
    press("ArrowLeft");
    expect(hook.result.current.collapsed).toBe(true);
    press("Enter");
    expect(hook.result.current.collapsed).toBe(false);
  });

  it("toggles with ⌘B / Ctrl+B", () => {
    const { hook } = setup();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    });
    expect(hook.result.current.collapsed).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    });
    expect(hook.result.current.collapsed).toBe(false);
  });

  it("double-clicking the handle restores the default width", () => {
    const { hook } = setup();
    dragBy(hook, 300, 420);

    act(() => hook.result.current.handleProps.onDoubleClick());

    expect(hook.result.current.width).toBe(SIDEBAR_DEFAULT);
  });

  it("restores the saved layout on mount", async () => {
    const { hook } = setup(memoryStorage({ "zgpt.sidebar.width": "410", "zgpt.sidebar.collapsed": "1" }));

    await waitFor(() => expect(hook.result.current).toMatchObject({ width: 410, collapsed: true }));
  });
});
