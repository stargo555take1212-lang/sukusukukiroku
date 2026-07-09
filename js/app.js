/* ========================================================
   すくすくノート - メインロジック
   ======================================================== */

// ---------------- 共通ユーティリティ ----------------

function pad2(n) { return String(n).padStart(2, '0'); }

function formatTimeHM(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function todayDateStr(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function shiftDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 保存中であることが分かるようボタンの文言を変え、連打による二重送信も防ぐ
function setButtonBusy(btn, busy, busyText = '保存中…') {
  if (busy) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = busyText;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.disabled = false;
  }
}

// 削除確定後、応答を待たずにその場で「削除中」であることが分かるようにする
// (成功時は一覧ごと再描画されて消えるため、失敗時のみ元に戻す)
function markRowRemoving(item) {
  const sub = item.querySelector('.record-item-sub');
  item.classList.add('removing');
  if (sub) {
    sub.dataset.originalText = sub.textContent;
    sub.textContent = '削除中…';
  }
}

function unmarkRowRemoving(item) {
  const sub = item.querySelector('.record-item-sub');
  item.classList.remove('removing');
  if (sub && sub.dataset.originalText) sub.textContent = sub.dataset.originalText;
}

// ネイティブの<input type="time">がAndroidの一部端末でボタンが見切れる不具合があるため、
// 時/分のプルダウンで代用する
function populateTimeSelects(hourEl, minuteEl, minuteStep = 1) {
  const blank = () => {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '－';
    return o;
  };
  hourEl.appendChild(blank());
  for (let h = 0; h < 24; h++) {
    const o = document.createElement('option');
    o.value = pad2(h);
    o.textContent = `${pad2(h)}時`;
    hourEl.appendChild(o);
  }
  minuteEl.appendChild(blank());
  for (let m = 0; m < 60; m += minuteStep) {
    const o = document.createElement('option');
    o.value = pad2(m);
    o.textContent = `${pad2(m)}分`;
    minuteEl.appendChild(o);
  }
}

function getTimeSelectValue(hourEl, minuteEl) {
  if (!hourEl.value || !minuteEl.value) return '';
  return `${hourEl.value}:${minuteEl.value}`;
}

function resetTimeSelect(hourEl, minuteEl) {
  hourEl.value = '';
  minuteEl.value = '';
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function calcAgeText(birthdateStr) {
  if (!birthdateStr) return '生年月日を設定してください';
  const birth = new Date(birthdateStr + 'T00:00:00');
  const now = new Date();
  if (birth > now) return '生年月日を確認してください';

  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  const anchor = addMonths(birth, months);
  let days = Math.floor((now - anchor) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    months -= 1;
    const anchor2 = addMonths(birth, months);
    days = Math.floor((now - anchor2) / (1000 * 60 * 60 * 24));
  }
  return `生後${months}か月 ${days}日`;
}

// ---------------- ナビゲーション ----------------

function showLoading(visible) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !visible);
}

let currentScreen = null;

function renderScreen(screenName) {
  if (screenName === 'home') renderHome();
  if (screenName === 'feeding') renderFeedingScreen();
  if (screenName === 'growth') renderGrowthScreen();
  if (screenName === 'schedule') renderScheduleScreen();
  if (screenName === 'settings') renderSettingsScreen();
}

// 画面に更新ボタンがあればそれを返す(タブ移動時の裏更新もこのボタンを回して知らせる)
function getScreenRefreshButton(screenName) {
  const section = document.querySelector(`.screen[data-screen="${screenName}"]`);
  return section ? section.querySelector('[data-refresh]') : null;
}

// 書き込みが失敗した際、通信が不安定なだけで実際はGAS側で成功している
// ことがあるため、最新状態を取り直して画面を実態に合わせ直す
async function resyncAfterError() {
  if (!Data.isConfigured()) return;
  const refreshBtn = currentScreen ? getScreenRefreshButton(currentScreen) : null;
  if (refreshBtn) refreshBtn.classList.add('spinning');
  try {
    await Data.refresh();
    if (currentScreen) renderScreen(currentScreen);
  } catch (err) {
    console.error('再同期に失敗しました', err);
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

function navigateTo(screenName) {
  currentScreen = screenName;
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.screen !== screenName);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === screenName);
  });

  // タブへの新規遷移時は表示日を今日にリセットする(裏での再描画時はリセットしない)
  if (screenName === 'feeding') feedingViewDate = new Date();
  if (screenName === 'home') homeChartDate = new Date();

  // まずキャッシュ済みのデータで即座に描画し、最新データは裏で取得して届いたら差し替える
  renderScreen(screenName);

  if (screenName !== 'settings' && Data.isConfigured()) {
    const refreshBtn = getScreenRefreshButton(screenName);
    if (refreshBtn) refreshBtn.classList.add('spinning');
    Data.refresh()
      .then(() => {
        if (currentScreen === screenName) renderScreen(screenName);
      })
      .catch((err) => {
        console.error('データの取得に失敗しました', err);
      })
      .finally(() => {
        if (refreshBtn) refreshBtn.classList.remove('spinning');
      });
  }
}

