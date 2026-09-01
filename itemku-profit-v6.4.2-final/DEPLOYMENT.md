# Deployment Itemku Profit V6.4.2 — Vercel + Supabase

## Upgrade dari deployment lama
1. Jangan hapus project Supabase atau data lama.
2. Pastikan migration payroll sudah berhasil di Supabase. Jika belum, jalankan `supabase/migrations/20260901_v6_4_2_payroll.sql`.
3. Upload/push seluruh source V6.4.2 ini ke branch production GitHub.
4. Di Vercel Project Settings → Environment Variables, pastikan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Redeploy Production.
6. Buka `/api/health`. Target: `ok: true`, `version: 6.4.2-payroll`, `cloudConfigured: true`, `payrollAdminConfigured: true`.
7. Login Owner → **Keuangan → Payroll**. Pastikan preview bulanan muncul.
8. Login Worker → **Gaji Saya**. Worker hanya boleh melihat slip miliknya.

## Penting tentang Service Role
`SUPABASE_SERVICE_ROLE_KEY` hanya digunakan di route server payroll. Nilai ini tidak dikirim ke browser. Jangan menaruh key ini di file client, screenshot publik, atau variable dengan prefix `NEXT_PUBLIC_`.

## Smoke test sebelum transaksi nyata
- Owner dan Worker bisa login.
- Order lama tetap muncul.
- Produk, stok, expense, settlement, dan audit tetap terbaca.
- Owner membuka Payroll tanpa `permission denied`.
- Preview payroll hanya menghitung order berstatus `Selesai`.
- Finalisasi payroll membuat slip Worker.
- Worker hanya melihat slip sendiri.
- Ubah skema sesudah finalisasi tidak mengubah slip lama.
- Mark Paid hanya mengubah status payroll menjadi `paid`.

## Rollback source
Jika deployment baru bermasalah, rollback deployment di Vercel. Jangan hapus tabel payroll atau database Supabase. Data payroll yang sudah finalized dirancang sebagai snapshot historis.
