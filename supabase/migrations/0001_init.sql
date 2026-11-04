-- Domi Reels: everything the product keeps. Every table is private: RLS is on with no policies, so only the server
-- (the secret key, in the web app's API routes and the worker) reads or writes. Browsers never talk to the tables.

-- Who uses Domi Reels: a restaurant owner who signed up with an invitation code, or an ordering platform (Doocado is
-- the first) that connects its restaurants through the API.
create table accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('owner', 'platform')),
  name text not null,
  user_id uuid unique references auth.users (id) on delete set null,
  invite_code text,
  -- A platform: its API key (only the hash is kept), and the two calls of docs/CONTRACT.md it answers.
  api_key_hash text unique,
  kit_url text,
  drop_url text,
  platform_token text,
  created_at timestamptz not null default now()
);

-- Domi Reels is by invitation only. A code with no max_uses works for anyone who has it (the judges').
create table invites (
  code text primary key,
  note text,
  max_uses int,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  external_id text,                       -- the platform's own id for it
  name text not null,
  cuisine text,
  city text,
  language text not null default 'en',
  website text,
  logo_url text,
  brand_color text,
  timezone text not null default 'America/New_York',
  delivery_day int not null default 0 check (delivery_day between 0 and 6),   -- 0 = Sunday, in its timezone
  delivery_hour int not null default 20 check (delivery_hour between 0 and 23),
  reels_per_week int not null default 1 check (reels_per_week between 0 and 3),
  music_options int not null default 3 check (music_options between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);

-- The WhatsApp numbers allowed to talk to Domi Reels for a restaurant. Nobody else gets an answer.
create table members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  name text,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);
create index on members (phone);

-- The menu, from the website, the platform or the owner. ai_note is the owner's own word on a dish.
create table dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  external_id text,
  name text not null,
  description text,
  price numeric,
  photo_path text,                        -- in the photos bucket
  photo_url text,                         -- where it came from
  ai_note text,
  addons jsonb not null default '[]',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, external_id)
);

-- Every photo the restaurant gave: menu photos, photos sent on WhatsApp or uploaded, and the equipment footage Muse
-- found for it. Muse labels each one.
create table photos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  path text not null,
  source text not null check (source in ('menu', 'library', 'whatsapp', 'upload', 'stock')),
  dish_id uuid references dishes (id) on delete set null,
  kind text,                              -- food, equipment, place, other
  label text,
  sha1 text not null,
  from_phone text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, sha1)
);

-- The worker's queue. A job is a week's Reel, a new score for a Reel, or a storyboard. waiting_owner: Muse asked
-- the owner something and the job sleeps until the answer comes.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  kind text not null check (kind in ('reel', 'remusic', 'storyboard')),
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_owner', 'done', 'failed', 'cancelled')),
  week date,
  input jsonb not null default '{}',
  state jsonb not null default '{}',
  spend_cap numeric not null default 8,
  spent numeric not null default 0,
  error text,
  attempts int not null default 0,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on jobs (status, created_at);
create index on jobs (restaurant_id, created_at desc);

create table reels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  title text,
  idea text,
  kind text,
  dishes jsonb not null default '[]',
  seconds numeric,
  cover_path text,
  versions jsonb not null default '[]',   -- [{ register, path }]: the same Reel with each score
  chosen int,
  director jsonb not null default '{}',   -- what Muse saw and decided, for the "how Muse directed it" page
  cost numeric,
  public boolean not null default false,
  deliver_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index on reels (restaurant_id, created_at desc);
create index on reels (public, created_at desc);

-- WhatsApp, both ways. wa_id makes Meta's retries harmless.
create table messages (
  id bigint generated always as identity primary key,
  restaurant_id uuid references restaurants (id) on delete set null,
  phone text not null,
  direction text not null check (direction in ('in', 'out')),
  type text not null,
  body text,
  media_path text,
  wa_id text unique,
  created_at timestamptz not null default now()
);
create index on messages (phone, created_at desc);

-- Which restaurant a phone is talking about right now (a number can belong to more than one).
create table conversations (
  phone text primary key,
  restaurant_id uuid references restaurants (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- What Muse learned. A restaurant's own lessons stay with it; a global lesson never names a restaurant or quotes its
-- owner, so what one owner teaches improves every Reel without sharing anything about anyone.
create table lessons (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('global', 'restaurant')),
  restaurant_id uuid references restaurants (id) on delete cascade,
  text text not null,
  source text,
  created_at timestamptz not null default now(),
  check ((scope = 'global') = (restaurant_id is null))
);

-- Every paid call: video, upscale, music. The worker stops a job at its cap.
create table spend (
  id bigint generated always as identity primary key,
  job_id uuid references jobs (id) on delete set null,
  restaurant_id uuid references restaurants (id) on delete set null,
  what text not null,
  cost numeric not null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['accounts','invites','restaurants','members','dishes','photos','jobs','reels','messages','conversations','lessons','spend'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- The worker takes the oldest queued job; two workers never take the same one.
create function claim_job(worker text) returns setof jobs language sql security definer set search_path = public as $$
  update jobs set status = 'running', locked_by = worker, locked_at = now(), attempts = attempts + 1, updated_at = now()
  where id = (select id from jobs where status = 'queued' order by created_at for update skip locked limit 1)
  returning *;
$$;
revoke all on function claim_job(text) from public, anon, authenticated;

-- An invitation is used once per account, atomically.
create function use_invite(c text) returns boolean language sql security definer set search_path = public as $$
  with u as (update invites set uses = uses + 1 where code = upper(c) and (max_uses is null or uses < max_uses) returning 1)
  select exists (select 1 from u);
$$;
revoke all on function use_invite(text) from public, anon, authenticated;

insert into storage.buckets (id, name, public) values ('photos', 'photos', false), ('reels', 'reels', false), ('gallery', 'gallery', true)
on conflict (id) do nothing;
