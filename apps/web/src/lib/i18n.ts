import ro from '@/messages/ro.json';

export type MessageKey = keyof typeof ro;

/** Romanian UI strings (CLAUDE.md: UI in Romanian; comma-below ș ț). */
export function t(key: MessageKey): string {
  return ro[key];
}
