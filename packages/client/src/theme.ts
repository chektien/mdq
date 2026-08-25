import type { DeckTheme } from "@mdq/shared";

export const DEFAULT_CLIENT_THEME: DeckTheme = "dark";

export function resolveClientTheme(theme: unknown, fallback: DeckTheme = DEFAULT_CLIENT_THEME): DeckTheme {
  if (theme === "light" || theme === "dark") return theme;
  return fallback;
}

export function applyClientTheme(theme: unknown, fallback: DeckTheme = DEFAULT_CLIENT_THEME): DeckTheme {
  const resolved = resolveClientTheme(theme, fallback);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}
