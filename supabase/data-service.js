(function () {
  'use strict';

  const TIMEZONE = 'Africa/Casablanca';
  const CACHE_KEY = 'lifeos_supabase_cache_v1';
  const PENDING_KEY = 'lifeos_pending_sync_v1';
  const SNAPSHOT_KEY = 'app_snapshot_v1';
  const IMPORT_KEY = 'legacy_import_v1';
  const config = window.LIFEOS_SUPABASE_CONFIG || {};
  let client = null;
  let user = null;
  let timer = null;
  let syncing = null;
  let latestSnapshot = null;
  let previewMode = false;

  const clone = value => JSON.parse(JSON.stringify(value));
  const sanitizeJson = (value, depth = 0) => {
    if (depth > 12 || value == null || typeof value === 'boolean') return value == null ? null : value;
    if (typeof value === 'string') return value.slice(0, 10000);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (Array.isArray(value)) return value.slice(0, 10000).map(item => sanitizeJson(item, depth + 1));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 500).map(([key, item]) => [String(key).slice(0, 200), sanitizeJson(item, depth + 1)]));
    return null;
  };
  const text = (value, max = 2000) => String(value == null ? '' : value).trim().slice(0, max);
  const nullableText = (value, max) => text(value, max) || null;
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : new Date().toISOString().slice(0, 10);
  const legacyId = (prefix, value) => `${prefix}:${text(value == null ? crypto.randomUUID() : value, 300)}`;
  const safeUrl = value => {
    const candidate = text(value, 2048);
    if (!candidate) return null;
    try {
      const parsed = new URL(candidate);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch (_) {
      return null;
    }
  };
  const isConfigured = () => {
    const key = String(config.publishableKey || config.anonKey || '');
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(config.url || '')) &&
      key.length > 20 && !key.includes('YOUR_') && !key.startsWith('sb_secret_') && !key.toLowerCase().includes('service_role');
  };
  const isLocalVisualTest = () => {
    const local = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    return local && new URLSearchParams(location.search).has('visual-test');
  };
  const redirect = page => location.replace(new URL(page, location.href).href);
  const dispatchSyncError = error => window.dispatchEvent(new CustomEvent('lifeos-sync-error', { detail: error }));

  function addDays(value, days) {
    const result = new Date(`${date(value)}T12:00:00Z`);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
  }

  // Convert a wall-clock time in Africa/Casablanca into an exact UTC timestamp.
  function zonedIso(day, clock) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(clock || ''));
    if (!match) return new Date(`${date(day)}T00:00:00Z`).toISOString();
    const [year, month, dayOfMonth] = date(day).split('-').map(Number);
    const target = Date.UTC(year, month - 1, dayOfMonth, Number(match[1]), Number(match[2]));
    let guess = target;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    for (let index = 0; index < 3; index += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
      const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
      guess += target - observed;
    }
    return new Date(guess).toISOString();
  }

  async function currentSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    return data.session || null;
  }

  function saveCache(snapshot) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch (_) {}
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; }
  }

  async function querySetting(key) {
    const { data, error } = await client.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data?.value || null;
  }

  async function upsertSetting(key, value) {
    const { error } = await client.from('settings').upsert(
      { user_id: user.id, key, value },
      { onConflict: 'user_id,key' }
    );
    if (error) throw error;
  }

  async function syncCollection(table, rows) {
    const cleanRows = rows.map(row => ({ ...row, user_id: user.id }));
    for (let start = 0; start < cleanRows.length; start += 100) {
      const { error } = await client.from(table).upsert(cleanRows.slice(start, start + 100), { onConflict: 'user_id,legacy_id' });
      if (error) throw error;
    }
    const { data: existing, error: selectError } = await client.from(table).select('id,legacy_id');
    if (selectError) throw selectError;
    const wanted = new Set(cleanRows.map(row => row.legacy_id));
    const stale = (existing || []).filter(row => !wanted.has(row.legacy_id)).map(row => row.id);
    for (let start = 0; start < stale.length; start += 100) {
      const { error } = await client.from(table).delete().in('id', stale.slice(start, start + 100));
      if (error) throw error;
    }
  }

  function normalized(snapshot) {
    const wallet = snapshot.wallet || { cash: 0, cards: [], goals: [], transactions: [] };
    const accounts = [
      { legacy_id: 'cash:primary', parent_account_id: null, kind: 'cash', name: 'Cash', balance: number(wallet.cash), target_amount: null, logo_url: null, metadata: {} },
      ...(wallet.cards || []).map(item => ({
        legacy_id: legacyId('account', item.id),
        kind: item.type === 'Savings Account' ? 'savings' : item.type === 'Credit Card' ? 'credit_card' : 'bank',
        parent_account_id: null, name: text(item.name, 200) || 'Account', balance: number(item.balance), target_amount: null,
        logo_url: safeUrl(item.logoUrl), metadata: { parentLegacyId: item.parentAccountId || null, originalType: item.type || null }
      })),
      ...(wallet.goals || []).map(item => ({
        legacy_id: legacyId('goal', item.id), parent_account_id: null, kind: 'savings_goal', name: text(item.name, 200) || 'Savings goal',
        balance: number(item.saved), target_amount: Math.max(0, number(item.target)), logo_url: safeUrl(item.logoUrl), metadata: {}
      }))
    ];

    const categories = (snapshot.categories || []).map((item, index) => ({
      legacy_id: legacyId('category', item.id), name: text(item.name, 120) || 'Other',
      icon: nullableText(item.icon, 80), logo_url: safeUrl(item.logoUrl),
      default_price: item.defaultPrice == null || item.defaultPrice === '' ? null : number(item.defaultPrice),
      subcategories: (item.subcategories || []).map(sub => ({
        name: text(sub.name, 120), price: sub.price == null || sub.price === '' ? null : number(sub.price), logoUrl: safeUrl(sub.logoUrl)
      })).filter(sub => sub.name), sort_order: index
    }));

    const companies = (snapshot.companies || []).map(item => ({
      legacy_id: legacyId('company', item.id), kind: 'company', name: text(item.name, 200) || 'Company',
      logo_url: safeUrl(item.logoUrl), notes: null, metadata: {}
    }));
    const receiverNames = new Set(['Myself', 'Girlfriend', 'Family', 'Charity']);
    (snapshot.expenses || []).forEach(item => { if (item.receiver) receiverNames.add(text(item.receiver, 200)); });
    const people = [...companies, ...[...receiverNames].filter(Boolean).map(name => ({
      legacy_id: legacyId('receiver', name.toLowerCase()),
      kind: name === 'Myself' ? 'personal' : name === 'Girlfriend' ? 'girlfriend' : name === 'Family' ? 'family' : 'receiver',
      name, logo_url: null, notes: null, metadata: {}
    }))];

    const presets = (snapshot.templates || []).map((item, index) => ({
      legacy_id: legacyId('preset', item.id), category_id: null, category_name: text(item.category, 120) || 'Other',
      name: text(item.name, 160) || 'Preset', price: Math.max(0, number(item.price)), logo_url: safeUrl(item.logoUrl),
      details: nullableText(item.details, 1000), sort_order: index
    }));

    const expenseTransactions = (snapshot.expenses || []).map(item => ({
      legacy_id: legacyId('expense', item.id), kind: 'expense', account_id: null, destination_account_id: null,
      category_id: null, person_id: null, amount: Math.abs(number(item.amount)), transaction_date: date(item.date),
      category_name: nullableText(item.category, 120), receiver_name: nullableText(item.receiver, 160), source_name: null,
      description: nullableText(item.details || item.sub, 500), note: nullableText(item.note, 2000), logo_url: safeUrl(item.logoUrl),
      metadata: { sub: item.sub || null, templateId: item.templateId || null, motoEntryId: item.motoEntryId || null }
    }));
    const incomeTransactions = (snapshot.incomes || []).map(item => ({
      legacy_id: legacyId('income', item.id), kind: 'income', account_id: null, destination_account_id: null,
      category_id: null, person_id: null, amount: Math.abs(number(item.amount)), transaction_date: date(item.date),
      category_name: nullableText(item.type, 120), receiver_name: nullableText(item.destinationName, 160),
      source_name: nullableText(item.sourceName, 200), description: nullableText(item.type, 500),
      note: nullableText(item.note, 2000), logo_url: safeUrl(item.sourceLogo),
      metadata: { sourceType: item.sourceType || null, sourceId: item.sourceId || null, destinationId: item.destinationId || null }
    }));
    const walletTransactions = (wallet.transactions || []).map(item => ({
      legacy_id: legacyId('wallet', item.id),
      kind: item.type === 'cash' ? 'cash_adjustment' : item.type === 'goal' ? 'goal_contribution' : item.type === 'income' ? 'account_event' : 'account_event',
      account_id: null, destination_account_id: null, category_id: null, person_id: null,
      amount: number(item.amount), transaction_date: date(item.date), category_name: nullableText(item.type, 120),
      receiver_name: null, source_name: null, description: nullableText(item.label, 500), note: null,
      logo_url: safeUrl(item.logoUrl), metadata: { accountId: item.accountId || null, incomeId: item.incomeId || null, meta: item.meta || null }
    }));

    const regularTimes = [], sleeps = [];
    (snapshot.times || []).forEach(item => {
      const duration = Math.max(1, number(item.duration, 0) || durationMinutes(item.from, item.to));
      const wakeDate = date(item.date);
      const startDate = date(item.startDate || (item.type === 'Sleep' && String(item.from) > String(item.to) ? addDays(wakeDate, -1) : wakeDate));
      const endDate = item.type === 'Sleep' ? wakeDate : (String(item.to) < String(item.from) ? addDays(startDate, 1) : startDate);
      const base = { legacy_id: legacyId('time', item.id), start_at: zonedIso(startDate, item.from), end_at: zonedIso(endDate, item.to) };
      if (item.type === 'Sleep') {
        sleeps.push({ ...base, wake_date: wakeDate, duration_minutes: duration, quality: item.quality || null,
          target_minutes: Math.max(1, number(item.targetMinutes, 480)), note: nullableText(item.note, 2000), metadata: { from: item.from, to: item.to, startDate } });
      } else {
        regularTimes.push({ ...base, person_id: null, category: text(item.type, 120) || 'Personal', entry_date: wakeDate,
          note: nullableText(item.note, 2000), metadata: { from: item.from, to: item.to, companyId: item.companyId || null, duration } });
      }
    });

    const books = (snapshot.books || []).map(item => ({
      legacy_id: legacyId('book', item.id), title: text(item.title, 500) || 'Untitled', author: nullableText(item.author, 300),
      cover_url: safeUrl(item.coverUrl), total_pages: item.totalPages ? Math.max(1, Math.trunc(number(item.totalPages))) : null,
      current_page: Math.max(0, Math.trunc(number(item.currentPage))), status: ['to_read','reading','finished','paused'].includes(item.status) ? item.status : 'to_read',
      started_on: item.startedOn || null, finished_on: item.finishedOn || null, notes: nullableText(item.notes, 5000)
    }));

    return { accounts, categories, people, presets, transactions: [...expenseTransactions, ...incomeTransactions, ...walletTransactions], regularTimes, sleeps, books };
  }

  function durationMinutes(from, to) {
    if (!from || !to) return 0;
    const [fromHour, fromMinute] = String(from).split(':').map(Number);
    const [toHour, toMinute] = String(to).split(':').map(Number);
    let result = toHour * 60 + toMinute - (fromHour * 60 + fromMinute);
    if (result <= 0) result += 1440;
    return result;
  }

  async function performSync(snapshot, importedLegacy) {
    if (!navigator.onLine) throw new Error('You are offline. Changes are queued and will sync automatically.');
    if (!user) {
      const session = await currentSession();
      if (!session) throw new Error('Your session has expired. Please sign in again.');
    }
    const safeSnapshot = sanitizeJson(clone(snapshot));
    const data = normalized(safeSnapshot);
    await syncCollection('people', data.people);
    await syncCollection('accounts', data.accounts);
    await syncCollection('categories', data.categories);

    const [{ data: peopleRows, error: peopleError }, { data: accountRows, error: accountError }, { data: categoryRows, error: categoryError }] = await Promise.all([
      client.from('people').select('id,legacy_id,name'),
      client.from('accounts').select('id,legacy_id'),
      client.from('categories').select('id,legacy_id,name')
    ]);
    if (peopleError) throw peopleError;
    if (accountError) throw accountError;
    if (categoryError) throw categoryError;
    const peopleByLegacy = new Map((peopleRows || []).map(row => [row.legacy_id, row.id]));
    const accountsByLegacy = new Map((accountRows || []).map(row => [row.legacy_id, row.id]));
    const categoriesByName = new Map((categoryRows || []).map(row => [row.name, row.id]));

    data.accounts.forEach(row => {
      row.parent_account_id = row.metadata.parentLegacyId ? (accountsByLegacy.get(legacyId('account', row.metadata.parentLegacyId)) || null) : null;
    });
    await syncCollection('accounts', data.accounts);
    data.presets.forEach(row => { row.category_id = categoriesByName.get(row.category_name) || null; });
    data.transactions.forEach(row => {
      row.category_id = row.category_name ? (categoriesByName.get(row.category_name) || null) : null;
      if (row.receiver_name) row.person_id = peopleByLegacy.get(legacyId('receiver', row.receiver_name.toLowerCase())) || null;
      const destination = row.metadata.destinationId;
      if (destination) row.destination_account_id = destination === 'cash' ? (accountsByLegacy.get('cash:primary') || null) : (accountsByLegacy.get(legacyId('account', destination)) || null);
      const account = row.metadata.accountId;
      if (account) row.account_id = account === 'cash' ? (accountsByLegacy.get('cash:primary') || null) : (accountsByLegacy.get(legacyId('account', account)) || null);
    });
    data.regularTimes.forEach(row => {
      if (row.metadata.companyId) row.person_id = peopleByLegacy.get(legacyId('company', row.metadata.companyId)) || null;
    });
    await syncCollection('quick_expense_presets', data.presets);
    await syncCollection('transactions', data.transactions);
    await syncCollection('time_entries', data.regularTimes);
    await syncCollection('sleep_entries', data.sleeps);
    await syncCollection('books', data.books);

    const profile = safeSnapshot.profile || {};
    const { error: profileError } = await client.from('profiles').upsert({
      user_id: user.id, status: nullableText(profile.status, 500), display_name: nullableText(profile.name, 200),
      avatar_url: safeUrl(profile.avatarUrl), timezone: TIMEZONE, currency: 'MAD'
    }, { onConflict: 'user_id' });
    if (profileError) throw profileError;

    const vehicle = safeSnapshot.moto || {};
    const { data: vehicleRow, error: vehicleError } = await client.from('vehicles').upsert({
      user_id: user.id, legacy_id: 'vehicle:primary-motorcycle', name: text(vehicle.name, 200) || 'Motorcycle', kind: 'motorcycle',
      image_url: safeUrl(vehicle.imageUrl), current_km: Math.max(0, number(vehicle.currentKm)),
      oil_interval_km: Math.max(1, number(vehicle.oilMaxKm, 1500)), metadata: { lastOilChange: vehicle.lastOilChange || null }
    }, { onConflict: 'user_id,legacy_id' }).select('id').single();
    if (vehicleError) throw vehicleError;
    const vehicleRecords = (safeSnapshot.motoEntries || []).map(item => ({
      legacy_id: legacyId('vehicle-record', item.id), vehicle_id: vehicleRow.id,
      kind: item.type === 'Fuel' ? 'fuel' : item.type === 'Oil' ? 'oil_change' : item.type === 'Fixes' ? 'repair' : 'other',
      amount: Math.abs(number(item.amount)), record_date: date(item.date), odometer_km: item.currentKm == null ? null : number(item.currentKm),
      oil_changed_at_km: item.changedAtKm == null ? null : number(item.changedAtKm), oil_interval_km: item.maxKm == null ? null : number(item.maxKm),
      note: nullableText(item.note, 2000), metadata: { oilMode: item.oilMode || null }
    }));
    await syncCollection('vehicle_records', vehicleRecords);

    await upsertSetting(SNAPSHOT_KEY, safeSnapshot);
    await upsertSetting(IMPORT_KEY, { complete: true, importedLegacy: Boolean(importedLegacy), completedAt: new Date().toISOString() });
    localStorage.removeItem(PENDING_KEY);
    saveCache(safeSnapshot);
    return safeSnapshot;
  }

  async function syncNow(snapshot, importedLegacy = false) {
    latestSnapshot = clone(snapshot);
    if (syncing) await syncing;
    syncing = performSync(latestSnapshot, importedLegacy).finally(() => { syncing = null; });
    return syncing;
  }

  function scheduleSync(snapshot) {
    latestSnapshot = clone(snapshot);
    saveCache(latestSnapshot);
    if (previewMode) return;
    localStorage.setItem(PENDING_KEY, JSON.stringify(latestSnapshot));
    clearTimeout(timer);
    timer = setTimeout(() => {
      syncNow(latestSnapshot).catch(dispatchSyncError);
    }, 350);
  }

  async function flushPending() {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) {}
    if (pending) await syncNow(pending);
  }

  async function init(defaultSnapshot, legacySnapshot) {
    if (isLocalVisualTest()) {
      previewMode = true;
      return clone(legacySnapshot || defaultSnapshot);
    }
    if (!isConfigured() || !window.supabase?.createClient) {
      redirect('./auth.html?setup=1');
      return new Promise(() => {});
    }
    client = window.supabase.createClient(config.url, config.publishableKey || config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const session = await currentSession();
    if (!session) {
      redirect('./auth.html');
      return new Promise(() => {});
    }

    try {
      const remoteSnapshot = await querySetting(SNAPSHOT_KEY);
      if (remoteSnapshot) {
        window.addEventListener('online', () => flushPending().catch(dispatchSyncError));
        let pending = null;
        try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) {}
        if (pending) {
          await syncNow(pending);
          return clone(pending);
        }
        saveCache(remoteSnapshot);
        return clone(remoteSnapshot);
      }
      const imported = await querySetting(IMPORT_KEY);
      const initial = clone((!imported && legacySnapshot) || readCache() || defaultSnapshot);
      await syncNow(initial, Boolean(!imported && legacySnapshot));
      window.addEventListener('online', () => flushPending().catch(dispatchSyncError));
      return initial;
    } catch (error) {
      const cached = readCache() || legacySnapshot;
      if (cached) {
        localStorage.setItem(PENDING_KEY, JSON.stringify(cached));
        window.addEventListener('online', () => flushPending().catch(dispatchSyncError));
        dispatchSyncError(error);
        return clone(cached);
      }
      throw error;
    }
  }

  async function signOut() {
    if (client) await client.auth.signOut();
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(PENDING_KEY);
    redirect('./auth.html');
  }

  window.LifeOSData = Object.freeze({ init, scheduleSync, syncNow, flushPending, signOut, isConfigured });
})();
