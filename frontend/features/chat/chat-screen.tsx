"use client";

import { useRef, useState } from "react";

import { formatStamp } from "@/lib/format";

import { ChatHeader } from "./components/chat-header";
import { Composer } from "./components/composer";
import { EmptyState } from "./components/empty-state";
import { MessageList } from "./components/message-list";
import { Sidebar } from "./components/sidebar";
import { useChat } from "./use-chat";
import { useSidebar } from "./use-sidebar";

const ACCEPTED_FILES = ".pdf,.docx,.txt,.md,.py,.csv";

export function ChatScreen() {
  const chat = useChat();
  const layout = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const current = chat.conversations.find((c) => c.thread_id === chat.threadId);
  const title = current?.title ?? "New chat";
  const isEmpty = chat.messages.length === 0 && chat.phase !== "loading";

  const pickFile = () => fileInputRef.current?.click();
  const closeMenuThen = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const sidebarProps = {
    conversations: chat.conversations,
    loaded: chat.conversationsLoaded,
    activeId: chat.threadId,
    onOpen: (threadId: string) => closeMenuThen(() => void chat.openConversation(threadId))(),
    onNew: closeMenuThen(chat.newChat),
  };

  return (
    <div className={`flex h-dvh overflow-hidden bg-canvas text-ink ${layout.resizing ? "cursor-col-resize select-none" : ""}`}>
      {/* Desktop sidebar: resizable by its right edge, collapsible to nothing. */}
      <div
        className={`relative hidden shrink-0 md:block ${
          layout.resizing ? "" : "transition-[width] duration-200 ease-out motion-reduce:transition-none"
        }`}
        style={{ width: layout.collapsed ? 0 : layout.width }}
      >
        <div
          className={`h-full overflow-hidden border-line ${layout.collapsed ? "invisible" : "border-r"}`}
          style={{ width: layout.collapsed ? 0 : layout.width }}
          inert={layout.collapsed}
        >
          <div className="h-full" style={{ width: layout.width }}>
            <Sidebar {...sidebarProps} onCollapse={layout.toggle} />
          </div>
        </div>
        <div
          {...layout.handleProps}
          className="group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none outline-none"
        >
          <span
            className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent ${
              layout.resizing ? "bg-accent" : "bg-transparent"
            }`}
          />
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Chats">
          <button type="button" aria-label="Close chats" className="absolute inset-0 bg-black/25" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-[min(300px,85vw)] border-r border-line shadow-xl">
            <Sidebar {...sidebarProps} />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col border-line">
        <ChatHeader
          title={title}
          colorKey={current ? current.thread_id : null}
          onOpenMenu={() => setMenuOpen(true)}
          onShowSidebar={layout.collapsed ? layout.toggle : undefined}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isEmpty ? (
            <EmptyState onPrompt={(prompt) => void chat.send(prompt)} onAttach={pickFile} />
          ) : (
            <MessageList messages={chat.messages} stamp={current ? formatStamp(current.created_at) : null} />
          )}
        </div>

        <Composer
          placeholder="Message ZacharyGPT"
          streaming={chat.phase === "streaming"}
          model={chat.model}
          onModelChange={chat.setModel}
          onSend={(text) => void chat.send(text)}
          onStop={chat.stop}
          onAttach={pickFile}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILES}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void chat.upload(file);
          }}
        />
      </main>
    </div>
  );
}
