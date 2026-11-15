# IEEE Grand Prix — Organizer Event-Day Run-Sheet

## 1. Pre-Event Setup (15 Minutes Before Doors Open)
1. **Start or Wake the Server:**
   - **Cloud (Vercel + Supabase):** Open your Supabase dashboard to confirm the project is active (not paused), and open `/admin` on the organizer laptop.
   - **Local Venue Backup:** Run `npm run build && npm run start` on the organizer laptop connected to the venue router. The app automatically uses its persistent local store (`.data/game-store.json`) if Supabase keys are not set.
2. **Projector Setup (`/display`):**
   - Connect the presentation laptop to the stage projector at `1920x1080` (or `4K`).
   - Open `https://<your-domain>/display` (no login required).
   - Click the **Speaker icon** once to unlock browser audio, and click the **Fullscreen icon** in the top-right corner.
3. **Organizer Portal (`/admin`):**
   - Open `https://<your-domain>/admin` on your laptop or tablet.
   - Sign in with `ADMIN_PASSWORD` (default: `ieee-race-2026`).
   - Verify **Round Name**, **Race Duration** (default `180s`), **Question Pool** (`10 Easy / 10 Medium / 10 Hard`), and **Step Rewards** (`+1 / +2 / +3`).

---

## 2. Running a Live Round
1. **Lobby & QR Onboarding (2–3 Minutes):**
   - Players scan the giant QR code on the projector screen (`/display`) or use the link copied via `Copy join link` in `/admin`.
   - As players enter their nicknames, their numbered race cars spawn live on the starting grid.
   - Use the **Participants** tab in `/admin` to rename or remove any inappropriate nickname.
2. **Green Flag (`Start race`):**
   - Announce on the mic: *"Eyes on your phones—Easy gives +1 step, Medium +2, Hard +3. Wrong answers lock you out for 3 seconds. Most steps when the 3-minute clock hits 00:00 wins!"*
   - Press **Start race** in `/admin`.
   - The projector plays the 4-second F1 start lights sequence (`4 - 3 - 2 - 1 - GO!`) and unlocks all phones simultaneously.
3. **During the 3-Minute Race:**
   - Watch the auto-zooming drag strip, floating `+1 / +2 / +3` pops, and live Timing Tower on the projector.
   - Call out lead changes on the mic.
4. **Checkered Flag (`00:00`):**
   - At `00:00`, the server automatically locks all answer submissions and displays the **Official Classification & Podium (`P1 / P2 / P3`)** on the projector.
   - Ties in total steps are broken automatically by:
     1. Highest number of correct answers
     2. Earliest server timestamp of final score
5. **Export Results & Next Round:**
   - In `/admin` → **Results & CSV**, click **Export current round CSV** to save the standings.
   - Click **Start new round** to archive the finished race, draw a fresh question pool from the 90-question bank, and open the lobby for the next group of players.

---

## 3. Network Fallback Plan
- **If Venue Wi-Fi Drops for Players:** Because the app is hosted over HTTPS (or if tethered via organizer hotspot), players can switch their phones to mobile 4G/5G data and refresh `/play`—their `player_token` restores their exact car, steps, and active question without losing progress.
- **If Internet Drops Completely at the Venue:** Run `npm run start` on the organizer laptop on the local Wi-Fi LAN (`http://<laptop-lan-ip>:3000`). The built-in local persistent store requires zero internet access and self-hosts all fonts and QR generation offline.
