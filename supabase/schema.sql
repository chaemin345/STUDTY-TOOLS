-- STUDTY TOOLS billing, encrypted API credentials, and AI usage quotas.
-- Run once in Supabase SQL Editor. Client access is intentionally disabled;
-- Vercel server functions use the Service Role key after validating the user's JWT.

create table if not exists public.billing_orders (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly', 'max_monthly')),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  payment_key text unique,
  payment_method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly', 'max_monthly')),
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

-- Monthly AI assistant usage counters (one row per user/month).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  count integer not null default 0 check (count >= 0),
  primary key (user_id, month)
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_user_month_idx on public.ai_usage(user_id, month);

-- Atomic monthly quota increment prevents parallel requests bypassing plan limits.
create or replace function public.consume_ai_quota(p_user_id uuid, p_month text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit must be a positive integer';
  end if;
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'p_month must use YYYY-MM format';
  end if;

  insert into public.ai_usage(user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set count = public.ai_usage.count + 1
  where public.ai_usage.count < p_limit
  returning count into new_count;

  return coalesce(new_count, 0);
end;
$$;
revoke all on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

-- Master/admin tables (server-only; no anon/authenticated policies).
create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null default '{}'::jsonb check (jsonb_typeof(workspace) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_workspaces enable row level security;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  actor_email text not null,
  action text not null check (char_length(action) between 1 and 80),
  target_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
