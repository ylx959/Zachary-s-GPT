"use client";

import { ArrowUp, Microphone, Plus, Stop } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";

import type { ModelId } from "@/lib/models";

import { useDictation } from "../use-dictation";
import { ModelPicker } from "./model-picker";

type ComposerProps = {
  placeholder: string;
  streaming: boolean;
  model: ModelId;
  onModelChange(model: ModelId): void;
  onSend(text: string): void;
  onStop(): void;
  onAttach(): void;
};

const MAX_HEIGHT = 200;

export function Composer({ placeholder, streaming, model, onModelChange, onSend, onStop, onAttach }: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((spoken) => setText((current) => (current ? `${current} ${spoken}` : spoken)));

  // Grow with the text up to MAX_HEIGHT, then scroll.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  const canSend = text.trim().length > 0 && !streaming;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  const actionButton = "grid size-9 shrink-0 place-items-center rounded-full transition active:scale-[0.94]";

  let action;
  if (streaming) {
    action = (
      <button type="button" onClick={onStop} aria-label="Stop answering" className={`${actionButton} bg-user-bubble text-user-ink`}>
        <Stop size={14} weight="fill" />
      </button>
    );
  } else if (text.trim() || !dictation.supported) {
    action = (
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={`${actionButton} bg-user-bubble text-user-ink disabled:bg-selected disabled:text-muted`}
      >
        <ArrowUp size={17} weight="bold" />
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={dictation.toggle}
        aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
        aria-pressed={dictation.listening}
        className={`${actionButton} ${dictation.listening ? "bg-danger text-white" : "bg-user-bubble text-user-ink"}`}
      >
        <Microphone size={17} weight="fill" />
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mx-auto w-full max-w-[760px] px-4 pb-5 sm:px-6"
    >
      <div className="flex items-end gap-2 rounded-[26px] border border-line-strong bg-surface p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus-within:border-muted">
        <button
          type="button"
          onClick={onAttach}
          aria-label="Attach a document"
          className={`${actionButton} bg-bubble text-muted hover:text-ink`}
        >
          <Plus size={17} weight="bold" />
        </button>
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <textarea
          id="message"
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <ModelPicker model={model} onChange={onModelChange} />
        {action}
      </div>
    </form>
  );
}
