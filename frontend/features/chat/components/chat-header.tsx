"use client";

import { List, SidebarSimple } from "@phosphor-icons/react";

import { Avatar } from "./avatar";

type ChatHeaderProps = {
  title: string;
  /** null for a new chat: show the assistant's own avatar. */
  colorKey: string | null;
  onOpenMenu(): void;
  /** Set when the desktop sidebar is collapsed: shows a button to bring it back. */
  onShowSidebar?(): void;
};

export function ChatHeader({ title, colorKey, onOpenMenu, onShowSidebar }: ChatHeaderProps) {
  return (
    <header className="relative flex h-16 shrink-0 items-center px-4">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open chats"
        className="grid size-9 place-items-center rounded-full text-ink hover:bg-selected md:hidden"
      >
        <List size={20} />
      </button>
      {onShowSidebar && (
        <button
          type="button"
          onClick={onShowSidebar}
          aria-label="Show sidebar"
          title="Show sidebar (⌘B)"
          className="relative hidden size-9 place-items-center rounded-full text-muted transition hover:bg-selected hover:text-ink md:grid"
        >
          <SidebarSimple size={19} />
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 flex justify-center px-28">
        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-4 pl-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {colorKey ? (
            <Avatar label={title} colorKey={colorKey} size={22} />
          ) : (
            <Avatar label="ZacharyGPT" color="var(--accent)" size={22} />
          )}
          <h1 className="truncate text-sm font-medium">{title}</h1>
        </div>
      </div>
    </header>
  );
}
