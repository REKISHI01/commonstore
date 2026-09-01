-- Itemku Profit Management V3.0
-- Jalankan di Supabase SQL Editor. Schema ini aman untuk upgrade dari V2.1.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'User',
  role text not null default 'worker' check (role in ('owner','worker')),
  active boolean not null default true,
  permissions jsonb not null default '{"canProcessOrders":true,"canRefund":false,"canViewStock":true,"canViewFinancials":false}'::jsonb,
  allowed_games text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists permissions jsonb not null default '{"canProcessOrders":true,"canRefund":false,"canViewStock":true,"canViewFinancials":false}'::jsonb;
alter table profiles add column if not exists allowed_games text[] not null default '{}';
update profiles set permissions=jsonb_set(coalesce(permissions,'{}'::jsonb),'{canProcessOrders}','true'::jsonb,true) where not (coalesce(permissions,'{}'::jsonb) ? 'canProcessOrders');

create table if not exists products (
  id text primary key,
  name text not null, game text not null, category text not null,
  sku text, supplier text, stock integer not null default 0 check(stock>=0),
  reorder_point integer not null default 5 check(reorder_point>=0),
  modal numeric not null default 0, price numeric not null default 0,
  fee numeric not null default 0, fixed numeric not null default 0, other numeric not null default 0,
  target numeric not null default 0, stock_since timestamptz not null default now(),
  discount_enabled boolean not null default false, discount_price numeric default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table products add column if not exists reorder_point integer not null default 5;
alter table products add column if not exists active boolean not null default true;

create table if not exists invoice_counters (
  counter_date date primary key,
  last_value integer not null default 0
);

create table if not exists orders (
  id text primary key,
  invoice_no text unique,
  product_id text references products(id) on delete set null,
  product_name text not null, game text not null, supplier_snapshot text, buyer_identifier text not null,
  server_id text, channel text not null default 'Itemku',
  qty integer not null check(qty>0), note text, status text not null default 'Baru'
    check(status in ('Baru','Diproses','Selesai','Cancel','Refund')),
  assigned_worker_name text, assigned_worker_id uuid references profiles(id) on delete set null,
  refund_reason text, stock_restored boolean not null default false,
  snapshot jsonb not null, created_at timestamptz not null default now(),
  processing_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
);
alter table orders add column if not exists invoice_no text;
alter table orders add column if not exists supplier_snapshot text;
alter table orders add column if not exists server_id text;
alter table orders add column if not exists channel text not null default 'Itemku';
alter table orders add column if not exists assigned_worker_id uuid references profiles(id) on delete set null;
create unique index if not exists orders_invoice_no_idx on orders(invoice_no) where invoice_no is not null;

create table if not exists restocks (
  id text primary key,
  product_id text references products(id) on delete cascade,
  product_name text not null,
  supplier text,
  qty integer not null check(qty>0),
  unit_cost numeric not null default 0,
  total_cost numeric not null default 0,
  previous_stock integer not null default 0,
  new_stock integer not null default 0,
  created_at timestamptz not null default now(),
  note text
);

create table if not exists expenses (
  id text primary key,
  category text not null,
  amount numeric not null default 0 check(amount>=0),
  expense_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists customer_notes (
  id text primary key,
  buyer_identifier text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table customer_notes add column if not exists buyer_key text generated always as (lower(btrim(buyer_identifier))) stored;
drop index if exists customer_notes_buyer_idx;
-- Rapikan duplikat legacy sebelum memberi unique key case-insensitive.
delete from customer_notes a using customer_notes b where a.ctid < b.ctid and lower(btrim(a.buyer_identifier))=lower(btrim(b.buyer_identifier));
create unique index if not exists customer_notes_buyer_key_idx on customer_notes(buyer_key);

create table if not exists business_targets (
  id text primary key,
  month_key text not null unique,
  target_profit numeric not null default 0,
  target_revenue numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists price_history (
  id text primary key,
  product_id text references products(id) on delete cascade,
  product_name text not null,
  field_name text not null check(field_name in ('modal','price')),
  from_value numeric not null default 0,
  to_value numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id text primary key, game text not null, product text not null, category text not null,
  market_price numeric not null default 0, previous_market_price numeric not null default 0,
  capital numeric not null default 0,
  sold_signal integer not null default 0, previous_sold_signal integer not null default 0,
  listing_signal integer not null default 0, competitor_count integer not null default 0,
  trend text not null default 'baru' check(trend in ('naik','turun','stabil','baru')),
  checked_at timestamptz not null default now(), note text
);
alter table opportunities add column if not exists previous_market_price numeric not null default 0;
alter table opportunities add column if not exists previous_sold_signal integer not null default 0;
alter table opportunities add column if not exists competitor_count integer not null default 0;
alter table opportunities add column if not exists trend text not null default 'baru';

create table if not exists audit_logs (
  id text primary key, actor_name text not null default 'System', action text not null,
  detail text, created_at timestamptz not null default now()
);

-- Role helpers
create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
  select role from profiles where id=auth.uid() and active=true limit 1;
$$;
create or replace function public.current_profile_name() returns text language sql stable security definer set search_path=public as $$
  select name from profiles where id=auth.uid() and active=true limit 1;
$$;
create or replace function public.has_permission(permission_name text) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((
    select case when role='owner' then true else coalesce((permissions->>permission_name)::boolean,false) end
    from profiles where id=auth.uid() and active=true limit 1
  ), false);
$$;
create or replace function public.game_allowed(game_name text) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((
    select case when role='owner' then true when cardinality(allowed_games)=0 then true else game_name=any(allowed_games) end
    from profiles where id=auth.uid() and active=true limit 1
  ), false);
$$;

-- RLS
alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table opportunities enable row level security;
alter table audit_logs enable row level security;
alter table restocks enable row level security;
alter table expenses enable row level security;
alter table customer_notes enable row level security;
alter table business_targets enable row level security;
alter table price_history enable row level security;
alter table invoice_counters enable row level security;

-- Clean legacy policies and V3 policies
do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('profiles','products','orders','opportunities','audit_logs','restocks','expenses','customer_notes','business_targets','price_history','invoice_counters') loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

create policy "profiles read" on profiles for select to authenticated using (id=auth.uid() or public.current_role()='owner');
create policy "profiles owner update" on profiles for update to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "profiles owner insert" on profiles for insert to authenticated with check (public.current_role()='owner');
create policy "profiles owner delete" on profiles for delete to authenticated using (public.current_role()='owner');

create policy "products read allowed game" on products for select to authenticated using (public.game_allowed(game));
create policy "products owner write" on products for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

create policy "orders read allowed game" on orders for select to authenticated using (public.game_allowed(game));
create policy "orders owner write" on orders for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
-- Worker updates dilakukan hanya melalui RPC security definer, bukan direct PATCH.

create policy "opportunities owner" on opportunities for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "audit owner read" on audit_logs for select to authenticated using (public.current_role()='owner');
create policy "audit owner insert" on audit_logs for insert to authenticated with check (public.current_role()='owner');
create policy "restocks owner" on restocks for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "expenses owner" on expenses for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "customer notes owner" on customer_notes for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "targets owner" on business_targets for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "price history owner" on price_history for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
create policy "invoice counters owner" on invoice_counters for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

-- Guard perubahan produk owner & riwayat harga.
create or replace function public.track_product_price_history() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at=now();
  if new.modal is distinct from old.modal then
    insert into price_history(id,product_id,product_name,field_name,from_value,to_value,created_at)
    values('price_'||replace(gen_random_uuid()::text,'-',''),new.id,new.name,'modal',old.modal,new.modal,now());
  end if;
  if new.price is distinct from old.price then
    insert into price_history(id,product_id,product_name,field_name,from_value,to_value,created_at)
    values('price_'||replace(gen_random_uuid()::text,'-',''),new.id,new.name,'price',old.price,new.price,now());
  end if;
  return new;
end $$;
drop trigger if exists trg_track_product_price on products;
create trigger trg_track_product_price before update on products for each row execute function public.track_product_price_history();

-- Invoice sequence per tanggal Jakarta yang aman dari race condition.
create or replace function public.next_invoice_no() returns text language plpgsql security definer set search_path=public as $$
declare d date; n integer;
begin
  d := timezone('Asia/Jakarta',now())::date;
  insert into invoice_counters(counter_date,last_value) values(d,1)
  on conflict(counter_date) do update set last_value=invoice_counters.last_value+1
  returning last_value into n;
  return 'INV-'||to_char(d,'YYMMDD')||'-'||lpad(n::text,4,'0');
end $$;

-- Create order + deduct stock atomically. Snapshot is calculated server-side.
create or replace function public.create_order_atomic(
  p_product_id text, p_buyer_identifier text, p_qty integer,
  p_note text default '', p_server_id text default '', p_channel text default 'Itemku'
) returns orders language plpgsql security definer set search_path=public as $$
declare p products%rowtype; o orders%rowtype; v_price numeric; v_revenue numeric; v_fee numeric; v_capital numeric; v_total numeric; v_profit numeric; v_id text;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh membuat order'; end if;
  if p_qty is null or p_qty<=0 then raise exception 'Qty tidak valid'; end if;
  select * into p from products where id=p_product_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if p.stock<p_qty then raise exception 'Stok tidak cukup. Tersedia %',p.stock; end if;
  v_price := case when p.discount_enabled and coalesce(p.discount_price,0)>0 then p.discount_price else p.price end;
  v_revenue := v_price*p_qty;
  v_fee := v_revenue*greatest(0,least(99.99,p.fee))/100;
  v_capital := p.modal*p_qty;
  v_total := v_capital+v_fee+p.fixed+(p.other*p_qty);
  v_profit := v_revenue-v_total;
  v_id := 'order_'||replace(gen_random_uuid()::text,'-','');
  update products set stock=stock-p_qty, updated_at=now() where id=p.id;
  insert into orders(id,invoice_no,product_id,product_name,game,supplier_snapshot,buyer_identifier,server_id,channel,qty,note,status,snapshot,created_at,updated_at)
  values(v_id,public.next_invoice_no(),p.id,p.name,p.game,p.supplier,p_buyer_identifier,nullif(p_server_id,''),coalesce(nullif(p_channel,''),'Itemku'),p_qty,p_note,'Baru',jsonb_build_object(
    'unitPrice',v_price,'unitModal',p.modal,'feePercent',p.fee,'fixedCost',p.fixed,'otherUnitCost',p.other,
    'revenue',v_revenue,'feeAmount',v_fee,'capital',v_capital,'totalCost',v_total,'profit',v_profit
  ),now(),now()) returning * into o;
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Order dibuat',o.invoice_no||' · '||o.product_name);
  return o;
end $$;

-- Worker/Owner status transition + refund stock atomically.
create or replace function public.transition_order_atomic(
  p_order_id text, p_status text, p_refund_reason text default '', p_restore_stock boolean default false
) returns orders language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; role_name text; worker_name text;
begin
  role_name:=public.current_role(); worker_name:=coalesce(public.current_profile_name(),'System');
  if role_name is null or role_name not in ('owner','worker') then raise exception 'Tidak memiliki akses'; end if;
  if p_status not in ('Diproses','Selesai','Cancel','Refund') then raise exception 'Status tidak valid'; end if;
  select * into o from orders where id=p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if not public.game_allowed(o.game) then raise exception 'Worker tidak diizinkan menangani game ini'; end if;
  if role_name='worker' and not public.has_permission('canProcessOrders') then raise exception 'Worker hanya memiliki akses lihat order'; end if;
  if role_name='worker' and p_status in ('Refund','Cancel') and not public.has_permission('canRefund') then raise exception 'Worker tidak memiliki izin refund/cancel'; end if;
  if role_name='worker' and o.assigned_worker_id is not null and o.assigned_worker_id<>auth.uid() and o.status='Diproses' then raise exception 'Order sedang dikerjakan worker lain'; end if;
  if p_status='Diproses' and o.status='Baru' then
    update orders set status='Diproses',assigned_worker_id=auth.uid(),assigned_worker_name=worker_name,processing_at=coalesce(processing_at,now()),updated_at=now() where id=o.id returning * into o;
  elsif p_status='Selesai' and o.status in ('Baru','Diproses') then
    update orders set status='Selesai',assigned_worker_id=coalesce(assigned_worker_id,auth.uid()),assigned_worker_name=coalesce(assigned_worker_name,worker_name),processing_at=coalesce(processing_at,now()),completed_at=now(),updated_at=now() where id=o.id returning * into o;
  elsif p_status in ('Refund','Cancel') and o.status not in ('Refund','Cancel') then
    if p_restore_stock and not o.stock_restored and o.product_id is not null then
      update products set stock=stock+o.qty,updated_at=now() where id=o.product_id;
    end if;
    update orders set status=p_status,assigned_worker_id=coalesce(assigned_worker_id,auth.uid()),assigned_worker_name=coalesce(assigned_worker_name,worker_name),refund_reason=nullif(p_refund_reason,''),stock_restored=(stock_restored or p_restore_stock),completed_at=now(),updated_at=now() where id=o.id returning * into o;
  else
    raise exception 'Perubahan status dari % ke % tidak diizinkan',o.status,p_status;
  end if;
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),worker_name,'Order → '||p_status,o.invoice_no||' · '||o.product_name);
  return o;
end $$;

-- Restock + weighted average modal atomically.
create or replace function public.restock_product_atomic(
  p_product_id text, p_qty integer, p_unit_cost numeric, p_supplier text default '', p_note text default ''
) returns restocks language plpgsql security definer set search_path=public as $$
declare p products%rowtype; r restocks%rowtype; new_modal numeric; new_stock integer;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh restock'; end if;
  if p_qty is null or p_qty<=0 or p_unit_cost<0 then raise exception 'Data restock tidak valid'; end if;
  select * into p from products where id=p_product_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  new_stock:=p.stock+p_qty;
  new_modal:=case when new_stock>0 then ((p.stock*p.modal)+(p_qty*p_unit_cost))/new_stock else p_unit_cost end;
  update products set stock=new_stock,modal=new_modal,supplier=coalesce(nullif(p_supplier,''),supplier),stock_since=case when p.stock=0 then now() else stock_since end,updated_at=now() where id=p.id;
  insert into restocks(id,product_id,product_name,supplier,qty,unit_cost,total_cost,previous_stock,new_stock,note)
  values('restock_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,coalesce(nullif(p_supplier,''),p.supplier),p_qty,p_unit_cost,p_qty*p_unit_cost,p.stock,new_stock,p_note) returning * into r;
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Restock',p.name||' +'||p_qty::text||' unit');
  return r;
end $$;

revoke all on function public.create_order_atomic(text,text,integer,text,text,text) from public, anon;
revoke all on function public.transition_order_atomic(text,text,text,boolean) from public, anon;
revoke all on function public.restock_product_atomic(text,integer,numeric,text,text) from public, anon;

grant execute on function public.create_order_atomic(text,text,integer,text,text,text) to authenticated;
grant execute on function public.transition_order_atomic(text,text,text,boolean) to authenticated;
grant execute on function public.restock_product_atomic(text,integer,numeric,text,text) to authenticated;

-- Realtime
-- Supabase sudah memiliki publication supabase_realtime. Tambahkan tabel bila belum ada.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then alter publication supabase_realtime add table orders; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='products') then alter publication supabase_realtime add table products; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='restocks') then alter publication supabase_realtime add table restocks; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='expenses') then alter publication supabase_realtime add table expenses; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_notes') then alter publication supabase_realtime add table customer_notes; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='business_targets') then alter publication supabase_realtime add table business_targets; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='opportunities') then alter publication supabase_realtime add table opportunities; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='price_history') then alter publication supabase_realtime add table price_history; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audit_logs') then alter publication supabase_realtime add table audit_logs; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then alter publication supabase_realtime add table profiles; end if;
  end if;
