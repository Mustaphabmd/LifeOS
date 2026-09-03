(function () {
  'use strict';

  const CACHE_KEY = 'lifeos_device_cache_v1';
  const OLD_CACHE_KEY = 'lifeos_supabase_cache_v1';
  const OLD_PENDING_KEY = 'lifeos_pending_sync_v1';
  const clone = value => JSON.parse(JSON.stringify(value));

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  function write(snapshot) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); }
    catch (error) {
      window.dispatchEvent(new CustomEvent('lifeos-sync-error', { detail: error }));
    }
  }

  async function init(defaultSnapshot, legacySnapshot) {
    const snapshot = read(OLD_PENDING_KEY) || read(CACHE_KEY) || read(OLD_CACHE_KEY) || legacySnapshot || defaultSnapshot;
    write(snapshot);
    localStorage.removeItem(OLD_PENDING_KEY);
    return clone(snapshot);
  }

  function scheduleSync(snapshot) {
    write(clone(snapshot));
  }

  window.LifeOSData = Object.freeze({ init, scheduleSync });
})();
