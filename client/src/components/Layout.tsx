import { Link, useLocation } from "wouter";
import { BarChart3, BookOpen, Brain, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/quiz", label: "Quiz", icon: Brain },
  { href: "/study", label: "Study", icon: BookOpen },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3 sm:gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <svg
              aria-label="AB-100 Prep"
              viewBox="0 0 32 32"
              className="w-7 h-7"
              fill="none"
            >
              <rect width="32" height="32" rx="7" fill="hsl(210 100% 45%)" />
              <path d="M9 23L16 9l7 14" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 19h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="font-semibold text-sm tracking-tight">
              AB-100 Prep
            </span>
            <span className="hidden md:inline text-xs text-muted-foreground font-medium px-1.5 py-0.5 rounded border border-border">
              Agentic AI Architect
            </span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5 sm:gap-1 ml-auto">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${label.toLowerCase()}`}
                aria-label={label}
                className={cn(
                  "flex items-center justify-center gap-1.5 min-h-[44px] px-3 sm:px-3.5 rounded-md text-sm font-medium transition-colors active:scale-[0.97]",
                  location === href
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
