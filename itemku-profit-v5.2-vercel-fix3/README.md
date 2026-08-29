# Itemku Profit Management System V5.2

Versi V5.2 mempertahankan seluruh fitur V5.1 dan menambahkan lapisan **Automation & Governance** agar insight dapat berubah menjadi tindakan tanpa mengorbankan kontrol Owner.

## Fitur utama terbaru
- Automation Runner
- Approval Center untuk perubahan sensitif
- Scheduled Reports (diproses saat dashboard dibuka)
- Maintenance Center dengan safe cleanup
- Backup/Recovery V5.2 termasuk data governance
- Final Control Center memeriksa approval dan report scheduler

Semua fitur V2–V5.1 sebelumnya tetap dipertahankan: order, stock, worker, supplier, PO, settlement, dispute, analytics, smart restock, price advisor, decision intelligence, recovery vault, observability, audit evidence, dan production hardening.

## Jalankan lokal
```bash
pnpm install
pnpm release:check
pnpm typecheck
pnpm build
pnpm dev
```

## Supabase
Untuk instalasi baru gunakan:
```text
supabase/schema-v5.2.sql
```
Upgrade V5.1 → V5.2 tidak membutuhkan tabel bisnis baru.

## Dokumentasi
- `V5.2-README.md` — fitur dan upgrade V5.2
- `DEPLOYMENT.md` — deployment/recovery
- README versi lama tetap disertakan sebagai histori pengembangan.

Version: **5.2.0**
