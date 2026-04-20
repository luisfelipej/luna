/**
 * A single line of a chat transcript. Phase-0 tracer shape.
 * Full shape (with media, role, etc.) arrives in Phase 2.
 */
export interface MessageLine {
  readonly chatId: number;
  readonly text: string;
  readonly dir: "user" | "assistant";
  /** ISO-8601 timestamp. */
  readonly ts: string;
}
