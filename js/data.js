/*
 * データ層
 * -----------------------------------------------------
 * 今はブラウザの localStorage にすべて保存しています。
 * 将来 GAS と連携するときは、この中の関数の中身だけを
 * fetch(GAS_WEB_APP_URL, ...) に差し替えれば、
 * app.js 側は一切変更不要です。
 * -----------------------------------------------------
 */

const STORAGE_KEYS = {
  CHILD: 'sukusuku_child',
  FEEDINGS: 'sukusuku_feedings',
  GROWTH: 'sukusuku_growth',
  SCHEDULE_CUSTOM: 'sukusuku_schedule_custom',
  SCHEDULE_AUTO_STATUS: 'sukusuku_schedule_auto_status',
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('読み込みエラー', key, e);
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateShareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const Data = {
  // ---------------- 子どもの情報 ----------------
  getChild() {
    return readJSON(STORAGE_KEYS.CHILD, { name: '', birthdate: '', shareCode: generateShareCode() });
  },
  saveChild(child) {
    const current = Data.getChild();
    const merged = { ...current, ...child };
    writeJSON(STORAGE_KEYS.CHILD, merged);
    return merged;
  },

  // ---------------- 授乳記録 ----------------
  getFeedings() {
    return readJSON(STORAGE_KEYS.FEEDINGS, []);
  },
  addFeeding(entry) {
    const list = Data.getFeedings();
    const record = { id: makeId(), ...entry };
    list.push(record);
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    writeJSON(STORAGE_KEYS.FEEDINGS, list);
    return record;
  },
  updateFeeding(id, updates) {
    const list = Data.getFeedings();
    const idx = list.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    writeJSON(STORAGE_KEYS.FEEDINGS, list);
    return list[idx];
  },
  deleteFeeding(id) {
    const list = Data.getFeedings().filter((f) => f.id !== id);
    writeJSON(STORAGE_KEYS.FEEDINGS, list);
  },

  // ---------------- 成長記録 ----------------
  getGrowth() {
    return readJSON(STORAGE_KEYS.GROWTH, []);
  },
  addGrowth(entry) {
    const list = Data.getGrowth();
    const record = { id: makeId(), ...entry };
    list.push(record);
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    writeJSON(STORAGE_KEYS.GROWTH, list);
    return record;
  },
  deleteGrowth(id) {
    const list = Data.getGrowth().filter((g) => g.id !== id);
    writeJSON(STORAGE_KEYS.GROWTH, list);
  },

  // ---------------- 予定(カスタム) ----------------
  getScheduleCustom() {
    return readJSON(STORAGE_KEYS.SCHEDULE_CUSTOM, []);
  },
  addScheduleCustom(entry) {
    const list = Data.getScheduleCustom();
    const record = { id: makeId(), done: false, ...entry };
    list.push(record);
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    writeJSON(STORAGE_KEYS.SCHEDULE_CUSTOM, list);
    return record;
  },
  deleteScheduleCustom(id) {
    const list = Data.getScheduleCustom().filter((s) => s.id !== id);
    writeJSON(STORAGE_KEYS.SCHEDULE_CUSTOM, list);
  },
  toggleScheduleCustom(id) {
    const list = Data.getScheduleCustom();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return;
    list[idx].done = !list[idx].done;
    writeJSON(STORAGE_KEYS.SCHEDULE_CUSTOM, list);
  },

  // ---------------- 予定(自動計算)の済みフラグ ----------------
  getAutoScheduleStatus() {
    return readJSON(STORAGE_KEYS.SCHEDULE_AUTO_STATUS, {});
  },
  toggleAutoScheduleStatus(key) {
    const status = Data.getAutoScheduleStatus();
    status[key] = !status[key];
    writeJSON(STORAGE_KEYS.SCHEDULE_AUTO_STATUS, status);
    return status;
  },
};
