import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import type { Question, Session, Answer, QuestionStat, InsertQuestion, InsertSession, InsertAnswer } from "@shared/schema";

const sqlite = new Database("data.db");
export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium',
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    reference TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    domain TEXT,
    difficulty TEXT,
    total_questions INTEGER NOT NULL,
    correct_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    selected_index INTEGER,
    is_correct INTEGER NOT NULL DEFAULT 0,
    time_spent_ms INTEGER
  );
  CREATE TABLE IF NOT EXISTS question_stats (
    question_id INTEGER PRIMARY KEY,
    times_attempted INTEGER NOT NULL DEFAULT 0,
    times_correct INTEGER NOT NULL DEFAULT 0,
    avg_time_ms REAL,
    last_attempted INTEGER
  );
`);

export interface IStorage {
  // Questions
  getQuestions(domain?: string, difficulty?: string, limit?: number): Question[];
  getQuestion(id: number): Question | undefined;
  insertQuestion(q: InsertQuestion): Question;
  getQuestionCount(): number;

  // Sessions
  createSession(s: InsertSession): Session;
  getSession(id: number): Session | undefined;
  completeSession(id: number, correctCount: number): Session | undefined;
  getRecentSessions(limit?: number): Session[];

  // Answers
  saveAnswer(a: InsertAnswer): Answer;
  getSessionAnswers(sessionId: number): Answer[];

  // Stats
  getQuestionStats(questionId: number): QuestionStat | undefined;
  upsertQuestionStats(questionId: number, correct: boolean, timeMs: number): void;
  getWeakTopics(): { topic: string; domain: string; accuracy: number; attempted: number }[];
  getOverallStats(): { totalAttempted: number; totalCorrect: number; totalSessions: number; avgScore: number };
  getDomainStats(): { domain: string; attempted: number; correct: number; accuracy: number }[];
}

export class Storage implements IStorage {
  getQuestions(domain?: string, difficulty?: string, limit?: number): Question[] {
    let query = db.select().from(schema.questions);
    const conditions = [];
    if (domain) conditions.push(eq(schema.questions.domain, domain));
    if (difficulty) conditions.push(eq(schema.questions.difficulty, difficulty));
    
    let result;
    if (conditions.length === 2) {
      result = db.select().from(schema.questions).where(and(conditions[0], conditions[1])).all();
    } else if (conditions.length === 1) {
      result = db.select().from(schema.questions).where(conditions[0]).all();
    } else {
      result = db.select().from(schema.questions).all();
    }
    
    // Shuffle and limit
    const shuffled = result.sort(() => Math.random() - 0.5);
    return limit ? shuffled.slice(0, limit) : shuffled;
  }

  getQuestion(id: number): Question | undefined {
    return db.select().from(schema.questions).where(eq(schema.questions.id, id)).get();
  }

  insertQuestion(q: InsertQuestion): Question {
    return db.insert(schema.questions).values(q).returning().get();
  }

  getQuestionCount(): number {
    const result = db.select({ count: sql<number>`count(*)` }).from(schema.questions).get();
    return result?.count ?? 0;
  }

  createSession(s: InsertSession): Session {
    return db.insert(schema.sessions).values(s).returning().get();
  }

  getSession(id: number): Session | undefined {
    return db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
  }

  completeSession(id: number, correctCount: number): Session | undefined {
    return db.update(schema.sessions)
      .set({ correctCount, completedAt: Date.now() })
      .where(eq(schema.sessions.id, id))
      .returning()
      .get();
  }

  getRecentSessions(limit = 10): Session[] {
    return db.select().from(schema.sessions)
      .where(sql`completed_at IS NOT NULL`)
      .orderBy(desc(schema.sessions.completedAt))
      .limit(limit)
      .all();
  }

  saveAnswer(a: InsertAnswer): Answer {
    return db.insert(schema.answers).values(a).returning().get();
  }

  getSessionAnswers(sessionId: number): Answer[] {
    return db.select().from(schema.answers).where(eq(schema.answers.sessionId, sessionId)).all();
  }

  getQuestionStats(questionId: number): QuestionStat | undefined {
    return db.select().from(schema.questionStats).where(eq(schema.questionStats.questionId, questionId)).get();
  }

  upsertQuestionStats(questionId: number, correct: boolean, timeMs: number): void {
    const existing = this.getQuestionStats(questionId);
    if (existing) {
      const newAttempted = existing.timesAttempted + 1;
      const newCorrect = existing.timesCorrect + (correct ? 1 : 0);
      const newAvgTime = existing.avgTimeMs
        ? (existing.avgTimeMs * existing.timesAttempted + timeMs) / newAttempted
        : timeMs;
      
      db.update(schema.questionStats)
        .set({
          timesAttempted: newAttempted,
          timesCorrect: newCorrect,
          avgTimeMs: newAvgTime,
          lastAttempted: Date.now(),
        })
        .where(eq(schema.questionStats.questionId, questionId))
        .run();
    } else {
      db.insert(schema.questionStats).values({
        questionId,
        timesAttempted: 1,
        timesCorrect: correct ? 1 : 0,
        avgTimeMs: timeMs,
        lastAttempted: Date.now(),
      }).run();
    }
  }

  getWeakTopics(): { topic: string; domain: string; accuracy: number; attempted: number }[] {
    const result = db.select({
      topic: schema.questions.topic,
      domain: schema.questions.domain,
      attempted: sql<number>`SUM(qs.times_attempted)`,
      correct: sql<number>`SUM(qs.times_correct)`,
    })
      .from(schema.questions)
      .innerJoin(schema.questionStats, eq(schema.questions.id, schema.questionStats.questionId))
      .groupBy(schema.questions.topic, schema.questions.domain)
      .all() as any[];
    
    return result
      .filter((r: any) => r.attempted > 0)
      .map((r: any) => ({
        topic: r.topic,
        domain: r.domain,
        accuracy: Math.round((r.correct / r.attempted) * 100),
        attempted: r.attempted,
      }))
      .sort((a: any, b: any) => a.accuracy - b.accuracy);
  }

  getOverallStats(): { totalAttempted: number; totalCorrect: number; totalSessions: number; avgScore: number } {
    const statsResult = db.select({
      totalAttempted: sql<number>`SUM(times_attempted)`,
      totalCorrect: sql<number>`SUM(times_correct)`,
    }).from(schema.questionStats).get() as any;
    
    const sessionsResult = db.select({
      count: sql<number>`count(*)`,
      avgScore: sql<number>`AVG(CAST(correct_count AS REAL) / total_questions * 100)`,
    }).from(schema.sessions).where(sql`completed_at IS NOT NULL`).get() as any;
    
    return {
      totalAttempted: statsResult?.totalAttempted ?? 0,
      totalCorrect: statsResult?.totalCorrect ?? 0,
      totalSessions: sessionsResult?.count ?? 0,
      avgScore: Math.round(sessionsResult?.avgScore ?? 0),
    };
  }

  getDomainStats(): { domain: string; attempted: number; correct: number; accuracy: number }[] {
    const result = db.select({
      domain: schema.questions.domain,
      attempted: sql<number>`SUM(qs.times_attempted)`,
      correct: sql<number>`SUM(qs.times_correct)`,
    })
      .from(schema.questions)
      .innerJoin(schema.questionStats, eq(schema.questions.id, schema.questionStats.questionId))
      .groupBy(schema.questions.domain)
      .all() as any[];
    
    return result.map((r: any) => ({
      domain: r.domain,
      attempted: r.attempted,
      correct: r.correct,
      accuracy: r.attempted > 0 ? Math.round((r.correct / r.attempted) * 100) : 0,
    }));
  }
}

export const storage = new Storage();
