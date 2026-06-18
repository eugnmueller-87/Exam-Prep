import type { Express } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { questionBank } from "./questions-seed";
import { insertAnswerSchema, insertSessionSchema } from "@shared/schema";

export async function registerRoutes(server: Server, app: Express) {
  // Seed questions on startup if DB is empty
  const count = storage.getQuestionCount();
  if (count === 0) {
    for (const q of questionBank) {
      storage.insertQuestion(q);
    }
    console.log(`Seeded ${questionBank.length} questions`);
  }

  // GET /api/questions - list questions with optional filters
  app.get("/api/questions", (req, res) => {
    const { domain, difficulty, limit } = req.query;
    const questions = storage.getQuestions(
      domain as string | undefined,
      difficulty as string | undefined,
      limit ? parseInt(limit as string) : undefined,
    );
    res.json(questions);
  });

  // GET /api/questions/count - get total question count
  app.get("/api/questions/count", (req, res) => {
    res.json({ count: storage.getQuestionCount() });
  });

  // GET /api/questions/:id - get single question
  app.get("/api/questions/:id", (req, res) => {
    const q = storage.getQuestion(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(q);
  });

  // GET /api/questions/:id/stats - get stats for a question
  app.get("/api/questions/:id/stats", (req, res) => {
    const stats = storage.getQuestionStats(parseInt(req.params.id));
    res.json(stats ?? { timesAttempted: 0, timesCorrect: 0 });
  });

  // POST /api/sessions - start a new session
  app.post("/api/sessions", (req, res) => {
    const parsed = insertSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const session = storage.createSession(parsed.data);
    res.json(session);
  });

  // GET /api/sessions/recent - get recent completed sessions
  app.get("/api/sessions/recent", (req, res) => {
    const sessions = storage.getRecentSessions(10);
    res.json(sessions);
  });

  // GET /api/sessions/:id - get a session
  app.get("/api/sessions/:id", (req, res) => {
    const session = storage.getSession(parseInt(req.params.id));
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json(session);
  });

  // PATCH /api/sessions/:id/complete - mark session done
  app.patch("/api/sessions/:id/complete", (req, res) => {
    const { correctCount } = req.body;
    if (typeof correctCount !== "number")
      return res.status(400).json({ error: "correctCount required" });
    const session = storage.completeSession(parseInt(req.params.id), correctCount);
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json(session);
  });

  // POST /api/answers - save an answer and update stats
  app.post("/api/answers", (req, res) => {
    const parsed = insertAnswerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const answer = storage.saveAnswer(parsed.data);
    // Update rolling stats
    storage.upsertQuestionStats(
      parsed.data.questionId,
      parsed.data.isCorrect === 1,
      parsed.data.timeSpentMs ?? 0,
    );
    res.json(answer);
  });

  // GET /api/sessions/:id/answers - get all answers for a session
  app.get("/api/sessions/:id/answers", (req, res) => {
    const answers = storage.getSessionAnswers(parseInt(req.params.id));
    res.json(answers);
  });

  // GET /api/answers/wrong - questions most recently answered incorrectly
  // (optionally filtered by ?domain=plan|design|deploy)
  app.get("/api/answers/wrong", (req, res) => {
    const domain = req.query.domain as string | undefined;
    res.json(storage.getWrongAnswers(domain && domain !== "all" ? domain : undefined));
  });

  // GET /api/stats/overview - overall performance stats
  app.get("/api/stats/overview", (req, res) => {
    res.json(storage.getOverallStats());
  });

  // GET /api/stats/domains - per-domain stats
  app.get("/api/stats/domains", (req, res) => {
    res.json(storage.getDomainStats());
  });

  // GET /api/stats/weak-topics - topics ranked by accuracy (weakest first)
  app.get("/api/stats/weak-topics", (req, res) => {
    res.json(storage.getWeakTopics());
  });
}
