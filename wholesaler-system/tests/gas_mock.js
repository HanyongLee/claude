/**
 * gas_mock.js — Google Apps Script 서비스의 최소 모의 구현 (로컬 검증용)
 * 실제 서비스와 다른 점: 할당량·실행시간·권한 동의·셀 수 제한을 흉내 내지 않는다.
 * 실제 동작과 맞춘 점: 새 시트 1000행×26열, 범위 밖 getRange 는 오류, 텍스트 서식 셀은 문자열 유지,
 *                     서식 없는 셀에 날짜 문자열을 쓰면 Date 로 바뀜(Sheets 자동 변환 흉내).
 */
'use strict';
const crypto = require('crypto');

function createGas(opts) {
  let idSeq = 0;
  const newId = (p) => p + (++idSeq).toString(36).padStart(6, '0');
  const files = new Map();      // id -> file
  const folders = new Map();    // id -> folder
  const spreadsheets = new Map();
  const props = {};
  const triggers = [];
  const state = { activeEmail: opts.ownerEmail, ownerEmail: opts.ownerEmail, now: opts.now || null };

  /* ── Drive ── */
  function makeFolder(name, parentId) {
    const f = { id: newId('fo'), name, parentId, trashed: false };
    folders.set(f.id, f);
    return wrapFolder(f);
  }
  function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
  function wrapFolder(f) {
    return {
      getId: () => f.id, getName: () => f.name,
      createFolder: (n) => makeFolder(n, f.id),
      getFolders: () => iter([...folders.values()].filter(x => x.parentId === f.id && !x.trashed).map(wrapFolder)),
      getFoldersByName: (n) => iter([...folders.values()].filter(x => x.parentId === f.id && x.name === n && !x.trashed).map(wrapFolder)),
      getFiles: () => iter([...files.values()].filter(x => x.parentId === f.id && !x.trashed).map(wrapFile)),
      createFile: (a, b, mime) => {
        let name, bytes, m;
        if (typeof a === 'string') { name = a; bytes = Buffer.from(b, 'utf8'); m = mime; }
        else { name = a._name; bytes = a._bytes; m = a._mime; }
        const file = { id: newId('fi'), name, bytes, mime: m, parentId: f.id, trashed: false, sharing: 'PRIVATE' };
        files.set(file.id, file);
        return wrapFile(file);
      },
      setTrashed: (t) => { f.trashed = t; },
      getSharingAccess: () => 'PRIVATE', getEditors: () => [], getViewers: () => []
    };
  }
  function wrapFile(file) {
    return {
      getId: () => file.id, getName: () => file.name, setName: (n) => { file.name = n; },
      getBlob: () => ({
        getBytes: () => Array.from(file.bytes).map(b => (b > 127 ? b - 256 : b)),
        getDataAsString: () => file.bytes.toString('utf8')
      }),
      moveTo: (folder) => { file.parentId = folder.getId(); return wrapFile(file); },
      makeCopy: (name, folder) => {
        const c = { ...file, id: newId('fi'), name, parentId: folder ? folder.getId() : file.parentId, bytes: Buffer.from(file.bytes) };
        files.set(c.id, c);
        if (spreadsheets.has(file.id)) spreadsheets.set(c.id, cloneSs(spreadsheets.get(file.id), c));
        return wrapFile(c);
      },
      setTrashed: (t) => { file.trashed = t; },
      getSharingAccess: () => file.sharing, getEditors: () => [], getViewers: () => []
    };
  }
  const rootFolder = makeFolder('내 드라이브', null);
  const DriveApp = {
    getRootFolder: () => rootFolder,
    createFolder: (n) => rootFolder.createFolder(n),
    getFolderById: (id) => { const f = folders.get(id); if (!f || f.trashed) throw new Error('No folder ' + id); return wrapFolder(f); },
    getFileById: (id) => { const f = files.get(id); if (!f) throw new Error('No file ' + id); return wrapFile(f); }
  };

  /* ── Sheets ── */
  function makeSheet(name) { return { name, data: [], maxRows: 1000, maxCols: 26, textCols: new Set() }; }
  function cloneSs(ss, fileRec) {
    const c = { file: fileRec, name: fileRec.name, sheets: ss.sheets.map(s => ({ ...s, data: s.data.map(r => r.slice()), textCols: new Set(s.textCols) })) };
    return c;
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;
  function wrapSheet(ss, sh) {
    const S = {
      getName: () => sh.name,
      getLastRow: () => { for (let r = sh.data.length - 1; r >= 0; r--) if (sh.data[r] && sh.data[r].some(v => v !== '' && v !== undefined)) return r + 1; return 0; },
      getMaxRows: () => sh.maxRows, getMaxColumns: () => sh.maxCols,
      insertRowsAfter: (after, n) => { sh.maxRows += n; },
      insertColumnsAfter: (after, n) => { sh.maxCols += n; },
      setFrozenRows: () => {},
      getRange: (r, c, nr, nc) => {
        nr = nr || 1; nc = nc || 1;
        if (r < 1 || c < 1 || r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) {
          throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        }
        const R = {
          getValues: () => {
            const out = [];
            for (let i = 0; i < nr; i++) {
              const row = [];
              for (let j = 0; j < nc; j++) {
                const v = sh.data[r - 1 + i] ? sh.data[r - 1 + i][c - 1 + j] : undefined;
                row.push(v === undefined ? '' : v);
              }
              out.push(row);
            }
            return out;
          },
          setValues: (vals) => {
            if (vals.length !== nr || vals.some(v => v.length !== nc)) throw new Error('setValues 크기 불일치');
            for (let i = 0; i < nr; i++) {
              const ri = r - 1 + i;
              sh.data[ri] = sh.data[ri] || [];
              for (let j = 0; j < nc; j++) {
                let v = vals[i][j];
                const col = c - 1 + j;
                // Sheets 자동 변환 흉내: 텍스트 서식이 아닌 셀의 날짜 문자열은 Date 로 저장
                if (typeof v === 'string' && !sh.textCols.has(col) && DATE_RE.test(v)) v = new Date(v.replace(' ', 'T') + '+09:00');
                sh.data[ri][col] = v;
              }
            }
            return R;
          },
          clearContent: () => { for (let i = 0; i < nr; i++) { const row = sh.data[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } return R; },
          setNumberFormat: (fmt) => { if (fmt === '@') for (let j = 0; j < nc; j++) sh.textCols.add(c - 1 + j); return R; },
          setFontWeight: () => R, setBackground: () => R
        };
        return R;
      }
    };
    return S;
  }
  function wrapSs(ss) {
    return {
      getId: () => ss.file.id, getName: () => ss.file.name,
      setSpreadsheetTimeZone: () => {},
      getSheetByName: (n) => { const s = ss.sheets.find(x => x.name === n); return s ? wrapSheet(ss, s) : null; },
      getSheets: () => ss.sheets.map(s => wrapSheet(ss, s)),
      insertSheet: (n) => { const s = makeSheet(n); ss.sheets.push(s); return wrapSheet(ss, s); },
      deleteSheet: (w) => { ss.sheets = ss.sheets.filter(s => s.name !== w.getName()); }
    };
  }
  const SpreadsheetApp = {
    create: (name) => {
      const fileRec = { id: newId('ss'), name, bytes: Buffer.from(''), mime: 'sheet', parentId: rootFolder.getId(), trashed: false, sharing: 'PRIVATE' };
      files.set(fileRec.id, fileRec);
      const ss = { file: fileRec, sheets: [makeSheet('Sheet1')] };
      spreadsheets.set(fileRec.id, ss);
      return wrapSs(ss);
    },
    openById: (id) => { const ss = spreadsheets.get(id); if (!ss) throw new Error('No spreadsheet ' + id); return wrapSs(ss); }
  };

  /* ── 기타 서비스 ── */
  const pad = (n) => String(n).padStart(2, '0');
  function kst(d) { return new Date(d.getTime() + 9 * 3600000); }
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, input) => {
      const buf = Array.isArray(input) ? Buffer.from(input.map(b => (b < 0 ? b + 256 : b))) : Buffer.from(String(input), 'utf8');
      return Array.from(crypto.createHash(alg).update(buf).digest()).map(b => (b > 127 ? b - 256 : b));
    },
    formatDate: (date, tz, fmt) => {
      const d = kst(date);
      const map = { yyyy: d.getUTCFullYear(), yy: pad(d.getUTCFullYear() % 100), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
        HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()) };
      return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (k) => map[k]);
    },
    getUuid: () => crypto.randomUUID(),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b)),
    newBlob: (bytes, mime, name) => ({ _bytes: Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b))), _mime: mime, _name: name }),
    sleep: () => {}
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => ({ ...props })
    })
  };
  let lockHeld = false;
  const LockService = {
    getScriptLock: () => ({
      tryLock: () => { if (lockHeld) return false; lockHeld = true; return true; },
      waitLock: () => { if (lockHeld) throw new Error('lock timeout'); lockHeld = true; },
      releaseLock: () => { lockHeld = false; },
      hasLock: () => lockHeld
    })
  };
  const Session = {
    getActiveUser: () => ({ getEmail: () => state.activeEmail }),
    getEffectiveUser: () => ({ getEmail: () => state.ownerEmail })
  };
  const ScriptApp = {
    newTrigger: (fn) => {
      const t = { fn };
      const b = { timeBased: () => b, after: (ms) => { t.after = ms; return b; }, everyDays: () => b, atHour: (h) => { t.hour = h; return b; },
        create: () => { const tr = { getHandlerFunction: () => fn, _t: t }; triggers.push(tr); return tr; } };
      return b;
    },
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (tr) => { const i = triggers.indexOf(tr); if (i >= 0) triggers.splice(i, 1); }
  };
  const logs = [];
  const Logger = { log: (m) => { logs.push(String(m)); } };
  const MimeType = { CSV: 'text/csv' };

  return {
    globals: { SpreadsheetApp, DriveApp, Utilities, PropertiesService, LockService, Session, ScriptApp, Logger, MimeType,
      HtmlService: {}, console: { log() {}, error: (e) => logs.push('ERR ' + e) } },
    state, files, folders, triggers, logs, props, lockRelease: () => { lockHeld = false; }
  };
}

module.exports = { createGas };
