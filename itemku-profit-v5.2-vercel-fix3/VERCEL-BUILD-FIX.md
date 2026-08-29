# Vercel Build-Safe Fix

Paket ini dibuat untuk mengurangi penyebab umum `pnpm run build exited with 1` pada Vercel.

Perubahan:
- Build menggunakan `next build --webpack` untuk menghindari masalah Turbopack yang mungkin muncul pada dependency/CSS tertentu.
- Komponen UI lama yang tidak dipakai (`components/ui/chart.tsx`, button, card) dihapus agar TypeScript tidak memeriksa kode mati.
- Import `shadcn/tailwind.css` yang tidak dipakai dihapus dari `app/globals.css`.
- Node engine ditetapkan `>=20.9.0 <25`.
- Package manager ditetapkan `pnpm@10.17.1`.

Vercel settings:
- Framework Preset: Next.js
- Root Directory: .
- Build Command: biarkan default atau `pnpm run build`
- Output Directory: kosong/default
- Install Command: default

Environment variables untuk cloud:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

Jika build masih gagal, buka Deployment > Build Logs dan kirim bagian mulai dari `Failed to compile` / `Build error occurred` sampai baris sebelum `ELIFECYCLE` atau `Command \"pnpm run build\" exited with 1`.
