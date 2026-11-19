"use client";

import { Bookmark, Code, FileText, Globe, type Icon } from "@phosphor-icons/react";

type Suggestion = {
  title: string;
  description: string;
  icon: Icon;
  color: string;
} & ({ prompt: string } | { attach: true });

const SUGGESTIONS: Suggestion[] = [
  {
    title: "Ask about a document",
    description: "Attach a PDF or DOCX and ask what's in it",
    icon: FileText,
    color: "#ea6a2e",
    attach: true,
  },
  {
    title: "Search the web",
    description: "Get this week's news with sources",
    icon: Globe,
    color: "#3b82f6",
    prompt: "Search the web for this week's most important AI agent news and cite your sources.",
  },
  {
    title: "Write some code",
    description: "Draft, explain or debug a function",
    icon: Code,
    color: "#34a853",
    prompt: "Write a Python function that removes duplicates from a list but keeps the original order.",
  },
  {
    title: "Remember a preference",
    description: "Saved for this chat's future answers",
    icon: Bookmark,
    color: "#e0559b",
    prompt: "Remember that I prefer answers in Traditional Chinese.",
  },
];

type EmptyStateProps = {
  onPrompt(prompt: string): void;
  onAttach(): void;
};

export function EmptyState({ onPrompt, onAttach }: EmptyStateProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4 sm:px-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
        <span aria-hidden="true" className="grid size-[88px] place-items-center rounded-full bg-accent text-4xl font-semibold text-white">
          Z
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[22px] font-semibold tracking-tight">ZacharyGPT</h2>
          <p className="max-w-[36ch] text-[15px] text-muted">
            Ask a question, attach a document, or have it search the web.
          </p>
        </div>
      </div>

      <section aria-labelledby="suggestions" className="pb-6">
        <h3 id="suggestions" className="px-1 pb-3 text-[15px] text-muted">
          Suggestions
        </h3>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => {
            const SuggestionIcon = suggestion.icon;
            return (
              <li key={suggestion.title}>
                <button
                  type="button"
                  onClick={() => ("attach" in suggestion ? onAttach() : onPrompt(suggestion.prompt))}
                  className="flex h-full w-full items-center gap-4 rounded-[22px] border border-line bg-surface px-5 py-5 text-left transition hover:border-line-strong active:scale-[0.99]"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-[14px] text-white"
                    style={{ background: suggestion.color }}
                  >
                    <SuggestionIcon size={22} weight="fill" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[16px] font-medium">{suggestion.title}</span>
                    <span className="text-[14px] leading-snug text-muted">{suggestion.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
