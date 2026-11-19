"use client";

/**
 * useSidebar: a resizable, collapsible sidebar behind one small interface.
 *
 * Callers get the width to render, whether it's collapsed or being dragged,
 * a toggle, and `handleProps` to spread on the drag handle. Pointer dragging,
 * snap-to-collapse, keyboard resizing, the ⌘B / Ctrl+B shortcut and
 * persistence all live here.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 300;
/** Dragging narrower than this collapses the sidebar instead of shrinking it. */
export const SIDEBAR_COLLAPSE_AT = 160;
const KEY_STEP = 16;

const WIDTH_KEY = "zgpt.sidebar.width";
const COLLAPSED_KEY = "zgpt.sidebar.collapsed";

type SidebarStorage = Pick<Storage, "getItem" | "setItem">;

export type UseSidebarOptions = {
  storage?: SidebarStorage | null;
};

export const clampWidth = (width: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));

function defaultStorage(): SidebarStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function save(storage: SidebarStorage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Persistence is a convenience; ignore storage failures.
  }
}

export function useSidebar({ storage }: UseSidebarOptions = {}) {
  const storageRef = useRef(storage === undefined ? defaultStorage() : storage);
  const [width, setWidthState] = useState(SIDEBAR_DEFAULT);
  const [collapsed, setCollapsedState] = useState(false);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    save(storageRef.current, WIDTH_KEY, String(clamped));
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    save(storageRef.current, COLLAPSED_KEY, next ? "1" : "0");
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((current) => {
      save(storageRef.current, COLLAPSED_KEY, current ? "0" : "1");
      return !current;
    });
  }, []);

  /** Apply a dragged-to width: below the threshold collapses, otherwise resize and expand. */
  const dragTo = useCallback(
    (rawWidth: number) => {
      if (rawWidth < SIDEBAR_COLLAPSE_AT) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        setWidth(rawWidth);
      }
    },
    [setCollapsed, setWidth],
  );

  // Restore saved layout after hydration (server render always uses the defaults).
  useEffect(() => {
    let savedWidth: string | null = null;
    let savedCollapsed: string | null = null;
    try {
      savedWidth = storageRef.current?.getItem(WIDTH_KEY) ?? null;
      savedCollapsed = storageRef.current?.getItem(COLLAPSED_KEY) ?? null;
    } catch {
      // ignore
    }

    queueMicrotask(() => {
      const parsed = Number(savedWidth);
      if (savedWidth && Number.isFinite(parsed)) setWidthState(clampWidth(parsed));
      if (savedCollapsed === "1") setCollapsedState(true);
    });
  }, []);

  // ⌘B / Ctrl+B toggles the sidebar.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const handleProps = {
    role: "separator",
    "aria-orientation": "vertical" as const,
    "aria-label": "Resize sidebar",
    "aria-valuemin": SIDEBAR_MIN,
    "aria-valuemax": SIDEBAR_MAX,
    "aria-valuenow": collapsed ? 0 : width,
    tabIndex: 0,

    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: collapsed ? 0 : width };
      setResizing(true);
    },

    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!drag.current) return;
      dragTo(drag.current.startWidth + event.clientX - drag.current.startX);
    },

    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!drag.current) return;
      drag.current = null;
      setResizing(false);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },

    onPointerCancel() {
      drag.current = null;
      setResizing(false);
    },

    onDoubleClick() {
      setCollapsed(false);
      setWidth(SIDEBAR_DEFAULT);
    },

    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      const actions: Record<string, () => void> = {
        ArrowLeft: () => (width - KEY_STEP < SIDEBAR_MIN ? setCollapsed(true) : setWidth(width - KEY_STEP)),
        ArrowRight: () => (collapsed ? setCollapsed(false) : setWidth(width + KEY_STEP)),
        Home: () => setWidth(SIDEBAR_MIN),
        End: () => setWidth(SIDEBAR_MAX),
        Enter: toggle,
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    },
  };

  return { width, collapsed, resizing, toggle, handleProps };
}
