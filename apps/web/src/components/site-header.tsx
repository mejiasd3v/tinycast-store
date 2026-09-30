import { Moon, Sun } from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export const REPO_URL = "https://github.com/mejiasd3v/tinycast-store";

export function SiteHeader() {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
            <rect width="32" height="32" rx="8" className="fill-foreground" />
            <path d="M9 11h14M16 11v11" className="stroke-background" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="24" cy="23" r="2.5" className="fill-background" />
          </svg>
          Tinycast Store
        </a>
        <nav className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
          <a href="#get" className="hidden rounded-md px-2 py-1 hover:text-foreground sm:block">
            Get the extension
          </a>
          <a href="#publish" className="hidden rounded-md px-2 py-1 hover:text-foreground sm:block">
            Publish
          </a>
          <ButtonLink variant="ghost" size="icon" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source on GitHub">
            <GitHubMark className="size-4" />
          </ButtonLink>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </nav>
      </div>
    </header>
  );
}
