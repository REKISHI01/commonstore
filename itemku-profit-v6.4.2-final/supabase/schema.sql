-- Itemku Profit V2 - starter schema for Supabase/Postgres
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game text not null,
  category text not null,
  sku text,
  supplier text,
  stock integer not null default 0 check (stock >= 0),
  modal numeric not null default 0,
  price numeric not null default 0,
  fee numeric not null default 0,
  fixed numeric not null default 0,
  other numeric not null default 0,
  target numeric not null default 0,
  stock_since timestamptz not null default now(),
  discount_enabled boolean not null default false,
  discount_price numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  product_name text not null,
  game text not null,
  buyer_identifier text not null,
  qty integer not null check (qty > 0),
  note text,
  status text not null default 'Baru',
  assigned_worker uuid references auth.users(id),
  refund_reason text,
  stock_restored boolean not null default false,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  product text not null,
  category text not null,
  market_price numeric not null default 0,
  capital numeric not null default 0,
  sold_signal integer not null default 0,
  listing_signal integer not null default 0,
  checked_at timestamptz not null default now(),
  note text
);

-- Enable RLS before production and create policies per owner/worker role.
alter table products enable row level security;
alter table orders enable row level security;
alter table audit_logs enable row level security;
alter table opportunities enable row level security;
