# Vercel Deploy — V6.4.2

Source ini siap dijadikan isi root repository `commonstore`.

Environment Variables yang dibutuhkan:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

Setelah push ke `main`, Vercel akan membuat deployment baru bila repository sudah terhubung. Cek `/api/health` setelah status deployment `Ready`.
