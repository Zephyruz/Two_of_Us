import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  customName: text("custom_name"),
  email: text("email").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accounts = sqliteTable("accounts", {
  slot: integer("slot").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => profiles.userId),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  invitationHash: text("invitation_hash").unique(),
  invitationExpiresAt: integer("invitation_expires_at"),
}, (table) => [check("two_account_slots", sql`${table.slot} IN (1, 2)`)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => accounts.userId, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: integer("id").primaryKey(),
  pendingPartnerName: text("pending_partner_name"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ideas = sqliteTable("ideas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("idea"),
  plannedDate: text("planned_date"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  cadence: text("cadence").notNull().default("每天"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const habitChecks = sqliteTable(
  "habit_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    habitId: integer("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("habit_user_day").on(table.habitId, table.userId, table.day)],
);

export const memories = sqliteTable("memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  memoryDate: text("memory_date").notNull(),
  sourceIdeaId: integer("source_idea_id").references(() => ideas.id, { onDelete: "set null" }),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memoryPhotos = sqliteTable("memory_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memoryId: integer("memory_id").notNull().references(() => memories.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
