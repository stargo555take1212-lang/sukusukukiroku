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
  CACHE: 'sukusuku_cache',
};

// 前回取得した内容をローカルに保存しておき、次回起動時は届くまでの間
// 空の初期状態を表示せず、直前の内容をそのまま表示できるようにする
function loadPersistedCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function persistCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(cache));
  } catch (e) {
    // 保存容量オーバー等は無視(次回起動時の即時表示が失われるだけで実害はない)
  }
}

let cache = loadPersistedCache() || {
  child: { name: '', birthdate: '' },
  feedings: [],
  growth: [],
  poop: [],
};

function sortCache() {
  cache.feedings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  cache.growth.sort((a, b) => new Date(a.date) - new Date(b.date));
  cache.poop.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  persistCache();
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

  // 画面遷移や失敗時の再同期など複数箇所から呼ばれるため、同時に複数の
  // getAllが飛ぶと後から届いた古い応答が新しい状態を上書きしてしまう。
  // 実行中のリクエストがあればそれを使い回すことで1回にまとめる。
  refresh() {
    if (this._inflightRefresh) return this._inflightRefresh;
    this._inflightRefresh = (async () => {
      try {
        const data = await callGas('getAll');
        cache.child = data.child || { name: '', birthdate: '' };
        cache.feedings = data.feedings || [];
        cache.growth = data.growth || [];
        cache.poop = data.poop || [];
        sortCache();
      } finally {
        this._inflightRefresh = null;
      }
    })();
    return this._inflightRefresh;
  },

  // ---------------- 子どもの情報 ----------------
  getChild() {
    return cache.child;
  },
  async saveChild(child) {
    cache.child = await callGas('saveChild', child);
    persistCache();
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
    persistCache();
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
    persistCache();
  },

  // ---------------- うんち記録 ----------------
  getPoop() {
    return cache.poop;
  },
  async addPoop(entry) {
    const record = await callGas('addPoop', entry);
    cache.poop.push(record);
    sortCache();
    return record;
  },
  async deletePoop(id) {
    await callGas('deletePoop', { id });
    cache.poop = cache.poop.filter((p) => p.id !== id);
    persistCache();
  },
};
