import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModelPicker } from "@/features/chat/components/model-picker";

describe("ModelPicker", () => {
  it("shows the current model and opens a menu with it checked", () => {
    render(<ModelPicker model="gemini-3.1-flash-lite" onChange={() => {}} />);

    const button = screen.getByRole("button", { name: "Model: Flash Lite 3.1" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    const selected = screen.getByRole("option", { selected: true });
    expect(selected.textContent).toBe("Flash Lite 3.1");
    expect(document.activeElement).toBe(selected);
  });

  it("picks a model by click and closes", () => {
    const onChange = vi.fn();
    render(<ModelPicker model="gemini-3.1-flash-lite" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Pro 2.5" }));

    expect(onChange).toHaveBeenCalledWith("gemini-2.5-pro");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("works from the keyboard", () => {
    const onChange = vi.fn();
    render(<ModelPicker model="gemini-3.1-flash-lite" onChange={onChange} />);
    const button = screen.getByRole("button");

    fireEvent.keyDown(button, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("gemini-2.5-pro");
    expect(document.activeElement).toBe(button);
  });

  it("closes on Escape and on an outside click without changing the model", () => {
    const onChange = vi.fn();
    render(<ModelPicker model="gemini-3.1-flash-lite" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
