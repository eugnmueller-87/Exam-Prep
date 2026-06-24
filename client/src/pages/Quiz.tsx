import { useState, useRef } from "react";
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
import { CheckCircle2, XCircle, ChevronRight, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [wrongOnly, setWrongOnly] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<
    { questionId: number; selected: number | null; correct: boolean; timeMs: number }[]
  >([]);
  const questionStartTime = useRef<number>(Date.now());

  const { data: allQuestions, isLoading: loadingQuestions } = useQuery({
    queryKey: ["/api/questions"],
    queryFn: () => apiRequest("GET", "/api/questions"),
  });

  // Pool of questions the user has most recently answered incorrectly. Used by
  // the "Wrong answers only" quiz mode so the user can drill exactly what they
  // keep missing. Returns full questions (with shuffled options).
  const { data: wrongQuestions, isLoading: loadingWrong } = useQuery<Question[]>({
    queryKey: ["/api/answers/wrong"],
    queryFn: () => apiRequest("GET", "/api/answers/wrong"),
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
    },
  });

  const currentQuestion = questions[currentIdx];
  const options: string[] = currentQuestion ? JSON.parse(currentQuestion.options) : [];
  const isLast = currentIdx === questions.length - 1;

  async function startQuiz() {
    // Source pool: either the full bank or only questions answered wrong before.
    const pool = wrongOnly ? (wrongQuestions ?? []) : (allQuestions ?? []);
    if (pool.length === 0) return;

    let qs = [...pool];
    if (domain !== "all") qs = qs.filter((q: Question) => q.domain === domain);
    if (difficulty !== "all") qs = qs.filter((q: Question) => q.difficulty === difficulty);
    qs = qs.sort(() => Math.random() - 0.5).slice(0, parseInt(questionCount));
    setQuestions(qs);

    const session = await createSession.mutateAsync({
      mode: wrongOnly ? "wrong-review" : "quiz",
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

  async function handleReveal() {
    if (selectedAnswer === null) return;
    setRevealed(true);
    const timeMs = Date.now() - questionStartTime.current;
    const isCorrect = selectedAnswer === currentQuestion.correctIndex;
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
    // can only ask as many as exist, so we surface this to the user. In
    // "wrong answers only" mode the pool is the user's wrong-answered questions.
    const pool: Question[] = wrongOnly ? (wrongQuestions ?? []) : (allQuestions ?? []);
    const available = pool.filter((q: Question) => {
      if (domain !== "all" && q.domain !== domain) return false;
      if (difficulty !== "all" && q.difficulty !== difficulty) return false;
      return true;
    }).length;
    const requested = parseInt(questionCount);
    const willAsk = Math.min(requested, available);
    const isCapped = available > 0 && requested > available;
    const poolLoading = wrongOnly ? loadingWrong : loadingQuestions;

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
            {/* Wrong answers only toggle */}
            <button
              type="button"
              data-testid="toggle-wrong-only"
              onClick={() => setWrongOnly((v) => !v)}
              className={cn(
                "w-full flex items-center justify-between gap-3 p-3.5 rounded-lg border text-left transition-colors min-h-[44px]",
                wrongOnly
                  ? "border-red-500/50 bg-red-500/10"
                  : "border-border bg-secondary/30 hover:bg-secondary",
              )}
            >
              <div className="flex items-center gap-2.5">
                <XCircle
                  className={cn(
                    "w-4 h-4 shrink-0",
                    wrongOnly ? "text-red-400" : "text-muted-foreground",
                  )}
                />
                <div>
                  <p className="text-sm font-medium">Wrong answers only</p>
                  <p className="text-xs text-muted-foreground">
                    Drill the questions you've gotten wrong before
                    {!loadingWrong && ` (${(wrongQuestions ?? []).length} available)`}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                  wrongOnly ? "bg-red-500" : "bg-secondary border border-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    wrongOnly ? "translate-x-[18px]" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>

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
                    ? wrongOnly
                      ? "No wrong answers to review with this filter. Great job!"
                      : "No questions match this filter."
                    : isCapped
                      ? `Only ${available} ${wrongOnly ? "wrong-answer" : ""} question${available !== 1 ? "s" : ""} match this filter — the quiz will ask all ${available}.`
                      : `${available} ${wrongOnly ? "wrong-answer " : ""}question${available !== 1 ? "s" : ""} available with this filter.`}
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
                  ? wrongOnly
                    ? "No wrong answers to review"
                    : "No questions available"
                  : `Begin ${wrongOnly ? "Review" : "Quiz"} (${willAsk} question${willAsk !== 1 ? "s" : ""})`}
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
        <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
          <span>
            Question {currentIdx + 1} of {questions.length}
          </span>
          <span>{answeredCorrect} correct so far</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
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
            onClick={handleReveal}
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
