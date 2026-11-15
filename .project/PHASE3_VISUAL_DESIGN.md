# Phase 3: Visual Design Specification

## 1. Design Tokens & Color Palette (IEEE-Inspired Dark Racing)

All surfaces share a single fixed dark motorsport theme (`styles/tokens.css` → Tailwind v4 `@theme`).

### Core Surface & Brand Tokens
| Token | Hex | Role & Contrast Notes |
|---|---|---|
| `--bg-asphalt` | `#17191D` | Primary background across Player, Display, and Admin |
| `--bg-surface` | `#1F2329` | Elevated cards, lane rows, and Admin panels |
| `--bg-elevated` | `#282D35` | Pressed states, table headers, secondary buttons |
| `--text-primary` | `#F5F3ED` | Primary off-white ink (`14.2:1` on `#17191D`) |
| `--text-muted` | `#A0A6B2` | Secondary labels, categories, timestamps (`6.3:1` on `#17191D`) |
| `--border-subtle` | `#2E3440` | `1px` crisp structural borders |
| `--brand-ieee` | `#00629B` | IEEE Blue — primary button fills, active header strip (`#F5F3ED` text on `#00629B` = `5.9:1`) |
| `--brand-ieee-light` | `#3898EC` | High-contrast blue for text/icons on dark asphalt (`6.8:1`) |
| `--accent-yellow` | `#FFD43B` | Racing Yellow — movement, rewards, leader highlight, Hard (+3) gold (`12.8:1` on `#17191D`) |

### Difficulty & Feedback Tokens (Color + Icon + Label)
| Difficulty / State | Fill / Accent | Border | Icon (`lucide-react`) | Spectator Pop |
|---|---|---|---|---|
| **Easy (+1 Step)** | `#22C55E` (Emerald) | `#22C55E` | `ShieldCheck` (1 chevron) | Green `+1` |
| **Medium (+2 Steps)** | `#3898EC` (Sky/IEEE Light) | `#3898EC` | `Gauge` (2 chevrons) | Blue `+2` |
| **Hard (+3 Steps)** | `#FFD43B` (Racing Gold) | `#FFD43B` | `Flame` / `Zap` (3 chevrons) | Gold `+3` (larger scale) |
| **Correct Feedback** | `#22C55E` | `#16A34A` | `CheckCircle2` | — |
| **Wrong / Lockout / Danger** | `#EF4444` (Red Flag) | `#DC2626` | `OctagonX` | — |

### Vehicle Liveries (Auto-assigned, avoiding pure Green/Blue/Gold difficulty confusion)
8 high-contrast motorsport liveries cycled across players, always paired with a crisp `#01–#99` number plate in `Orbitron`:
`#F97316` (McLaren Papaya), `#EC4899` (Alpine Pink), `#A855F7` (Ultraviolet), `#14B8A6` (Teal), `#E11D48` (Crimson), `#F43F5E` (Coral), `#8B5CF6` (Indigo), `#06B6D4` (Cyan).

---

## 2. Typography & Scale

Loaded via `next/font/google` (self-hosted at build):
- **Display / Telemetry (`--font-orbitron`):** Global countdown (`64px–88px` on Display), position numbers (`P1`, `P2`), car numbers (`#07`), step badges (`+1`, `+2`, `+3`), and screen titles. Always `tabular-nums`.
- **UI & Questions (`--font-sans` / Geist):** Question prompts (`18px/1.4` on mobile), answer buttons (`16px/1.35` medium), admin tables (`14px`).
- **Code & Timestamps (`--font-mono` / Geist Mono):** Code snippets in questions (`14px`), millisecond tie-break diffs, and live clock telemetry.

### Radius & Border Scale
- Single crisp motorsport geometry:
  - `--radius-sm`: `4px` (badges, number plates, code blocks)
  - `--radius-md`: `6px` (buttons, inputs)
  - `--radius-lg`: `8px` (cards, modals, difficulty cards)
- Borders: `1px solid var(--border-subtle)`; active/selected states use `2px solid`. No heavy blur stacks or glowing neon drop-shadows.

---

## 3. Component System (Mapped to Approved Phase 0 Pick List)

