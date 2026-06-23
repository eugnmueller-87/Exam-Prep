import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import type {
  Question,
  Session,
  Answer,
  QuestionStat,
  InsertQuestion,
  InsertSession,
  InsertAnswer,
} from "@shared/schema";

// A question the user most recently answered incorrectly, plus the option they
// picked. Used by the "Review Wrong Answers" section on the dashboard.
export type WrongAnswer = Question & {
  selectedIndex: number | null;
  answeredAt: number | null;
};

// Node's built-in SQLite (node:sqlite, stable in Node 22+). No native compiler
// needed — unlike better-sqlite3 — so it installs and deploys anywhere Node runs.
//
// Open the DB at DATABASE_PATH (default ./data.db). If that location isn't
// writable on the host (some PaaS containers have a read-only working dir),
// fall back to the OS temp dir so the app still boots instead of crashing.
function openDatabase(): DatabaseSync {
  const primary = process.env.DATABASE_PATH || "data.db";
  try {
    return new DatabaseSync(primary);
  } catch (err) {
    const fallback = path.join(os.tmpdir(), "ab100-exam-prep.db");
    console.error(
      `[storage] Could not open SQLite DB at "${primary}" (${(err as Error).message}). ` +
        `Falling back to "${fallback}". Set DATABASE_PATH to a writable path to persist data.`,
    );
    return new DatabaseSync(fallback);
  }
}

const sqlite = openDatabase();

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

// ── Row → camelCase mappers (node:sqlite returns raw snake_case columns) ──
function mapQuestion(r: any): Question {
  return {
    id: r.id,
    domain: r.domain,
    topic: r.topic,
    subtopic: r.subtopic,
    difficulty: r.difficulty,
    question: r.question,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    reference: r.reference ?? null,
  };
}

function mapSession(r: any): Session {
  return {
    id: r.id,
    mode: r.mode,
    domain: r.domain ?? null,
    difficulty: r.difficulty ?? null,
    totalQuestions: r.total_questions,
    correctCount: r.correct_count,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? null,
  };
}

function mapAnswer(r: any): Answer {
  return {
    id: r.id,
    sessionId: r.session_id,
    questionId: r.question_id,
    selectedIndex: r.selected_index ?? null,
    isCorrect: r.is_correct,
    timeSpentMs: r.time_spent_ms ?? null,
  };
}

function mapQuestionStat(r: any): QuestionStat {
  return {
    questionId: r.question_id,
    timesAttempted: r.times_attempted,
    timesCorrect: r.times_correct,
    avgTimeMs: r.avg_time_ms ?? null,
    lastAttempted: r.last_attempted ?? null,
  };
}

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
  getWrongAnswers(domain?: string): WrongAnswer[];

  // Stats
  getQuestionStats(questionId: number): QuestionStat | undefined;
  upsertQuestionStats(questionId: number, correct: boolean, timeMs: number): void;
  getWeakTopics(): { topic: string; domain: string; accuracy: number; attempted: number }[];
  getOverallStats(): {
    totalAttempted: number;
    totalCorrect: number;
    totalSessions: number;
    avgScore: number;
  };
  getDomainStats(): { domain: string; attempted: number; correct: number; accuracy: number }[];
}

