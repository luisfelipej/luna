import pino, { type Logger as PinoLoggerRaw, type DestinationStream } from "pino";
import type { LogLevel, LoggerPort } from "../../adapters/ports/logger.port.ts";

export interface PinoLoggerOptions {
  level?: LogLevel;
  /** Sink for JSON lines. Defaults to stdout. Tests pass an in-memory sink. */
  stream?: { write(chunk: string): void };
  /** Initial bindings attached to every line. */
  bindings?: object;
}

/**
 * Pino-backed LoggerPort implementation.
 *
 * `stream` accepts any object with a `write(chunk: string): void` so tests can
 * capture JSON lines into an array. Pino's own DestinationStream type is
 * compatible with our narrower shape.
 */
export class PinoLogger implements LoggerPort {
  private readonly logger: PinoLoggerRaw;

  constructor(optsOrRaw: PinoLoggerOptions | PinoLoggerRaw = {}) {
    if (typeof (optsOrRaw as PinoLoggerRaw).child === "function") {
      // internal: wrap an existing pino instance (used by .child())
      this.logger = optsOrRaw as PinoLoggerRaw;
      return;
    }
    const opts = optsOrRaw as PinoLoggerOptions;
    const level: LogLevel = opts.level ?? "info";
    const stream: DestinationStream | undefined = opts.stream
      ? { write: (s: string) => opts.stream!.write(s) }
      : undefined;

    const base = opts.bindings ?? null;
    this.logger = stream ? pino({ level, base }, stream) : pino({ level, base });
  }

  debug(msg: string, meta?: object): void {
    if (meta) this.logger.debug(meta, msg);
    else this.logger.debug(msg);
  }

  info(msg: string, meta?: object): void {
    if (meta) this.logger.info(meta, msg);
    else this.logger.info(msg);
  }

  warn(msg: string, meta?: object): void {
    if (meta) this.logger.warn(meta, msg);
    else this.logger.warn(msg);
  }

  error(msg: string, meta?: object): void {
    if (meta) this.logger.error(meta, msg);
    else this.logger.error(msg);
  }

  child(bindings: object): LoggerPort {
    return new PinoLogger(this.logger.child(bindings));
  }
}
