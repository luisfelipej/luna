import { integer, real, sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema for Luna's SQLite DB. Five tables:
 *  - users                   (telegram identity + role)
 *  - workspaces              (per-chat allow-list of working directories)
 *  - sessions                (per-chat Claude session snapshot)
 *  - jobs                    (scheduled tasks)
 *  - settings                (namespaced key/value overrides)
 *
 * All timestamps are stored as ISO-8601 text (UTC). JSON blobs (Job.schedule)
 * are serialized as TEXT.
 */

export const users = sqliteTable("users", {
  telegramId: integer("telegram_id").primaryKey(),
  githubLogin: text("github_login"),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  createdAt: text("created_at").notNull(),
});

export const workspaces = sqliteTable(
  "workspaces",
  {
    chatId: integer("chat_id").notNull(),
    path: text("path").notNull(),
    addedAt: text("added_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.path] }),
    wsByChat: index("ws_by_chat").on(t.chatId),
  }),
);

export const sessions = sqliteTable("sessions", {
  chatId: integer("chat_id").primaryKey(),
  sessionId: text("session_id"),
  model: text("model", { enum: ["opus", "sonnet", "haiku"] }).notNull(),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  lastUsedAt: text("last_used_at").notNull(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id").notNull(),
    name: text("name").notNull(),
    jobType: text("job_type", { enum: ["reminder", "agent"] }).notNull(),
    prompt: text("prompt").notNull(),
    scheduleData: text("schedule_data").notNull(), // JSON blob
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    autoRemove: integer("auto_remove", { mode: "boolean" }).notNull().default(false),
    firedAt: text("fired_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    byChatActive: index("jobs_by_chat_active").on(t.chatId, t.active),
  }),
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
