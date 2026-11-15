# Project: IEEE Strategic Racing Quiz

## Goal
Real-time multiplayer racing quiz for a live event. Players join by QR on phones, pick Easy/Medium/Hard Web Development questions, and correct answers move their car (+1/+2/+3). A big-screen Live Race Display shows the race, leaderboard, and global countdown. An Admin Portal runs the lifecycle (config, participants, questions, start, end, reset, new round).

## Surfaces
- Player (mobile, 360-430px)
- Live Race Display (1920x1080 / 4K projector)
- Admin Portal (desktop / tablet)

## Non-negotiables
- Server-authoritative: status, timestamps, remaining time, progress, correctness, ranking, winner.
- Correct answers never sent to clients before submission; duplicate / post-end submissions rejected; reconnect never grants progress.
- A non-technical organizer must be able to run it live.

## Source of truth
Product brief "Updated Game Mechanics – Strategic Racing Quiz" (in conversation, 2026-11-15).

## Reference
UI reference (MIT): https://github.com/FirePheonix/vengeance-ui-blog-template — studied in Phase 0, re-implement only, no wholesale copy.
