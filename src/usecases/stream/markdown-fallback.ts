/**
 * Retry helper for Telegram HTML parse failures.
 *
 * Primary path: convert rawText GFM → Telegram HTML, send with html: true.
 * Fallback: on Telegram parse error, retry with html: false, body = rawText
 * (plain text — always accepted by Telegram).
 *
 * Pure usecase — no I/O, no timers, no fs. The converter and transport
 * callbacks are injected via the function arguments.
 */

import { gfmToTelegramHtml } from "./gfm-to-telegram-html.ts";

/** Options passed to the send/edit closure. */
export type SendFnOpts = { readonly html: boolean; readonly body: string };

/**
 * Closure that performs the actual Telegram send or edit.
 * Receives the final body text and html flag.
 */
export type SendFn<R> = (opts: SendFnOpts) => Promise<R>;

export interface MarkdownFallbackOptions {
  readonly isParseError: (err: unknown) => boolean;
}

/**
 * Default heuristic for "Telegram rejected HTML entity parsing". Matches the
 * most common grammY error phrasings: `can't parse entities`, `MARKDOWN`,
 * 400 Bad Request with a parse_mode clue.
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
 * Convert `rawText` GFM → Telegram HTML, then call `fn({html: true, body: htmlBody})`.
 * On Telegram parse error, retries with `fn({html: false, body: rawText})`.
 *
 * Any non-parse error (network, 5xx, auth) is rethrown immediately.
 */
export async function sendWithMarkdownFallback<R>(
  rawText: string,
  fn: SendFn<R>,
  opts: MarkdownFallbackOptions = { isParseError: defaultIsParseError },
): Promise<R> {
  const htmlBody = gfmToTelegramHtml(rawText);
  try {
    return await fn({ html: true, body: htmlBody });
  } catch (err) {
    if (opts.isParseError(err)) {
      return fn({ html: false, body: rawText });
    }
    throw err;
  }
}
