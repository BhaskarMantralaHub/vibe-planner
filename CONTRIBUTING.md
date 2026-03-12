# Contributing

Thanks for your interest in contributing to Bhaskar's Toolkit!

## Getting Started

1. Fork this repository
2. Clone your fork locally
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Test locally by opening `index.html` in a browser
6. Commit with a clear message: `git commit -m "Add: description of change"`
7. Push and open a Pull Request

## Project Structure

```
├── index.html              ← Homepage (app launcher)
├── vibe-planner/           ← Vibe Planner app
│   └── index.html
├── docs/                   ← Documentation
│   └── SUPABASE_SETUP.md
├── .github/                ← GitHub templates
│   └── PULL_REQUEST_TEMPLATE.md
├── CHANGELOG.md            ← Version history
├── CONTRIBUTING.md         ← This file
├── LICENSE                 ← MIT License
└── README.md               ← Project overview
```

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `style:` — Formatting, no logic change
- `refactor:` — Code restructuring
- `test:` — Adding tests
- `chore:` — Maintenance tasks

Example: `feat: add pomodoro timer app`

## Adding a New App

1. Create a new folder at the root (e.g., `focus-timer/`)
2. Add an `index.html` inside it
3. Add a card linking to it in the root `index.html`
4. Update `README.md` with the new app
5. Add a `CHANGELOG.md` entry

## Code Style

- Vanilla JavaScript — no frameworks or build tools
- Each app is a single self-contained HTML file
- CSS uses custom properties defined in `:root`
- Mobile-first responsive design
- Dark theme by default

## Questions?

Open an issue and we'll help out.
