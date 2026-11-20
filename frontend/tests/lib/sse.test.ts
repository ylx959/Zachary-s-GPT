import { describe, expect, it } from "vitest";

import { createSseParser } from "@/lib/sse";

describe("createSseParser", () => {
  it("parses complete events", () => {
    const parse = createSseParser();

    expect(parse('data: {"token": "Hi"}\n\ndata: {"done": true}\n\n')).toEqual([{ token: "Hi" }, { done: true }]);
  });

  it("holds a partial event until the rest arrives", () => {
    const parse = createSseParser();

    expect(parse('data: {"tok')).toEqual([]);
    expect(parse('en": "雙語"}\n')).toEqual([]);
    expect(parse("\n")).toEqual([{ token: "雙語" }]);
  });

  it("accepts CRLF line endings", () => {
    const parse = createSseParser();

    expect(parse('data: {"error": "boom"}\r\n\r\n')).toEqual([{ error: "boom" }]);
  });
});

describe("chart events", () => {
  it("parses a chart event", () => {
    const parse = createSseParser();
    expect(parse('data: {"chart": {"type": "price", "title": "AAPL"}}\n\n')).toEqual([{ chart: { type: "price", title: "AAPL" } }]);
  });
});
