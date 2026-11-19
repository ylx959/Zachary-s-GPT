import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when vitest globals are on; unmount after each test ourselves.
afterEach(() => {
  cleanup();
});
