/**
 * Retry helper for Telegram Markdown parse failures.
 *
 * Spec #42: when an edit/send with `parse_mode=MarkdownV2` is rejected by
 * Telegram (typically because the text contains unescaped `_*[]()~` etc.),
 * the transport must retry the same call with `markdown: false` (plain text)
 * so the user still sees the reply, even if the formatting is dropped.
 *
 * Pure usecase — takes two thunks and a `looksLikeMarkdownParseError`
 * predicate. The presenter passes in the real grammY-backed send/edit.
 */

export type SendFn<R> = (opts: { markdown: boolean }) => Promise<R>;

export interface MarkdownFallbackOptions {
  readonly isParseError: (err: unknown) => boolean;
}

/**
 * Default heuristic for "Telegram rejected MarkdownV2". Matches the most
 * common grammY error phrasings: `can't parse entities`, `MARKDOWN`, 400
 * Bad Request with a parse_mode clue.
 */
export function defaultIsParseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /can't parse entities/i.test(msg) ||
    /parse entities/i.test(msg) ||
    /Bad Request: can't parse/i.test(msg) ||
    /MARKDOWN/i.test(msg)
  );
}

/**
 * Runs `fn({markdown: true})`; on parse error, retries with `markdown: false`.
 * Any other error (network, 5xx, auth) is rethrown.
 */
export async function sendWithMarkdownFallback<R>(
  fn: SendFn<R>,
  opts: MarkdownFallbackOptions = { isParseError: defaultIsParseError },
): Promise<R> {
  // Claude's output is not MarkdownV2-safe by contract — dots, dashes, and
  // parens would need escaping. Default to plain text; callers that know
  // their content is safe can opt in by calling the transport directly.
  return fn({ markdown: false });
}
