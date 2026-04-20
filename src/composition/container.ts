import {
  GrammyTelegramTransport,
  realGrammyBotFactory,
  type GrammyLikeBot,
} from "../infra/telegram/grammy-transport.ts";
import { EchoBackend } from "../infra/backends/echo-backend.ts";
import { makeSendMessageToAgent } from "../usecases/send-message-to-agent.ts";
import { TracerEnvSchema } from "./env-schema.ts";

export interface TracerContainer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BuildTracerContainerOptions {
  env: Record<string, string | undefined>;
  /** Optional — tests inject a fake grammY Bot; prod uses the real factory. */
  botFactory?: () => GrammyLikeBot;
}

/**
 * Phase-0 tracer composition root. Wires EchoBackend + GrammyTransport +
 * SendMessageToAgent. No DB, no scheduler, no HTTP yet.
 */
export function buildTracerContainer(opts: BuildTracerContainerOptions): TracerContainer {
  const env = TracerEnvSchema.parse(opts.env);
  const botFactory = opts.botFactory ?? realGrammyBotFactory(env.TELEGRAM_BOT_TOKEN);

  const transport = new GrammyTelegramTransport({
    botFactory,
    allowList: env.TELEGRAM_ALLOWED_IDS,
  });
  const backend = new EchoBackend();
  const sendMessageToAgent = makeSendMessageToAgent({ backend, telegram: transport });

  transport.onMessage(async ({ chatId, text }) => {
    await sendMessageToAgent(chatId, text);
  });

  return {
    async start() {
      await transport.start();
    },
    async stop() {
      await transport.stop();
    },
  };
}
