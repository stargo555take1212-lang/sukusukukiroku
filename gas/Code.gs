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
  CHILD: { name: 'Child', headers: ['name', 'birthdate', 'photo', 'sex'], textColumns: ['birthdate'] },
  FEEDINGS: { name: 'Feedings', headers: ['id', 'type', 'timestamp', 'durationMin', 'amountMl'], textColumns: ['id', 'timestamp'] },
  GROWTH: { name: 'Growth', headers: ['id', 'date', 'weightG', 'heightCm'], textColumns: ['id', 'date'] },
  POOP: { name: 'Poop', headers: ['id', 'timestamp', 'size'], textColumns: ['id', 'timestamp'] },
};

function doGet(e) {
  return jsonOutput({ ok: true, message: 'sukusuku API is running' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // 読み取り(getAll)はデータを変更しないためロック不要。
    // 画面遷移のたびに裏で走る仕組みなので、ロックを取ると書き込み
    // リクエストがその分待たされて不安定になっていた。
    if (body.action === 'getAll') {
      return jsonOutput({ ok: true, data: getAll() });
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const data = handleAction(body.action, body.payload);
      return jsonOutput({ ok: true, data });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, payload) {
  switch (action) {
    case 'saveChild': return saveChild(payload);
    case 'addFeeding': return addFeeding(payload);
    case 'deleteFeeding': return deleteFeeding(payload.id);
    case 'addGrowth': return addGrowth(payload);
    case 'deleteGrowth': return deleteGrowth(payload.id);
    case 'addPoop': return addPoop(payload);
    case 'deletePoop': return deletePoop(payload.id);
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
      // 1000行分だけだと将来行が増えたときに書式が外れるため、余裕を持って広めに固定する
      sheet.getRange(1, colIdx, 20000, 1).setNumberFormat('@');
    });
  }
  return sheet;
}

function normalizeCell(v) {
  if (v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    // toISOString()は常に正しいUTC表記を返すため、タイムゾーンの取り違えが起きない
    return v.toISOString();
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

// ---------------- うんち記録 ----------------

function addPoop(entry) {
  const def = SHEET_DEFS.POOP;
  const sheet = getSheet(def);
  const record = Object.assign({ id: Utilities.getUuid() }, entry);
  const row = def.headers.map((h) => (record[h] == null ? '' : record[h]));
  sheet.appendRow(row);
  return record;
}

function deletePoop(id) {
  const def = SHEET_DEFS.POOP;
  const sheet = getSheet(def);
  const rowNum = findRowById(sheet, def.headers, id);
  if (rowNum !== -1) sheet.deleteRow(rowNum);
  return { id };
}

// ---------------- 全件取得 ----------------

function getAll() {
  return {
    child: getChildObj(),
    feedings: sheetToObjects(getSheet(SHEET_DEFS.FEEDINGS)).map(stripRow),
    growth: sheetToObjects(getSheet(SHEET_DEFS.GROWTH)).map(stripRow),
    poop: sheetToObjects(getSheet(SHEET_DEFS.POOP)).map(stripRow),
  };
}

function stripRow(obj) {
  const copy = Object.assign({}, obj);
  delete copy._row;
  return copy;
}
