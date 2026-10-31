# CodeInsta

Private systems-learning reels from Claude and GPT. Next.js 15, React, TypeScript, Tailwind and Supabase.

Use Node.js 22.12+ and npm. Run `npm ci`, then `npm run dev`. Copy `.env.example` to `.env.local` and supply values for the later Supabase integration. The scaffold and schema tests need no credentials.

- `npm run build`: production build
- `npm run lint`: ESLint
- `npm test`: Vitest contract tests
- `npm run agent -- <command>` / `npm run seed`: Claude-owned scripts, available after that implementation lands

See `COORDINATION.md` for ownership and `docs/superpowers/specs/2026-10-31-codeinsta-design.md` for the accepted design. The current page is a scaffold placeholder; authentication, feed/player and PWA are subsequent work.
