# Bhaskar's Toolkit

A collection of personal productivity tools — free, private, and self-hosted.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deployed on Cloudflare](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Pages-orange)](https://pages.cloudflare.com)
[![Version](https://img.shields.io/badge/version-1.0.0-green)](#)

## Apps

| App | Status | Description |
|-----|--------|-------------|
| [Vibe Planner](./vibe-planner/) | ✅ Live | Kanban board, timeline, and list view with drag & drop, time tracking, and categories |
| Focus Timer | 🔜 Coming Soon | Pomodoro sessions with break reminders and daily streaks |
| Daily Journal | 🔜 Coming Soon | Quick reflections with mood tracking and weekly summaries |
| Habit Tracker | 🔜 Coming Soon | Streak tracking and consistency visualization |

## Tech Stack

- **Frontend** — Pure vanilla JavaScript, zero dependencies, zero build step
- **Auth & Database** — [Supabase](https://supabase.com) (free tier) with Row Level Security
- **Hosting** — [Cloudflare Pages](https://pages.cloudflare.com) (free tier)
- **Version Control** — Git + GitHub

## Project Structure

```
bhaskars-toolkit/
├── index.html                        ← Homepage (app launcher)
├── vibe-planner/
│   └── index.html                    ← Vibe Planner (with auth + sync)
├── docs/
│   └── SUPABASE_SETUP.md            ← Database setup guide
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md     ← PR template
├── .editorconfig                     ← Editor consistency rules
├── .gitignore                        ← Git ignore rules
├── CHANGELOG.md                      ← Version history
├── CONTRIBUTING.md                   ← Contribution guidelines
├── LICENSE                           ← MIT License
├── VERSION                           ← Current version
└── README.md                         ← This file
```

## Quick Start

### Local Development

```bash
git clone https://github.com/BhaskarMantralaHub/vibe-planner.git
cd vibe-planner
# Open index.html in your browser — that's it!
```

### Deploy to Cloudflare Pages

1. Push to GitHub
2. Go to [Cloudflare Pages](https://dash.cloudflare.com) → Workers & Pages → Create
3. Connect to Git → select this repo
4. Leave build settings blank → Deploy

### Set Up Supabase (for auth + sync)

See [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md) for the full guide.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Browser    │────▶│  Cloudflare CDN  │     │   Supabase   │
│  (any device)│◀────│  (static files)  │     │  (auth + db) │
└──────┬───────┘     └──────────────────┘     └──────┬───────┘
       │                                              │
       │         HTTPS (auth + data sync)             │
       └──────────────────────────────────────────────┘
```

- **Static files** served from Cloudflare's global edge network (300+ locations)
- **Authentication** handled by Supabase Auth (email/password)
- **Data storage** in Supabase PostgreSQL with Row Level Security
- **Each user** sees only their own data — enforced at the database level

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## License

[MIT](./LICENSE) © 2026 Bhaskar Mantrala
