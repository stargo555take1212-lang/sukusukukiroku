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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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

function navigateTo(screenName) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.screen !== screenName);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === screenName);
  });
  if (screenName === 'home') renderHome();
  if (screenName === 'feeding') renderFeedingScreen();
  if (screenName === 'growth') renderGrowthScreen();
  if (screenName === 'schedule') renderScheduleScreen();
  if (screenName === 'settings') renderSettingsScreen();
}

function setupNav() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigateTo(el.dataset.nav));
  });
}

// ---------------- ホーム画面 ----------------

function renderHome() {
  const child = Data.getChild();
  document.getElementById('home-child-name').textContent = child.name || 'お名前未設定';
  document.getElementById('home-child-age').textContent = calcAgeText(child.birthdate);

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

  // 今日の回数・合計量
  const todaysFeedings = feedings.filter((f) => isSameDay(new Date(f.timestamp), now));
  document.getElementById('metric-count').textContent = `${todaysFeedings.length}回`;
  const totalMl = todaysFeedings.filter((f) => f.type === 'milk').reduce((sum, f) => sum + (f.amountMl || 0), 0);
  document.getElementById('metric-volume').textContent = `${totalMl}ml`;

  // 最新体重
  const growth = Data.getGrowth();
  const weightEl = document.getElementById('metric-weight');
  weightEl.textContent = growth.length ? `${growth[growth.length - 1].weightG}g` : '記録なし';

  renderHomeBarChart(feedings);
  renderHomeScheduleBadge();
}

