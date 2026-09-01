-- Itemku Profit V6.4.2 — Payroll & Profit Sharing Transparency
-- Upgrade aman dari V5.2.0.
-- Default: gaji tetap Rp500.000 + profit share 15% per Worker + cadangan usaha 25%.
-- Payroll hanya diakses melalui backend server menggunakan SUPABASE_SERVICE_ROLE_KEY.

create extension if not exists pgcrypto;

create table if not exists public.payroll_schemes (
  id uuid primary key default gen_random_uuid(),
  base_salary numeric(18,2) not null default 500000 check (base_salary >= 0),
  worker_share_percent numeric(7,4) not null default 15 check (worker_share_percent >= 0 and worker_share_percent <= 100),
  reserve_percent numeric(7,4) not null default 25 check (reserve_percent >= 0 and reserve_percent <= 100),
  effective_from date not null,
  note text not null default '',
  created_by uuid null,
  created_by_name text not null default 'Owner',
  created_at timestamptz not null default now()
);

create index if not exists payroll_schemes_effective_idx
  on public.payroll_schemes(effective_from desc, created_at desc);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  month_key text not null unique check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  period_start date not null,
  period_end date not null,
  scheme_id uuid not null references public.payroll_schemes(id),
  scheme_snapshot jsonb not null,
  worker_count integer not null default 0 check (worker_count >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  gross_order_profit numeric(18,2) not null default 0,
  expenses_total numeric(18,2) not null default 0,
  net_profit numeric(18,2) not null default 0,
  reserve_amount numeric(18,2) not null default 0,
  fixed_salary_total numeric(18,2) not null default 0,
  distributable_profit numeric(18,2) not null default 0,
  worker_share_total numeric(18,2) not null default 0,
  total_payroll numeric(18,2) not null default 0,
  owner_remaining numeric(18,2) not null default 0,
  status text not null default 'finalized' check (status in ('finalized','paid')),
  finalized_by uuid null,
  finalized_by_name text not null default 'Owner',
  finalized_at timestamptz not null default now(),
  paid_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete restrict,
  month_key text not null,
  worker_id uuid not null,
  worker_name text not null,
  base_salary numeric(18,2) not null default 0,
  share_percent numeric(7,4) not null default 0,
  share_amount numeric(18,2) not null default 0,
  total_pay numeric(18,2) not null default 0,
  business_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(run_id, worker_id)
);

create index if not exists payroll_items_worker_idx
  on public.payroll_items(worker_id, month_key desc);

-- Seed skema awal hanya jika belum ada skema sama sekali.
insert into public.payroll_schemes(
  base_salary, worker_share_percent, reserve_percent, effective_from, note, created_by_name
)
select 500000, 15, 25, current_date, 'Skema awal V6.4', 'Owner'
where not exists (select 1 from public.payroll_schemes);

-- Snapshot payroll finalized tidak boleh diubah. Satu-satunya transisi adalah finalized -> paid.
create or replace function public.guard_payroll_run_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'paid' then
    raise exception 'Payroll yang sudah dibayar tidak dapat diubah';
  end if;

  if old.status = 'finalized' then
    if new.status <> 'paid' then
      raise exception 'Payroll finalized hanya dapat diubah menjadi paid';
    end if;

    if row(
      new.month_key,new.period_start,new.period_end,new.scheme_id,new.scheme_snapshot,
      new.worker_count,new.order_count,new.gross_order_profit,new.expenses_total,new.net_profit,
      new.reserve_amount,new.fixed_salary_total,new.distributable_profit,new.worker_share_total,
      new.total_payroll,new.owner_remaining,new.finalized_by,new.finalized_by_name,new.finalized_at
    ) is distinct from row(
      old.month_key,old.period_start,old.period_end,old.scheme_id,old.scheme_snapshot,
      old.worker_count,old.order_count,old.gross_order_profit,old.expenses_total,old.net_profit,
      old.reserve_amount,old.fixed_salary_total,old.distributable_profit,old.worker_share_total,
      old.total_payroll,old.owner_remaining,old.finalized_by,old.finalized_by_name,old.finalized_at
    ) then
      raise exception 'Snapshot payroll finalized tidak boleh diubah';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_payroll_run_immutable on public.payroll_runs;
create trigger trg_guard_payroll_run_immutable
before update on public.payroll_runs
for each row execute function public.guard_payroll_run_immutable();

