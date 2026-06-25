import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, ChevronRight, SkipForward, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const SECONDS_PER_QUESTION = 120; // 2 minutes, matching the real exam pace

type Question = {
  id: number;
  domain: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  question: string;
  options: string;
  correctIndex: number;
  explanation: string;
};

const DOMAIN_LABELS: Record<string, string> = {
  plan: "Plan",
  design: "Design",
  deploy: "Deploy",
};
const DOMAIN_COLORS: Record<string, string> = {
  plan: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  design: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  deploy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};
const DIFF_COLORS: Record<string, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-red-400",
};

type QuizState = "config" | "active" | "review";

export default function Quiz() {
  const [, navigate] = useLocation();
  const [quizState, setQuizState] = useState<QuizState>("config");
  const [domain, setDomain] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [questionCount, setQuestionCount] = useState("10");
  // Question pool: "all" = full bank, "grind" = not-yet-mastered, "bottleneck"
  // = repeatedly struggled with, "weak" = curated exam-trap topics.
  const [poolMode, setPoolMode] = useState<"all" | "grind" | "bottleneck" | "weak">("all");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [answers, setAnswers] = useState<
    { questionId: number; selected: number | null; correct: boolean; timeMs: number }[]
  >([]);
  const questionStartTime = useRef<number>(Date.now());

  const { data: allQuestions, isLoading: loadingQuestions } = useQuery({
    queryKey: ["/api/questions"],
    queryFn: () => apiRequest("GET", "/api/questions"),
  });

  // "Not mastered" grind pool — every question not yet answered correctly
  // (never attempted, or attempted with 0 correct). Shrinks as you get them
  // right. This is the "go through everything you haven't nailed" pool.
  const { data: grindQuestions, isLoading: loadingGrind } = useQuery<Question[]>({
    queryKey: ["/api/questions/grind"],
    queryFn: () => apiRequest("GET", "/api/questions/grind"),
  });

  // "Bottleneck" pool — questions missed at least once and not yet re-learned
  // (2 correct in a row). Your hardest questions; they leave automatically once
  // you answer them correctly twice consecutively.
  const { data: bottleneckQuestions, isLoading: loadingBottleneck } = useQuery<Question[]>({
    queryKey: ["/api/questions/bottleneck"],
    queryFn: () => apiRequest("GET", "/api/questions/bottleneck"),
  });

  // Curated "exam traps" question set — the high-value topics that are easy to
  // get wrong (model router modes, monitoring tools, MCP, platform selection,
  // voice, prebuilt-agent features, testing, tuning). Always available to drill.
  const { data: weakQuestions, isLoading: loadingWeak } = useQuery<Question[]>({
    queryKey: ["/api/questions", "weak"],
    queryFn: () => apiRequest("GET", "/api/questions?weak=true"),
  });

  // IDs of questions already answered at least once. Used to serve never-seen
  // questions first so the user works through the entire bank before repeating.
  const { data: seenIds } = useQuery<number[]>({
    queryKey: ["/api/questions/seen-ids"],
    queryFn: () => apiRequest("GET", "/api/questions/seen-ids"),
  });

  const createSession = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sessions", data),
  });

  const saveAnswer = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/answers", data),
  });

  const completeSession = useMutation({
    mutationFn: ({ id, correct }: { id: number; correct: number }) =>
      apiRequest("PATCH", `/api/sessions/${id}/complete`, { correctCount: correct }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/weak-topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/answers/wrong"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/seen-ids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/grind"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions/bottleneck"] });
    },
  });

  const currentQuestion = questions[currentIdx];
  const options: string[] = currentQuestion ? JSON.parse(currentQuestion.options) : [];
  const isLast = currentIdx === questions.length - 1;

  // Per-question 2-minute countdown, mirroring the real exam pace. Resets to
  // SECONDS_PER_QUESTION whenever a new question is shown. While the question is
  // unanswered it ticks down every second; reaching 0 auto-reveals the answer
  // (time's up). The timer freezes once the answer is revealed.
  useEffect(() => {
    if (quizState !== "active") return;
    setSecondsLeft(SECONDS_PER_QUESTION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, quizState]);

  useEffect(() => {
    if (quizState !== "active" || revealed) return;
    if (secondsLeft <= 0) {
      // Time's up — reveal whatever is (or isn't) selected.
      handleReveal(true);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, revealed, quizState]);

  async function startQuiz() {
    // Source pool: full bank, not-mastered grind set, bottleneck set, or
    // curated exam-trap topics.
    const pool =
      poolMode === "grind"
        ? (grindQuestions ?? [])
        : poolMode === "bottleneck"
          ? (bottleneckQuestions ?? [])
          : poolMode === "weak"
            ? (weakQuestions ?? [])
            : (allQuestions ?? []);
    if (pool.length === 0) return;

    let qs = [...pool];
    if (domain !== "all") qs = qs.filter((q: Question) => q.domain === domain);
    if (difficulty !== "all") qs = qs.filter((q: Question) => q.difficulty === difficulty);

    // Prioritize never-seen questions so the user works through the whole bank
    // before repeating. Shuffle first (random within each group), then put
    // unseen questions ahead of seen ones, and finally slice to the count. Once
    // every question has been seen, this is just a normal random selection.
    const seen = new Set(seenIds ?? []);
    qs = qs.sort(() => Math.random() - 0.5);
    const unseen = qs.filter((q: Question) => !seen.has(q.id));
    const alreadySeen = qs.filter((q: Question) => seen.has(q.id));
    qs = [...unseen, ...alreadySeen].slice(0, parseInt(questionCount));
    setQuestions(qs);

    const session = await createSession.mutateAsync({
      mode:
        poolMode === "grind"
          ? "grind"
          : poolMode === "bottleneck"
            ? "bottleneck"
            : poolMode === "weak"
              ? "weak-review"
              : "quiz",
      domain: domain !== "all" ? domain : null,
      difficulty: difficulty !== "all" ? difficulty : null,
      totalQuestions: qs.length,
      correctCount: 0,
      startedAt: Date.now(),
    });
    setSessionId(session.id);
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setRevealed(false);
    setAnswers([]);
    setQuizState("active");
    questionStartTime.current = Date.now();
  }

  function handleSelect(idx: number) {
    if (revealed) return;
    setSelectedAnswer(idx);
  }

  async function handleReveal(timedOut = false) {
    // Normally requires a selection; on time-out we reveal with no selection
    // (recorded as incorrect). Guard against double-reveal.
    if (revealed) return;
    if (selectedAnswer === null && !timedOut) return;
    setRevealed(true);
    const timeMs = Date.now() - questionStartTime.current;
    const isCorrect = selectedAnswer !== null && selectedAnswer === currentQuestion.correctIndex;
    const answerEntry = {
      questionId: currentQuestion.id,
      selected: selectedAnswer,
      correct: isCorrect,
      timeMs,
    };
    setAnswers((prev) => [...prev, answerEntry]);

    if (sessionId) {
      await saveAnswer.mutateAsync({
        sessionId,
        questionId: currentQuestion.id,
        selectedIndex: selectedAnswer,
        isCorrect: isCorrect ? 1 : 0,
        timeSpentMs: timeMs,
      });
    }
  }

  async function handleNext() {
    if (isLast) {
      // Finish quiz
      const allAnswers = [...answers];
      const correct = allAnswers.filter((a) => a.correct).length;
      if (sessionId) {
        await completeSession.mutateAsync({ id: sessionId, correct });
        navigate(`/results/${sessionId}`);
      }
    } else {
      setCurrentIdx((prev) => prev + 1);
      setSelectedAnswer(null);
      setRevealed(false);
      questionStartTime.current = Date.now();
    }
  }

  async function handleSkip() {
    const timeMs = Date.now() - questionStartTime.current;
    const answerEntry = { questionId: currentQuestion.id, selected: null, correct: false, timeMs };
    setAnswers((prev) => [...prev, answerEntry]);

    if (sessionId) {
      await saveAnswer.mutateAsync({
        sessionId,
        questionId: currentQuestion.id,
        selectedIndex: null,
        isCorrect: 0,
        timeSpentMs: timeMs,
      });
    }

    if (isLast) {
      const allAnswers = [...answers, answerEntry];
      const correct = allAnswers.filter((a) => a.correct).length;
      if (sessionId) {
        await completeSession.mutateAsync({ id: sessionId, correct });
        navigate(`/results/${sessionId}`);
      }
    } else {
      setCurrentIdx((prev) => prev + 1);
      setSelectedAnswer(null);
      setRevealed(false);
      questionStartTime.current = Date.now();
    }
  }

  // Config screen
  if (quizState === "config") {
    // How many questions match the chosen pool + domain + difficulty. The quiz
    // can only ask as many as exist, so we surface this to the user.
    const pool: Question[] =
      poolMode === "grind"
        ? (grindQuestions ?? [])
        : poolMode === "bottleneck"
          ? (bottleneckQuestions ?? [])
          : poolMode === "weak"
            ? (weakQuestions ?? [])
            : (allQuestions ?? []);
    const matching = pool.filter((q: Question) => {
      if (domain !== "all" && q.domain !== domain) return false;
      if (difficulty !== "all" && q.difficulty !== difficulty) return false;
      return true;
    });
    const available = matching.length;
    // How many of the matching questions the user has not seen yet — these are
    // served first, so the user knows progress toward covering the whole pool.
    const seenSet = new Set(seenIds ?? []);
    const unseenCount = matching.filter((q: Question) => !seenSet.has(q.id)).length;
    const requested = parseInt(questionCount);
    const willAsk = Math.min(requested, available);
    const isCapped = available > 0 && requested > available;
    const poolLoading =
      poolMode === "grind"
        ? loadingGrind
        : poolMode === "bottleneck"
          ? loadingBottleneck
          : poolMode === "weak"
            ? loadingWeak
            : loadingQuestions;
    const poolLabel =
      poolMode === "grind"
        ? "not-mastered"
        : poolMode === "bottleneck"
          ? "bottleneck"
          : poolMode === "weak"
            ? "exam-trap"
            : "";

    return (
      <div className="max-w-xl mx-auto fade-in">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1">Configure Quiz</h1>
          <p className="text-muted-foreground text-sm">
            Choose your focus area and difficulty level.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Question pool mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Practice with</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "all", label: "All questions", count: (allQuestions ?? []).length },
                    { key: "weak", label: "Exam traps", count: (weakQuestions ?? []).length },
                    {
                      key: "grind",
                      label: "Not mastered",
                      count: (grindQuestions ?? []).length,
                    },
                    {
                      key: "bottleneck",
                      label: "Bottleneck",
                      count: (bottleneckQuestions ?? []).length,
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    data-testid={`pool-${m.key}`}
                    onClick={() => setPoolMode(m.key)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 p-2.5 rounded-lg border text-center transition-colors min-h-[56px] active:scale-[0.98]",
                      poolMode === m.key
                        ? m.key === "bottleneck"
                          ? "border-red-500 bg-red-500/10 text-foreground"
                          : "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 hover:bg-secondary text-muted-foreground",
                    )}
                  >
                    <span className="text-xs font-medium leading-tight">{m.label}</span>
                    <span className="text-[10px] opacity-70">{m.count}</span>
                  </button>
                ))}
              </div>
              {poolMode === "weak" && (
                <p className="text-xs text-muted-foreground">
                  Curated high-value topics that are easy to miss: model router, monitoring tools,
                  MCP, platform selection, voice, prebuilt-agent features, testing &amp; tuning.
                </p>
              )}
              {poolMode === "grind" && (
                <p className="text-xs text-muted-foreground">
                  Every question you haven't answered correctly yet. Grind through them — each
                  leaves this pool once you get it right.
                </p>
              )}
              {poolMode === "bottleneck" && (
                <p className="text-xs text-red-400">
                  Questions you've missed. A question enters here the moment you get it wrong, and
                  leaves once you answer it correctly twice in a row.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Domain</label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger data-testid="select-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  <SelectItem value="plan">Plan AI Solutions (25–30%)</SelectItem>
                  <SelectItem value="design">Design AI Solutions (25–30%)</SelectItem>
                  <SelectItem value="deploy">Deploy AI Solutions (40–45%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Difficulty</label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger data-testid="select-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Number of Questions</label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger data-testid="select-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 questions (quick)</SelectItem>
                  <SelectItem value="10">10 questions</SelectItem>
                  <SelectItem value="15">15 questions</SelectItem>
                  <SelectItem value="20">20 questions (full)</SelectItem>
                </SelectContent>
              </Select>
              {!poolLoading && (
                <p
                  data-testid="available-count"
                  className={`text-xs ${isCapped ? "text-amber-400" : "text-muted-foreground"}`}
                >
                  {available === 0
                    ? poolMode === "grind"
                      ? "Nothing left to grind with this filter — you've answered them all correctly! 🎉"
                      : poolMode === "bottleneck"
                        ? "No bottleneck questions with this filter. Nicely done!"
                        : "No questions match this filter."
                    : isCapped
                      ? `Only ${available} ${poolLabel} question${available !== 1 ? "s" : ""} match this filter — the quiz will ask all ${available}.`
                      : `${available} ${poolLabel ? poolLabel + " " : ""}question${available !== 1 ? "s" : ""} available with this filter.`}
                </p>
              )}
              {!poolLoading && available > 0 && (
                <p className="text-xs text-primary" data-testid="unseen-count">
                  {unseenCount > 0
                    ? `New questions get priority — ${unseenCount} not seen yet.`
                    : "✓ You've seen every question in this set — now reviewing at random."}
                </p>
              )}
            </div>

            <Button
              data-testid="btn-begin-quiz"
              className="w-full mt-2"
              onClick={startQuiz}
              disabled={createSession.isPending || poolLoading || available === 0}
            >
              {poolLoading
                ? "Loading questions..."
                : available === 0
                  ? poolMode === "grind"
                    ? "All mastered 🎉"
                    : poolMode === "bottleneck"
                      ? "No bottlenecks"
                      : "No questions available"
                  : `Begin ${poolMode === "all" ? "Quiz" : "Review"} (${willAsk} question${willAsk !== 1 ? "s" : ""})`}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const progress = (currentIdx / questions.length) * 100;
  const answeredCorrect = answers.filter((a) => a.correct).length;

  return (
    <div className="max-w-2xl mx-auto fade-in">
      {/* Progress header */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground gap-3">
          <span>
            Question {currentIdx + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">{answeredCorrect} correct so far</span>
            <span
              data-testid="question-timer"
              className={cn(
                "inline-flex items-center gap-1 font-mono font-semibold tabular-nums px-2 py-0.5 rounded-md",
                revealed
                  ? "text-muted-foreground bg-secondary/50"
                  : secondsLeft <= 30
                    ? "text-red-400 bg-red-500/10"
                    : secondsLeft <= 60
                      ? "text-amber-400 bg-amber-500/10"
                      : "text-foreground bg-secondary",
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
        {/* Time bar (drains over 2 min) */}
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000 ease-linear",
              revealed
                ? "bg-muted-foreground/40"
                : secondsLeft <= 30
                  ? "bg-red-500"
                  : secondsLeft <= 60
                    ? "bg-amber-500"
                    : "bg-primary",
            )}
            style={{ width: `${(secondsLeft / SECONDS_PER_QUESTION) * 100}%` }}
          />
        </div>
        {/* Question progress */}
        <div className="h-1 bg-secondary/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary/50 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <Card className="mb-4">
        <CardContent className="pt-5">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span
              className={`text-xs px-2 py-0.5 rounded-md border font-medium ${DOMAIN_COLORS[currentQuestion.domain]}`}
            >
              {DOMAIN_LABELS[currentQuestion.domain]}
            </span>
            <span className="text-xs text-muted-foreground">{currentQuestion.topic}</span>
            <span
              className={`text-xs font-semibold ml-auto capitalize ${DIFF_COLORS[currentQuestion.difficulty]}`}
            >
              {currentQuestion.difficulty}
            </span>
          </div>

          {/* Question text */}
          <p
            className="text-base sm:text-[17px] font-medium leading-relaxed mb-5"
            data-testid="question-text"
          >
            {currentQuestion.question}
          </p>

          {/* Options */}
          <div className="space-y-2.5">
            {options.map((opt, i) => {
              const isSelected = selectedAnswer === i;
              const isCorrect = currentQuestion.correctIndex === i;
              let cls =
                "w-full text-left p-4 rounded-lg border text-[15px] sm:text-sm leading-relaxed transition-all cursor-pointer active:scale-[0.99] touch-manipulation ";

              if (!revealed) {
                cls += isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary/30 hover:border-primary/50 hover:bg-secondary";
              } else {
                if (isCorrect) cls += "border-emerald-500 bg-emerald-500/10 text-emerald-300";
                else if (isSelected && !isCorrect)
                  cls += "border-red-500 bg-red-500/10 text-red-300";
                else cls += "border-border bg-secondary/20 text-muted-foreground";
              }

              return (
                <button
                  key={i}
                  data-testid={`option-${i}`}
                  className={cls}
                  onClick={() => handleSelect(i)}
                  disabled={revealed}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs shrink-0 mt-px">
                      {revealed && isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : revealed && isSelected && !isCorrect ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span>{opt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {revealed && (
            <div className="mt-5 p-4 rounded-lg bg-secondary/50 border border-border fade-in">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Explanation
              </p>
              <p className="text-sm leading-relaxed">{currentQuestion.explanation}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Topic: {currentQuestion.subtopic}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pb-4">
        {!revealed && (
          <Button
            variant="ghost"
            size="lg"
            data-testid="btn-skip"
            onClick={handleSkip}
            className="gap-1.5 text-muted-foreground w-full sm:w-auto"
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </Button>
        )}
        {!revealed ? (
          <Button
            size="lg"
            data-testid="btn-check-answer"
            onClick={() => handleReveal()}
            disabled={selectedAnswer === null}
            className="w-full sm:w-auto"
          >
            Check Answer
          </Button>
        ) : (
          <Button
            size="lg"
            data-testid="btn-next"
            onClick={handleNext}
            className="gap-1.5 w-full sm:w-auto"
          >
            {isLast ? "See Results" : "Next Question"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
