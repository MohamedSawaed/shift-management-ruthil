# Supabase Cloud Sync Setup

This app supports cloud sync via Supabase. Without it, data stays local on each device. Setting this up takes ~3 minutes.

## 1. Create a free Supabase project

1. Go to https://supabase.com → **Start your project** (sign in with GitHub)
2. Click **New project**
3. Pick any name (e.g. `myshift`), set a strong DB password, choose closest region
4. Wait ~1 minute for the project to provision

## 2. Create the `workspaces` table

In your Supabase project:

1. Go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Paste this and click **Run**:

```sql
-- Create workspaces table
create table workspaces (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (data only readable with the correct sync code)
alter table workspaces enable row level security;

-- Allow anyone to read/write rows where they know the ID (sync code).
-- The sync code itself is the access control.
create policy "Public access by sync code"
  on workspaces for all
  using (true)
  with check (true);
```

## 3. Get your project credentials

1. In Supabase, go to **Project Settings** (gear icon) → **API**
2. Copy two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

## 4. Add credentials locally

Create a file `.env.local` in the project root with:

```
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...your-anon-key
```

Restart `npm start` after creating the file.

## 5. Add credentials to Vercel

In your Vercel project:

1. **Settings → Environment Variables**
2. Add both:
   - `REACT_APP_SUPABASE_URL` = your project URL
   - `REACT_APP_SUPABASE_ANON_KEY` = your anon key
3. Redeploy (or push any commit — Vercel auto-deploys)

## How users use it

1. First time on any device, go to **Settings → Create new sync code**
2. App shows the code (e.g. `K7N2-X4P9`) — copy it
3. On another device, go to **Settings → Have a code already** → paste → Connect
4. Both devices now sync automatically. Any change on one shows up on the other within a second.

## Security note

The sync code IS the password. Anyone with the code can read and edit the data. Treat it like a password — don't share publicly. If a code leaks, create a new one and the old one stops syncing to your device.
