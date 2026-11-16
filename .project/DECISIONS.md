# Decisions

| # | Date | Decision | Status |
|---|---|---|---|
| D-000 | 2026-11-15 | Server-authoritative architecture; fairness rules from brief are non-negotiable | Given by user |
| D-001 | 2026-11-15 | Phase 0 pick list from vengeance-ui-blog-template (tokens, cva button, cn, Orbitron/Geist/Geist Mono, hatch texture, code block, admin shell + copy button; offset-path dropped since track is straight). See REFERENCE_USAGE.md | Approved |
| D-002 | 2026-11-15 | Track: 2D straight drag strip, one lane per car, left → right | Approved |
| D-003 | 2026-11-15 | Art style: flat motorsport broadcast graphics | Approved |
| D-004 | 2026-11-15 | Palette "IEEE-inspired Dark Racing": IEEE Blue #00629B (brand, primary highlights), Dark Asphalt #17191D (background), Off-white #F5F3ED (text/surfaces), Racing Yellow #FFD43B (movement, rewards, winner) | Approved |
| D-005 | 2026-11-15 | Mood: hybrid — calm broadcast frame, arcade bursts only at start, step gains, lead changes, winner | Approved |
| D-006 | 2026-11-15 | Vehicles: one shared car silhouette, auto-assigned color + race number + name tag | Approved |
| D-007 | 2026-11-15 | One global race timer only; default 180 s, admin-configurable; all players start at the same server moment. NO per-question timers. | Approved |
| D-008 | 2026-11-15 | Wrong answer: 0 steps + 3 s lockout before next difficulty pick (server-enforced). Abandon: 0 steps, no lockout, question burned for that player, timer keeps running. | Approved |
| D-009 | 2026-11-15 | Rewards: Easy +1, Medium +2, Hard +3 | Approved |
| D-010 | 2026-11-15 | Ranking: steps desc → correct answers desc → earliest server timestamp of final progress | Approved |
| D-011 | 2026-11-15 | Default pool per race: 30 questions (10/10/10), admin-configurable | Approved |
| D-012 | 2026-11-15 | Rounds: new players each round, fresh question set per round from a ~90-question bank (agent drafts, user reviews) | Approved |
| D-013 | 2026-11-15 | Capacity: design for 30-60 players per race, load-test with 100 bots | Approved |
| D-014 | 2026-11-15 | Display layout: ≤20 cars = full lanes; >20 = top 12 full lanes + compact "field" strip with every car as numbered marker | Approved |
| D-015 | 2026-11-15 | Track scale: auto-zoom, leader near right edge, smooth rescale as scores grow | Approved |
| D-016 | 2026-11-15 | Spectator indicator: animated +1 (green) / +2 (blue) / +3 (gold) pop above car, rises and fades; intensity proportional to reward (Hard most noticeable). No permanent per-lane difficulty badges; question/difficulty details stay on phones | Approved |
| D-017 | 2026-11-15 | Admin auth: single server-side admin password + secure httpOnly session cookie | Approved |
| D-018 | 2026-11-15 | Display: public read-only link, no login (shows only public race state) | Default stated, not objected |
| D-019 | 2026-11-15 | No late join: joining closes when race starts; late arrivals wait for next round | Approved |
| D-020 | 2026-11-15 | Questions: Admin CRUD (view/add/edit/enable-disable) + CSV/JSON import | Approved |
| D-021 | 2026-11-15 | Names: player nickname; server blocks offensive words + duplicates; admin can rename/remove | Approved |
| D-022 | 2026-11-15 | Persistence: DB stores live race state (crash recovery mid-race) + all round results, CSV export | Approved |
| D-023 | 2026-11-15 | Stack: Next.js on Vercel + Supabase (Postgres + Realtime). Game authority lives in Postgres functions (RPC) + Next.js route handlers; clients never write tables directly | Approved (user chose over Node+Socket.IO recommendation) |
| D-024 | 2026-11-15 | Database: Supabase Postgres | Approved |
| D-025 | 2026-11-15 | Display rendering: DOM/CSS with GPU transforms (translate/scale/opacity) | Approved |
| D-026 | 2026-11-15 | Motion: motion/react for Player/Admin transitions & feedback; plain CSS transforms for Display cars | Approved |
| D-027 | 2026-11-15 | Audio: Display only (start lights, gain blips, lead change, winner fanfare, light music); phone vibration on correct/wrong where supported | Approved |
| D-028 | 2026-11-15 | Phase 2 (Product Definition) & Phase 3 (Visual Design) approved; dual-mode repository adapter (Supabase Postgres + automatic local JSON-backed fallback store when Supabase env vars are absent) | Approved |
| D-029 | 2026-11-15 | Duckurity-caliber UI/UX redesign: Pit Wall Telemetry metaphor, Carbon Dark + FIA Paper Light theme tokens, Geist + Geist Mono only (Orbitron dropped), Headline Option A ("Ship answers at race pace."), interactive hero telemetry strip + surface mini-previews, shared UI primitive kit (Button, Card, Chip, Stat, Panel, Table, Label, ThemeToggle) | Superseded by D-030 |
| D-030 | 2026-11-15 | Linear/Vercel/Apple dark-only product UI pass: #0A0B0D / #111317 / #171A1F surfaces, 1px hairline borders, IEEE Blue (#00629B / #3B8FD0) brand accent, Racing Red-Orange (#FF4D2E) reserved strictly for race signals, uniform 8px radius, Geist + Geist Mono (medium weight headlines), flat line-art car vectors, "IEEE Grand Prix" landing with 3 equal surface mini-preview cards | Superseded by D-031 |
| D-031 | 2026-11-16 | F1 Broadcast / Esports UI & Technical Overhaul: #080B10 / #111722 / #172030 surfaces, #00D4FF primary cyan accent, #FF453A racing signal red, #36D399 track green, Barlow Condensed + Geist + Geist Mono typography, 3-zone /display broadcast layout (Left Timing Tower, Center Drag Strip, Right Clock & QR), permanent cockpit HUD & reconnection notice on /play, live event monitor on /admin, and deployment-origin URL/QR resolver eliminating localhost exposure | Approved |

