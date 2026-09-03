import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/202609030001_initial_lifeos_schema.sql', 'utf8');
const service = await readFile('supabase/data-service.js', 'utf8');
const app = await readFile('LifeOS.html', 'utf8');
const config = await readFile('supabase/config.js', 'utf8');
const tables = ['profiles','people','accounts','categories','quick_expense_presets','transactions','time_entries','sleep_entries','books','reading_sessions','highlights','vehicles','vehicle_records','settings'];

for (const table of tables) {
  const block = migration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'))?.[1] || '';
  for (const column of ['id uuid primary key', 'user_id uuid not null', 'created_at timestamptz', 'updated_at timestamptz']) {
    if (!block.includes(column)) throw new Error(`${table} is missing required column declaration: ${column}`);
  }
}

if (!migration.includes("foreach table_name in array")) throw new Error('RLS policy loop missing');
for (const operation of ['select','insert','update','delete']) {
  if (!migration.includes(`table_name || '_${operation}_own'`)) throw new Error(`Policy generator is missing ${operation}`);
}
if (!service.includes("'Africa/Casablanca'")) throw new Error('Casablanca timezone missing');
if (!app.includes("const KEY='lifeos_merged_v4'")) throw new Error('Legacy migration key missing');
if ((app.match(/localStorage\.setItem\(KEY/g) || []).length) throw new Error('Legacy localStorage remains a primary write target');
if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(config)) throw new Error('Supabase secret key found in browser configuration');
const jwt = config.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
if (jwt) {
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  if (payload.role !== 'anon') throw new Error(`Privileged Supabase JWT found in browser configuration: ${payload.role || 'unknown role'}`);
}
console.log(JSON.stringify({ ok: true, tables: tables.length, legacyKey: 'lifeos_merged_v4' }));
