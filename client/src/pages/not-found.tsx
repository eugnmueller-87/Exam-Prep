import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-5xl font-bold text-muted-foreground/30 mb-4">404</p>
      <p className="text-lg font-semibold mb-2">Page not found</p>
      <p className="text-muted-foreground text-sm mb-6">This page doesn't exist.</p>
      <Link href="/">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  );
}
