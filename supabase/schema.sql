-- STUDTY TOOLS billing and encrypted API credential tables.
-- Run once in Supabase SQL Editor. Client access is intentionally disabled;
-- Vercel server functions use the Service Role key after validating the user's JWT.

create table if not exists public.billing_orders (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  payment_key text unique,
  payment_method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null check (status in ('active', 'expired', 'canceled')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  payment_key text,
  order_id text references public.billing_orders(order_id),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  model text not null,
  secret_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.billing_orders enable row level security;
alter table public.subscriptions enable row level security;
alter table public.api_credentials enable row level security;

-- No anon/authenticated policies are added. Only server-side Service Role access is allowed.
create index if not exists billing_orders_user_created_idx on public.billing_orders(user_id, created_at desc);
create index if not exists api_credentials_user_idx on public.api_credentials(user_id);