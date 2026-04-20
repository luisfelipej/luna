/**
 * Structured logging port. Infra provides pino; tests use an in-memory fake.
 * Log output never reaches end-users — only the logger.
 */
export interface LoggerPort {
  debug(msg: string, meta?: object): void;
  info(msg: string, meta?: object): void;
  warn(msg: string, meta?: object): void;
  error(msg: string, meta?: object): void;
  child(bindings: object): LoggerPort;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
