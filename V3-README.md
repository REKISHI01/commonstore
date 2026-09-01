# Ringkasan upgrade V3

Semua ide V2.2 + V2.3 sudah digabung ke V3.0. Lihat `README.md` untuk daftar fitur dan setup lengkap.

File penting:
- `supabase/schema-v3.sql` — schema, RLS, realtime, permission, invoice, dan RPC atomic.
- `app/page.tsx` — Owner dashboard.
- `app/worker/page.tsx` — panel Worker mobile.
- `app/api/cloud/*` — auth cookie + server proxy Supabase.
- `lib/itemku.ts` — model data, kalkulasi, migrasi lokal, analytics.
- `public/sw.js` + `app/manifest.ts` — PWA.
