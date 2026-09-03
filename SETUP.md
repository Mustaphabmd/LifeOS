# LifeOS setup

LifeOS currently opens without authentication and stores data only in the browser on the current device. No setup is required to run it.

The Supabase migration below is retained for a future authenticated, cross-device mode. It is not used by the current password-free application because exposing personal tables through the public anon role would allow anyone to read or change the data.

## Optional future Supabase setup

1. Create a Supabase project and keep its region close to Morocco when possible.
2. Open **SQL Editor**, paste `supabase/migrations/202609030001_initial_lifeos_schema.sql`, and run it once. If you use the Supabase CLI instead, link the project and run `supabase db push`.
3. In **Authentication → Users**, create your email/password user.
4. In **Authentication → Providers → Email**, turn off new-user signups after your account exists. The application intentionally has no public sign-up form.
5. In **Project Settings → API**, copy the project URL and the publishable key (or legacy anon key).
6. Replace the two placeholders in `supabase/config.js`. Never use the service-role key in browser code.

The migration enables RLS, removes anonymous table privileges, grants CRUD only to authenticated users, and applies separate owner-only policies for select, insert, update, and delete on every personal-data table.

## 2. First sign-in and local-data import

Open the application, sign in, and leave the page open until the first sync completes. If the browser contains the old `lifeos_merged_v4` localStorage record, LifeOS imports it once using stable legacy IDs. The original key is not deleted. A remote `legacy_import_v1` marker prevents a second import on another device.

After a successful import, normal data lives in Supabase. Browser storage contains only the latest offline cache and a pending-sync snapshot. Pending changes retry automatically when the browser comes online.

## 3. GitHub Pages

1. Push the configured repository to GitHub with the default branch named `main`.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Push to `main` or run the **Deploy LifeOS to GitHub Pages** workflow manually.
4. Add the final Pages URL to Supabase **Authentication → URL Configuration → Redirect URLs**.

All asset and navigation URLs are relative, so the application works below `https://mustaphabmd.github.io/REPOSITORY-NAME/`. `index.html` is the entry point, and `404.html` returns unknown Pages paths to that entry point.

## Local visual/smoke test

Run a static server and open `LifeOS.html`. The application opens directly without a login screen.
