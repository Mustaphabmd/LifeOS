-- LifeOS personal data schema.
-- Timestamps are stored as timestamptz. The client displays them in Africa/Casablanca.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  status text,
  timezone text not null default 'Africa/Casablanca',
  currency text not null default 'MAD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  kind text not null check (kind in ('personal','girlfriend','family','company','receiver','other')),
  name text not null,
  logo_url text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  parent_account_id uuid references public.accounts(id) on delete set null,
  kind text not null check (kind in ('cash','bank','credit_card','savings','savings_goal','other')),
  name text not null,
  balance numeric(16,2) not null default 0,
  target_amount numeric(16,2),
  logo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  name text not null,
  icon text,
  logo_url text,
  default_price numeric(16,2),
  subcategories jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.quick_expense_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  category_id uuid references public.categories(id) on delete set null,
  category_name text not null,
  name text not null,
  price numeric(16,2) not null check (price >= 0),
  logo_url text,
  details text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  kind text not null check (kind in ('expense','income','transfer','cash_adjustment','goal_contribution','account_event')),
  account_id uuid references public.accounts(id) on delete set null,
  destination_account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  amount numeric(16,2) not null,
  transaction_date date not null,
  category_name text,
  receiver_name text,
  source_name text,
  description text,
  note text,
  logo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  person_id uuid references public.people(id) on delete set null,
  category text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  entry_date date not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  check (end_at > start_at)
);

create table public.sleep_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  wake_date date not null,
  duration_minutes integer not null check (duration_minutes > 0),
  quality smallint check (quality between 1 and 5),
  target_minutes integer not null default 480 check (target_minutes > 0),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  check (end_at > start_at)
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  title text not null,
  author text,
  cover_url text,
  total_pages integer check (total_pages is null or total_pages > 0),
  current_page integer not null default 0 check (current_page >= 0),
  status text not null default 'to_read' check (status in ('to_read','reading','finished','paused')),
  started_on date,
  finished_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  book_id uuid references public.books(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  pages_read integer check (pages_read is null or pages_read >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  check (end_at > start_at)
);

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  book_id uuid references public.books(id) on delete cascade,
  kind text not null default 'highlight' check (kind in ('highlight','quote','note')),
  content text not null,
  page_number integer check (page_number is null or page_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  name text not null default 'Motorcycle',
  kind text not null default 'motorcycle',
  image_url text,
  current_km numeric(12,1) not null default 0 check (current_km >= 0),
  oil_interval_km numeric(12,1) not null default 1500 check (oil_interval_km > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.vehicle_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id text not null,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null check (kind in ('mileage','fuel','oil_change','repair','maintenance','other')),
  amount numeric(16,2),
  record_date date not null,
  odometer_km numeric(12,1),
  oil_changed_at_km numeric(12,1),
  oil_interval_km numeric(12,1),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','people','accounts','categories','quick_expense_presets','transactions',
    'time_entries','sleep_entries','books','reading_sessions','highlights','vehicles',
    'vehicle_records','settings'
  ] loop
    execute format('create index %I on public.%I (user_id)', table_name || '_user_id_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end;
$$;
