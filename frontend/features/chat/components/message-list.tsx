"use client";

import { CircleNotch, Paperclip, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage } from "../use-chat";
import { useTypewriter } from "../use-typewriter";
import { StockChart } from "./stock-chart";

type MessageListProps = {
  messages: ChatMessage[];
  stamp: string | null;
};

function LiveStatus({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2.5 pl-3 text-sm text-muted">
      <span className="relative grid size-2 place-items-center">
        <span className="live-ring absolute inset-0 rounded-full bg-live" />
        <span className="relative size-2 rounded-full bg-live" />
      </span>
      {label}
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-[20px] bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-user-ink">
          {message.content}
        </p>
      </div>
    );
  }

  if (message.role === "notice") {
    const Icon = message.tone === "pending" ? CircleNotch : message.tone === "error" ? WarningCircle : Paperclip;
    return (
      <p
        role={message.tone === "error" ? "alert" : "status"}
        className={`flex items-center justify-center gap-1.5 text-center text-[13px] ${
          message.tone === "error" ? "text-danger" : "text-muted"
        }`}
      >
        <Icon size={15} className={message.tone === "pending" ? "animate-spin" : undefined} />
        {message.content}
      </p>
    );
  }

  return <AssistantMessage message={message} />;
}

type AssistantChatMessage = Extract<ChatMessage, { role: "assistant" }>;

function AssistantMessage({ message }: { message: AssistantChatMessage }) {
  // Only answers that start streaming while on screen are typed out; history shows at once.
  const shown = useTypewriter(message.content, message.status === "streaming");
  const writing = message.status === "streaming" || shown.length < message.content.length;

  return (
    <div className="flex flex-col items-start gap-2">
      {message.charts.map((chart, i) => (
        <StockChart key={i} spec={chart} />
      ))}
      {shown && (
        <div className="md max-w-[85%] rounded-[18px] bg-bubble px-4 py-2.5 text-[15px] leading-relaxed break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{shown}</ReactMarkdown>
        </div>
      )}
      {writing && <LiveStatus label={shown ? "Writing" : "Thinking"} />}
      {message.status === "error" && !writing && (
        <p role="alert" className="flex items-center gap-1.5 pl-3 text-[13px] text-danger">
          <WarningCircle size={15} />
          {message.error ?? "The answer was cut off."}
        </p>
      )}
    </div>
  );
}

export function MessageList({ messages, stamp }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as messages arrive and as the answer is typed out.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => endRef.current?.scrollIntoView({ block: "end" }));
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={listRef} className="mx-auto flex w-full max-w-[760px] flex-col gap-3.5 px-4 pt-4 pb-6 sm:px-6">
      {stamp && <p className="pb-1 text-center text-[13px] text-muted">{stamp}</p>}
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
