import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const filePath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadDotEnvLocal();

import { getPublicRaceSnapshot } from "../src/lib/engine/store";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !serviceKey) {
    console.log("✗ Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  console.log("1. Triggering store initialization & Supabase seed...");
  const snap = await getPublicRaceSnapshot();
  console.log(
    `   Active Race: "${snap.race.name}" (Status: ${snap.race.status}, Pool: ${snap.race.totalPoolSize} questions)`,
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("2. Verifying Supabase PostgreSQL tables:");
  const tables = ["races", "questions", "race_questions", "players", "attempts"];
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.log(`   - ${t}: ERROR (${error.message})`);
    } else {
      console.log(`   - ${t}: OK (${count ?? 0} rows in Supabase)`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
