import type { Express } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { questionBank } from "./questions-seed";
import { insertAnswerSchema, insertSessionSchema } from "@shared/schema";
import type { Question } from "@shared/schema";

// Deterministic per-question PRNG (mulberry32) seeded by the question id, so a
// given question always shuffles to the SAME order. This is essential: the Quiz
// and the Results review both fetch /api/questions independently, and they must
// agree on option order or the "your answer / correct answer" review would be
// wrong. A fixed salt varies the layout without making it random per request.
function seededRand(seed: number): () => number {
  let a = (seed * 2654435761) ^ 0x9e3779b9;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Reorder a question's answer options and remap correctIndex so it still points
// at the right one. The bank was generated with the correct answer almost always
// in slot B (~85%) and as the longest option — patterns the real Microsoft exam
// deliberately avoids, so practising against them trains a bad habit. This
// breaks the positional tell. The stored data (questions-seed.ts / DB) is never
// mutated — only the copy sent in the response is reordered.
function shuffleOptions(q: Question): Question {
  let options: string[];
  try {
    options = JSON.parse(q.options);
  } catch {
    return q; // malformed options — return unchanged rather than crash
  }
  if (!Array.isArray(options) || options.length < 2) return q;

  const rand = seededRand(q.id);
  // Pair each option with whether it is the correct one, then seeded Fisher–Yates.
  const paired = options.map((text, i) => ({ text, correct: i === q.correctIndex }));
  for (let i = paired.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [paired[i], paired[j]] = [paired[j], paired[i]];
  }
  const newCorrectIndex = paired.findIndex((p) => p.correct);

  return {
    ...q,
    options: JSON.stringify(paired.map((p) => p.text)),
    correctIndex: newCorrectIndex,
  };
}

// "Weak topics / exam traps" — the high-value concepts that are easiest to get
// wrong on the real exam (and that have tripped up practice runs). A question is
// included if its topic or subtopic matches any of these regexes. Kept on the
// server so the set can be tuned without a schema change or DB migration.
const WEAK_TOPIC_PATTERNS: RegExp[] = [
  /model router/i, // Balanced vs Quality vs Cost
  /monitor|telemetry|agent details|metrics explorer|azure monitor/i, // Logs vs Metrics vs Agent details
  /model context protocol|mcp/i, // centralized tools
  /multi-app|virtual table|data organization/i, // cross-environment data
  /voice|contact center/i, // Optimize for voice, CloseOmnichannelConversation
  /authoring|agents and flows|platform selection|multi-agent solution|task agents|foundry agent service/i, // Copilot Studio vs Agent Builder
  /orchestrate prebuilt|prebuilt agents|sales service|finance sc ai|warehouse|cx service/i, // Sales/Service/F&O Copilot features
  /test|validation|evaluation/i, // similarity test, schema validation
  /telemetry interpret|tuning/i, // strictness, temperature=0
];

function isWeakTopic(q: { topic: string; subtopic: string }): boolean {
  const hay = `${q.topic} ${q.subtopic}`;
  return WEAK_TOPIC_PATTERNS.some((re) => re.test(hay));
}

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
    const { domain, difficulty, limit, weak } = req.query;
    let questions = storage.getQuestions(
      domain as string | undefined,
      difficulty as string | undefined,
      limit ? parseInt(limit as string) : undefined,
    );
    // ?weak=true restricts to the curated "exam traps" topic set.
    if (weak === "true") {
      questions = questions.filter(isWeakTopic);
    }
    res.json(questions.map(shuffleOptions));
  });

  // GET /api/questions/count - get total question count
  app.get("/api/questions/count", (req, res) => {
    res.json({ count: storage.getQuestionCount() });
  });

  // GET /api/questions/seen-ids - IDs of questions already answered at least
  // once. Used by the quiz to prioritize never-seen questions. (Declared before
  // /:id so "seen-ids" is not parsed as an id.)
  app.get("/api/questions/seen-ids", (req, res) => {
    res.json(storage.getSeenQuestionIds());
  });

  // GET /api/questions/:id - get single question
  app.get("/api/questions/:id", (req, res) => {
    const q = storage.getQuestion(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(shuffleOptions(q));
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
    const wrong = storage.getWrongAnswers(domain && domain !== "all" ? domain : undefined);
    // Apply the same deterministic option shuffle so the displayed order matches
    // what the user saw in the quiz; selectedIndex/answeredAt are preserved.
    res.json(wrong.map((w) => ({ ...shuffleOptions(w), selectedIndex: w.selectedIndex })));
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