// 各タブの更新ボタン。ブラウザ標準の引っ張って更新の代わりに使う
function setupRefreshButtons() {
  document.querySelectorAll('[data-refresh]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!Data.isConfigured() || btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('spinning');
      try {
        await Data.refresh();
        if (currentScreen) renderScreen(currentScreen);
      } catch (err) {
        alert('更新に失敗しました: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
      }
    });
  });
}

function setupNav() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!Data.isConfigured() && el.dataset.nav !== 'settings') {
        alert('まず設定画面でGAS連携のURLを登録してください');
        navigateTo('settings');
        return;
      }
      navigateTo(el.dataset.nav);
    });
  });
}

// ---------------- ホーム画面 ----------------

let homeChartDate = new Date();

function homeChartDateLabel(date) {
  if (isSameDay(date, new Date())) return '直近の授乳パターン（時間帯別）';
  return `${date.getMonth() + 1}/${date.getDate()}の授乳パターン（時間帯別）`;
}

function setupHomeScreen() {
  document.getElementById('home-chart-date-prev').addEventListener('click', () => {
    homeChartDate = shiftDate(homeChartDate, -1);
    renderHome();
  });
  document.getElementById('home-chart-date-next').addEventListener('click', () => {
    if (isSameDay(homeChartDate, new Date())) return; // 今日より先(未来)には進めない
    homeChartDate = shiftDate(homeChartDate, 1);
    renderHome();
  });
}

function renderHome() {
  const child = Data.getChild();
  document.getElementById('home-child-name').textContent = child.name || 'お名前未設定';
  document.getElementById('home-child-age').textContent = calcAgeText(child.birthdate);

  const avatarEl = document.getElementById('home-avatar');
  if (child.photo) {
    avatarEl.style.backgroundImage = `url(${child.photo})`;
    avatarEl.innerHTML = '';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.innerHTML = '<i class="icon">👶</i>';
  }

  const feedings = Data.getFeedings();
  const now = new Date();

  // 最後の授乳からの経過時間
  const elapsedEl = document.getElementById('metric-elapsed');
  if (feedings.length === 0) {
    elapsedEl.textContent = '記録なし';
  } else {
    const last = new Date(feedings[0].timestamp);
    const diffMin = Math.floor((now - last) / 60000);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    elapsedEl.textContent = h > 0 ? `${h}時間${m}分` : `${m}分`;
  }

  // 今日の回数
  const todaysFeedings = feedings.filter((f) => isSameDay(new Date(f.timestamp), now));
  document.getElementById('metric-count').textContent = `${todaysFeedings.length}回`;

  // 最新体重
  const growth = Data.getGrowth();
  const weightEl = document.getElementById('metric-weight');
  weightEl.textContent = growth.length ? `${growth[growth.length - 1].weightG}g` : '記録なし';

  document.getElementById('home-chart-date-label').textContent = homeChartDateLabel(homeChartDate);
  document.getElementById('home-chart-date-next').classList.toggle('disabled', isSameDay(homeChartDate, now));
  renderHomeBarChart(feedings, homeChartDate);
  renderHomeScheduleBadge();
}

// 母乳は分数そのまま、ミルク・搾乳は40mlあたり5分として分数換算する
function feedingMinutesEquivalent(f) {
  if (f.type === 'breast') return f.durationMin || 0;
  return (f.amountMl || 0) * 5 / 40;
}

