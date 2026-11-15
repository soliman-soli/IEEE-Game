import Link from "next/link";
import { Flag, Monitor, Shield, Smartphone } from "lucide-react";

export default function HomePage() {
  return (
    <main className="respect-reduced-motion mx-auto flex min-h-screen max-w-4xl flex-col justify-between px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between border-b border-[#2E3440] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[6px] bg-[#00629B] text-[#F5F3ED]">
            <Flag className="size-5" />
          </div>
          <div>
            <p className="font-[family-name:var(--font-orbitron)] text-lg font-bold tracking-tight text-[#F5F3ED]">
              IEEE GRAND PRIX
            </p>
            <p className="text-xs text-[#A0A6B2]">
              Strategic Web Development Racing Quiz
            </p>
          </div>
        </div>
        <span className="rounded-[4px] border border-[#00629B] bg-[#00629B]/20 px-2.5 py-1 font-mono text-xs font-medium text-[#3898EC]">
          LIVE EVENT SYSTEM
        </span>
      </header>

      <section className="my-auto py-10">
        <div className="mb-8 space-y-2">
          <h1 className="font-[family-name:var(--font-orbitron)] text-3xl font-bold tracking-tight text-[#F5F3ED] sm:text-4xl">
            CHOOSE YOUR SURFACE
          </h1>
          <p className="max-w-xl text-sm text-[#A0A6B2]">
            All three surfaces stay synchronized against the authoritative race clock.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/play"
            className="group flex flex-col justify-between rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 transition-colors active:translate-y-[1px] hover:border-[#3898EC]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-[6px] bg-[#00629B] text-[#F5F3ED]">
                  <Smartphone className="size-5" />
                </div>
                <span className="rounded-[4px] bg-[#FFD43B]/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#FFD43B]">
                  MOBILE
                </span>
              </div>
              <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                Player Cockpit
              </h2>
              <p className="text-xs leading-relaxed text-[#A0A6B2]">
                Join the race on your phone, pick Easy (+1), Medium (+2), or Hard (+3) questions, and advance your car.
              </p>
            </div>
            <span className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-[6px] bg-[#00629B] text-xs font-semibold text-[#F5F3ED]">
              Join race
            </span>
          </Link>

          <Link
            href="/display"
            className="group flex flex-col justify-between rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 transition-colors active:translate-y-[1px] hover:border-[#FFD43B]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-[6px] bg-[#282D35] text-[#FFD43B]">
                  <Monitor className="size-5" />
                </div>
                <span className="rounded-[4px] bg-[#282D35] px-2 py-0.5 font-mono text-[11px] text-[#A0A6B2]">
                  1080P / 4K
                </span>
              </div>
              <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                Live Race Display
              </h2>
              <p className="text-xs leading-relaxed text-[#A0A6B2]">
                Projector broadcast view with auto-zoom drag strip, +1/+2/+3 telemetry pops, timing tower, and race audio.
              </p>
            </div>
            <span className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-[6px] border border-[#2E3440] bg-[#282D35] text-xs font-semibold text-[#F5F3ED]">
              Open broadcast display
            </span>
          </Link>

          <Link
            href="/admin"
            className="group flex flex-col justify-between rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 transition-colors active:translate-y-[1px] hover:border-[#3898EC]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-[6px] bg-[#282D35] text-[#3898EC]">
                  <Shield className="size-5" />
                </div>
                <span className="rounded-[4px] bg-[#282D35] px-2 py-0.5 font-mono text-[11px] text-[#A0A6B2]">
                  ORGANIZER
                </span>
              </div>
              <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                Race Control Admin
              </h2>
              <p className="text-xs leading-relaxed text-[#A0A6B2]">
                Configure duration and rewards, moderate players, edit the 90-question bank, and trigger Start/End/New Round.
              </p>
            </div>
            <span className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-[6px] border border-[#2E3440] bg-[#282D35] text-xs font-semibold text-[#F5F3ED]">
              Open race control
            </span>
          </Link>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2E3440] pt-4 text-xs text-[#A0A6B2]">
        <span>IEEE Student Branch • Strategic Racing Quiz</span>
        <span className="font-mono">Easy +1 • Medium +2 • Hard +3</span>
      </footer>
    </main>
  );
}