## Supabase authority design (consequences of D-023, to detail in Phase 2)
- **Timer:** `started_at` / `ends_at` set by DB `now()` on Start. Every answer RPC checks `now() < ends_at` inside the transaction → exact cut-off, no cron needed. Race status after `ends_at` is derived; `finalize_race()` is idempotent (called by Display/Admin at 00:00, safe to call twice).
- **Clock sync:** clients call `server_time()` RPC several times, NTP-style offset; countdown = `ends_at − (Date.now() + offset)`. Client timer is display-only.
- **Secrets:** correct answers in a table with RLS denying anon; only RPCs (security definer) read them, and only return correctness after submission. Abandon never returns the answer.
- **Fairness:** unique (player_id, question_id) attempt rows; `lockout_until` enforced in RPC (3 s wrong-answer lockout); per-player secret token (stored on device) required by every RPC; reconnect = re-read state, never re-grant.
- **Realtime budget (free tier: 200 connections, 100 msgs/s, 2M msgs/month):** players do NOT subscribe to the leaderboard (their own result comes back in the RPC response). Players subscribe only to rare race-status events; Display + Admin subscribe to progress events. Keeps peak at ~20 msgs/s for 60 players.
- **Ops risks:** free projects pause after inactivity → wake/verify before event (or Pro plan for event month). Internet required — upside: players can fall back to mobile data.

## Notes for Phase 3
- IEEE Blue on Dark Asphalt ≈ 2.7:1 contrast → use blue as a fill (panels, brand bars, primary button) with off-white text on it (≈ 5.9:1), never as thin text/lines on asphalt.
- Racing Yellow is reserved for movement/rewards/winner → car colors must avoid yellow, green and blue hues that read as difficulty colors.
- Difficulty colors (D-016): Easy green, Medium blue, Hard gold. Medium "blue" on asphalt needs a lighter tint than #00629B for small text/pops (contrast); Hard gold can share Racing Yellow #FFD43B.
