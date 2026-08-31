# Upgrade Itemku Profit V5.2 → V6.4.2

V6.4.2 mempertahankan seluruh modul V5.2 dan menambahkan Payroll & Profit Sharing Transparency.

## Fitur payroll
- Gaji tetap default Rp500.000 per Worker.
- Profit share default 15% dari profit distributable **per Worker**.
- Cadangan usaha default 25%.
- Owner dapat membuat versi skema baru tanpa mengubah slip lama.
- Preview bulanan sebelum finalisasi.
- Finalized payroll adalah snapshot immutable.
- Status pembayaran: Finalized → Paid.
- Worker hanya melihat slip gajinya sendiri di menu **Gaji Saya**.
- Owner melihat payroll di **Keuangan → Payroll**.

## Keamanan
Tabel payroll memakai RLS dan akses browser langsung untuk `anon` / `authenticated` diblokir. API `/api/payroll` memverifikasi sesi Itemku terlebih dahulu, lalu akses payroll dilakukan server-side dengan `SUPABASE_SERVICE_ROLE_KEY`.

**Jangan pernah** menaruh `SUPABASE_SERVICE_ROLE_KEY` di `NEXT_PUBLIC_*`, source code, GitHub, atau mengirimkannya ke orang lain.

## Database
Migration final: `supabase/migrations/20260901_v6_4_2_payroll.sql`.
Migration bersifat upgrade/idempotent untuk database yang sebelumnya sudah menjalankan draft V6.4.1: tabel tetap dipertahankan dan fungsi/trigger keamanan diperbarui.
