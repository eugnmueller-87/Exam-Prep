import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Brain, BookOpen, TrendingUp, Clock, Target, AlertTriangle, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

  const { data: domains, isLoading: loadingDomains } = useQuery({
    queryKey: ["/api/stats/domains"],
    queryFn: () => apiRequest("GET", "/api/stats/domains"),
  });

  const { data: weakTopics, isLoading: loadingWeak } = useQuery({
    queryKey: ["/api/stats/weak-topics"],
    queryFn: () => apiRequest("GET", "/api/stats/weak-topics"),
  });

  const { data: recentSessions, isLoading: loadingSessions } = useQuery({
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
                <span key={key} className={`text-xs px-2 py-1 rounded-md border font-medium ${DOMAIN_COLORS[key]}`}>
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
              <Button variant="secondary" data-testid="btn-start-study" className="gap-2 w-full sm:w-auto min-h-[44px]">
                <BookOpen className="w-4 h-4" />
                Study
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Target} label="Questions Answered" value={overview?.totalAttempted ?? 0} />
          <StatCard
            icon={TrendingUp}
            label="Overall Accuracy"
            value={overview?.totalAttempted > 0
              ? `${Math.round((overview.totalCorrect / overview.totalAttempted) * 100)}%`
              : "—"}
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
                ? overview.avgScore >= 70 ? "green" : "orange"
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
              <p className="text-xs text-muted-foreground pt-2">Complete a quiz to see domain stats.</p>
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
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : weakTopics?.length > 0 ? (
              <div className="space-y-2">
                {weakTopics.slice(0, 5).map((topic: any, i: number) => (
                  <div key={i} data-testid={`weak-topic-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                    <div>
                      <p className="text-sm font-medium leading-tight">{topic.topic}</p>
                      <p className="text-xs text-muted-foreground capitalize">{DOMAIN_LABELS[topic.domain]}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={topic.accuracy < 50 ? "border-red-500/40 text-red-400" : "border-orange-500/40 text-orange-400"}
                    >
                      {topic.accuracy}%
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Complete quizzes to identify weak areas.</p>
            )}
          </CardContent>
        </Card>
      </div>

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
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize border ${DOMAIN_COLORS[s.domain || "plan"] ?? "text-muted-foreground border-border"}`}>
                          {s.domain ? DOMAIN_LABELS[s.domain] : "All Domains"}
                        </span>
                        <span className="text-sm">{s.correctCount}/{s.totalQuestions} correct</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${score >= 70 ? "text-emerald-400" : "text-orange-400"}`}>
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
