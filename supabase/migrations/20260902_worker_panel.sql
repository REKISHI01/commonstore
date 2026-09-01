-- V6.5 Worker Panel: notifikasi untuk worker
-- (order baru masuk, order ditugaskan, slip gaji dibayar) + RPC tandai dibaca.
-- Idempotent: aman dijalankan berulang. Aditif: tidak mengubah/menghapus data.

-- 1. Kolom penerima notifikasi. NULL = notifikasi Owner (data lama tetap terbaca Owner).
alter table public.notifications add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);

-- 2. RLS: worker hanya boleh membaca & menandai dibaca notifikasi miliknya.
--    Kebijakan Owner yang lama ("v4 owner notifications") tidak diubah.
drop policy if exists "notifications worker read" on public.notifications;
drop policy if exists "notifications worker update" on public.notifications;
create policy "notifications worker read" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy "notifications worker update" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- 3. Trigger order: order baru + penugasan.
create or replace function public.notify_order_events() returns trigger
language plpgsql security definer set search_path=public as $$
declare w record;
begin
  if tg_op = 'INSERT' then
    -- Order baru: kabari semua worker aktif kecuali yang langsung ditugaskan.
    for w in
      select p.id from public.profiles p
      where p.role = 'worker' and p.active = true
        and (new.assigned_worker_id is null or p.id <> new.assigned_worker_id)
    loop
      insert into public.notifications(id,kind,level,title,detail,entity_type,entity_id,recipient_id)
      select 'notif_'||gen_random_uuid(),'order_baru','info','Order baru masuk',
             trim(coalesce(new.game,''))||' · '||new.product_name||' × '||new.qty,
             'order',new.id,w.id
      where not exists (
        select 1 from public.notifications n
        where n.kind='order_baru' and n.entity_id=new.id and n.recipient_id=w.id);
    end loop;
    -- Order yang dibuat sudah ter-tugaskan: kabari worker penerimaannya.
    if new.assigned_worker_id is not null then
      insert into public.notifications(id,kind,level,title,detail,entity_type,entity_id,recipient_id)
      select 'notif_'||gen_random_uuid(),'order_ditugaskan','info','Order ditugaskan ke kamu',
             coalesce(new.invoice_no,new.id)||' · '||new.product_name||' × '||new.qty,
             'order',new.id,new.assigned_worker_id
      where not exists (
        select 1 from public.notifications n
        where n.kind='order_ditugaskan' and n.entity_id=new.id and n.recipient_id=new.assigned_worker_id);
    end if;
  elsif tg_op = 'UPDATE' and new.assigned_worker_id is not null
        and old.assigned_worker_id is distinct from new.assigned_worker_id
        and new.assigned_worker_id is distinct from auth.uid() then
    -- Penugasan oleh orang lain (Owner). Klaim mandiri tidak menotifikasi diri sendiri.
    insert into public.notifications(id,kind,level,title,detail,entity_type,entity_id,recipient_id)
    select 'notif_'||gen_random_uuid(),'order_ditugaskan','info','Order ditugaskan ke kamu',
           coalesce(new.invoice_no,new.id)||' · '||new.product_name||' × '||new.qty,
           'order',new.id,new.assigned_worker_id
    where not exists (
      select 1 from public.notifications n
      where n.kind='order_ditugaskan' and n.entity_id=new.id and n.recipient_id=new.assigned_worker_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_notify_order_events on public.orders;
create trigger trg_notify_order_events
after insert or update on public.orders
for each row execute function public.notify_order_events();

-- 4. Trigger payroll: notifikasi saat slip dibayar (finalized -> paid).
create or replace function public.notify_payroll_paid() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'paid' and coalesce(old.status,'') <> 'paid' then
    insert into public.notifications(id,kind,level,title,detail,entity_type,entity_id,recipient_id)
    select 'notif_'||gen_random_uuid(),'gaji_dibayar','success','Gaji sudah dibayar',
           'Slip '||i.month_key||' · Rp '||trim(to_char(i.total_pay,'999999999')),
           'payroll',new.id::text,i.worker_id
    from public.payroll_items i
    where i.run_id = new.id
      and not exists (
        select 1 from public.notifications n
        where n.kind='gaji_dibayar' and n.entity_id=new.id::text and n.recipient_id=i.worker_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_notify_payroll_paid on public.payroll_runs;
create trigger trg_notify_payroll_paid
after update of status on public.payroll_runs
for each row execute function public.notify_payroll_paid();

-- 5. RPC tandai notifikasi dibaca (semua milik pemanggil, atau per-ID).
create or replace function public.worker_mark_notifications_read(p_ids text[] default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Tidak terautentikasi' using errcode='42501';
  end if;
  update public.notifications set is_read = true
  where is_read = false and recipient_id = auth.uid()
    and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.worker_mark_notifications_read(text[]) to authenticated;
