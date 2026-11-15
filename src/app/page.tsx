import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-background text-foreground">
      {/* Minimal Top Bar */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-brand-light" />
            <span className="font-sans text-sm font-medium tracking-tight text-foreground">
              IEEE Grand Prix
            </span>
          </div>
          <Label index="timing" tone="signal" dot>
            live event
          </Label>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        {/* Hero Header */}
        <div className="mb-12 max-w-2xl space-y-3">
          <Label index="race">choose your surface</Label>
          <h1 className="font-sans text-3xl font-medium tracking-[-0.03em] text-foreground sm:text-4xl">
            IEEE Grand Prix
          </h1>
          <p className="text-sm leading-relaxed text-secondary sm:text-base">
            A live multiplayer coding quiz where every correct answer moves your
            car forward on the big screen.
          </p>
        </div>

        {/* Three Equal Surface Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Surface 01: /play */}
          <Link
            href="/play"
            className="group block rounded-[var(--radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
          >
            <Card className="flex h-full flex-col justify-between group-hover:border-border-strong">
              <div>
                <CardHeader>
                  <Label index="surface">01</Label>
                  <span className="font-mono text-[11px] text-muted">
                    /play · mobile
                  </span>
                </CardHeader>

                {/* Accurate Phone Frame Mini-Preview */}
                <div className="border-b border-border bg-background/60 px-6 py-5">
                  <div className="mx-auto flex h-40 max-w-[200px] flex-col justify-between rounded-[var(--radius-default)] border border-border bg-surface p-3">
                    <div className="flex items-center justify-between border-b border-border pb-2 font-mono text-[10px] tabular-nums">
                      <span className="text-foreground">#07 · P1</span>
                      <span className="text-secondary">02:14</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[10px] tabular-nums">
                      <div className="flex items-center justify-between rounded-[6px] border border-border bg-elevated px-2.5 py-1.5">
                        <span className="text-secondary">Easy</span>
                        <span className="text-success">+1</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[6px] border border-brand-light/40 bg-brand-subtle px-2.5 py-1.5">
                        <span className="text-foreground">Medium</span>
                        <span className="text-brand-light">+2</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[6px] border border-border bg-elevated px-2.5 py-1.5">
                        <span className="text-secondary">Hard</span>
                        <span className="text-signal">+3</span>
                      </div>
                    </div>
                  </div>
                </div>

                <CardBody className="space-y-1.5">
                  <h2 className="font-sans text-base font-medium tracking-[-0.015em] text-foreground">
                    Player Cockpit
                  </h2>
                  <p className="text-xs leading-relaxed text-secondary">
                    Join on your phone, choose Easy (+1), Medium (+2), or Hard
                    (+3) questions, and move your car down the strip.
                  </p>
                </CardBody>
              </div>

              <CardFooter className="font-mono text-xs text-brand-light">
                <span>Open player</span>
                <ArrowUpRight className="size-4 transition-transform duration-[var(--duration-ui)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </CardFooter>
            </Card>
          </Link>

          {/* Surface 02: /display */}
          <Link
            href="/display"
            className="group block rounded-[var(--radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
          >
            <Card className="flex h-full flex-col justify-between group-hover:border-border-strong">
              <div>
                <CardHeader>
                  <Label index="surface">02</Label>
                  <span className="font-mono text-[11px] text-muted">
                    /display · 1080p / 4k
                  </span>
                </CardHeader>

                {/* Accurate 16:9 Broadcast Frame Mini-Preview */}
                <div className="border-b border-border bg-background/60 px-6 py-5">
                  <div className="flex h-40 w-full flex-col justify-between rounded-[var(--radius-default)] border border-border bg-surface p-3">
                    <div className="flex items-center justify-between border-b border-border pb-2 font-mono text-[10px] tabular-nums">
                      <span className="flex items-center gap-1.5 text-signal">
                        <span className="size-1.5 rounded-full bg-signal" />
                        <span>live</span>
                      </span>
                      <span className="font-medium text-foreground">02:14</span>
                      <span className="text-secondary">18 cars</span>
                    </div>

                    <div className="grid flex-1 grid-cols-12 gap-2 pt-2.5">
                      {/* Mini Track Lanes */}
                      <div className="col-span-8 flex flex-col justify-around rounded-[6px] border border-border bg-background px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] text-muted">P1</span>
                          <div className="h-1 flex-1 rounded-full bg-elevated">
                            <div className="h-1 w-4/5 rounded-full bg-signal" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] text-muted">P2</span>
                          <div className="h-1 flex-1 rounded-full bg-elevated">
                            <div className="h-1 w-3/5 rounded-full bg-brand-light" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] text-muted">P3</span>
                          <div className="h-1 flex-1 rounded-full bg-elevated">
                            <div className="h-1 w-2/5 rounded-full bg-success" />
                          </div>
                        </div>
                      </div>

                      {/* Mini Timing Tower */}
                      <div className="col-span-4 flex flex-col justify-between rounded-[6px] border border-border bg-background p-2 font-mono text-[9px] tabular-nums">
                        <div className="flex justify-between text-foreground">
                          <span>1 SOL</span>
                          <span>18</span>
                        </div>
                        <div className="flex justify-between text-secondary">
                          <span>2 NOU</span>
                          <span>-3</span>
                        </div>
                        <div className="flex justify-between text-secondary">
                          <span>3 OMA</span>
                          <span>-6</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <CardBody className="space-y-1.5">
                  <h2 className="font-sans text-base font-medium tracking-[-0.015em] text-foreground">
                    Live Race Display
                  </h2>
                  <p className="text-xs leading-relaxed text-secondary">
                    Projector view with the live drag strip, +1/+2/+3 step
                    gains, F1-style timing tower, and race clock.
                  </p>
                </CardBody>
              </div>

              <CardFooter className="font-mono text-xs text-brand-light">
                <span>Open display</span>
                <ArrowUpRight className="size-4 transition-transform duration-[var(--duration-ui)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </CardFooter>
            </Card>
          </Link>

          {/* Surface 03: /admin */}
          <Link
            href="/admin"
            className="group block rounded-[var(--radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
          >
            <Card className="flex h-full flex-col justify-between group-hover:border-border-strong">
              <div>
                <CardHeader>
                  <Label index="surface">03</Label>
                  <span className="font-mono text-[11px] text-muted">
                    /admin · organizer
                  </span>
                </CardHeader>

                {/* Accurate Console Panel Mini-Preview */}
                <div className="border-b border-border bg-background/60 px-6 py-5">
                  <div className="flex h-40 w-full flex-col justify-between rounded-[var(--radius-default)] border border-border bg-surface p-3 font-mono text-[10px] tabular-nums">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-foreground">Round 1</span>
                      <span className="text-secondary">180s · 90 bank</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <span className="rounded-[6px] bg-brand px-2 py-1.5 text-center text-foreground">
                        Start
                      </span>
                      <span className="rounded-[6px] border border-border bg-elevated px-2 py-1.5 text-center text-secondary">
                        Reset
                      </span>
                      <span className="rounded-[6px] border border-danger/40 bg-danger-subtle px-2 py-1.5 text-center text-danger">
                        End
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2 text-[9px] text-muted">
                      <span>pool: 10E / 10M / 10H</span>
                      <span>csv export</span>
                    </div>
                  </div>
                </div>

                <CardBody className="space-y-1.5">
                  <h2 className="font-sans text-base font-medium tracking-[-0.015em] text-foreground">
                    Race Control
                  </h2>
                  <p className="text-xs leading-relaxed text-secondary">
                    Configure race duration and rewards, moderate players, edit
                    the 90-question bank, and trigger rounds.
                  </p>
                </CardBody>
              </div>

              <CardFooter className="font-mono text-xs text-brand-light">
                <span>Open admin</span>
                <ArrowUpRight className="size-4 transition-transform duration-[var(--duration-ui)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </CardFooter>
            </Card>
          </Link>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-5 font-mono text-xs text-secondary sm:flex-row sm:items-center">
          <span>IEEE Student Branch</span>
          <span className="text-muted tabular-nums">
            easy +1 · medium +2 · hard +3
          </span>
        </div>
      </footer>
    </div>
  );
}
