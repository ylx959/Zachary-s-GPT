"use client";

import { useEffect, useRef, useState } from "react";

/** Steady reading pace, in characters per millisecond (~80 chars/s). */
const BASE_RATE = 0.08;
/** If text piles up faster than the base pace, speed up so the backlog clears in about this long. */
const CATCH_UP_MS = 1200;
/** Ignore long gaps between frames (background tab) so text doesn't jump. */
const MAX_FRAME_MS = 100;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** How many characters to reveal for one frame. Always at least one, never past the end. */
export function nextRevealLength(shown: number, total: number, elapsedMs: number): number {
  const dt = Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS);
  const backlog = total - shown;
  const rate = Math.max(BASE_RATE, backlog / CATCH_UP_MS);
  return Math.min(total, shown + Math.max(1, Math.round(rate * dt)));
}

/**
 * Reveal `text` gradually, like typing.
 *
 * The model sends answers in large chunks, so rendering them as they arrive looks
 * like the whole answer pops in at once. This smooths that out: it keeps typing
 * at a steady pace, speeds up when it falls behind, and finishes the text even
 * after the stream has ended. With `animate` false (history, reduced motion)
 * the full text shows immediately.
 */
export function useTypewriter(text: string, animate: boolean): string {
  const [enabled] = useState(() => animate && !prefersReducedMotion());
  const [shown, setShown] = useState(0);
  const totalRef = useRef(text.length);
  const caughtUp = shown >= text.length;

  useEffect(() => {
    totalRef.current = text.length;
  }, [text.length]);

  useEffect(() => {
    if (!enabled || caughtUp) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      setShown((current) => Math.max(current, nextRevealLength(current, totalRef.current, elapsed)));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, caughtUp]);

  return enabled ? text.slice(0, shown) : text;
}
