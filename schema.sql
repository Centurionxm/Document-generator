-- Run in Supabase SQL Editor before enabling paid access.
create extension if not exists pgcrypto;

create table if not exists public.paperpilot_orders (
  id uuid primary key default gen_random_uuid(),
  api_ref text not null unique,
  plan text not null check (plan in ('single','monthly')),
  product_name text not null,
  email text not null,
  phone text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'KES',
  status text not null default 'PENDING',
  provider_invoice_id text,
  provider_tracking_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists paperpilot_orders_email_created_idx
  on public.paperpilot_orders (email, created_at desc);
create index if not exists paperpilot_orders_status_idx
  on public.paperpilot_orders (status);

-- Documents and paid entitlement ledger. Keep service-role access server-side only.
create table if not exists public.paperpilot_documents (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  document_number text,
  document_type text not null,
  client_name text not null,
  file_path text,
  created_at timestamptz not null default now()
);
create index if not exists paperpilot_documents_email_created_idx
  on public.paperpilot_documents (email, created_at desc);

alter table public.paperpilot_orders enable row level security;
alter table public.paperpilot_documents enable row level security;
-- Do not add public policies for these tables. Use SUPABASE_SERVICE_ROLE_KEY only in Vercel server-side functions.
