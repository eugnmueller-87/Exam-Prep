import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain,
  BookOpen,
  TrendingUp,
  Clock,
  Target,
  AlertTriangle,
  BarChart3,
  XCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WrongAnswer = {
  id: number;
  domain: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  question: string;
  options: string;
  correctIndex: number;
  explanation: string;
  selectedIndex: number | null;
  answeredAt: number | null;
};

const DOMAIN_LABELS: Record<string, string> = {
  plan: "Plan AI Solutions",
  design: "Design AI Solutions",
  deploy: "Deploy AI Solutions",
};
const DOMAIN_WEIGHTS: Record<string, string> = {
  plan: "25–30%",
  design: "25–30%",
  deploy: "40–45%",
};
const DOMAIN_COLORS: Record<string, string> = {
  plan: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  design: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  deploy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};
const DOMAIN_BAR: Record<string, string> = {
  plan: "bg-blue-500",
  design: "bg-purple-500",
  deploy: "bg-emerald-500",
};

export default function Dashboard() {
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["/api/stats/overview"],
    queryFn: () => apiRequest("GET", "/api/stats/overview"),
  });

  const { data: domains } = useQuery({
    queryKey: ["/api/stats/domains"],
    queryFn: () => apiRequest("GET", "/api/stats/domains"),
  });

  const { data: weakTopics, isLoading: loadingWeak } = useQuery({
    queryKey: ["/api/stats/weak-topics"],
    queryFn: () => apiRequest("GET", "/api/stats/weak-topics"),
  });

  const { data: recentSessions } = useQuery({
    queryKey: ["/api/sessions/recent"],
    queryFn: () => apiRequest("GET", "/api/sessions/recent"),
  });

  const hasData = overview?.totalAttempted > 0;

  return (
    <div className="space-y-6 fade-in">
      {/* Hero */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold mb-1">AB-100 Exam Practice</h1>
            <p className="text-muted-foreground text-sm">
              Agentic AI Business Solutions Architect — Microsoft Certification
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                <span
                  key={key}
                  className={`text-xs px-2 py-1 rounded-md border font-medium ${DOMAIN_COLORS[key]}`}
                >
                  {label} <span className="opacity-70">({DOMAIN_WEIGHTS[key]})</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
            <Link href="/quiz" className="flex-1 sm:flex-none">
              <Button data-testid="btn-start-quiz" className="gap-2 w-full sm:w-auto min-h-[44px]">
                <Brain className="w-4 h-4" />
                Start Quiz
              </Button>
            </Link>
            <Link href="/study" className="flex-1 sm:flex-none">
              <Button
                variant="secondary"
                data-testid="btn-start-study"
                className="gap-2 w-full sm:w-auto min-h-[44px]"
              >
                <BookOpen className="w-4 h-4" />
                Study
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Mastery progress — how many unique questions answered correctly at least once */}
      {loadingOverview ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        (() => {
          const mastered = overview?.masteredCount ?? 0;
          const total = overview?.totalQuestions ?? 0;
          const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
          return (
            <Card data-testid="mastery-card">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-end justify-between mb-2 gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium">Questions Mastered</span>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-2xl font-bold tracking-tight text-emerald-400"
                      data-testid="mastery-count"
                    >
                      {mastered}
                    </span>
                    <span className="text-sm text-muted-foreground"> / {total}</span>
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {mastered === 0
                    ? "Answer a question correctly to start building mastery."
                    : `${pct}% of the question bank answered correctly at least once.`}
                </p>
              </CardContent>
            </Card>
          );
        })()
      )}

      {/* Stats row */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={Target}
            label="Questions Answered"
            value={overview?.totalAttempted ?? 0}
          />
          <StatCard
            icon={TrendingUp}
            label="Overall Accuracy"
            value={
              overview?.totalAttempted > 0
                ? `${Math.round((overview.totalCorrect / overview.totalAttempted) * 100)}%`
                : "—"
            }
            accent={
              overview?.totalAttempted > 0
                ? Math.round((overview.totalCorrect / overview.totalAttempted) * 100) >= 70
                  ? "green"
                  : "orange"
                : undefined
            }
          />
          <StatCard icon={Clock} label="Sessions Completed" value={overview?.totalSessions ?? 0} />
          <StatCard
            icon={Brain}
            label="Avg Session Score"
            value={overview?.totalSessions > 0 ? `${overview.avgScore}%` : "—"}
            accent={
              overview?.totalSessions > 0
                ? overview.avgScore >= 70
                  ? "green"
                  : "orange"
                : undefined
            }
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Domain performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Performance by Domain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["plan", "design", "deploy"].map((domain) => {
              const stat = domains?.find((d: any) => d.domain === domain);
              const acc = stat?.accuracy ?? 0;
              const hasAttempts = stat?.attempted > 0;
              return (
                <div key={domain} data-testid={`domain-stat-${domain}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">{DOMAIN_LABELS[domain]}</span>
                    <span className="text-xs text-muted-foreground">
                      {hasAttempts ? `${acc}% (${stat.attempted} Q)` : "Not started"}
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${DOMAIN_BAR[domain]}`}
                      style={{ width: hasAttempts ? `${acc}%` : "0%" }}
                    />
                  </div>
                </div>
              );
            })}
            {!hasData && (
              <p className="text-xs text-muted-foreground pt-2">
                Complete a quiz to see domain stats.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Weak topics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              Weak Areas to Focus On
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingWeak ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : weakTopics?.length > 0 ? (
              <div className="space-y-2">
                {weakTopics.slice(0, 5).map((topic: any, i: number) => (
                  <div
                    key={i}
                    data-testid={`weak-topic-${i}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <p className="text-sm font-medium leading-tight">{topic.topic}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {DOMAIN_LABELS[topic.domain]}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        topic.accuracy < 50
                          ? "border-red-500/40 text-red-400"
                          : "border-orange-500/40 text-orange-400"
                      }
                    >
                      {topic.accuracy}%
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Complete quizzes to identify weak areas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review wrong answers */}
      <WrongAnswersSection />

      {/* Recent sessions */}
      {recentSessions?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentSessions.slice(0, 5).map((s: any) => {
                const score = Math.round((s.correctCount / s.totalQuestions) * 100);
                return (
                  <Link key={s.id} href={`/results/${s.id}`}>
                    <div
                      data-testid={`session-row-${s.id}`}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 hover:bg-secondary transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize border ${DOMAIN_COLORS[s.domain || "plan"] ?? "text-muted-foreground border-border"}`}
                        >
                          {s.domain ? DOMAIN_LABELS[s.domain] : "All Domains"}
                        </span>
                        <span className="text-sm">
                          {s.correctCount}/{s.totalQuestions} correct
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm font-semibold ${score >= 70 ? "text-emerald-400" : "text-orange-400"}`}
                        >
                          {score}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.completedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  accent?: "green" | "orange";
}) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-5 pb-4">
        <Icon className="w-4 h-4 text-muted-foreground mb-3" />
        <p
          className={`text-2xl font-bold tracking-tight ${
            accent === "green" ? "text-emerald-400" : accent === "orange" ? "text-orange-400" : ""
          }`}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

const DIFF_BADGE: Record<string, string> = {
  easy: "border-emerald-500/40 text-emerald-400",
  medium: "border-amber-500/40 text-amber-400",
  hard: "border-red-500/40 text-red-400",
};

function WrongAnswersSection() {
  const [domain, setDomain] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: wrong, isLoading } = useQuery<WrongAnswer[]>({
    queryKey: ["/api/answers/wrong", domain],
    queryFn: () => apiRequest("GET", `/api/answers/wrong?domain=${domain}`),
  });

  // Hide the whole section until the user has at least one wrong answer to review
  // (keeps a clean dashboard for new users). Always render once data shows any.
  const hasAny = (wrong?.length ?? 0) > 0 || domain !== "all";
  if (!isLoading && !hasAny) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            Review Wrong Answers
            {wrong && wrong.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">({wrong.length})</span>
            )}
          </CardTitle>
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger
              data-testid="wrong-filter-domain"
              className="w-full sm:w-44 min-h-[40px]"
            >
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="design">Design</SelectItem>
              <SelectItem value="deploy">Deploy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : wrong && wrong.length > 0 ? (
          <div className="space-y-2.5">
            {wrong.map((q) => {
              const opts: string[] = JSON.parse(q.options);
              const isExpanded = expandedId === q.id;
              return (
                <div
                  key={q.id}
                  data-testid={`wrong-card-${q.id}`}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  <button
                    className="w-full text-left px-4 py-3.5 min-h-[44px] flex items-start gap-3 hover:bg-secondary/30 active:bg-secondary/40 transition-colors touch-manipulation"
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    data-testid={`wrong-expand-${q.id}`}
                  >
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border font-medium ${DOMAIN_COLORS[q.domain]}`}
                        >
                          {DOMAIN_LABELS[q.domain]}
                        </span>
                        <Badge variant="outline" className={`text-xs ${DIFF_BADGE[q.difficulty]}`}>
                          {q.difficulty}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium leading-snug">{q.question}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border fade-in space-y-1.5 pt-3">
                      {q.selectedIndex !== null && (
                        <div className="flex items-start gap-2">
                          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300">
                            <span className="font-medium">Your answer:</span>{" "}
                            {opts[q.selectedIndex]}
                          </p>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-300">
                          <span className="font-medium">Correct:</span> {opts[q.correctIndex]}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50 leading-relaxed">
                        {q.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No wrong answers in this domain — nice work! Try another filter or take a quiz.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
