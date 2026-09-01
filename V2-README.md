# Itemku Profit Management System V2

## Fitur baru
- Produk: Game, Kategori, SKU, Supplier, ID unik, low-stock, restock.
- Order: Username/User ID universal, status Baru → Diproses → Selesai, Cancel/Refund.
- Snapshot transaksi: harga, modal, fee, biaya, omzet, profit disimpan saat order dibuat.
- Refund/Cancel bisa mengembalikan stok secara eksplisit.
- Worker assignment dan timestamp proses/selesai.
- Audit log otomatis.
- Riset Peluang Jualan dengan skor sederhana dari margin, sinyal terjual, dan listing.
- Backup JSON, restore JSON, export order CSV.
- Migrasi otomatis data V1 yang masih memakai itemkuProducts/itemkuOrders.
- Supabase starter schema di `supabase/schema.sql`.

## Menjalankan lokal
```bash
pnpm install
pnpm dev
```

## Catatan keamanan
Versi lokal masih memakai localStorage untuk kompatibilitas dengan V1. Password worker tidak aman untuk deployment publik. Untuk production, pindahkan login ke Supabase Auth dan data ke Postgres menggunakan starter schema yang disediakan.
