# Viber's Toolkit

A personal productivity suite — fast, private, and self-hosted.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deployed on Cloudflare](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Pages-orange)](https://pages.cloudflare.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

## Tools

| Tool | Status | Description |
|------|--------|-------------|
| Vibe Planner | ✅ Live | Kanban board + timeline with drag & drop, due dates, notes, categories |
| Focus Timer | 🔜 Coming Soon | Pomodoro sessions with break reminders |
| Daily Journal | 🔜 Coming Soon | Quick reflections with mood tracking |
| Habit Tracker | 🔜 Coming Soon | Streak tracking and consistency visualization |

## Tech Stack

- **Framework** — [Next.js 15](https://nextjs.org) (App Router, static export)
- **Language** — TypeScript
- **Styling** — [Tailwind CSS v4](https://tailwindcss.com)
- **State** — [Zustand](https://zustand-demo.pmnd.rs)
- **Drag & Drop** — [@dnd-kit](https://dndkit.com)
- **Auth & Database** — [Supabase](https://supabase.com) (PostgreSQL + Auth + RLS)
- **Hosting** — [Cloudflare Pages](https://pages.cloudflare.com) (static export)
- **Theme** — [next-themes](https://github.com/pacocoursey/next-themes) (dark/light)

## Project Structure

```
vibers-toolkit/
├── app/
│   ├── layout.tsx                    # Root layout: theme, shell, metadata
│   ├── page.tsx                      # Homepage (redirects to vibe-planner)
│   ├── globals.css                   # Tailwind + dark/light theme variables
│   ├── providers.tsx                 # ThemeProvider
│   └── (tools)/
│       └── vibe-planner/
│           ├── page.tsx              # Main vibe planner page
│           ├── components/           # Board, Timeline, VibeCard, Header, etc.
│           └── lib/                  # Constants, utils
├── components/                       # Shared: Shell, AuthGate, HamburgerMenu, etc.
├── lib/                              # Supabase client, auth helpers, storage
├── stores/                           # Zustand stores (auth, vibes)
├── types/                            # TypeScript types
├── tests/                            # Playwright E2E tests
├── public/                           # Static assets (hero image)
└── docs/                             # Supabase setup guide
```

## Quick Start

### Local Development

```bash
git clone https://github.com/BhaskarMantralaHub/vibe-planner.git
cd vibe-planner
npm install
cp .env.example .env.local  # Add your Supabase credentials
npm run dev                  # http://localhost:3000
```

### Build for Production

```bash
npm run build    # Generates static export in out/
npx serve out    # Preview locally
```

### Deploy to Cloudflare Pages

1. Push to GitHub `main` branch
2. Cloudflare Pages auto-deploys with:
   - **Build command**: `npm run build`
   - **Output directory**: `out`
3. Add environment variables (see [Supabase Setup](./docs/SUPABASE_SETUP.md))

### Set Up Supabase

See [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md) for the full database + auth setup guide.

## Features

### Vibe Planner
- **Board view** — 4-column kanban (Spark → In Progress → Scheduled → Done)
- **Timeline view** — Weekly calendar with drag-to-schedule
- **Due dates** — Color-coded (red overdue, orange soon, green future)
- **Notes** — Add URLs, justifications, context to any vibe
- **Categories** — Work, Personal, Creative, Learning, Health with filter pills
- **Soft delete** — Recently Deleted with restore, synced across devices
- **Mobile** — Bottom sheet menus, swipe to change status, long-press for options
- **Desktop** — Drag & drop between columns, right-click menus, keyboard shortcuts
- **Quotes** — Daily motivational quotes in English and Telugu

### Auth & Security
- Email/password login with Supabase Auth
- Signup with max user limit (default: 10)
- Forgot password / reset password flow
- Row Level Security — each user sees only their own data
- Rate limiting on auth attempts
- Sanitized error messages (no information leaks)

## Running Tests

```bash
# Start dev server first
npm run dev

# In another terminal
TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass node tests/smoke.mjs
TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass node tests/e2e.mjs
```

## License

[MIT](./LICENSE)
