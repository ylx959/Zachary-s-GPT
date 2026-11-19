"use client";

import { MagnifyingGlass, Plus, SidebarSimple, X } from "@phosphor-icons/react";
import { useState } from "react";

import type { Conversation } from "@/lib/api";
import { formatListTime } from "@/lib/format";

import { Avatar } from "./avatar";

type SidebarProps = {
  conversations: Conversation[];
  loaded: boolean;
  activeId: string | null;
  onOpen(threadId: string): void;
  onNew(): void;
  /** Hides the sidebar. Omitted in the mobile drawer, which closes by tapping outside. */
  onCollapse?(): void;
};

const roundButton =
  "grid size-9 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-selected active:scale-[0.96]";

export function Sidebar({ conversations, loaded, activeId, onOpen, onNew, onCollapse }: SidebarProps) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = needle ? conversations.filter((c) => c.title.toLowerCase().includes(needle)) : conversations;

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘B)"
            className="-ml-1.5 grid size-9 place-items-center rounded-full text-muted transition hover:bg-selected hover:text-ink"
          >
            <SidebarSimple size={19} />
          </button>
        )}
        <span className="mr-auto truncate text-[15px] font-semibold tracking-tight">ZacharyGPT</span>
        <button
          type="button"
          className={roundButton}
          aria-label={searching ? "Close search" : "Search chats"}
          aria-pressed={searching}
          onClick={() => (searching ? closeSearch() : setSearching(true))}
        >
          {searching ? <X size={16} weight="bold" /> : <MagnifyingGlass size={17} weight="bold" />}
        </button>
        <button type="button" className={roundButton} aria-label="New chat" onClick={onNew}>
          <Plus size={17} weight="bold" />
        </button>
      </div>

      {searching && (
        <div className="px-3 pb-2">
          <label htmlFor="chat-search" className="sr-only">
            Search chats
          </label>
          <input
            id="chat-search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && closeSearch()}
            placeholder="Search chats"
            className="h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
      )}

      <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {loaded && visible.length === 0 ? (
          <p className="grid h-full place-items-center pb-16 text-[15px] text-muted">
            {needle ? "No chats match" : "No chats yet"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((conversation) => {
              const active = conversation.thread_id === activeId;
              return (
                <li key={conversation.thread_id}>
                  <button
                    type="button"
                    onClick={() => onOpen(conversation.thread_id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition ${
                      active ? "bg-selected" : "hover:bg-selected/60"
                    }`}
                  >
                    <Avatar label={conversation.title} colorKey={conversation.thread_id} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{conversation.title}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {formatListTime(conversation.updated_at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="flex h-16 shrink-0 items-center gap-3 border-t border-line px-4">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full border border-line-strong bg-surface text-xs font-medium text-muted"
        >
          Z
        </span>
        <span className="text-[15px]">Zachary</span>
      </div>
    </aside>
  );
}
