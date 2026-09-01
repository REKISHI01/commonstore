# Itemku Profit Management V6.4.2

Release ini langsung meng-upgrade source V5.2 menjadi **V6.4.2 Payroll & Profit Sharing Transparency** tanpa menghapus fitur lama.

## Tambahan V6.4.2
- Payroll Owner di menu **Keuangan → Payroll**.
- Worker memiliki menu **Gaji Saya**.
- Gaji tetap default **Rp500.000 / Worker**.
- Profit share default **15% per Worker** dari profit distributable.
- Cadangan bisnis default **25%**.
- Owner dapat membuat versi skema baru; histori lama tetap tersimpan.
- Payroll bulanan dapat **Finalized → Paid** dan snapshot finansial lama tidak dapat diubah.
- Worker hanya menerima slip miliknya melalui API aplikasi.
- Tabel payroll menggunakan RLS dan akses langsung `anon/authenticated` diblokir. Payroll API memakai **Service Role hanya di server**, setelah sesi aplikasi diverifikasi.

## Environment Vercel
Wajib tersedia:
```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` adalah rahasia server. **Jangan** memakai prefix `NEXT_PUBLIC_` dan jangan pernah menaruh nilainya di source GitHub.

## Database
Untuk database V5.2 yang sudah ada, jalankan migration:
```text
supabase/migrations/20260901_v6_4_2_payroll.sql
```

Jika migration payroll sudah berhasil dijalankan sebelumnya di Supabase, tidak perlu menjalankannya lagi.

## Verifikasi
```bash
pnpm install --frozen-lockfile
pnpm release:check
pnpm typecheck
pnpm build
```

Health endpoint:
```text
/api/health
```
Harus menunjukkan `version: 6.4.2-payroll`. Untuk fitur payroll, `payrollAdminConfigured` harus `true`.

Version: **6.4.2**
