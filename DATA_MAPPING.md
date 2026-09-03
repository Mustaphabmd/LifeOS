# LifeOS data mapping

The repository contains one application file and one legacy storage key: `lifeos_merged_v4`. The current UI does not contain book, reading-session, highlight, file-upload, or editable person-profile screens; the migration includes those requested domain tables for forward compatibility, but no visible features were invented.

| Existing UI / legacy field | Supabase destination |
|---|---|
| Profile status | `profiles.status` |
| Default timezone / currency | `profiles.timezone`, `profiles.currency` |
| Job company name/logo | `people.kind`, `people.name`, `people.logo_url` |
| Cash, bank, card, savings account | `accounts.kind`, `name`, `balance`, `logo_url` |
| Savings goal name/saved/target | `accounts` with `kind = savings_goal`, `balance`, `target_amount` |
| Category name/icon/logo/default price/subcategories | `categories.name`, `icon`, `logo_url`, `default_price`, `subcategories` |
| Fixed expense name/category/price/logo/details | `quick_expense_presets.*` |
| Expense amount/date/category/receiver/details/note/logo | `transactions` with `kind = expense` |
| Income amount/date/source/type/destination/note | `transactions` with `kind = income` |
| Cash changes, account events, goal contributions | `transactions` with the corresponding `kind` |
| Time type/from/to/date/company/note | `time_entries.category`, `start_at`, `end_at`, `entry_date`, `metadata`, `note` |
| Sleep from/to/wake date/start date/duration | `sleep_entries.start_at`, `end_at`, `wake_date`, `duration_minutes` |
| Motorcycle current km/oil interval/last change | `vehicles.current_km`, `oil_interval_km`, `metadata` |
| Fuel/oil/fix amount/date/km/note | `vehicle_records.kind`, `amount`, `record_date`, kilometre columns, `note` |
| Complete UI-compatible recovery snapshot | `settings` row `app_snapshot_v1` |
| Completed legacy import marker | `settings` row `legacy_import_v1` |

Every mutable collection row also stores a `legacy_id`. Combined with `user_id`, it is unique and makes retries and the one-time import idempotent.

## Existing actions inventoried

- Create: expense, income, time/sleep record, motorcycle cost, mileage, account, savings goal, category, company, and fixed-expense preset.
- Update: profile status, current motorcycle mileage, category/company/preset configuration, account balances, cash, and savings progress.
- Delete: expense (including linked motorcycle record), time/sleep record, category, company, and preset.
- Navigation/popups: home, money tabs, time, profile/life/categories/analytics/motorcycle screens; manager, quick add, expense, income, time, account, goal, motorcycle cost, mileage, and configuration sheets.
- Calculated views: daily/monthly totals, seven-day charts, category percentages, sleep duration across midnight, account totals, reading-ready schema, motorcycle costs, and oil health.

## Browser storage after migration

| Key | Purpose |
|---|---|
| `lifeos_merged_v4` | Untouched legacy source; never deleted automatically |
| `lifeos_device_cache_v1` | Current device-local application data |
| `lifeos_supabase_cache_v1` | Previous cache imported once for compatibility |
| `lifeos_pending_sync_v1` | Previous pending snapshot imported into the device cache, then removed |
