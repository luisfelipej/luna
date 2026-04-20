/**
 * The shape of an inbound Telegram text update that the tracer cares about.
 */
export interface InboundMessage {
  readonly chatId: number;
  readonly fromId: number;
  readonly text: string;
}

export type InboundHandler = (msg: InboundMessage) => Promise<void>;

/**
 * Phase-0 tracer shape for the Telegram transport. The full streaming API
 * (messageId return, editMessage, sendFile, markdown) arrives in Phase 2.
 */
export interface TelegramTransport {
  sendMessage(chatId: number, text: string): Promise<void>;
  onMessage(handler: InboundHandler): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
