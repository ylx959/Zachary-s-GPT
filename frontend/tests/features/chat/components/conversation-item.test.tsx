import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConversationItem } from "@/features/chat/components/conversation-item";
import type { Conversation } from "@/lib/api";

const conversation: Conversation = {
  thread_id: "t1",
  title: "hello",
  created_at: "2026-11-19T08:00:00",
  updated_at: "2026-11-19T08:00:00",
};

function setup() {
  const onOpen = vi.fn();
  const onRename = vi.fn();
  render(<ConversationItem conversation={conversation} active={false} onOpen={onOpen} onRename={onRename} />);
  return { onOpen, onRename };
}

const field = () => screen.getByRole("textbox", { name: "Chat name" });

describe("ConversationItem", () => {
  it("opens the chat on click", () => {
    const { onOpen } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^hello/ }));

    expect(onOpen).toHaveBeenCalled();
  });

  it("renames with the pencil button and Enter", () => {
    const { onRename } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Rename hello" }));
    expect(field()).toHaveProperty("value", "hello");

    fireEvent.change(field(), { target: { value: "  Lighthouse notes " } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("Lighthouse notes");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("starts renaming on double-click and saves on blur", () => {
    const { onRename } = setup();

    fireEvent.doubleClick(screen.getByRole("button", { name: /^hello/ }));
    fireEvent.change(field(), { target: { value: "Trip plan" } });
    fireEvent.blur(field());

    expect(onRename).toHaveBeenCalledWith("Trip plan");
  });

  it("Escape cancels, and blank or unchanged names are not saved", () => {
    const { onRename } = setup();
    const edit = (value: string, key?: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Rename hello" }));
      fireEvent.change(field(), { target: { value } });
      if (key) fireEvent.keyDown(field(), { key });
      else fireEvent.blur(field());
    };

    edit("Something else", "Escape");
    edit("   ");
    edit("hello", "Enter");

    expect(onRename).not.toHaveBeenCalled();
  });
});
