// Tiny i18n layer: packages/shared/src/locales/mr.json is the single source
// of truth for Marathi strings. No i18next/react-i18next runtime — a typed
// dot-path lookup is all this app needs.
import raw from "../../../../packages/shared/src/locales/mr.json";

export interface MrLocale {
  slip: Record<string, string>;
  collect: Record<string, string>;
  sync: Record<string, string | Record<string, string>>;
  auth: Record<string, string>;
}

export const mr = raw as unknown as MrLocale;

/** Resolves a dot-path key ("sync.syncNow") and falls back to the key itself. */
export function t(path: string): string {
  let node: unknown = mr;
  for (const part of path.split(".")) {
    if (
      node &&
      typeof node === "object" &&
      part in (node as Record<string, unknown>)
    ) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof node === "string" ? node : path;
}

/** Resolves a dot-path key and interpolates {placeholders} ("sync.syncFailed", { error }). */
export function tf(
  path: string,
  vars: Record<string, string | number>
): string {
  let text = t(path);
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, String(value));
  }
  return text;
}