function renderHomeBarChart(feedings, date) {
  const buckets = new Array(24).fill(0);
  feedings.forEach((f) => {
    const d = new Date(f.timestamp);
    if (isSameDay(d, date)) buckets[d.getHours()] += feedingMinutesEquivalent(f);
  });
  const maxMinutes = Math.max(...buckets, 0);
  const niceMax = Math.max(15, Math.ceil(maxMinutes / 15) * 15);

  const yAxis = document.getElementById('home-bar-chart-yaxis');
  const yTicks = [];
  for (let m = niceMax; m >= 0; m -= 15) yTicks.push(m);
  yAxis.innerHTML = yTicks.map((m) => `<span>${m}分</span>`).join('');

  const container = document.getElementById('home-bar-chart');
  container.innerHTML = '';
  buckets.forEach((minutes) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(4, (minutes / niceMax) * 100)}%`;
    container.appendChild(bar);
  });
}

function renderHomeScheduleBadge() {
  const upcoming = getUpcomingScheduleItem();
  const badge = document.getElementById('home-schedule-badge');
  if (!upcoming) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  document.getElementById('schedule-badge-title').textContent = upcoming.label;
  document.getElementById('schedule-badge-date').textContent = upcoming.dateLabel;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('home-start-feeding-btn').addEventListener('click', () => {
    if (!Data.isConfigured()) {
      alert('まず設定画面でGAS連携のURLを登録してください');
      navigateTo('settings');
      return;
    }
    navigateTo('feeding');
  });
});

// ---------------- 写真アップロード ----------------

// スプレッドシートのセル容量に収まるよう、正方形に切り抜いてから
// 文字数の上限内に収まるまで段階的に圧縮する
function resizeImageToDataUrl(file, maxSize, maxChars) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);

        let quality = 0.75;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxChars && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > maxChars) {
          reject(new Error('画像サイズが大きすぎます。別の写真でお試しください'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setupAvatarUpload() {
  const fileInput = document.getElementById('avatar-file-input');
  const openPicker = () => {
    if (!Data.isConfigured()) {
      alert('まず設定画面でGAS連携のURLを登録してください');
      navigateTo('settings');
      return;
    }
    fileInput.click();
  };
  document.getElementById('home-avatar').addEventListener('click', openPicker);
  document.getElementById('avatar-edit-btn').addEventListener('click', openPicker);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    showLoading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 320, 45000);
      await Data.saveChild({ photo: dataUrl });
      renderHome();
    } catch (err) {
      alert('写真の保存に失敗しました: ' + err.message);
    } finally {
      showLoading(false);
    }
  });
}

// ---------------- 授乳記録画面 ----------------

let feedingType = 'breast';
let manualSubtype = 'breast'; // 'breast' | 'pump' (feedingTypeが'breast'の時だけ使う、手入力の種類)
let timerInterval = null;
let timerStartTime = null; // Date | null
let feedingViewDate = new Date();

// 手入力カードのラベル・入力欄の見た目を、上部のタイプと手入力サブタイプに合わせて更新する
function updateManualEntryFields() {
  const isMilk = feedingType === 'milk';
  const isPump = feedingType === 'breast' && manualSubtype === 'pump';
  document.getElementById('manual-value-label').textContent = isMilk ? 'ミルクの量（ml）' : isPump ? '搾乳量（ml）' : '授乳時間（分）';
  document.getElementById('manual-duration-select').classList.toggle('hidden', isMilk || isPump);
  document.getElementById('manual-value-input').classList.toggle('hidden', !(isMilk || isPump));
  document.getElementById('manual-subtype-segmented').classList.toggle('hidden', isMilk);
}

function setupFeedingScreen() {
  populateTimeSelects(document.getElementById('manual-time-hour'), document.getElementById('manual-time-minute'), 5);

  document.querySelectorAll('#feeding-type-segmented .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      feedingType = btn.dataset.type;
      manualSubtype = 'breast';
      document.querySelectorAll('#feeding-type-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('#manual-subtype-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b.dataset.subtype === 'breast'));
      document.getElementById('breast-timer-card').classList.toggle('hidden', feedingType !== 'breast');
      document.getElementById('milk-input-card').classList.toggle('hidden', feedingType !== 'milk');
      updateManualEntryFields();
    });
  });

  document.querySelectorAll('#manual-subtype-segmented .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      manualSubtype = btn.dataset.subtype;
      document.querySelectorAll('#manual-subtype-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      updateManualEntryFields();
    });
  });

  document.getElementById('timer-toggle-btn').addEventListener('click', toggleTimer);
  document.getElementById('milk-save-btn').addEventListener('click', saveMilkEntry);
  document.getElementById('manual-entry-toggle-btn').addEventListener('click', () => {
    document.getElementById('manual-entry-card').classList.toggle('hidden');
  });
  document.getElementById('manual-save-btn').addEventListener('click', saveManualEntry);

  document.getElementById('feeding-date-prev').addEventListener('click', () => {
    feedingViewDate = shiftDate(feedingViewDate, -1);
    renderFeedingScreen();
  });
  document.getElementById('feeding-date-next').addEventListener('click', () => {
    feedingViewDate = shiftDate(feedingViewDate, 1);
    renderFeedingScreen();
  });
}

async function toggleTimer() {
  const btn = document.getElementById('timer-toggle-btn');
  if (!timerStartTime) {
    timerStartTime = new Date();
    btn.textContent = '■ 停止する';
    timerInterval = setInterval(updateTimerDisplay, 1000);
  } else {
    clearInterval(timerInterval);
    const startTime = timerStartTime;
    const durationMin = Math.max(1, Math.round((new Date() - startTime) / 60000));
    timerStartTime = null;
    document.getElementById('timer-display').textContent = '00:00:00';
    setButtonBusy(btn, true, '保存中…');
    try {
      await Data.addFeeding({ type: 'breast', timestamp: startTime.toISOString(), durationMin });
      renderFeedingList();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
      await resyncAfterError();
    } finally {
      setButtonBusy(btn, false);
      btn.textContent = '▶ 開始する';
    }
  }
}

function updateTimerDisplay() {
  const diff = Math.floor((new Date() - timerStartTime) / 1000);
  const h = pad2(Math.floor(diff / 3600));
  const m = pad2(Math.floor((diff % 3600) / 60));
  const s = pad2(diff % 60);
  document.getElementById('timer-display').textContent = `${h}:${m}:${s}`;
}

async function saveMilkEntry() {
  const input = document.getElementById('milk-amount-input');
  const amount = parseInt(input.value, 10);
  if (!amount || amount <= 0) { alert('ミルクの量を入力してください'); return; }
  const btn = document.getElementById('milk-save-btn');
  setButtonBusy(btn, true);
  try {
    await Data.addFeeding({ type: 'milk', timestamp: new Date().toISOString(), amountMl: amount });
    input.value = '';
    renderFeedingList();
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
    await resyncAfterError();
  } finally {
    setButtonBusy(btn, false);
  }
}

async function saveManualEntry() {
  const hourEl = document.getElementById('manual-time-hour');
  const minuteEl = document.getElementById('manual-time-minute');
  const timeVal = getTimeSelectValue(hourEl, minuteEl);
  const durationSelect = document.getElementById('manual-duration-select');
  const valueInput = document.getElementById('manual-value-input');

  const isMilk = feedingType === 'milk';
  const isPump = feedingType === 'breast' && manualSubtype === 'pump';
  const entryType = isMilk ? 'milk' : isPump ? 'pump' : 'breast';
  const valueVal = parseFloat((isMilk || isPump) ? valueInput.value : durationSelect.value);
  if (!timeVal || !valueVal) { alert('時刻と数値を入力してください'); return; }

  const [h, m] = timeVal.split(':').map(Number);
  const ts = new Date();
  ts.setHours(h, m, 0, 0);

  const entry = { type: entryType, timestamp: ts.toISOString() };
  if (entryType === 'breast') entry.durationMin = valueVal;
  else entry.amountMl = valueVal;

  const btn = document.getElementById('manual-save-btn');
  setButtonBusy(btn, true);
  try {
    await Data.addFeeding(entry);
    resetTimeSelect(hourEl, minuteEl);
    durationSelect.value = '';
    valueInput.value = '';
    document.getElementById('manual-entry-card').classList.add('hidden');
    renderFeedingList();
  } catch (err) {
    alert('保存に失敗しました: ' + err.message);
    await resyncAfterError();
  } finally {
    setButtonBusy(btn, false);
  }
}

function feedingDateLabel(date) {
  if (isSameDay(date, new Date())) return '今日';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function renderFeedingScreen() {
  document.getElementById('feeding-list-label').textContent = `${feedingDateLabel(feedingViewDate)}の記録`;
  renderFeedingList();
}

function renderFeedingList() {
  const container = document.getElementById('feeding-list');
  const todays = Data.getFeedings().filter((f) => isSameDay(new Date(f.timestamp), feedingViewDate));

  if (todays.length === 0) {
    container.innerHTML = `<p class="empty-state">${feedingDateLabel(feedingViewDate)}の記録はまだありません。</p>`;
    return;
  }

  container.innerHTML = '';
  todays.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'record-item';
    const isBreast = f.type === 'breast';
    const isPump = f.type === 'pump';
    const sub = isBreast ? `母乳・${f.durationMin}分` : isPump ? `搾乳・${f.amountMl}ml` : `ミルク・${f.amountMl}ml`;
    item.innerHTML = `
      <div class="record-icon" style="background:${isBreast ? 'var(--c-pink-50)' : isPump ? 'var(--c-teal-50)' : 'var(--c-purple-50)'}">🍼</div>
      <div class="record-item-body">
        <p class="record-item-time">${formatTimeHM(new Date(f.timestamp))}</p>
        <p class="record-item-sub">${sub}</p>
      </div>
      <button class="record-action" data-action="delete" aria-label="削除">🗑</button>
    `;
    item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      if (confirm('この記録を削除しますか？')) {
        setButtonBusy(e.target, true, '…');
        markRowRemoving(item);
        try {
          await Data.deleteFeeding(f.id);
          renderFeedingList();
        } catch (err) {
          alert('削除に失敗しました: ' + err.message);
          setButtonBusy(e.target, false);
          unmarkRowRemoving(item);
          await resyncAfterError();
        }
      }
    });
    container.appendChild(item);
  });
}

// ---------------- 成長記録画面 ----------------

function setupGrowthScreen() {
  document.getElementById('growth-date-input').value = todayDateStr();
  document.getElementById('growth-save-btn').addEventListener('click', async (e) => {
    const date = document.getElementById('growth-date-input').value;
    const weight = parseInt(document.getElementById('growth-weight-input').value, 10);
    const height = parseFloat(document.getElementById('growth-height-input').value);
    if (!date || (!weight && !height)) { alert('日付と、体重または身長を入力してください'); return; }
    setButtonBusy(e.target, true);
    try {
      await Data.addGrowth({ date, weightG: weight || null, heightCm: height || null });
      document.getElementById('growth-weight-input').value = '';
      document.getElementById('growth-height-input').value = '';
      renderGrowthScreen();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
      await resyncAfterError();
    } finally {
      setButtonBusy(e.target, false);
    }
  });
}

function renderGrowthScreen() {
  const list = Data.getGrowth();
  const child = Data.getChild();

  const withWeight = list.filter((g) => g.weightG != null);
  const withHeight = list.filter((g) => g.heightCm != null);
  document.getElementById('growth-weight-current').textContent = withWeight.length ? `体重 ${withWeight[withWeight.length - 1].weightG}g` : '体重 記録なし';
  document.getElementById('growth-height-current').textContent = withHeight.length ? `身長 ${withHeight[withHeight.length - 1].heightCm}cm` : '身長 記録なし';

  const canShowCurve = !!(child.birthdate && child.sex);
  document.getElementById('growth-chart-setup-card').classList.toggle('hidden', canShowCurve);
  document.getElementById('growth-chart-card').classList.toggle('hidden', !canShowCurve);
  if (canShowCurve) drawGrowthCurveChart(child, list);

  renderGrowthList(list);
}

// 日時付き文字列(スプレッドシート側で日付型に化けた場合など)が来ても
// 日付部分だけを安全に取り出す
function toDateOnly(str) {
  return String(str).slice(0, 10);
}

// 生年月日からの月齢(小数)を計算する。1か月を30.4368日として近似する
function ageInMonths(birthdateStr, dateStr) {
  const birth = new Date(`${toDateOnly(birthdateStr)}T00:00:00`);
  const date = new Date(`${toDateOnly(dateStr)}T00:00:00`);
  return (date - birth) / (1000 * 60 * 60 * 24) / 30.4368;
}

function buildBandPath(curveRows, monthToX, valueToY) {
  const top = curveRows.map((row, i) => `${i === 0 ? 'M' : 'L'}${monthToX(i)},${valueToY(row[2])}`).join(' ');
  const bottom = [...curveRows].reverse().map((row, i) => `L${monthToX(curveRows.length - 1 - i)},${valueToY(row[0])}`).join(' ');
  return `${top} ${bottom} Z`;
}

function buildCurveLinePath(curveRows, monthToX, valueToY, percentileIdx) {
  return curveRows.map((row, i) => `${i === 0 ? 'M' : 'L'}${monthToX(i)},${valueToY(row[percentileIdx])}`).join(' ');
}

// 乳児身体発育曲線(0〜12か月)に体重・身長の記録を重ねて描画する
// 母子手帳の発育曲線にならい、身長を上段・体重を下段に分けて描く
function drawGrowthCurveChart(child, list) {
  const svg = document.getElementById('growth-chart-svg');
  const curves = GROWTH_CURVES[child.sex];
  if (!curves) { svg.innerHTML = ''; return; }

  const w = 320;
  const x0 = 34, x1 = w - 10;
  const plotW = x1 - x0;
  const heightTop = 16, heightBottom = 108;
  const weightTop = 128, weightBottom = 220;
  const monthAxisY = 236;

  const monthToX = (m) => x0 + (m / 12) * plotW;
  const heightToY = (cm) => heightBottom - ((cm - 40) / 40) * (heightBottom - heightTop);
  const weightToY = (kg) => weightBottom - (kg / 12) * (weightBottom - weightTop);

  const heightBand = buildBandPath(curves.height, monthToX, heightToY);
  const weightBand = buildBandPath(curves.weight, monthToX, weightToY);
  const heightMedian = buildCurveLinePath(curves.height, monthToX, heightToY, 1);
  const weightMedian = buildCurveLinePath(curves.weight, monthToX, weightToY, 1);

  const heightTicks = [40, 50, 60, 70, 80].map((cm) => `
    <line x1="${x0}" y1="${heightToY(cm)}" x2="${x1}" y2="${heightToY(cm)}" stroke="var(--border)" stroke-width="0.5"/>
    <text x="${x0 - 4}" y="${heightToY(cm) + 3}" font-size="7" fill="var(--c-blue-600)" text-anchor="end">${cm}</text>
  `).join('');
  const weightTicks = [0, 3, 6, 9, 12].map((kg) => `
    <line x1="${x0}" y1="${weightToY(kg)}" x2="${x1}" y2="${weightToY(kg)}" stroke="var(--border)" stroke-width="0.5"/>
    <text x="${x0 - 4}" y="${weightToY(kg) + 3}" font-size="7" fill="var(--c-green-600)" text-anchor="end">${kg}</text>
  `).join('');
  const monthTicks = [0, 3, 6, 9, 12].map((m) => `
    <text x="${monthToX(m)}" y="${monthAxisY}" font-size="7" fill="var(--text-muted)" text-anchor="middle">${m}か月</text>
  `).join('');
  const sectionLabels = `
    <text x="${x0}" y="${heightTop - 5}" font-size="8" font-weight="700" fill="var(--c-blue-600)">身長(cm)</text>
    <text x="${x0}" y="${weightTop - 5}" font-size="8" font-weight="700" fill="var(--c-green-600)">体重(kg)</text>
  `;

  const actualHeight = list.filter((g) => g.heightCm != null)
    .map((g) => ({ age: ageInMonths(child.birthdate, g.date), v: g.heightCm }))
    .filter((p) => p.age >= 0 && p.age <= 12)
    .sort((a, b) => a.age - b.age);
  const actualWeight = list.filter((g) => g.weightG != null)
    .map((g) => ({ age: ageInMonths(child.birthdate, g.date), v: g.weightG / 1000 }))
    .filter((p) => p.age >= 0 && p.age <= 12)
    .sort((a, b) => a.age - b.age);

  const heightPath = actualHeight.map((p, i) => `${i === 0 ? 'M' : 'L'}${monthToX(p.age)},${heightToY(p.v)}`).join(' ');
  const heightDots = actualHeight.map((p) => `<circle cx="${monthToX(p.age)}" cy="${heightToY(p.v)}" r="3" fill="var(--c-blue-600)"/>`).join('');
  const weightPath = actualWeight.map((p, i) => `${i === 0 ? 'M' : 'L'}${monthToX(p.age)},${weightToY(p.v)}`).join(' ');
  const weightDots = actualWeight.map((p) => `<circle cx="${monthToX(p.age)}" cy="${weightToY(p.v)}" r="3" fill="var(--c-green-600)"/>`).join('');

  svg.innerHTML = `
    <path d="${heightBand}" fill="var(--c-blue-600)" opacity="0.15"/>
    <path d="${weightBand}" fill="var(--c-green-600)" opacity="0.15"/>
    ${heightTicks}
    ${weightTicks}
    ${sectionLabels}
    <path d="${heightMedian}" fill="none" stroke="var(--c-blue-600)" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
    <path d="${weightMedian}" fill="none" stroke="var(--c-green-600)" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
    ${monthTicks}
    <path d="${heightPath}" fill="none" stroke="var(--c-blue-600)" stroke-width="2.5"/>
    ${heightDots}
    <path d="${weightPath}" fill="none" stroke="var(--c-green-600)" stroke-width="2.5"/>
    ${weightDots}
  `;
}

function renderGrowthList(list) {
  const container = document.getElementById('growth-list');
  if (list.length === 0) {
    container.innerHTML = '<p class="empty-state">まだ記録がありません。</p>';
    return;
  }
  container.innerHTML = '';
  [...list].reverse().forEach((g) => {
    const item = document.createElement('div');
    item.className = 'record-item';
    const parts = [];
    if (g.weightG != null) parts.push(`${g.weightG}g`);
    if (g.heightCm != null) parts.push(`${g.heightCm}cm`);
    item.innerHTML = `
      <div class="record-icon" style="background:var(--c-teal-50)">📏</div>
      <div class="record-item-body">
        <p class="record-item-time">${toDateOnly(g.date)}</p>
        <p class="record-item-sub">${parts.join(' / ')}</p>
      </div>
      <button class="record-action" data-action="delete" aria-label="削除">🗑</button>
    `;
    item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      if (confirm('この記録を削除しますか？')) {
        setButtonBusy(e.target, true, '…');
        markRowRemoving(item);
        try {
          await Data.deleteGrowth(g.id);
          renderGrowthScreen();
        } catch (err) {
          alert('削除に失敗しました: ' + err.message);
          setButtonBusy(e.target, false);
          unmarkRowRemoving(item);
          await resyncAfterError();
        }
      }
    });
    container.appendChild(item);
  });
}

// ---------------- 予定画面 ----------------

function scheduleDateTime(item) {
  return new Date(`${toDateOnly(item.date)}T${item.time || '00:00'}`);
}

function scheduleDateLabel(item) {
  const d = new Date(`${toDateOnly(item.date)}T00:00:00`);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
  return item.time ? `${dateStr} ${item.time}` : dateStr;
}

function getUpcomingScheduleItem() {
  const now = new Date();
  const upcoming = Data.getScheduleCustom()
    .filter((c) => !c.done)
    .map((c) => ({ label: c.title, dateObj: scheduleDateTime(c) }))
    .filter((i) => {
      const diffDays = Math.floor((i.dateObj - now) / (1000 * 60 * 60 * 24));
      return diffDays <= 7; // 過ぎたものも含め、1週間以内に近いものだけバッジ表示
    })
    .sort((a, b) => a.dateObj - b.dateObj);
  if (upcoming.length === 0) return null;
  const target = upcoming[0];
  const diffDays = Math.floor((target.dateObj - now) / (1000 * 60 * 60 * 24));
  const dateLabel = `予定日: ${target.dateObj.getMonth() + 1}/${target.dateObj.getDate()}` + (diffDays >= 0 ? `（あと${diffDays}日）` : '（期日を過ぎています）');
  return { label: target.label, dateLabel };
}

function setupScheduleScreen() {
  const timeHourEl = document.getElementById('schedule-time-hour');
  const timeMinuteEl = document.getElementById('schedule-time-minute');
  populateTimeSelects(timeHourEl, timeMinuteEl);

  document.getElementById('schedule-add-toggle-btn').addEventListener('click', () => {
    document.getElementById('schedule-add-card').classList.toggle('hidden');
  });
  document.getElementById('schedule-save-btn').addEventListener('click', async (e) => {
    const title = document.getElementById('schedule-title-input').value.trim();
    const date = document.getElementById('schedule-date-input').value;
    const time = getTimeSelectValue(timeHourEl, timeMinuteEl);
    if (!title || !date) { alert('予定の名前と日付を入力してください'); return; }
    setButtonBusy(e.target, true);
    try {
      await Data.addScheduleCustom({ title, date, time: time || null });
      document.getElementById('schedule-title-input').value = '';
      document.getElementById('schedule-date-input').value = '';
      resetTimeSelect(timeHourEl, timeMinuteEl);
      document.getElementById('schedule-add-card').classList.add('hidden');
      renderScheduleScreen();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
      await resyncAfterError();
    } finally {
      setButtonBusy(e.target, false);
    }
  });
}

function renderScheduleScreen() {
  const customContainer = document.getElementById('schedule-custom-list');
  const customList = Data.getScheduleCustom();
  if (customList.length === 0) {
    customContainer.innerHTML = '<p class="empty-state">追加した予定はありません。</p>';
  } else {
    customContainer.innerHTML = '';
    customList.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'record-item';
      el.innerHTML = `
        <button class="record-action" data-action="toggle" aria-label="完了を切り替え" style="font-size:20px">${item.done ? '✅' : '⚪'}</button>
        <div class="record-item-body">
          <p class="record-item-time" style="${item.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${item.title}</p>
          <p class="record-item-sub">予定日: ${scheduleDateLabel(item)}</p>
        </div>
        <button class="record-action" data-action="delete" aria-label="削除">🗑</button>
      `;
      el.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
        try {
          await Data.toggleScheduleCustom(item.id);
          renderScheduleScreen();
        } catch (err) {
          alert('更新に失敗しました: ' + err.message);
          await resyncAfterError();
        }
      });
      el.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        if (confirm('この予定を削除しますか？')) {
          setButtonBusy(e.target, true, '…');
          markRowRemoving(el);
          try {
            await Data.deleteScheduleCustom(item.id);
            renderScheduleScreen();
          } catch (err) {
            alert('削除に失敗しました: ' + err.message);
            setButtonBusy(e.target, false);
            unmarkRowRemoving(el);
            await resyncAfterError();
          }
        }
      });
      customContainer.appendChild(el);
    });
  }
}

// ---------------- 設定画面 ----------------

let settingsSex = null;

function setupSettingsScreen() {
  document.querySelectorAll('#settings-sex-segmented .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      settingsSex = btn.dataset.sex;
      document.querySelectorAll('#settings-sex-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('settings-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('settings-name-input').value.trim();
    const birthdate = document.getElementById('settings-birthdate-input').value;
    try {
      await Data.saveChild({ name, birthdate, sex: settingsSex });
      alert('保存しました');
      renderHome();
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
      await resyncAfterError();
    }
  });

  document.getElementById('gas-url-save-btn').addEventListener('click', async () => {
    const url = document.getElementById('gas-url-input').value.trim();
    if (!url) { alert('URLを入力してください'); return; }
    showLoading(true);
    try {
      Data.setGasUrl(url);
      await Data.refresh();
      alert('接続に成功しました');
      renderSettingsScreen();
      renderHome();
    } catch (err) {
      alert('接続に失敗しました。URLを確認してください。\n' + err.message);
    } finally {
      showLoading(false);
    }
  });

  document.getElementById('gas-url-invite-btn').addEventListener('click', async () => {
    const url = Data.getGasUrl();
    if (!url) { alert('先にGASウェブアプリURLを登録してください'); return; }
    const appUrl = `${location.origin}${location.pathname}`;
    const inviteUrl = `${appUrl}?gasUrl=${encodeURIComponent(url)}`;
    const shareText = `「すくすくノート」に招待します。\n下のリンクを開いて「OK」を押すと、データ共有の設定が完了します。\n\n${inviteUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'すくすくノート データ共有', text: shareText });
        return; // 共有シートでの送信が完了
      } catch (err) {
        // 端末やブラウザによってはユーザーが何もしていなくても失敗することがあるため、
        // キャンセル(AbortError)かどうかにかかわらずコピーにフォールバックする
      }
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareText);
        alert('共有メッセージをコピーしました。LINEやメールに貼り付けて送ってください。');
        return;
      } catch (err) {
        // クリップボードも使えない場合はダイアログにフォールバック
      }
    }
    prompt('以下をコピーしてパートナーに送ってください', shareText);
  });
}