-- Slip per Worker bersifat immutable setelah dibuat.
create or replace function public.guard_payroll_item_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run_status text;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Slip payroll adalah snapshot dan tidak dapat diubah';
  end if;

  select status into run_status
  from public.payroll_runs
  where id = new.run_id;

  if run_status is distinct from 'finalized' then
    raise exception 'Slip hanya dapat dibuat untuk payroll finalized';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_payroll_item_immutable on public.payroll_items;
create trigger trg_guard_payroll_item_immutable
before insert or update or delete on public.payroll_items
for each row execute function public.guard_payroll_item_immutable();

-- Preview payroll live. Batas bulan memakai WIB (Asia/Jakarta).
create or replace function public.payroll_preview(p_month_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_scheme public.payroll_schemes%rowtype;
  v_worker_count integer;
  v_order_count integer;
  v_gross numeric(18,2);
  v_expenses numeric(18,2);
  v_net numeric(18,2);
  v_reserve numeric(18,2);
  v_salary_total numeric(18,2);
  v_distributable numeric(18,2);
  v_share_total numeric(18,2);
  v_total_payroll numeric(18,2);
  v_owner_remaining numeric(18,2);
begin
  if p_month_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'month_key harus YYYY-MM';
  end if;

  v_start := to_date(p_month_key || '-01', 'YYYY-MM-DD');
  v_end := (v_start + interval '1 month')::date;
  v_start_ts := v_start::timestamp at time zone 'Asia/Jakarta';
  v_end_ts := v_end::timestamp at time zone 'Asia/Jakarta';

  select * into v_scheme
  from public.payroll_schemes
  where effective_from < v_end
  order by effective_from desc, created_at desc
  limit 1;

  if v_scheme.id is null then
    raise exception 'Skema payroll belum tersedia';
  end if;

  select count(*) into v_worker_count
  from public.profiles
  where role = 'worker' and active is true;

  -- Share adalah per Worker. Total seluruh Worker tidak boleh melebihi 100% profit distributable.
  if (v_worker_count * v_scheme.worker_share_percent) > 100 then
    raise exception using message = format(
      'Total profit share aktif melebihi 100%% (%s Worker x %s%%)',
      v_worker_count,
      v_scheme.worker_share_percent
    );
  end if;

  select count(*), coalesce(sum(coalesce((snapshot->>'profit')::numeric,0)),0)
    into v_order_count, v_gross
  from public.orders
  where status = 'Selesai'
    and coalesce(completed_at, updated_at, created_at) >= v_start_ts
    and coalesce(completed_at, updated_at, created_at) < v_end_ts;

  select coalesce(sum(amount),0) into v_expenses
  from public.expenses
  where expense_date >= v_start_ts
    and expense_date < v_end_ts;

  v_net := v_gross - v_expenses;
  v_reserve := case when v_net > 0 then round(v_net * v_scheme.reserve_percent / 100, 2) else 0 end;
  v_salary_total := round(v_scheme.base_salary * v_worker_count, 2);
  v_distributable := greatest(v_net - v_reserve - v_salary_total, 0);
  v_share_total := round(v_distributable * v_scheme.worker_share_percent / 100 * v_worker_count, 2);
  v_total_payroll := v_salary_total + v_share_total;
  v_owner_remaining := v_net - v_reserve - v_total_payroll;

  return jsonb_build_object(
    'monthKey', p_month_key,
    'periodStart', v_start,
    'periodEnd', v_end - 1,
    'scheme', jsonb_build_object(
      'id', v_scheme.id,
      'baseSalary', v_scheme.base_salary,
      'workerSharePercent', v_scheme.worker_share_percent,
      'reservePercent', v_scheme.reserve_percent,
      'effectiveFrom', v_scheme.effective_from,
      'note', v_scheme.note
    ),
    'workerCount', v_worker_count,
    'orderCount', v_order_count,
    'grossOrderProfit', v_gross,
    'expensesTotal', v_expenses,
    'netProfit', v_net,
    'reserveAmount', v_reserve,
    'fixedSalaryTotal', v_salary_total,
    'distributableProfit', v_distributable,
    'workerShareTotal', v_share_total,
    'totalPayroll', v_total_payroll,
    'ownerRemaining', v_owner_remaining
  );
end;
$$;

-- Finalisasi ulang menghitung preview di transaksi DB yang sama lalu membuat snapshot per Worker.
create or replace function public.finalize_payroll(
  p_month_key text,
  p_actor uuid default null,
  p_actor_name text default 'Owner'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_run_id uuid;
  v_scheme_id uuid;
  v_worker record;
  v_share numeric(18,2);
  v_base numeric(18,2);
  v_share_percent numeric(7,4);
  v_business_snapshot jsonb;
begin
  if exists(select 1 from public.payroll_runs where month_key = p_month_key) then
    raise exception 'Payroll bulan % sudah difinalisasi', p_month_key;
  end if;

  v_preview := public.payroll_preview(p_month_key);
  v_scheme_id := (v_preview#>>'{scheme,id}')::uuid;
  v_base := (v_preview#>>'{scheme,baseSalary}')::numeric;
  v_share_percent := (v_preview#>>'{scheme,workerSharePercent}')::numeric;
  v_share := round((v_preview->>'distributableProfit')::numeric * v_share_percent / 100, 2);

  insert into public.payroll_runs(
    month_key,period_start,period_end,scheme_id,scheme_snapshot,worker_count,order_count,
    gross_order_profit,expenses_total,net_profit,reserve_amount,fixed_salary_total,
    distributable_profit,worker_share_total,total_payroll,owner_remaining,
    status,finalized_by,finalized_by_name,finalized_at
  ) values (
    p_month_key,(v_preview->>'periodStart')::date,(v_preview->>'periodEnd')::date,
    v_scheme_id,v_preview->'scheme',(v_preview->>'workerCount')::int,(v_preview->>'orderCount')::int,
    (v_preview->>'grossOrderProfit')::numeric,(v_preview->>'expensesTotal')::numeric,(v_preview->>'netProfit')::numeric,
    (v_preview->>'reserveAmount')::numeric,(v_preview->>'fixedSalaryTotal')::numeric,
    (v_preview->>'distributableProfit')::numeric,(v_preview->>'workerShareTotal')::numeric,
    (v_preview->>'totalPayroll')::numeric,(v_preview->>'ownerRemaining')::numeric,
    'finalized',p_actor,p_actor_name,now()
  ) returning id into v_run_id;

  v_business_snapshot := v_preview - 'scheme';

  for v_worker in
    select id,name
    from public.profiles
    where role = 'worker' and active is true
    order by created_at asc
  loop
    insert into public.payroll_items(
      run_id,month_key,worker_id,worker_name,base_salary,share_percent,share_amount,total_pay,business_snapshot
    ) values (
      v_run_id,p_month_key,v_worker.id,coalesce(v_worker.name,'Worker'),v_base,v_share_percent,v_share,v_base+v_share,v_business_snapshot
    );
  end loop;

  insert into public.audit_logs(id,action,detail,actor_name,created_at)
  values(gen_random_uuid()::text,'PAYROLL_FINALIZED','Payroll '||p_month_key||' difinalisasi. Run: '||v_run_id,p_actor_name,now());

  return v_run_id;
end;
$$;

create or replace function public.mark_payroll_paid(
  p_run_id uuid,
  p_actor_name text default 'Owner'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text;
begin
  select month_key into v_month
  from public.payroll_runs
  where id = p_run_id;

  if v_month is null then
    raise exception 'Payroll tidak ditemukan';
  end if;

  update public.payroll_runs
  set status = 'paid', paid_at = now()
  where id = p_run_id and status = 'finalized';

  if not found then
    raise exception 'Payroll bukan berstatus finalized';
  end if;

  insert into public.audit_logs(id,action,detail,actor_name,created_at)
  values(gen_random_uuid()::text,'PAYROLL_PAID','Payroll '||v_month||' ditandai dibayar. Run: '||p_run_id,p_actor_name,now());
end;
$$;

-- SECURITY: payroll tidak boleh diakses langsung memakai anon/authenticated.
alter table public.payroll_schemes enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;

revoke all on table public.payroll_schemes from anon, authenticated;
revoke all on table public.payroll_runs from anon, authenticated;
revoke all on table public.payroll_items from anon, authenticated;

revoke execute on function public.payroll_preview(text) from public, anon, authenticated;
revoke execute on function public.finalize_payroll(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_payroll_paid(uuid, text) from public, anon, authenticated;

grant execute on function public.payroll_preview(text) to service_role;
grant execute on function public.finalize_payroll(text, uuid, text) to service_role;
grant execute on function public.mark_payroll_paid(uuid, text) to service_role;
