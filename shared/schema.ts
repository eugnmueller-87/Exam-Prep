import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Questions table
export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(), // "plan" | "design" | "deploy"
  topic: text("topic").notNull(), // Sub-topic area
  subtopic: text("subtopic").notNull(), // Specific bullet point area
  difficulty: text("difficulty").notNull().default("medium"), // "easy" | "medium" | "hard"
  question: text("question").notNull(),
  options: text("options").notNull(), // JSON array of 4 strings
  correctIndex: integer("correct_index").notNull(), // 0-3
  explanation: text("explanation").notNull(),
  reference: text("reference"), // optional link or doc reference
});

// Quiz sessions
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode").notNull(), // "quiz" | "study" | "timed"
  domain: text("domain"), // null = all domains
  difficulty: text("difficulty"), // null = all difficulties
  totalQuestions: integer("total_questions").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  startedAt: integer("started_at").notNull(), // unix timestamp
  completedAt: integer("completed_at"), // null = in progress
});

// Individual answers within a session
export const answers = sqliteTable("answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  questionId: integer("question_id").notNull(),
  selectedIndex: integer("selected_index"), // null = skipped
  isCorrect: integer("is_correct").notNull().default(0), // 0/1 boolean
  timeSpentMs: integer("time_spent_ms"),
});

// Per-question performance stats (materialized for speed)
export const questionStats = sqliteTable("question_stats", {
  questionId: integer("question_id").primaryKey(),
  timesAttempted: integer("times_attempted").notNull().default(0),
  timesCorrect: integer("times_correct").notNull().default(0),
  avgTimeMs: real("avg_time_ms"),
  lastAttempted: integer("last_attempted"),
});

// Insert schemas
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const insertAnswerSchema = createInsertSchema(answers).omit({ id: true });
export const insertQuestionStatSchema = createInsertSchema(questionStats);

// Types
export type Question = typeof questions.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type QuestionStat = typeof questionStats.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;