end $$;

-- Isi role setelah membuat akun di Authentication > Users:
-- insert into profiles(id,name,role) values ('UUID_OWNER','Owner','owner') on conflict(id) do update set role='owner',name='Owner';
-- insert into profiles(id,name,role,permissions,allowed_games) values (
--   'UUID_WORKER','Worker 1','worker',
--   '{"canProcessOrders":true,"canRefund":false,"canViewStock":true,"canViewFinancials":false}'::jsonb,
--   array['Fish It!','Pet Simulator 99']
-- ) on conflict(id) do update set name=excluded.name,permissions=excluded.permissions,allowed_games=excluded.allowed_games;

-- ============================================================
-- V4.0 Operational + Automation Upgrade
-- Jalankan SETELAH bagian V3 di atas. Aman untuk upgrade bertahap.
-- ============================================================

create table if not exists channel_rules (
  id text primary key,
  name text not null,
  fee_percent numeric not null default 0 check(fee_percent>=0 and fee_percent<100),
  fixed_fee numeric not null default 0 check(fixed_fee>=0),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists channel_rules_name_key on channel_rules(lower(btrim(name)));
insert into channel_rules(id,name,fee_percent,fixed_fee,active,note)
values ('channel_itemku','Itemku',10,0,true,'Default V4'),('channel_whatsapp','WhatsApp',0,0,true,'Direct')
on conflict(id) do nothing;

create table if not exists suppliers (
  id text primary key, name text not null, contact text, note text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists purchase_orders (
  id text primary key, po_no text not null unique,
  supplier_id text references suppliers(id) on delete set null,
  supplier_name text not null default '', product_id text references products(id) on delete set null,
  product_name text not null default '', qty integer not null check(qty>0), unit_cost numeric not null default 0,
  total_cost numeric not null default 0, status text not null default 'Draft' check(status in ('Draft','Dipesan','Dibayar','Diterima','Batal')),
  ordered_at timestamptz not null default now(), received_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists inventory_ledger (
  id text primary key, product_id text references products(id) on delete set null, product_name text not null default '',
  delta integer not null, stock_before integer not null default 0, stock_after integer not null default 0,
  reason text not null check(reason in ('Restock','Order','Refund','Adjustment','Opening','PO')),
  reference_id text, note text, actor_name text not null default 'System', created_at timestamptz not null default now()
);
create index if not exists inventory_ledger_product_idx on inventory_ledger(product_id,created_at desc);

create table if not exists settlements (
  id text primary key, channel text not null, period_start timestamptz not null, period_end timestamptz not null,
  expected_amount numeric not null default 0, actual_amount numeric not null default 0,
  status text not null default 'Belum Cair' check(status in ('Belum Cair','Sebagian','Sudah Cair')),
  paid_at timestamptz, note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists disputes (
  id text primary key, order_id text references orders(id) on delete set null, invoice_no text not null default '',
  buyer_identifier text not null default '', reason text not null default '', chronology text not null default '',
  status text not null default 'Terbuka' check(status in ('Terbuka','Menunggu Pembeli','Menunggu Seller','Selesai','Ditutup')),
  assigned_worker text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz
);

create table if not exists automation_rules (
  id text primary key, kind text not null check(kind in ('low_stock','aging_stock','slow_order','low_margin','hot_product')),
  enabled boolean not null default true, threshold numeric not null default 0, label text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key, kind text not null, level text not null check(level in ('info','warn','danger','success')),
  title text not null, detail text, entity_type text, entity_id text, is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists dashboard_preferences (
  id text primary key default 'owner', visible_cards text[] not null default array['profit','revenue','orders','stock','sla','forecast'],
  sla_minutes integer not null default 10, forecast_days integer not null default 7,
  updated_at timestamptz not null default now()
);

create table if not exists customer_tags (
  id text primary key, buyer_identifier text not null, tags text[] not null default '{}',
  buyer_key text generated always as (lower(btrim(buyer_identifier))) stored,
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_tags_buyer_key_idx on customer_tags(buyer_key);

-- RLS V4: seluruh modul bisnis lanjutan adalah Owner-only.
do $$ declare t text; r record; begin
  foreach t in array array['channel_rules','suppliers','purchase_orders','inventory_ledger','settlements','disputes','automation_rules','notifications','dashboard_preferences','customer_tags'] loop
    execute format('alter table public.%I enable row level security',t);
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy if exists %I on public.%I',r.policyname,t); end loop;
    execute format('create policy %I on public.%I for all to authenticated using (public.current_role()=''owner'') with check (public.current_role()=''owner'')','v4 owner '||t,t);
  end loop;
end $$;

-- Atomic stock adjustment untuk stock opname.
create or replace function public.adjust_stock_atomic(p_product_id text,p_new_stock integer,p_note text default '')
returns products language plpgsql security definer set search_path=public as $$
declare p products%rowtype; before_stock integer; delta_stock integer;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh koreksi stok'; end if;
  if p_new_stock<0 then raise exception 'Stok tidak boleh negatif'; end if;
  select * into p from products where id=p_product_id for update; if not found then raise exception 'Produk tidak ditemukan'; end if;
  before_stock:=p.stock; delta_stock:=p_new_stock-before_stock;
  update products set stock=p_new_stock,updated_at=now() where id=p.id returning * into p;
  insert into inventory_ledger(id,product_id,product_name,delta,stock_before,stock_after,reason,reference_id,note,actor_name)
  values('ledger_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,delta_stock,before_stock,p_new_stock,'Adjustment',null,p_note,coalesce(public.current_profile_name(),'Owner'));
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Koreksi stok',p.name||' '||before_stock||'→'||p_new_stock);
  return p;
end $$;

-- Terima Purchase Order: stok + modal weighted average + ledger dalam satu transaksi.
create or replace function public.receive_purchase_order_atomic(p_po_id text)
returns purchase_orders language plpgsql security definer set search_path=public as $$
declare po purchase_orders%rowtype; p products%rowtype; new_stock integer; new_modal numeric;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh menerima PO'; end if;
  select * into po from purchase_orders where id=p_po_id for update; if not found then raise exception 'PO tidak ditemukan'; end if;
  if po.status='Diterima' then return po; end if; if po.status='Batal' then raise exception 'PO sudah dibatalkan'; end if;
  select * into p from products where id=po.product_id for update; if not found then raise exception 'Produk PO tidak ditemukan'; end if;
  new_stock:=p.stock+po.qty; new_modal:=case when new_stock>0 then ((p.stock*p.modal)+(po.qty*po.unit_cost))/new_stock else po.unit_cost end;
  update products set stock=new_stock,modal=new_modal,supplier=coalesce(nullif(po.supplier_name,''),supplier),stock_since=case when p.stock=0 then now() else stock_since end,updated_at=now() where id=p.id;
  update purchase_orders set status='Diterima',received_at=now(),updated_at=now() where id=po.id returning * into po;
  insert into inventory_ledger(id,product_id,product_name,delta,stock_before,stock_after,reason,reference_id,note,actor_name)
  values('ledger_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,po.qty,p.stock,new_stock,'PO',po.id,po.po_no,coalesce(public.current_profile_name(),'Owner'));
  insert into restocks(id,product_id,product_name,supplier,qty,unit_cost,total_cost,previous_stock,new_stock,note)
  values('restock_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,po.supplier_name,po.qty,po.unit_cost,po.total_cost,p.stock,new_stock,'Dari '||po.po_no);
  return po;
end $$;

-- Override create_order_atomic V4: fee berdasarkan channel rule dan ledger stock.
create or replace function public.create_order_atomic(
  p_product_id text, p_buyer_identifier text, p_qty integer,
  p_note text default '', p_server_id text default '', p_channel text default 'Itemku'
) returns orders language plpgsql security definer set search_path=public as $$
declare p products%rowtype; o orders%rowtype; v_price numeric; v_revenue numeric; v_fee numeric; v_fee_pct numeric; v_fixed numeric; v_capital numeric; v_total numeric; v_profit numeric; v_id text; before_stock integer;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh membuat order'; end if;
  if p_qty is null or p_qty<=0 then raise exception 'Qty tidak valid'; end if;
  select * into p from products where id=p_product_id for update; if not found then raise exception 'Produk tidak ditemukan'; end if;
  if p.stock<p_qty then raise exception 'Stok tidak cukup. Tersedia %',p.stock; end if;
  select fee_percent,fixed_fee into v_fee_pct,v_fixed from channel_rules where active=true and lower(btrim(name))=lower(btrim(coalesce(nullif(p_channel,''),'Itemku'))) limit 1;
  v_fee_pct:=coalesce(v_fee_pct,p.fee); v_fixed:=coalesce(v_fixed,p.fixed);
  v_price:=case when p.discount_enabled and coalesce(p.discount_price,0)>0 then p.discount_price else p.price end;
  v_revenue:=v_price*p_qty; v_fee:=v_revenue*greatest(0,least(99.99,v_fee_pct))/100; v_capital:=p.modal*p_qty; v_total:=v_capital+v_fee+v_fixed+(p.other*p_qty); v_profit:=v_revenue-v_total;
  v_id:='order_'||replace(gen_random_uuid()::text,'-',''); before_stock:=p.stock;
  update products set stock=stock-p_qty,updated_at=now() where id=p.id;
  insert into orders(id,invoice_no,product_id,product_name,game,supplier_snapshot,buyer_identifier,server_id,channel,qty,note,status,snapshot,created_at,updated_at)
  values(v_id,public.next_invoice_no(),p.id,p.name,p.game,p.supplier,p_buyer_identifier,nullif(p_server_id,''),coalesce(nullif(p_channel,''),'Itemku'),p_qty,p_note,'Baru',jsonb_build_object('unitPrice',v_price,'unitModal',p.modal,'feePercent',v_fee_pct,'fixedCost',v_fixed,'otherUnitCost',p.other,'revenue',v_revenue,'feeAmount',v_fee,'capital',v_capital,'totalCost',v_total,'profit',v_profit),now(),now()) returning * into o;
  insert into inventory_ledger(id,product_id,product_name,delta,stock_before,stock_after,reason,reference_id,note,actor_name)
  values('ledger_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,-p_qty,before_stock,before_stock-p_qty,'Order',o.id,o.invoice_no,coalesce(public.current_profile_name(),'Owner'));
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Order dibuat',o.invoice_no||' · '||o.product_name||' · '||o.channel);
  return o;
end $$;

-- Override transition order agar refund juga masuk ledger.
create or replace function public.transition_order_atomic(
  p_order_id text, p_status text, p_refund_reason text default '', p_restore_stock boolean default false
) returns orders language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; role_name text; worker_name text; before_stock integer;
begin
  role_name:=public.current_role(); worker_name:=coalesce(public.current_profile_name(),'System');
  if role_name is null or role_name not in ('owner','worker') then raise exception 'Tidak memiliki akses'; end if;
  if p_status not in ('Diproses','Selesai','Cancel','Refund') then raise exception 'Status tidak valid'; end if;
  select * into o from orders where id=p_order_id for update; if not found then raise exception 'Order tidak ditemukan'; end if;
  if not public.game_allowed(o.game) then raise exception 'Worker tidak diizinkan menangani game ini'; end if;
  if role_name='worker' and not public.has_permission('canProcessOrders') then raise exception 'Worker hanya memiliki akses lihat order'; end if;
  if role_name='worker' and p_status in ('Refund','Cancel') and not public.has_permission('canRefund') then raise exception 'Worker tidak memiliki izin refund/cancel'; end if;
  if role_name='worker' and o.assigned_worker_id is not null and o.assigned_worker_id<>auth.uid() and o.status='Diproses' then raise exception 'Order sedang dikerjakan worker lain'; end if;
  if p_status='Diproses' and o.status='Baru' then update orders set status='Diproses',assigned_worker_id=auth.uid(),assigned_worker_name=worker_name,processing_at=coalesce(processing_at,now()),updated_at=now() where id=o.id returning * into o;
  elsif p_status='Selesai' and o.status in ('Baru','Diproses') then update orders set status='Selesai',assigned_worker_id=coalesce(assigned_worker_id,auth.uid()),assigned_worker_name=coalesce(assigned_worker_name,worker_name),processing_at=coalesce(processing_at,now()),completed_at=now(),updated_at=now() where id=o.id returning * into o;
  elsif p_status in ('Refund','Cancel') and o.status not in ('Refund','Cancel') then
    if p_restore_stock and not o.stock_restored and o.product_id is not null then
      select stock into before_stock from products where id=o.product_id for update;
      update products set stock=stock+o.qty,updated_at=now() where id=o.product_id;
      insert into inventory_ledger(id,product_id,product_name,delta,stock_before,stock_after,reason,reference_id,note,actor_name) values('ledger_'||replace(gen_random_uuid()::text,'-',''),o.product_id,o.product_name,o.qty,before_stock,before_stock+o.qty,'Refund',o.id,o.invoice_no,worker_name);
    end if;
    update orders set status=p_status,assigned_worker_id=coalesce(assigned_worker_id,auth.uid()),assigned_worker_name=coalesce(assigned_worker_name,worker_name),refund_reason=nullif(p_refund_reason,''),stock_restored=(stock_restored or p_restore_stock),completed_at=now(),updated_at=now() where id=o.id returning * into o;
  else raise exception 'Perubahan status dari % ke % tidak diizinkan',o.status,p_status; end if;
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),worker_name,'Order → '||p_status,o.invoice_no||' · '||o.product_name);
  return o;
end $$;

-- Override restock agar semua pergerakan stok memiliki ledger.
create or replace function public.restock_product_atomic(
  p_product_id text, p_qty integer, p_unit_cost numeric, p_supplier text default '', p_note text default ''
) returns restocks language plpgsql security definer set search_path=public as $$
declare p products%rowtype; r restocks%rowtype; new_modal numeric; new_stock integer;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh restock'; end if;
  if p_qty is null or p_qty<=0 or p_unit_cost<0 then raise exception 'Data restock tidak valid'; end if;
  select * into p from products where id=p_product_id for update; if not found then raise exception 'Produk tidak ditemukan'; end if;
  new_stock:=p.stock+p_qty; new_modal:=case when new_stock>0 then ((p.stock*p.modal)+(p_qty*p_unit_cost))/new_stock else p_unit_cost end;
  update products set stock=new_stock,modal=new_modal,supplier=coalesce(nullif(p_supplier,''),supplier),stock_since=case when p.stock=0 then now() else stock_since end,updated_at=now() where id=p.id;
  insert into restocks(id,product_id,product_name,supplier,qty,unit_cost,total_cost,previous_stock,new_stock,created_at,note) values('restock_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,coalesce(nullif(p_supplier,''),p.supplier),p_qty,p_unit_cost,p_qty*p_unit_cost,p.stock,new_stock,now(),p_note) returning * into r;
  insert into inventory_ledger(id,product_id,product_name,delta,stock_before,stock_after,reason,reference_id,note,actor_name) values('ledger_'||replace(gen_random_uuid()::text,'-',''),p.id,p.name,p_qty,p.stock,new_stock,'Restock',r.id,p_note,coalesce(public.current_profile_name(),'Owner'));
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Restock',p.name||' +'||p_qty::text||' unit'); return r;
end $$;

revoke all on function public.adjust_stock_atomic(text,integer,text) from public,anon;
revoke all on function public.receive_purchase_order_atomic(text) from public,anon;
grant execute on function public.adjust_stock_atomic(text,integer,text) to authenticated;
grant execute on function public.receive_purchase_order_atomic(text) to authenticated;

-- Realtime V4 tables.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='channel_rules') then alter publication supabase_realtime add table channel_rules; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='suppliers') then alter publication supabase_realtime add table suppliers; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_orders') then alter publication supabase_realtime add table purchase_orders; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_ledger') then alter publication supabase_realtime add table inventory_ledger; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='settlements') then alter publication supabase_realtime add table settlements; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='disputes') then alter publication supabase_realtime add table disputes; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table notifications; end if;
  end if;
end $$;

-- ============================================================
-- V4.1 Speed & Intelligence Update
-- Order Kanban + Worker Queue atomic assignment
-- ============================================================

-- Tambah status Menunggu untuk workflow Kanban.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid='public.orders'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.orders drop constraint if exists %I',c.conname);
  end loop;
  alter table public.orders add constraint orders_status_check check(status in ('Baru','Diproses','Menunggu','Selesai','Cancel','Refund'));
exception when duplicate_object then null;
end $$;

-- Owner dapat menugaskan / melepas worker tanpa mengambil order atas nama owner.
create or replace function public.assign_order_atomic(p_order_id text,p_worker_id uuid default null)
returns orders language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; w profiles%rowtype;
begin
  if coalesce(public.current_role(),'')<>'owner' then raise exception 'Hanya Owner yang boleh assign worker'; end if;
  select * into o from orders where id=p_order_id for update; if not found then raise exception 'Order tidak ditemukan'; end if;
  if o.status not in ('Baru','Diproses','Menunggu') then raise exception 'Order yang sudah selesai tidak dapat di-assign'; end if;
  if p_worker_id is null then
    update orders set assigned_worker_id=null,assigned_worker_name=null,updated_at=now() where id=o.id returning * into o;
    insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Unassign worker',o.invoice_no||' · '||o.product_name);
    return o;
  end if;
  select * into w from profiles where id=p_worker_id and role='worker' and active=true for update;
  if not found then raise exception 'Worker cloud tidak ditemukan / nonaktif'; end if;
  if not coalesce((w.permissions->>'canProcessOrders')::boolean,false) then raise exception 'Worker tidak punya izin proses order'; end if;
  if cardinality(w.allowed_games)>0 and not (o.game=any(w.allowed_games)) then raise exception 'Worker tidak diizinkan untuk game %',o.game; end if;
  update orders set assigned_worker_id=w.id,assigned_worker_name=w.name,updated_at=now() where id=o.id returning * into o;
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),coalesce(public.current_profile_name(),'Owner'),'Assign worker',o.invoice_no||' → '||w.name);
  return o;
end $$;

-- Workflow V4.1: Menunggu + lock assignment untuk mencegah worker lain mengambil order terjadwal.
create or replace function public.transition_order_atomic(
  p_order_id text, p_status text, p_refund_reason text default '', p_restore_stock boolean default false
) returns orders language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; role_name text; worker_name text; before_stock integer;
begin
  role_name:=public.current_role(); worker_name:=coalesce(public.current_profile_name(),'System');
  if role_name is null or role_name not in ('owner','worker') then raise exception 'Tidak memiliki akses'; end if;
  if p_status not in ('Diproses','Menunggu','Selesai','Cancel','Refund') then raise exception 'Status tidak valid'; end if;
  select * into o from orders where id=p_order_id for update; if not found then raise exception 'Order tidak ditemukan'; end if;
  if not public.game_allowed(o.game) then raise exception 'Worker tidak diizinkan menangani game ini'; end if;
  if role_name='worker' and not public.has_permission('canProcessOrders') then raise exception 'Worker hanya memiliki akses lihat order'; end if;
  if role_name='worker' and p_status in ('Refund','Cancel') and not public.has_permission('canRefund') then raise exception 'Worker tidak memiliki izin refund/cancel'; end if;
  if role_name='worker' and o.assigned_worker_id is not null and o.assigned_worker_id<>auth.uid() and o.status in ('Baru','Diproses','Menunggu') then raise exception 'Order sudah ditugaskan ke worker lain'; end if;

  if p_status='Diproses' and o.status in ('Baru','Menunggu') then
    update orders set status='Diproses',assigned_worker_id=coalesce(assigned_worker_id,auth.uid()),assigned_worker_name=coalesce(assigned_worker_name,worker_name),processing_at=coalesce(processing_at,now()),completed_at=null,updated_at=now() where id=o.id returning * into o;
  elsif p_status='Menunggu' and o.status in ('Baru','Diproses') then
    update orders set status='Menunggu',assigned_worker_id=coalesce(assigned_worker_id,case when role_name='worker' then auth.uid() else null end),assigned_worker_name=coalesce(assigned_worker_name,case when role_name='worker' then worker_name else null end),processing_at=coalesce(processing_at,now()),completed_at=null,updated_at=now() where id=o.id returning * into o;
  elsif p_status='Selesai' and o.status in ('Baru','Diproses','Menunggu') then
    update orders set status='Selesai',assigned_worker_id=coalesce(assigned_worker_id,case when role_name='worker' then auth.uid() else null end),assigned_worker_name=coalesce(assigned_worker_name,case when role_name='worker' then worker_name else null end),processing_at=coalesce(processing_at,now()),completed_at=now(),updated_at=now() where id=o.id returning * into o;
  elsif p_status in ('Refund','Cancel') and o.status not in ('Refund','Cancel') then
    if p_restore_stock and not o.stock_restored and o.product_id is not null then
      select stock into before_stock from products where id=o.product_id for update;
      update products set stock=stock+o.qty,updated_at=now() where id=o.product_id;
      insert into inventory_ledger(id,product_id,product_name,delta,stock_before,stock_after,reason,reference_id,note,actor_name) values('ledger_'||replace(gen_random_uuid()::text,'-',''),o.product_id,o.product_name,o.qty,before_stock,before_stock+o.qty,'Refund',o.id,o.invoice_no,worker_name);
    end if;
    update orders set status=p_status,refund_reason=nullif(p_refund_reason,''),stock_restored=(stock_restored or p_restore_stock),completed_at=now(),updated_at=now() where id=o.id returning * into o;
  else raise exception 'Perubahan status dari % ke % tidak diizinkan',o.status,p_status; end if;
  insert into audit_logs(id,actor_name,action,detail) values('log_'||replace(gen_random_uuid()::text,'-',''),worker_name,'Order → '||p_status,o.invoice_no||' · '||o.product_name);
  return o;
end $$;

revoke all on function public.assign_order_atomic(text,uuid) from public,anon;
grant execute on function public.assign_order_atomic(text,uuid) to authenticated;

-- ============================================================
-- V4.2 application update
-- Tidak ada tabel/RPC baru yang wajib. Fitur V4.2 memakai data V4.1:
-- Quick Order, Price Advisor, Product Templates, Customer Intelligence,
-- Sales Trend Radar, Daily Operations, Data Quality, Business Calendar.
-- File ini disediakan sebagai schema instalasi terbaru yang kompatibel penuh.
-- ============================================================

-- V4.3 Decision Intelligence update
-- Tidak ada tabel/RPC baru yang wajib. Modul V4.3 bersifat derived analytics dan memakai data V4.2 yang sudah ada:
-- products, orders, restocks, suppliers, settlements, disputes, expenses, channel_rules.
-- Upgrade V4.2 -> V4.3 cukup deploy source V4.3. Menjalankan schema ini aman sebagai schema referensi instalasi baru.
