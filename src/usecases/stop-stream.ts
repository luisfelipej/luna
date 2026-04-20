/**
 * `/stop` — abort the in-flight send for a chat, if any.
 *
 * The registry is an adapter-level concept (a per-chat AbortController map).
 * Keeping the usecase thin + pure lets presenters (Telegram, HTTP) share
 * the same logic.
 */
export interface StreamAbortRegistryLike {
  abort(chatId: number): boolean;
}

export interface StopStreamDeps {
  readonly aborts: StreamAbortRegistryLike;
}

export function makeStopStream(deps: StopStreamDeps) {
  /** Returns `true` iff an in-flight stream was actually aborted. */
  return function stopStream(chatId: number): boolean {
    return deps.aborts.abort(chatId);
  };
}

export type StopStream = ReturnType<typeof makeStopStream>;