export class Storage implements IStorage {
  getQuestions(domain?: string, difficulty?: string, limit?: number): Question[] {
    const conditions: string[] = [];
    const args: any[] = [];
    if (domain) {
      conditions.push("domain = ?");
      args.push(domain);
    }
    if (difficulty) {
      conditions.push("difficulty = ?");
      args.push(difficulty);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";

    const rows = sqlite.prepare(`SELECT * FROM questions${where}`).all(...args) as any[];
    const questions = rows.map(mapQuestion);

    // Shuffle and limit (preserves original behaviour)
    const shuffled = questions.sort(() => Math.random() - 0.5);
    return limit ? shuffled.slice(0, limit) : shuffled;
  }

  getQuestion(id: number): Question | undefined {
    const r = sqlite.prepare("SELECT * FROM questions WHERE id = ?").get(id) as any;
    return r ? mapQuestion(r) : undefined;
  }

  insertQuestion(q: InsertQuestion): Question {
    const r = sqlite
      .prepare(
        `INSERT INTO questions (domain, topic, subtopic, difficulty, question, options, correct_index, explanation, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      )
      .get(
        q.domain,
        q.topic,
        q.subtopic,
        q.difficulty ?? "medium",
        q.question,
        q.options,
        q.correctIndex,
        q.explanation,
        q.reference ?? null,
      ) as any;
    return mapQuestion(r);
  }

  getQuestionCount(): number {
    const r = sqlite.prepare("SELECT count(*) AS count FROM questions").get() as any;
    return r?.count ?? 0;
  }

  createSession(s: InsertSession): Session {
    const r = sqlite
      .prepare(
        `INSERT INTO sessions (mode, domain, difficulty, total_questions, correct_count, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      )
      .get(
        s.mode,
        s.domain ?? null,
        s.difficulty ?? null,
        s.totalQuestions,
        s.correctCount ?? 0,
        s.startedAt,
        s.completedAt ?? null,
      ) as any;
    return mapSession(r);
  }

  getSession(id: number): Session | undefined {
    const r = sqlite.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    return r ? mapSession(r) : undefined;
  }

  completeSession(id: number, correctCount: number): Session | undefined {
    const r = sqlite
      .prepare("UPDATE sessions SET correct_count = ?, completed_at = ? WHERE id = ? RETURNING *")
      .get(correctCount, Date.now(), id) as any;
    return r ? mapSession(r) : undefined;
  }

  getRecentSessions(limit = 10): Session[] {
    const rows = sqlite
      .prepare(
        "SELECT * FROM sessions WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(mapSession);
  }

  saveAnswer(a: InsertAnswer): Answer {
    const r = sqlite
      .prepare(
        `INSERT INTO answers (session_id, question_id, selected_index, is_correct, time_spent_ms)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
      )
      .get(
        a.sessionId,
        a.questionId,
        a.selectedIndex ?? null,
        a.isCorrect ?? 0,
        a.timeSpentMs ?? null,
      ) as any;
    return mapAnswer(r);
  }

  getSessionAnswers(sessionId: number): Answer[] {
    const rows = sqlite
      .prepare("SELECT * FROM answers WHERE session_id = ?")
      .all(sessionId) as any[];
    return rows.map(mapAnswer);
  }

  // Questions whose MOST RECENT answer was wrong (and not skipped). One row per
  // question. answers.id (autoincrement) is used as the recency proxy since the
  // answers table has no timestamp; the session's completed_at is surfaced as
  // answeredAt for display. Optionally filtered by domain.
  getWrongAnswers(domain?: string): WrongAnswer[] {
    const args: any[] = [];
    let domainFilter = "";
    if (domain) {
      domainFilter = "AND q.domain = ?";
      args.push(domain);
    }

    const rows = sqlite
      .prepare(
        `SELECT q.*, latest.selected_index AS sel, s.completed_at AS answered_at
         FROM (
           SELECT a.question_id, a.selected_index, a.is_correct, a.session_id
           FROM answers a
           INNER JOIN (
             SELECT question_id, MAX(id) AS max_id
             FROM answers
             GROUP BY question_id
           ) m ON a.id = m.max_id
         ) latest
         INNER JOIN questions q ON q.id = latest.question_id
         LEFT JOIN sessions s ON s.id = latest.session_id
         WHERE latest.is_correct = 0
           AND latest.selected_index IS NOT NULL
           ${domainFilter}
         ORDER BY answered_at DESC, q.id DESC`,
      )
      .all(...args) as any[];

    return rows.map((r) => ({
      ...mapQuestion(r),
      selectedIndex: r.sel ?? null,
      answeredAt: r.answered_at ?? null,
    }));
  }

  getQuestionStats(questionId: number): QuestionStat | undefined {
    const r = sqlite
      .prepare("SELECT * FROM question_stats WHERE question_id = ?")
      .get(questionId) as any;
    return r ? mapQuestionStat(r) : undefined;
  }

  upsertQuestionStats(questionId: number, correct: boolean, timeMs: number): void {
    const existing = this.getQuestionStats(questionId);
    if (existing) {
      const newAttempted = existing.timesAttempted + 1;
      const newCorrect = existing.timesCorrect + (correct ? 1 : 0);
      const newAvgTime = existing.avgTimeMs
        ? (existing.avgTimeMs * existing.timesAttempted + timeMs) / newAttempted
        : timeMs;

      sqlite
        .prepare(
          `UPDATE question_stats
         SET times_attempted = ?, times_correct = ?, avg_time_ms = ?, last_attempted = ?
         WHERE question_id = ?`,
        )
        .run(newAttempted, newCorrect, newAvgTime, Date.now(), questionId);
    } else {
      sqlite
        .prepare(
          `INSERT INTO question_stats (question_id, times_attempted, times_correct, avg_time_ms, last_attempted)
         VALUES (?, ?, ?, ?, ?)`,
        )
        .run(questionId, 1, correct ? 1 : 0, timeMs, Date.now());
    }
  }

  getWeakTopics(): { topic: string; domain: string; accuracy: number; attempted: number }[] {
    const result = sqlite
      .prepare(
        `SELECT q.topic AS topic, q.domain AS domain,
              SUM(qs.times_attempted) AS attempted,
              SUM(qs.times_correct) AS correct
       FROM questions q
       INNER JOIN question_stats qs ON q.id = qs.question_id
       GROUP BY q.topic, q.domain`,
      )
      .all() as any[];

    return result
      .filter((r) => r.attempted > 0)
      .map((r) => ({
        topic: r.topic,
        domain: r.domain,
        accuracy: Math.round((r.correct / r.attempted) * 100),
        attempted: r.attempted,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
  }

  getOverallStats(): {
    totalAttempted: number;
    totalCorrect: number;
    totalSessions: number;
    avgScore: number;
    masteredCount: number;
    totalQuestions: number;
  } {
    const statsResult = sqlite
      .prepare(
        "SELECT SUM(times_attempted) AS totalAttempted, SUM(times_correct) AS totalCorrect FROM question_stats",
      )
      .get() as any;

    const sessionsResult = sqlite
      .prepare(
        `SELECT count(*) AS count,
              AVG(CAST(correct_count AS REAL) / total_questions * 100) AS avgScore
       FROM sessions WHERE completed_at IS NOT NULL`,
      )
      .get() as any;

    // Mastery: distinct questions that have been answered correctly at least
    // once (times_correct > 0). This only ever goes up the first time a given
    // question is answered correctly — re-answering it correctly does not change
    // the count, and the total bank size is the denominator.
    const masteredResult = sqlite
      .prepare("SELECT count(*) AS mastered FROM question_stats WHERE times_correct > 0")
      .get() as any;

    return {
      totalAttempted: statsResult?.totalAttempted ?? 0,
      totalCorrect: statsResult?.totalCorrect ?? 0,
      totalSessions: sessionsResult?.count ?? 0,
      avgScore: Math.round(sessionsResult?.avgScore ?? 0),
      masteredCount: masteredResult?.mastered ?? 0,
      totalQuestions: this.getQuestionCount(),
    };
  }

  getDomainStats(): { domain: string; attempted: number; correct: number; accuracy: number }[] {
    const result = sqlite
      .prepare(
        `SELECT q.domain AS domain,
              SUM(qs.times_attempted) AS attempted,
              SUM(qs.times_correct) AS correct
       FROM questions q
       INNER JOIN question_stats qs ON q.id = qs.question_id
       GROUP BY q.domain`,
      )
      .all() as any[];

    return result.map((r) => ({
      domain: r.domain,
      attempted: r.attempted,
      correct: r.correct,
      accuracy: r.attempted > 0 ? Math.round((r.correct / r.attempted) * 100) : 0,
    }));
  }
}

export const storage = new Storage();
