# Vercel deployment

This package is flattened so `package.json` is at the project root.

## Recommended Vercel settings

- Framework Preset: Next.js
- Root Directory: `.`
- Install Command: leave default (Vercel detects `pnpm-lock.yaml`)
- Build Command: `pnpm build`
- Output Directory: leave empty/default for Next.js

## Environment variables

Copy the values described in `.env.example` into Vercel Project Settings > Environment Variables.
Do not commit service-role or other server secrets to public source control.

## Before deploy

```bash
pnpm install
pnpm release:check
pnpm typecheck
pnpm build
```

If deploying the older nested archive instead, set Root Directory to `itemku-profit-v5.2`.
