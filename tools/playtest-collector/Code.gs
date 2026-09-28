/**
 * CarFacTycoon playtest collector: a Google Apps Script web app.
 *
 * The public build of the game posts here the games its players agree to share.
 * Each game is kept as one JSON file in a Drive folder (a newer copy of the same
 * game replaces the older one) and gets one row in the "Oyunlar" sheet of the
 * spreadsheet this script is bound to. Setup: see README.md next to this file.
 */

var FOLDER_NAME = 'CarFacTycoon oyunları';
var SHEET_NAME = 'Oyunlar';
var MAX_BYTES = 3000000;
var HEADER = ['Oyun', 'Oyuncu', 'Son gönderim', 'Otomatik', 'Şirket', 'Oyun tarihi', 'Kasa', 'İtibar', 'Modeller', 'Hatalar', 'Not', 'Dosya'];

function doPost(e) {
  var body = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!body || body.length > MAX_BYTES) return reply_('rejected: size');
  var p;
  try {
    p = JSON.parse(body);
  } catch (err) {
    return reply_('rejected: json');
  }
  if (!p || p.app !== 'carfactycoon' || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(p.id)) return reply_('rejected: shape');
  if (typeof p.data !== 'string' || !p.summary) return reply_('rejected: save');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var file = saveFile_(p.id + '.json', body);
    upsertRow_(p, file.getUrl());
  } finally {
    lock.releaseLock();
  }
  return reply_('ok');
}

/** A quick check that the web app is up: open its URL in a browser. */
function doGet() {
  return reply_('CarFacTycoon collector is running.');
}

function reply_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function saveFile_(name, content) {
  var folder = folder_();
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    var f = it.next();
    f.setContent(content);
    return f;
  }
  return folder.createFile(name, content, 'application/json');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Text from players goes in as text, never as a formula. */
function safe_(v) {
  var s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, 5000);
}

function upsertRow_(p, url) {
  var sh = sheet_();
  var s = p.summary || {};
  var models = (s.models || [])
    .map(function (m) {
      return m.name + ' (' + m.segment + ', ' + m.status + ', ' + m.sold + ' adet, dergi ' + m.review + ')';
    })
    .join('; ');
  var row = [
    p.id,
    safe_(p.player),
    p.sentAt || new Date().toISOString(),
    p.auto ? 'evet' : 'hayır',
    safe_(s.company),
    safe_(s.date),
    s.cash,
    s.reputation,
    safe_(models),
    safe_((s.errors || []).join(' | ')),
    safe_(p.note),
    url,
  ];
  var found = sh.getRange('A:A').createTextFinder(p.id).matchEntireCell(true).findNext();
  if (found) sh.getRange(found.getRow(), 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}
