# Itemku Profit Management System V5 FINAL

V5 FINAL adalah tahap stabilisasi dan production-readiness setelah rangkaian V4.0–V4.4. Seluruh fitur bisnis lama dipertahankan; fokus release ini adalah memastikan aplikasi lebih aman, recoverable, dan mudah diaudit sebelum dipakai sebagai sistem utama.

## Yang baru di V5 FINAL

### 1. Final Control Center
Menu **Pengaturan → Final Control Center** menjalankan audit kesiapan aplikasi dan memberi Readiness Score 0–100.

Pemeriksaan mencakup:
- Cloud session, koneksi, realtime, dan pending sync.
- SKU/invoice duplikat.
- Stok negatif.
- Snapshot order tidak valid.
- Referensi produk historis.
- Produk/channel aktif.
- Margin negatif.
- Supplier, Worker, dispute, PO, dan settlement.
- Hak akses finansial Worker.
- Backup terakhir.
- Inventory ledger.

Status akhir:
- **Siap Go-Live**
- **Hampir Siap**
- **Perlu Perbaikan**

### 2. Backup readiness
Setiap backup V5 mencatat `itemkuLastBackupAt`. Final Control Center akan memperingatkan jika backup terlalu lama atau belum pernah dibuat di perangkat tersebut.

Nama backup final:
`itemku-v5-final-backup-<timestamp>.json`

### 3. Production error recovery
Ditambahkan:
- `app/error.tsx`
- `app/loading.tsx`
- `app/not-found.tsx`

Error UI tidak menghapus localStorage. Pengguna diarahkan ke Health Center/backup jika error berulang.

### 4. API hardening
Mutation API cloud sekarang memeriksa:
- same-origin / `sec-fetch-site`
- `Content-Type: application/json`
- batas ukuran payload
- batas jumlah record sync

Proteksi ini adalah lapisan tambahan; RLS/RPC Supabase tetap menjadi kontrol otorisasi utama.

### 5. Security headers
`next.config.mjs` sekarang mengaktifkan:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: same-origin`
- restrictive `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Robots-Tag: noindex, nofollow, noarchive`
- `poweredByHeader: false`

API juga memakai `Cache-Control: no-store`.

### 6. Private dashboard indexing
Ditambahkan `app/robots.ts` dan metadata `robots` no-index. Dashboard operasional tidak ditujukan untuk mesin pencari.

### 7. Health endpoint
`GET /api/health`

Mengembalikan status aplikasi minimal, versi, status konfigurasi cloud, dan waktu server. Endpoint tidak mengembalikan secret atau token.

### 8. TypeScript build policy
`ignoreBuildErrors` dihapus dari `next.config.mjs`. Production build seharusnya gagal jika TypeScript menemukan error, sehingga error tidak disembunyikan saat deploy.

## Upgrade V4.4 → V5 FINAL

1. Backup V4.4 terlebih dahulu.
2. Ganti source dengan V5 FINAL.
3. Jika memakai Supabase, gunakan `supabase/schema-v5-final.sql` sebagai schema referensi final. Schema ini sama fondasinya dengan V4.4 dan tidak memerlukan migrasi tabel baru khusus V5.
4. Copy `.env.example` ke `.env.local` dan isi Supabase URL + anon key.
5. Jalankan:

```bash
pnpm install
pnpm build
pnpm start
```

6. Buka **Final Control Center**.
7. Selesaikan semua pemeriksaan berstatus **Kritis**.
8. Buat **Backup V5 FINAL**.
9. Uji alur Owner → Worker → Selesai, lalu uji Refund + Restore Stock.
10. Uji offline → online dan pastikan Pending Sync kembali 0.

## Go-live recommendation

Sebelum digunakan untuk transaksi nyata, targetkan:
- Final Readiness ≥ 85%
- 0 pemeriksaan Kritis
- Pending Sync = 0
- Backup ≤ 7 hari (idealnya pada hari go-live)
- Production build berhasil
- Supabase RLS/RPC sudah diuji dengan akun Owner dan Worker terpisah

## Catatan

Readiness Score adalah checklist teknis/operasional berbasis data aplikasi. Skor ini membantu pemeriksaan go-live tetapi bukan pengganti backup eksternal, monitoring hosting, atau audit keamanan profesional untuk deployment berskala besar.
