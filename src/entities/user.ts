/**
 * A Telegram-identified Luna user. Rows live in the `users` SQLite table;
 * the `role` gates admin-only operations in M2+.
 */
export type UserRole = "admin" | "user";

export interface User {
  readonly telegramId: number;
  readonly githubLogin?: string;
  readonly role: UserRole;
  readonly createdAt: Date;
}
