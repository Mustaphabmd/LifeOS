# LifeOS

LifeOS is a static, mobile-first personal dashboard. It opens directly without authentication and stores its data on the current device. The approved interface remains in `LifeOS.html`; `index.html` is the GitHub Pages entry point.

## Run locally

```bash
npm install
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/`. No account or password is required.

## Test

```bash
npm test
```

The test suite checks the retained optional database schema and drives the current UI in headless Chrome, including expense, income, preset, cross-midnight sleep, account, savings goal, motorcycle/oil, category, profile, delete, mobile-layout, persistence, and console-error checks.

See [DATA_MAPPING.md](DATA_MAPPING.md) for the UI-to-database inventory and [SETUP.md](SETUP.md) for Supabase and GitHub Pages deployment.
