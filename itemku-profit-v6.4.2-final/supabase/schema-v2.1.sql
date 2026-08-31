-- Itemku Profit V2.1 - Supabase schema + role based RLS
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'User',
  role text not null default 'worker' check (role in ('owner','worker')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  name text not null, game text not null, category text not null,
  sku text, supplier text, stock integer not null default 0 check(stock>=0),
  modal numeric not null default 0, price numeric not null default 0,
  fee numeric not null default 0, fixed numeric not null default 0, other numeric not null default 0,
  target numeric not null default 0, stock_since timestamptz not null default now(),
  discount_enabled boolean not null default false, discount_price numeric default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  product_id text references products(id) on delete set null,
  product_name text not null, game text not null, buyer_identifier text not null,
  qty integer not null check(qty>0), note text, status text not null default 'Baru'
    check(status in ('Baru','Diproses','Selesai','Cancel','Refund')),
  assigned_worker_name text, refund_reason text, stock_restored boolean not null default false,
  snapshot jsonb not null, created_at timestamptz not null default now(),
  processing_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
);

create table if not exists opportunities (
  id text primary key, game text not null, product text not null, category text not null,
  market_price numeric not null default 0, capital numeric not null default 0,
  sold_signal integer not null default 0, listing_signal integer not null default 0,
  checked_at timestamptz not null default now(), note text
);

create table if not exists audit_logs (
  id text primary key, actor_name text not null default 'System', action text not null,
  detail text, created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table opportunities enable row level security;
alter table audit_logs enable row level security;

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
  select role from profiles where id=auth.uid() and active=true limit 1;
$$;

drop policy if exists "profile own read" on profiles;
create policy "profile own read" on profiles for select to authenticated using (id=auth.uid() or public.current_role()='owner');

drop policy if exists "products read" on products;
create policy "products read" on products for select to authenticated using (true);
drop policy if exists "products owner write" on products;
create policy "products owner write" on products for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
drop policy if exists "products worker update" on products;
create policy "products worker update" on products for update to authenticated using (public.current_role()='worker') with check (public.current_role()='worker');

drop policy if exists "orders read" on orders;
create policy "orders read" on orders for select to authenticated using (true);
drop policy if exists "orders owner write" on orders;
create policy "orders owner write" on orders for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
drop policy if exists "orders worker update" on orders;
create policy "orders worker update" on orders for update to authenticated using (public.current_role()='worker') with check (public.current_role()='worker');

drop policy if exists "opportunities owner" on opportunities;
create policy "opportunities owner" on opportunities for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

drop policy if exists "audit read" on audit_logs;
create policy "audit read" on audit_logs for select to authenticated using (true);
drop policy if exists "audit insert" on audit_logs;
create policy "audit insert" on audit_logs for insert to authenticated with check (true);

-- Setelah membuat user di Authentication > Users, jalankan contoh ini dengan UUID asli:
-- insert into profiles(id,name,role) values ('UUID_OWNER','Owner','owner');
-- insert into profiles(id,name,role) values ('UUID_WORKER','Worker 1','worker');

-- Guard: worker hanya boleh mengubah stok produk, bukan harga/modal/identitas produk.
create or replace function public.guard_worker_product_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.current_role()='worker' then
    if (new.name,new.game,new.category,coalesce(new.sku,''),coalesce(new.supplier,''),new.modal,new.price,new.fee,new.fixed,new.other,new.target,new.stock_since,new.discount_enabled,coalesce(new.discount_price,0))
       is distinct from
       (old.name,old.game,old.category,coalesce(old.sku,''),coalesce(old.supplier,''),old.modal,old.price,old.fee,old.fixed,old.other,old.target,old.stock_since,old.discount_enabled,coalesce(old.discount_price,0)) then
      raise exception 'Worker hanya boleh mengubah stok produk';
    end if;
  end if;
  new.updated_at=now();
  return new;
end $$;
drop trigger if exists trg_guard_worker_product on products;
create trigger trg_guard_worker_product before update on products for each row execute function public.guard_worker_product_update();

-- Guard order: worker tidak boleh mengubah nilai finansial/snapshot atau identitas pembeli.
create or replace function public.guard_worker_order_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.current_role()='worker' then
    if (new.product_id,new.product_name,new.game,new.buyer_identifier,new.qty,coalesce(new.note,''),new.snapshot,new.created_at)
       is distinct from
       (old.product_id,old.product_name,old.game,old.buyer_identifier,old.qty,coalesce(old.note,''),old.snapshot,old.created_at) then
      raise exception 'Worker tidak boleh mengubah detail finansial order';
    end if;
  end if;
  new.updated_at=now();
  return new;
end $$;
drop trigger if exists trg_guard_worker_order on orders;
create trigger trg_guard_worker_order before update on orders for each row execute function public.guard_worker_order_update();
