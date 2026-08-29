# Deployment V5.2

## Vercel + Supabase

1. Buat Backup V5/V5.2 dari deployment lama.
2. Push source V5.2 ke repository Git.
3. Import/deploy repository di Vercel.
4. Tambahkan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Untuk instalasi baru gunakan `supabase/schema-v5.2.sql`. Upgrade dari V5.0 tidak membutuhkan tabel bisnis baru.
6. Jalankan build dan buka `/api/health`; pastikan `ok: true` dan versi `5.2.0-automation`.
7. Login Owner lalu buka **Observability Center**; cek latency, cloud/realtime, dan Pending Sync.
8. Buka **Recovery Center** dan buat checkpoint pertama.
9. Uji Worker dari browser/perangkat terpisah.
10. Buka **Final Control Center** dan targetkan 0 isu Kritis.
11. Download Backup V5.2 eksternal setelah data terverifikasi.

## Node server

```bash
pnpm install
pnpm release:check
pnpm typecheck
pnpm build
pnpm start
```

Gunakan HTTPS reverse proxy untuk deployment publik.

## Smoke test wajib

- `/api/health` mengembalikan `ok: true`.
- Owner login/logout cloud.
- Buat produk dan Quick Order percobaan.
- Worker: Baru → Diproses → Selesai.
- Uji Refund + Restore Stock.
- Putuskan internet lalu sambungkan kembali; Pending Sync harus kembali 0.
- Buat checkpoint Recovery Vault.
- Preview backup tanpa menerapkan restore.
- Export Audit & Evidence + checksum.
- Final Control Center tidak memiliki isu Kritis.
- Download backup eksternal V5.2.

## Rollback

Jika deployment V5.2 bermasalah:
1. Jangan hapus database Supabase.
2. Gunakan checkpoint hanya jika masalah berasal dari data lokal dan checkpoint dipastikan sehat.
3. Untuk rollback source, deploy source V5.0 FINAL tanpa otomatis merestore data.
4. Restore JSON hanya ketika data memang rusak/terhapus.
5. Periksa Audit Log, Inventory Ledger, Settlement, dan Pending Sync sebelum melanjutkan transaksi.


## V5.2 smoke test tambahan
- Jalankan Automation Runner dan pastikan perubahan sensitif masuk Approval Center, bukan langsung mengubah produk.
- Setujui satu approval dummy lalu Terapkan; pastikan perubahan produk tersimpan dan cloud delta sync tetap normal.
- Buat Scheduled Report lalu Generate sekarang.
- Jalankan Safe Cleanup dan pastikan order/produk/ledger tidak berubah.
- Buat backup V5.2 dan preview melalui Recovery Center sebelum deploy final.
