/*
 * すくすくノート - Google Apps Script バックエンド
 * -----------------------------------------------------
 * このファイルを Google スプレッドシートに紐づく
 * Apps Script プロジェクトに貼り付けてウェブアプリとして
 * デプロイすると、js/data.js からのアクセス先になります。
 *
 * セットアップ手順は README.md を参照してください。
 * -----------------------------------------------------
 */

// textColumns: 日付/ID等、Sheetsが自動で日付型・数値型に変換してしまうと
// 困る列だけをプレーンテキスト形式に固定する（done等の真偽値・数値列は対象外）
const SHEET_DEFS = {
  CHILD: { name: 'Child', headers: ['name', 'birthdate', 'photo'], textColumns: ['birthdate'] },
  FEEDINGS: { name: 'Feedings', headers: ['id', 'type', 'timestamp', 'durationMin', 'amountMl'], textColumns: ['id', 'timestamp'] },
  GROWTH: { name: 'Growth', headers: ['id', 'date', 'weightG', 'heightCm'], textColumns: ['id', 'date'] },
  SCHEDULE_CUSTOM: { name: 'ScheduleCustom', headers: ['id', 'title', 'date', 'time', 'done'], textColumns: ['id', 'date', 'time'] },
};

function doGet(e) {
  return jsonOutput({ ok: true, message: 'sukusuku API is running' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents);
    const data = handleAction(body.action, body.payload);
    return jsonOutput({ ok: true, data });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, payload) {
  switch (action) {
    case 'getAll': return getAll();
    case 'saveChild': return saveChild(payload);
    case 'addFeeding': return addFeeding(payload);
    case 'updateFeeding': return updateFeeding(payload.id, payload.updates);
    case 'deleteFeeding': return deleteFeeding(payload.id);
    case 'addGrowth': return addGrowth(payload);
    case 'deleteGrowth': return deleteGrowth(payload.id);
    case 'addScheduleCustom': return addScheduleCustom(payload);
    case 'deleteScheduleCustom': return deleteScheduleCustom(payload.id);
    case 'toggleScheduleCustom': return toggleScheduleCustom(payload.id);
    default: throw new Error('未対応のaction: ' + action);
  }
}

// ---------------- シート操作の共通ヘルパー ----------------

function getSheet(def) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(def.name);
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    sheet.appendRow(def.headers);
    (def.textColumns || []).forEach((col) => {
      const colIdx = def.headers.indexOf(col) + 1;
      sheet.getRange(1, colIdx, 1000, 1).setNumberFormat('@');
    });
  }
  return sheet;
}

function normalizeCell(v) {
  if (v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }
  return v;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter((row) => row.some((c) => c !== ''))
    .map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, colIdx) => { obj[h] = normalizeCell(row[colIdx]); });
      return obj;
    });
}

function findRowById(sheet, headers, id) {
  const idCol = headers.indexOf('id');
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(id)) return r + 1; // 1-indexed row number
  }
  return -1;
}

function rowToObject(headers, rowValues) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = normalizeCell(rowValues[i]); });
  return obj;
}

// ---------------- 子どもの情報 ----------------

function getChildObj() {
  const sheet = getSheet(SHEET_DEFS.CHILD);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { name: '', birthdate: '' };
  return rowToObject(SHEET_DEFS.CHILD.headers, values[1]);
}

function saveChild(payload) {
  const def = SHEET_DEFS.CHILD;
  const sheet = getSheet(def);
  const current = getChildObj();
  const merged = Object.assign({}, current, payload);
  const row = def.headers.map((h) => (merged[h] == null ? '' : merged[h]));
  sheet.getRange(2, 1, 1, def.headers.length).setValues([row]);
  return merged;
}

// ---------------- 授乳記録 ----------------

function addFeeding(entry) {
  const def = SHEET_DEFS.FEEDINGS;
  const sheet = getSheet(def);
  const record = Object.assign({ id: Utilities.getUuid() }, entry);
  const row = def.headers.map((h) => (record[h] == null ? '' : record[h]));
  sheet.appendRow(row);
  return record;
}

function updateFeeding(id, updates) {
  const def = SHEET_DEFS.FEEDINGS;
  const sheet = getSheet(def);
  const rowNum = findRowById(sheet, def.headers, id);
  if (rowNum === -1) throw new Error('指定の授乳記録が見つかりません');
  const current = rowToObject(def.headers, sheet.getRange(rowNum, 1, 1, def.headers.length).getValues()[0]);
  const merged = Object.assign({}, current, updates);
  const row = def.headers.map((h) => (merged[h] == null ? '' : merged[h]));
  sheet.getRange(rowNum, 1, 1, def.headers.length).setValues([row]);
  return merged;
}

function deleteFeeding(id) {
  const def = SHEET_DEFS.FEEDINGS;
  const sheet = getSheet(def);
  const rowNum = findRowById(sheet, def.headers, id);
  if (rowNum !== -1) sheet.deleteRow(rowNum);
  return { id };
}

// ---------------- 成長記録 ----------------

function addGrowth(entry) {
  const def = SHEET_DEFS.GROWTH;
  const sheet = getSheet(def);
  const record = Object.assign({ id: Utilities.getUuid() }, entry);
  const row = def.headers.map((h) => (record[h] == null ? '' : record[h]));
  sheet.appendRow(row);
  return record;
}

function deleteGrowth(id) {
  const def = SHEET_DEFS.GROWTH;
  const sheet = getSheet(def);
  const rowNum = findRowById(sheet, def.headers, id);
  if (rowNum !== -1) sheet.deleteRow(rowNum);
  return { id };
}

// ---------------- 予定(カスタム) ----------------

function addScheduleCustom(entry) {
  const def = SHEET_DEFS.SCHEDULE_CUSTOM;
  const sheet = getSheet(def);
  const record = Object.assign({ id: Utilities.getUuid(), done: false }, entry);
  const row = def.headers.map((h) => (record[h] == null ? '' : record[h]));
  sheet.appendRow(row);
  return record;
}

function deleteScheduleCustom(id) {
  const def = SHEET_DEFS.SCHEDULE_CUSTOM;
  const sheet = getSheet(def);
  const rowNum = findRowById(sheet, def.headers, id);
  if (rowNum !== -1) sheet.deleteRow(rowNum);
  return { id };
}

function toggleScheduleCustom(id) {
  const def = SHEET_DEFS.SCHEDULE_CUSTOM;
  const sheet = getSheet(def);
  const rowNum = findRowById(sheet, def.headers, id);
  if (rowNum === -1) throw new Error('指定の予定が見つかりません');
  const current = rowToObject(def.headers, sheet.getRange(rowNum, 1, 1, def.headers.length).getValues()[0]);
  current.done = !current.done;
  const row = def.headers.map((h) => (current[h] == null ? '' : current[h]));
  sheet.getRange(rowNum, 1, 1, def.headers.length).setValues([row]);
  return current;
}

// ---------------- 全件取得 ----------------

function getAll() {
  return {
    child: getChildObj(),
    feedings: sheetToObjects(getSheet(SHEET_DEFS.FEEDINGS)).map(stripRow),
    growth: sheetToObjects(getSheet(SHEET_DEFS.GROWTH)).map(stripRow),
    scheduleCustom: sheetToObjects(getSheet(SHEET_DEFS.SCHEDULE_CUSTOM)).map(stripRow),
  };
}

function stripRow(obj) {
  const copy = Object.assign({}, obj);
  delete copy._row;
  return copy;
}
