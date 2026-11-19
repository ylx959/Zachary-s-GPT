"use client";

import { CaretDown, Check } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { MODELS, type ModelId } from "@/lib/models";

type ModelPickerProps = {
  model: ModelId;
  onChange(model: ModelId): void;
};

/** Compact model switcher for the composer: a pill that opens a menu above it. */
export function ModelPicker({ model, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listId = useId();

  const current = MODELS.find((option) => option.id === model) ?? MODELS[0];

  const openMenu = () => {
    setActive(Math.max(0, MODELS.findIndex((option) => option.id === model)));
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const choose = (id: ModelId) => {
    onChange(id);
    close(true);
  };

  // Move focus to the highlighted option while the menu is open.
  useEffect(() => {
    if (open) optionRefs.current[active]?.focus();
  }, [open, active]);

  // Close when clicking anywhere outside the picker.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = MODELS.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => (i === last ? 0 : i + 1)),
      ArrowUp: () => setActive((i) => (i === 0 ? last : i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(MODELS[active].id),
      " ": () => choose(MODELS[active].id),
      Escape: () => close(true),
      Tab: () => close(false),
    };
    const action = keys[event.key];
    if (!action) return;
    if (event.key !== "Tab") event.preventDefault();
    action();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Model: ${current.label}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted transition hover:bg-bubble hover:text-ink ${
          open ? "bg-bubble text-ink" : ""
        }`}
      >
        {current.label}
        <CaretDown size={13} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Model"
          onKeyDown={onListKeyDown}
          className="absolute right-0 bottom-full z-20 mb-2 min-w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]"
        >
          {MODELS.map((option, index) => {
            const selected = option.id === model;
            return (
              <li
                key={option.id}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={selected}
                tabIndex={index === active ? 0 : -1}
                onClick={() => choose(option.id)}
                onPointerMove={() => setActive(index)}
                className={`flex cursor-pointer items-center justify-between gap-6 rounded-xl px-3 py-2.5 text-[15px] outline-none ${
                  index === active ? "bg-bubble" : ""
                }`}
              >
                {option.label}
                {selected && <Check size={16} weight="bold" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
