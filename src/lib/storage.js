/**
 * Local persistence. Everything lives in localStorage on this device only.
 * There is no server, no account and no upload of voice data.
 */

const KEYS = {
  profiles: 'rakshacall.profiles.v1',
  calls: 'rakshacall.calls.v1',
  settings: 'rakshacall.settings.v1',
};

export const DEFAULT_SETTINGS = {
  sensitivity: 'balanced', // strict | balanced | relaxed
  asrLang: 'en-IN',
  liveWindowSec: 3,
  liveIntervalMs: 2600,
  soundAlerts: true,
  autoSaveUnsaved: false,
  autoSaveAll: false,
};

export const newId = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    // quota exceeded or private mode
    console.warn('Could not save to localStorage:', error);
    return false;
  }
}

export const loadProfiles = () => {
  const list = read(KEYS.profiles, []);
  return Array.isArray(list) ? list.filter((p) => p && p.id && p.summary) : [];
};
export const saveProfiles = (profiles) => write(KEYS.profiles, profiles);

export const loadCalls = () => {
  const list = read(KEYS.calls, []);
  return Array.isArray(list) ? list : [];
};
export const saveCalls = (calls) => write(KEYS.calls, calls.slice(0, 120));

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) });
export const saveSettings = (settings) => write(KEYS.settings, { ...DEFAULT_SETTINGS, ...settings });

export function exportAll(profiles, calls, settings) {
  return {
    app: 'RakshaCall',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
    calls,
    settings,
  };
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function clearEverything() {
  Object.values(KEYS).forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
}

export function estimateStorageBytes() {
  try {
    return Object.values(KEYS).reduce((sum, key) => sum + (localStorage.getItem(key)?.length || 0), 0);
  } catch {
    return 0;
  }
}

export { KEYS };
