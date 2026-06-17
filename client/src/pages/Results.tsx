import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Trophy, RotateCcw, Home } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function Results() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = parseInt(params.sessionId);

  const { data: session, isLoading: loadingSession } = useQuery({
    queryKey: ["/api/sessions", sessionId],
    queryFn: () => apiRequest("GET", `/api/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const { data: answers, isLoading: loadingAnswers } = useQuery({
    queryKey: ["/api/sessions", sessionId, "answers"],
    queryFn: () => apiRequest("GET", `/api/sessions/${sessionId}/answers`),
    enabled: !!sessionId,
  });

  const { data: allQuestions } = useQuery({
    queryKey: ["/api/questions"],
    queryFn: () => apiRequest("GET", "/api/questions"),
  });

  if (loadingSession || loadingAnswers) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  if (!session) return <div className="text-muted-foreground">Session not found.</div>;

  const score = Math.round((session.correctCount / session.totalQuestions) * 100);
  const passed = score >= 70;

  // Map answers to questions
  const questionMap = (allQuestions ?? []).reduce((acc: Record<number, any>, q: any) => {
    acc[q.id] = q;
    return acc;
  }, {});

  const enriched = (answers ?? []).map((a: any) => ({
    ...a,
    question: questionMap[a.questionId],
  }));

  return (
    <div className="max-w-2xl mx-auto fade-in space-y-5">
      {/* Score card */}
      <Card className="text-center">
        <CardContent className="pt-8 pb-7">
          <div
            className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center scale-in ${passed ? "bg-emerald-500/20" : "bg-orange-500/20"}`}
          >
            <Trophy className={`w-8 h-8 ${passed ? "text-emerald-400" : "text-orange-400"}`} />
          </div>
          <p
            className={`text-5xl font-bold mb-1 ${passed ? "text-emerald-400" : "text-orange-400"}`}
          >
            {score}%
          </p>
          <p className="text-muted-foreground text-sm mb-1">
            {session.correctCount} correct out of {session.totalQuestions} questions
          </p>
          <p className={`text-sm font-medium ${passed ? "text-emerald-400" : "text-orange-400"}`}>
            {passed ? "Passing score (≥70%)" : "Keep practising — aim for 70%+"}
          </p>

          <div className="flex flex-col sm:flex-row sm:justify-center gap-3 mt-6">
            <Link href="/quiz" className="w-full sm:w-auto">
              <Button data-testid="btn-retry" className="gap-2 w-full sm:w-auto min-h-[44px]">
                <RotateCcw className="w-4 h-4" />
                New Quiz
              </Button>
            </Link>
            <Link href="/" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                data-testid="btn-home"
                className="gap-2 w-full sm:w-auto min-h-[44px]"
              >
                <Home className="w-4 h-4" />
                Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Answer review */}
      {enriched.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Answer Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {enriched.map((a: any, i: number) => {
              const q = a.question;
              if (!q) return null;
              const opts: string[] = JSON.parse(q.options);
              const skipped = a.selectedIndex === null;

              return (
                <div
                  key={a.id}
                  data-testid={`result-item-${i}`}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  {/* Question row */}
                  <div
                    className={`px-4 py-3 flex items-start gap-3 ${a.isCorrect ? "bg-emerald-500/5" : "bg-red-500/5"}`}
                  >
                    {a.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border font-medium ${DOMAIN_COLORS[q.domain]}`}
                        >
                          {DOMAIN_LABELS[q.domain]}
                        </span>
                        <span className="text-xs text-muted-foreground">{q.subtopic}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">{q.question}</p>
                    </div>
                  </div>

                  {/* Answer breakdown */}
                  <div className="px-4 py-3 space-y-1.5 border-t border-border">
                    {skipped ? (
                      <p className="text-xs text-muted-foreground italic">Skipped</p>
                    ) : (
                      <>
                        {a.selectedIndex !== q.correctIndex && (
                          <div className="flex items-start gap-2">
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-300">
                              <span className="font-medium">Your answer:</span>{" "}
                              {opts[a.selectedIndex]}
                            </p>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-emerald-300">
                            <span className="font-medium">Correct:</span> {opts[q.correctIndex]}
                          </p>
                        </div>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50 leading-relaxed">
                      {q.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
