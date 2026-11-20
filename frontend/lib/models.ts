// Keep in sync with `allowed_models` in backend/app/core/config.py.
export const MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Flash Lite 3.1" },
  { id: "gemini-2.5-pro", label: "Pro 2.5" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "gemini-3.1-flash-lite";

export function isModelId(value: string | null): value is ModelId {
  return MODELS.some((model) => model.id === value);
}
