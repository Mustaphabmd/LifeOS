# LifeOS

LifeOS is a static, mobile-first personal dashboard backed by Supabase Auth and Postgres. The approved interface remains in `LifeOS.html`; `index.html` is the GitHub Pages entry point.

## Run locally

```bash
npm install
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/`. Complete [SETUP.md](SETUP.md) first to sign in against Supabase. For the local-only UI regression mode, use `http://127.0.0.1:4173/LifeOS.html?visual-test=1`.

## Test

```bash
npm test
```

The test suite statically checks the schema/security contract and drives the current UI in headless Chrome, including expense, income, preset, cross-midnight sleep, account, savings goal, motorcycle/oil, category, profile, delete, mobile-layout, auth-redirect, and console-error checks.

See [DATA_MAPPING.md](DATA_MAPPING.md) for the UI-to-database inventory and [SETUP.md](SETUP.md) for Supabase and GitHub Pages deployment.
