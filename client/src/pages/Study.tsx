import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, BookOpen, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
  plan: "Plan AI Solutions",
  design: "Design AI Solutions",
  deploy: "Deploy AI Solutions",
};
const DOMAIN_COLORS: Record<string, string> = {
  plan: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  design: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  deploy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};
const DIFF_BADGE: Record<string, string> = {
  easy: "border-emerald-500/40 text-emerald-400",
  medium: "border-amber-500/40 text-amber-400",
  hard: "border-red-500/40 text-red-400",
};

export default function Study() {
  const [domain, setDomain] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());

  const { data: questions, isLoading } = useQuery({
    queryKey: ["/api/questions"],
    queryFn: () => apiRequest("GET", "/api/questions"),
  });

  const filtered = (questions ?? []).filter((q: Question) => {
    if (domain !== "all" && q.domain !== domain) return false;
    if (difficulty !== "all" && q.difficulty !== difficulty) return false;
    return true;
  });

  // Group by topic
  const grouped = filtered.reduce((acc: Record<string, Question[]>, q: Question) => {
    const key = `${q.domain}::${q.topic}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {});

  function toggleReveal(id: number) {
    setRevealedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold mb-1">Study Mode</h1>
          <p className="text-muted-foreground text-sm">Browse all questions by topic. Reveal answers when you're ready.</p>
        </div>

        <div className="flex gap-2">
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger data-testid="study-filter-domain" className="w-44">
              <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="design">Design</SelectItem>
              <SelectItem value="deploy">Deploy</SelectItem>
            </SelectContent>
          </Select>

          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger data-testid="study-filter-difficulty" className="w-36">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-5">
        Showing {filtered.length} question{filtered.length !== 1 ? "s" : ""}
      </p>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, topicQuestions]) => {
            const [domainKey, topic] = key.split("::");
            return (
              <div key={key}>
                {/* Topic header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${DOMAIN_COLORS[domainKey]}`}>
                    {DOMAIN_LABELS[domainKey]}
                  </span>
                  <h2 className="text-sm font-semibold">{topic}</h2>
                  <span className="text-xs text-muted-foreground">({topicQuestions.length})</span>
                </div>

                <div className="space-y-2.5">
                  {topicQuestions.map((q) => {
                    const opts: string[] = JSON.parse(q.options);
                    const isExpanded = expandedId === q.id;
                    const isRevealed = revealedAnswers.has(q.id);

                    return (
                      <Card key={q.id} data-testid={`study-card-${q.id}`} className="overflow-hidden">
                        {/* Question header — clickable to expand */}
                        <button
                          className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-secondary/30 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : q.id)}
                          data-testid={`study-expand-${q.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Badge variant="outline" className={`text-xs ${DIFF_BADGE[q.difficulty]}`}>
                                {q.difficulty}
                              </Badge>
                              <span className="text-xs text-muted-foreground truncate">{q.subtopic}</span>
                            </div>
                            <p className="text-sm font-medium leading-snug">{q.question}</p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          )}
                        </button>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-border fade-in">
                            <div className="pt-3 space-y-2">
                              {opts.map((opt, i) => {
                                const isCorrect = q.correctIndex === i;
                                let cls = "p-3 rounded-lg border text-sm ";
                                if (!isRevealed) {
                                  cls += "border-border bg-secondary/30";
                                } else if (isCorrect) {
                                  cls += "border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
                                } else {
                                  cls += "border-border bg-secondary/20 text-muted-foreground";
                                }
                                return (
                                  <div key={i} className={cls}>
                                    <span className="font-mono text-xs mr-2 opacity-60">{String.fromCharCode(65 + i)}.</span>
                                    {opt}
                                    {isRevealed && isCorrect && (
                                      <span className="ml-2 text-xs text-emerald-400 font-medium">✓ Correct</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex items-center justify-between mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`btn-reveal-${q.id}`}
                                onClick={() => toggleReveal(q.id)}
                                className="text-xs"
                              >
                                {isRevealed ? "Hide Answer" : "Reveal Answer"}
                              </Button>
                            </div>

                            {isRevealed && (
                              <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border fade-in">
                                <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Why?</p>
                                <p className="text-sm leading-relaxed">{q.explanation}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No questions match your filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