function renderHomeBarChart(feedings) {
  const now = new Date();
  const buckets = new Array(24).fill(0);
  feedings.forEach((f) => {
    const d = new Date(f.timestamp);
    if (isSameDay(d, now)) buckets[d.getHours()] += 1;
  });
  const max = Math.max(1, ...buckets);
  const container = document.getElementById('home-bar-chart');
  container.innerHTML = '';
  buckets.forEach((count) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(4, (count / max) * 100)}%`;
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
    navigateTo('feeding');
  });
});

// ---------------- 授乳記録画面 ----------------

let feedingType = 'breast';
let timerInterval = null;
let timerStartTime = null; // Date | null

function setupFeedingScreen() {
  document.querySelectorAll('#feeding-type-segmented .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      feedingType = btn.dataset.type;
      document.querySelectorAll('#feeding-type-segmented .segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('breast-timer-card').classList.toggle('hidden', feedingType !== 'breast');
      document.getElementById('milk-input-card').classList.toggle('hidden', feedingType !== 'milk');
      document.getElementById('manual-value-label').textContent = feedingType === 'breast' ? '授乳時間（分）' : 'ミルクの量（ml）';
    });
  });

  document.getElementById('timer-toggle-btn').addEventListener('click', toggleTimer);
  document.getElementById('milk-save-btn').addEventListener('click', saveMilkEntry);
  document.getElementById('manual-entry-toggle-btn').addEventListener('click', () => {
    document.getElementById('manual-entry-card').classList.toggle('hidden');
  });
  document.getElementById('manual-save-btn').addEventListener('click', saveManualEntry);
}

function toggleTimer() {
  const btn = document.getElementById('timer-toggle-btn');
  if (!timerStartTime) {
    timerStartTime = new Date();
    btn.textContent = '■ 停止する';
    timerInterval = setInterval(updateTimerDisplay, 1000);
  } else {
    clearInterval(timerInterval);
    const durationMin = Math.max(1, Math.round((new Date() - timerStartTime) / 60000));
    Data.addFeeding({ type: 'breast', timestamp: timerStartTime.toISOString(), durationMin });
    timerStartTime = null;
    btn.textContent = '▶ 開始する';
    document.getElementById('timer-display').textContent = '00:00:00';
    renderFeedingList();
  }
}

function updateTimerDisplay() {
  const diff = Math.floor((new Date() - timerStartTime) / 1000);
  const h = pad2(Math.floor(diff / 3600));
  const m = pad2(Math.floor((diff % 3600) / 60));
  const s = pad2(diff % 60);
  document.getElementById('timer-display').textContent = `${h}:${m}:${s}`;
}

function saveMilkEntry() {
  const input = document.getElementById('milk-amount-input');
  const amount = parseInt(input.value, 10);
  if (!amount || amount <= 0) { alert('ミルクの量を入力してください'); return; }
  Data.addFeeding({ type: 'milk', timestamp: new Date().toISOString(), amountMl: amount });
  input.value = '';
  renderFeedingList();
}

function saveManualEntry() {
  const timeVal = document.getElementById('manual-time-input').value;
  const valueVal = parseFloat(document.getElementById('manual-value-input').value);
  if (!timeVal || !valueVal) { alert('時刻と数値を入力してください'); return; }

  const [h, m] = timeVal.split(':').map(Number);
  const ts = new Date();
  ts.setHours(h, m, 0, 0);

  const entry = { type: feedingType, timestamp: ts.toISOString() };
  if (feedingType === 'breast') entry.durationMin = valueVal;
  else entry.amountMl = valueVal;

  Data.addFeeding(entry);
  document.getElementById('manual-time-input').value = '';
  document.getElementById('manual-value-input').value = '';
  document.getElementById('manual-entry-card').classList.add('hidden');
  renderFeedingList();
}

function renderFeedingScreen() {
  renderFeedingList();
}

function renderFeedingList() {
  const container = document.getElementById('feeding-list');
  const now = new Date();
  const todays = Data.getFeedings().filter((f) => isSameDay(new Date(f.timestamp), now));

  if (todays.length === 0) {
    container.innerHTML = '<p class="empty-state">今日の記録はまだありません。</p>';
    return;
  }

  container.innerHTML = '';
  todays.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'record-item';
    const isBreast = f.type === 'breast';
    const sub = isBreast ? `母乳・${f.durationMin}分` : `ミルク・${f.amountMl}ml`;
    item.innerHTML = `
      <div class="record-icon" style="background:${isBreast ? 'var(--c-pink-50)' : 'var(--c-purple-50)'}">${isBreast ? '💧' : '🍼'}</div>
      <div class="record-item-body">
        <p class="record-item-time">${formatTimeHM(new Date(f.timestamp))}</p>
        <p class="record-item-sub">${sub}</p>
      </div>
      <button class="record-action" data-action="delete" aria-label="削除">🗑</button>
    `;
    item.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm('この記録を削除しますか？')) {
        Data.deleteFeeding(f.id);
        renderFeedingList();
      }
    });
    container.appendChild(item);
  });
}

// ---------------- 成長記録画面 ----------------

function setupGrowthScreen() {
  document.getElementById('growth-date-input').value = todayDateStr();
  document.getElementById('growth-save-btn').addEventListener('click', () => {
    const date = document.getElementById('growth-date-input').value;
    const weight = parseInt(document.getElementById('growth-weight-input').value, 10);
    const height = parseFloat(document.getElementById('growth-height-input').value);
    if (!date || (!weight && !height)) { alert('日付と、体重または身長を入力してください'); return; }
    Data.addGrowth({ date, weightG: weight || null, heightCm: height || null });
    document.getElementById('growth-weight-input').value = '';
    document.getElementById('growth-height-input').value = '';
    renderGrowthScreen();
  });
}

function renderGrowthScreen() {
  const list = Data.getGrowth();

  const withWeight = list.filter((g) => g.weightG != null);
  const withHeight = list.filter((g) => g.heightCm != null);

  document.getElementById('growth-weight-current').textContent = withWeight.length ? `${withWeight[withWeight.length - 1].weightG}g` : '記録なし';
  document.getElementById('growth-height-current').textContent = withHeight.length ? `${withHeight[withHeight.length - 1].heightCm}cm` : '記録なし';

  drawLineChart('growth-weight-svg', withWeight.map((g) => g.weightG), 'var(--c-green-600)');
  drawLineChart('growth-height-svg', withHeight.map((g) => g.heightCm), 'var(--c-blue-600)');

  renderAxisLabels('growth-weight-axis', withWeight);
  renderAxisLabels('growth-height-axis', withHeight);

  renderGrowthList(list);
}

function renderAxisLabels(elId, list) {
  const el = document.getElementById(elId);
  if (list.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `<span>${list[0].date}</span><span>${list[list.length - 1].date}</span>`;
}

function drawLineChart(svgId, values, color) {
  const svg = document.getElementById(svgId);
  if (values.length < 2) {
    svg.innerHTML = values.length === 1
      ? `<circle cx="150" cy="40" r="4" fill="${color}"/>`
      : '';
    return;
  }
  const w = 300, h = 80, pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });

  const polyline = points.map((p) => p.join(',')).join(' ');
  const circles = points.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`).join('');
  svg.innerHTML = `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.5"/>${circles}`;
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
        <p class="record-item-time">${g.date}</p>
        <p class="record-item-sub">${parts.join(' / ')}</p>
      </div>
      <button class="record-action" data-action="delete" aria-label="削除">🗑</button>
    `;
    item.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm('この記録を削除しますか？')) {
        Data.deleteGrowth(g.id);
        renderGrowthScreen();
      }
    });
    container.appendChild(item);
  });
}

// ---------------- 予定画面 ----------------

const AUTO_SCHEDULE_DEFS = [
  { key: 'k2_1', label: 'K2シロップ 1回目', calc: (birth) => addDays(birth, 7) },
  { key: 'checkup_2w', label: '2週間健診', calc: (birth) => addDays(birth, 14) },
  { key: 'checkup_1m', label: '1か月健診', calc: (birth) => addMonths(birth, 1) },
  { key: 'k2_2', label: 'K2シロップ 2回目', calc: (birth) => addMonths(birth, 1) },
];

function getAutoScheduleItems() {
  const child = Data.getChild();
  if (!child.birthdate) return [];
  const birth = new Date(child.birthdate + 'T00:00:00');
  const status = Data.getAutoScheduleStatus();
  return AUTO_SCHEDULE_DEFS.map((def) => {
    const date = def.calc(birth);
    return {
      key: def.key,
      label: def.label,
      date,
      dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      done: !!status[def.key],
    };
  });
}

function getUpcomingScheduleItem() {
  const now = new Date();
  const items = getAutoScheduleItems().filter((i) => !i.done);
  const custom = Data.getScheduleCustom().filter((c) => !c.done).map((c) => ({
    label: c.title,
    date: new Date(c.date + 'T00:00:00'),
  }));
  const all = [...items, ...custom].map((i) => ({ ...i, dateObj: i.date }));
  const withinRange = all.filter((i) => {
    const diffDays = Math.floor((i.dateObj - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 7; // 過ぎたものも含め、1週間以内に近いものだけバッジ表示
  });
  if (withinRange.length === 0) return null;
  withinRange.sort((a, b) => a.dateObj - b.dateObj);
  const target = withinRange[0];
  const diffDays = Math.floor((target.dateObj - now) / (1000 * 60 * 60 * 24));
  const dateLabel = `予定日: ${target.dateObj.getMonth() + 1}/${target.dateObj.getDate()}` + (diffDays >= 0 ? `（あと${diffDays}日）` : '（期日を過ぎています）');
  return { label: target.label, dateLabel };
}

function setupScheduleScreen() {
  document.getElementById('schedule-add-toggle-btn').addEventListener('click', () => {
    document.getElementById('schedule-add-card').classList.toggle('hidden');
  });
  document.getElementById('schedule-save-btn').addEventListener('click', () => {
    const title = document.getElementById('schedule-title-input').value.trim();
    const date = document.getElementById('schedule-date-input').value;
    if (!title || !date) { alert('予定の名前と日付を入力してください'); return; }
    Data.addScheduleCustom({ title, date });
    document.getElementById('schedule-title-input').value = '';
    document.getElementById('schedule-date-input').value = '';
    document.getElementById('schedule-add-card').classList.add('hidden');
    renderScheduleScreen();
  });
}

function renderScheduleScreen() {
  const autoContainer = document.getElementById('schedule-auto-list');
  const child = Data.getChild();

  if (!child.birthdate) {
    autoContainer.innerHTML = '<p class="empty-state">設定タブで生年月日を登録すると、健診・K2シロップの予定が自動で表示されます。</p>';
  } else {
    const items = getAutoScheduleItems();
    autoContainer.innerHTML = '';
    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'record-item';
      el.innerHTML = `
        <button class="record-action" data-action="toggle" aria-label="完了を切り替え" style="font-size:20px">${item.done ? '✅' : '⚪'}</button>
        <div class="record-item-body">
          <p class="record-item-time" style="${item.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${item.label}</p>
          <p class="record-item-sub">予定日: ${item.dateLabel}${item.done ? '（済み）' : ''}</p>
        </div>
      `;
      el.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        Data.toggleAutoScheduleStatus(item.key);
        renderScheduleScreen();
      });
      autoContainer.appendChild(el);
    });
  }

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
          <p class="record-item-sub">予定日: ${item.date}</p>
        </div>
        <button class="record-action" data-action="delete" aria-label="削除">🗑</button>
      `;
      el.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        Data.toggleScheduleCustom(item.id);
        renderScheduleScreen();
      });
      el.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm('この予定を削除しますか？')) {
          Data.deleteScheduleCustom(item.id);
          renderScheduleScreen();
        }
      });
      customContainer.appendChild(el);
    });
  }
}

// ---------------- 設定画面 ----------------

function setupSettingsScreen() {
  document.getElementById('settings-save-btn').addEventListener('click', () => {
    const name = document.getElementById('settings-name-input').value.trim();
    const birthdate = document.getElementById('settings-birthdate-input').value;
    Data.saveChild({ name, birthdate });
    alert('保存しました');
    renderHome();
  });
}

function renderSettingsScreen() {
  const child = Data.getChild();
  document.getElementById('settings-name-input').value = child.name || '';
  document.getElementById('settings-birthdate-input').value = child.birthdate || '';
  document.getElementById('settings-share-code').textContent = child.shareCode;
}

// ---------------- 初期化 ----------------

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupFeedingScreen();
  setupGrowthScreen();
  setupScheduleScreen();
  setupSettingsScreen();
  renderHome();
});