function renderSettingsScreen() {
  const child = Data.getChild();
  document.getElementById('settings-name-input').value = child.name || '';
  document.getElementById('settings-birthdate-input').value = child.birthdate || '';
  document.getElementById('gas-url-input').value = Data.getGasUrl();
  document.getElementById('gas-url-status').textContent = Data.isConfigured() ? '接続済み' : '未接続';

  settingsSex = child.sex || null;
  document.querySelectorAll('#settings-sex-segmented .segmented-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.sex === settingsSex);
  });
}

// ---------------- 招待リンク ----------------

// パートナーが共有リンク(?gasUrl=...)を開いた場合、GAS連携URLを自動登録する
async function handleInviteLink() {
  const params = new URLSearchParams(location.search);
  const incomingGasUrl = params.get('gasUrl');
  if (!incomingGasUrl) return;
  history.replaceState(null, '', location.pathname);

  if (!confirm('共有された連携用リンクです。このデータに接続しますか？\n\n（今のデータ接続は上書きされます）')) return;
  showLoading(true);
  try {
    Data.setGasUrl(incomingGasUrl);
    await Data.refresh();
    alert('接続に成功しました');
  } catch (err) {
    alert('接続に失敗しました。リンクを確認してください。\n' + err.message);
  } finally {
    showLoading(false);
  }
}

// ---------------- 初期化 ----------------

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupRefreshButtons();
  setupHomeScreen();
  setupFeedingScreen();
  setupGrowthScreen();
  setupScheduleScreen();
  setupSettingsScreen();
  setupAvatarUpload();
  await handleInviteLink();
  navigateTo(Data.isConfigured() ? 'home' : 'settings');
});
