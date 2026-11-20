import type { ChartSpec } from "@/lib/chart";

/** `chart` arrives when a tool (e.g. analyze_stock) produced a chart, before or between tokens. */
export type StreamEvent = { token: string } | { chart: ChartSpec } | { error: string } | { done: true };

/**
 * Incremental parser for the backend's server-sent events.
 *
 * Feed it decoded text in whatever pieces the network delivers; it returns the
 * events completed so far and keeps any partial event for the next call.
 * Events are separated by a blank line and carry one `data: {json}` line.
 */
export function createSseParser(): (chunk: string) => StreamEvent[] {
  let buffer = "";

  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    const events: StreamEvent[] = [];
    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("data:")) {
          events.push(JSON.parse(line.slice(5).trim()) as StreamEvent);
        }
      }

      boundary = buffer.indexOf("\n\n");
    }

    return events;
  };
}