1. **`Button` (from Ref #2 cva pattern):**
   - Variants: `primary` (`#00629B` fill, `#F5F3ED` text, active `translate-y-[1px]`), `secondary` (`#282D35` fill, `#F5F3ED` text, `1px` border), `danger` (`#EF4444` fill for Admin destructive actions).
   - Sizes: `player` (`h-14` / `56px` min tap target), `default` (`h-11` / `44px`), `sm` (`h-9` / `36px` Admin table actions).
2. **`Card`:** `#1F2329` background, `1px solid #2E3440`, `8px` radius.
3. **`CodeBlock` (from Ref #6):** `#111317` background, `1px solid #2E3440`, `Geist Mono`, horizontal scroll, no hover-only buttons.
4. **Diagonal Hatch Texture (from Ref #5):**
   - Used on track kerbs (red/white or yellow/asphalt stripes), pit wall divider, and exhausted difficulty cards (`opacity-50` + diagonal hatch overlay).
5. **Admin Shell & `CopyButton` (from Ref #7 & #8):**
   - Top bar with IEEE Racing wordmark, active race status pill, and one-click `Copy join link` button.

---

## 4. Track & Vehicle Visual Design (Display Surface)

### Layout (`1920x1080`, zero scroll, 60 fps)
- **Top Broadcast Header (`88px` tall):**
  - Left: IEEE Racing emblem + Round name + status badge (`LOBBY` / `RACING` / `FINISHED`).
  - Center: Giant `Orbitron` countdown timer (`03:00` → `00:00`), switching to `#FFD43B` under 30s and `#EF4444` under 10s.
  - Right: Total players count, leader step count, and audio mute toggle.
- **Main Stage (Left `74%` width — The Drag Strip):**
  - Left edge: Starting grid line with diagonal hatch kerbs along top and bottom.
  - Vertical distance grid lines showing dynamic step markers (`5`, `10`, `15`, `20`… rescaled smoothly by **Auto-Zoom** so `max(10, leaderSteps * 1.15)` sits near the right edge).
  - **Adaptive Lanes (D-014):**
    - **≤ 20 players:** Every player gets a full horizontal lane with their flat top-down F1/GT car SVG, race number badge `#07`, nickname pill, and current step counter.
    - **> 20 players:** Top 12 players get full horizontal lanes (`P1–P12`). Below a hatched pit-wall divider, a **Field Strip** (`140px` tall) shows all remaining cars (`P13–P60+`) on a shared multi-row track as compact numbered car markers so every participant can still spot their number moving across the screen.
- **Floating Step Indicators (D-016):**
  - When a player scores, an animated badge pops above their car (`translateY(0) -> translateY(-28px)`, `opacity: 1 -> 0` over `900ms`):
    - **Easy:** `+1` in Emerald `#22C55E` (`scale(1.0)`)
    - **Medium:** `+2` in Sky Blue `#3898EC` (`scale(1.12)`)
    - **Hard:** `+3` in Racing Gold `#FFD43B` (`scale(1.25)` with double chevron accent)
- **Right Timing Tower (`26%` width — F1 Broadcast Leaderboard):**
  - Fixed top-to-bottom table showing Rank (`P1..P20`), car number plate in livery color, Nickname, Steps (`Orbitron`), and Correct Answers count. Leader row highlighted with a `#FFD43B` left bar.

---

## 5. Screen-by-Screen Specification

### Surface A: Player (`/play`, `360–430px` mobile)
1. **Join Screen:** IEEE Racing header, single input (`Nickname`), primary button `Join race`.
2. **Lobby Screen:** Large car preview in assigned livery + `#Number`, player nickname, and live status `"Waiting for organizer to start…"`.
3. **Difficulty Selection Screen:**
   - Sticky top mini-bar: Player `#Number`, current `Steps`, and synced `02:45` global timer.
   - Three full-width tap cards (`min-h-[104px]` each):
     - **Easy** (`+1 Step`, Emerald bar, remaining count `10 left`)
     - **Medium** (`+2 Steps`, Blue bar, remaining count `10 left`)
     - **Hard** (`+3 Steps`, Gold bar, remaining count `10 left`)
4. **Question Screen:**
   - Top bar: Difficulty badge (`HARD • +3 STEPS`), category tag (`React`), and global countdown.
   - Question prompt + optional `CodeBlock`.
   - 4 thumb-friendly option buttons (`56px+` height, `A/B/C/D` prefix box). Tap selects, primary button `Submit answer` confirms (prevents accidental fat-finger taps), plus secondary `Abandon question` button at bottom.
5. **Feedback & Lockout State:**
   - **Correct:** `450ms` green flash + mini car advances `+1/+2/+3` steps, then straight back to Difficulty Selection.
   - **Wrong:** Red banner `"Incorrect — 0 steps"` with a 3-second countdown bar (`3.0s -> 0.0s`) before unlocking `Choose next question`.
6. **Finished Screen:** Final rank (`#3 of 42`), total steps, accuracy breakdown, and winner banner.

### Surface B: Live Race Display (`/display`, `1920x1080` / `4K`)
1. **Lobby State:** Giant QR code card + join URL + live grid of joined player cars revving on the starting line.
2. **Countdown State (`4s`):** 5 red F1 start lights illuminating one by one → lights out `GO!`.
3. **Active Race State:** Auto-zoom drag strip + `+1/+2/+3` floating pops + right-hand Timing Tower.
4. **Finished / Podium State:** Checkered flag header, P1/P2/P3 podium spotlight with tie-break stats (Steps • Correct • Time), plus full final standings.

### Surface C: Admin Portal (`/admin`, Desktop/Tablet)
1. **Login (`/admin/login`):** Password input + `Sign in`.
2. **Control Deck (Tab 1 — Race):**
   - Primary action bar: `Open lobby`, `Start race` (prominent `#00629B` / `#22C55E`), `End race` (with confirmation), `Reset race` (with confirmation), `New round`.
   - Pre-race configuration form (locked during `COUNTDOWN`/`RACING`): Duration (`180s`), Question pool counts (`10 / 10 / 10`), Step rewards (`1 / 2 / 3`), Allow abandon toggle.
   - Live telemetry summary + quick links to `/display` and `Copy join link`.
3. **Participants (Tab 2):** Live list of joined players, step counts, inline `Rename` and `Remove player` (with confirmation).
4. **Question Bank (Tab 3):** Filter by difficulty/category, `Add question`, `Edit`, `Enable/Disable` toggle, `Import JSON/CSV`, and `Seed 90 default questions`.
5. **Results & Export (Tab 4):** Completed rounds history + `Export CSV` button.
