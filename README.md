# Dart Master — Orientation Booth Game

A mobile-first two-stage aiming dart game with a live Supabase-backed leaderboard, built for Netlify (static frontend + Netlify Functions).

## 1. Configure the organization name

Edit this one line in **two** files:

- `game.js` → `const ORGANIZATION_NAME = "YOUR ORGANIZATION NAME";`
- `leaderboard.js` → `const ORGANIZATION_NAME = "YOUR ORGANIZATION NAME";`

## 2. Create the Supabase project

1. Go to https://supabase.com → New project.
2. Wait for it to finish provisioning.
3. Open **SQL Editor** and run:

```sql
create table if not exists leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  score integer not null check (score >= 0 and score <= 100),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_score_created_idx
  on leaderboard (score desc, created_at asc);

-- Row Level Security: keep the table locked down. The Netlify Functions
-- use the service-role key, which bypasses RLS entirely, so the browser
-- never gets direct table access. Enabling RLS with no policies means
-- the anon/public key (if ever exposed) still can't read or write.
alter table leaderboard enable row level security;
```

4. **Project URL**: Settings → API → "Project URL" → this is `SUPABASE_URL`.
5. **Service role key**: Settings → API → "Project API keys" → `service_role` (secret) → this is `SUPABASE_SERVICE_ROLE_KEY`.
   ⚠️ This key bypasses Row Level Security. Never put it in frontend code — it must only ever be set as a Netlify environment variable, used inside `netlify/functions/*.js`.

## 3. Set Netlify environment variables

Netlify dashboard → your site → **Site configuration → Environment variables** → Add variable:

| Key | Value |
|---|---|
| `SUPABASE_URL` | from step 2.4 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2.5 |

(If deploying via Netlify CLI, you can instead run `netlify env:set SUPABASE_URL ...`.)

## 4. Deploy to Netlify

**Option A — GitHub**
1. Push this folder to a new GitHub repo.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Build command: leave empty. Publish directory: `.` (repo root).
4. Add the environment variables from step 3, then deploy.

**Option B — Direct deploy**
1. Netlify → **Add new site → Deploy manually**.
2. Drag the whole `dart-game` folder onto the upload area.
3. Add the environment variables from step 3 in Site configuration, then trigger a redeploy so the functions pick them up.

Either way, Netlify auto-detects `netlify.toml` and deploys the functions in `netlify/functions/`.

## 5. Test it

- Open the deployed URL on your phone → play through a full game → submit a score.
- Open `/leaderboard` on a laptop/TV at the booth — it refreshes every 5 seconds automatically.

## 6. Generate the QR code

Use any free QR generator (e.g. https://www.qr-code-generator.com) pointed at your Netlify URL, e.g. `https://your-site.netlify.app`. Print it for the booth.

---

### How anti-cheat works

The browser never sends a raw score. It sends the **normalized locked coordinates** (`x`, `y`, each `0.0–1.0`) from the player's two aim locks. `netlify/functions/submit-score.js` independently recalculates the score from those coordinates using the exact same scoring bands as the client — so a modified client can send different coordinates, but it cannot claim a score its coordinates don't earn. The server also rejects out-of-range coordinates, non-integer/out-of-range scores, empty or malformed names, and applies a short best-effort per-IP cooldown between submissions.
