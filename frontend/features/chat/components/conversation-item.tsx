"use client";

import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";

import type { Conversation } from "@/lib/api";
import { formatListTime } from "@/lib/format";

import { Avatar } from "./avatar";

type ConversationItemProps = {
  conversation: Conversation;
  active: boolean;
  onOpen(): void;
  onRename(title: string): void;
};

const MAX_TITLE = 80;

/** One sidebar row. Rename with the pencil button or a double-click; Enter saves, Escape cancels. */
export function ConversationItem({ conversation, active, onOpen, onRename }: ConversationItemProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const startEditing = () => setDraft(conversation.title);

  const finish = (save: boolean) => {
    if (save && draft !== null) {
      const title = draft.trim();
      if (title && title !== conversation.title) onRename(title);
    }
    setDraft(null);
  };

  const avatar = <Avatar label={conversation.title} colorKey={conversation.thread_id} size={38} />;
  const rowShape = `flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ${active ? "bg-selected" : ""}`;

  if (editing) {
    return (
      <div className={`${rowShape} bg-selected`}>
        {avatar}
        <label htmlFor={`rename-${conversation.thread_id}`} className="sr-only">
          Chat name
        </label>
        <input
          id={`rename-${conversation.thread_id}`}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={draft}
          maxLength={MAX_TITLE}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") finish(true);
            if (event.key === "Escape") finish(false);
          }}
          onBlur={() => finish(true)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-accent bg-surface px-2 text-[15px] font-medium outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={startEditing}
        aria-current={active ? "page" : undefined}
        className={`${rowShape} pr-11 transition ${active ? "" : "hover:bg-selected/60"}`}
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{conversation.title}</span>
          <span className="block truncate text-[13px] text-muted">{formatListTime(conversation.updated_at)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Rename ${conversation.title}`}
        title="Rename"
        className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted opacity-0 transition group-hover:opacity-100 hover:bg-surface hover:text-ink focus-visible:opacity-100"
      >
        <PencilSimple size={16} />
      </button>
    </div>
  );
}
