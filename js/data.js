/*
 * データ層
 * -----------------------------------------------------
 * Google Apps Script + スプレッドシートをバックエンドにした
 * オンライン専用のデータ層です。GAS の URL は端末ごとに
 * localStorage(sukusuku_gas_url) に保存し、設定画面から登録します。
 *
 * 読み取り系(get*)はメモリ上のキャッシュを同期的に返し、
 * Data.refresh() で GAS から最新状態を取得してキャッシュを更新します。
 * 書き込み系(add/update/delete/toggle/save)は GAS への通信を
 * 待ってからキャッシュを更新するため、呼び出し側は await が必要です。
 * -----------------------------------------------------
 */

const STORAGE_KEYS = {
  GAS_URL: 'sukusuku_gas_url',
};

let cache = {
  child: { name: '', birthdate: '' },
  feedings: [],
  growth: [],
  scheduleCustom: [],
};

function sortCache() {
  cache.feedings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  cache.growth.sort((a, b) => new Date(a.date) - new Date(b.date));
  cache.scheduleCustom.sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}`) - new Date(`${b.date}T${b.time || '00:00'}`));
}

async function callGas(action, payload) {
  const url = (localStorage.getItem(STORAGE_KEYS.GAS_URL) || '').trim();
  if (!url) throw new Error('GAS連携のURLが未設定です');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) throw new Error(`通信エラー(${res.status})`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '不明なエラー');
  return json.data;
}

const Data = {
  isConfigured() {
    return !!(localStorage.getItem(STORAGE_KEYS.GAS_URL) || '').trim();
  },
  getGasUrl() {
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || '';
  },
  setGasUrl(url) {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, url.trim());
  },

  async refresh() {
    const data = await callGas('getAll');
    cache.child = data.child || { name: '', birthdate: '' };
    cache.feedings = data.feedings || [];
    cache.growth = data.growth || [];
    cache.scheduleCustom = data.scheduleCustom || [];
    sortCache();
  },

  // ---------------- 子どもの情報 ----------------
  getChild() {
    return cache.child;
  },
  async saveChild(child) {
    cache.child = await callGas('saveChild', child);
    return cache.child;
  },

  // ---------------- 授乳記録 ----------------
  getFeedings() {
    return cache.feedings;
  },
  async addFeeding(entry) {
    const record = await callGas('addFeeding', entry);
    cache.feedings.push(record);
    sortCache();
    return record;
  },
  async updateFeeding(id, updates) {
    const record = await callGas('updateFeeding', { id, updates });
    const idx = cache.feedings.findIndex((f) => f.id === id);
    if (idx !== -1) cache.feedings[idx] = record;
    sortCache();
    return record;
  },
  async deleteFeeding(id) {
    await callGas('deleteFeeding', { id });
    cache.feedings = cache.feedings.filter((f) => f.id !== id);
  },

  // ---------------- 成長記録 ----------------
  getGrowth() {
    return cache.growth;
  },
  async addGrowth(entry) {
    const record = await callGas('addGrowth', entry);
    cache.growth.push(record);
    sortCache();
    return record;
  },
  async deleteGrowth(id) {
    await callGas('deleteGrowth', { id });
    cache.growth = cache.growth.filter((g) => g.id !== id);
  },

  // ---------------- 予定(カスタム) ----------------
  getScheduleCustom() {
    return cache.scheduleCustom;
  },
  async addScheduleCustom(entry) {
    const record = await callGas('addScheduleCustom', entry);
    cache.scheduleCustom.push(record);
    sortCache();
    return record;
  },
  async deleteScheduleCustom(id) {
    await callGas('deleteScheduleCustom', { id });
    cache.scheduleCustom = cache.scheduleCustom.filter((s) => s.id !== id);
  },
  async toggleScheduleCustom(id) {
    const record = await callGas('toggleScheduleCustom', { id });
    const idx = cache.scheduleCustom.findIndex((s) => s.id === id);
    if (idx !== -1) cache.scheduleCustom[idx] = record;
    return record;
  },
};
