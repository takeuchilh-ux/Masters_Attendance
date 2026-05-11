// ============================================================
// マスターズ勤怠システム - Web App API
// デプロイ方法:
//   Apps Script エディタ → デプロイ → 新しいデプロイ
//   種類: ウェブアプリ
//   実行者: 自分
//   アクセス: 全員（匿名）
// ============================================================

const SS2 = SpreadsheetApp.getActiveSpreadsheet();

// ---- CORS対応ヘッダー ----
function setCorsHeaders(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonRes(data) {
  return setCorsHeaders(
    ContentService.createTextOutput(JSON.stringify(data))
  );
}

// ============================================================
// GET ハンドラ
// ?type=staff              全スタッフ
// ?type=staff&tenantId=xx  事業所別スタッフ
// ?type=tenants            事業所一覧
// ?type=shifts             シフトマスタ
// ?type=punches&tenantId=xx 事業所別打刻
// ?type=requests           全申請
// ?type=shiftdata&tenantId=xx シフトデータ
// ============================================================
function doGet(e) {
  try {
    const type = e.parameter.type;
    const tenantId = e.parameter.tenantId || null;
    const staffId  = e.parameter.staffId  || null;
    const month    = e.parameter.month    || null; // YYYY-MM

    switch (type) {
      case 'staff':    return jsonRes(getStaff(tenantId));
      case 'tenants':  return jsonRes(getTenants());
      case 'shifts':   return jsonRes(getShiftMaster());
      case 'punches':  return jsonRes(getPunches(tenantId, staffId, month));
      case 'requests': return jsonRes(getRequests(tenantId));
      case 'shiftdata':return jsonRes(getShiftData(tenantId, month));
      default:
        return jsonRes({ error: 'unknown type: ' + type });
    }
  } catch(err) {
    return jsonRes({ error: err.message });
  }
}

// ============================================================
// POST ハンドラ
// body: { action, type, data, ... }
// action: upsertPunch | upsertStaff | upsertRequest |
//         upsertShift | approveRequest | deleteStaff
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action } = body;

    switch (action) {
      case 'upsertPunch':    return jsonRes(upsertPunch(body.data));
      case 'upsertStaff':    return jsonRes(upsertStaff(body.data));
      case 'deleteStaff':    return jsonRes(deleteStaff(body.staffId));
      case 'upsertRequest':  return jsonRes(upsertRequest(body.data));
      case 'approveRequest': return jsonRes(approveRequest(body.requestId, body.status, body.approverId));
      case 'upsertShift':    return jsonRes(upsertShift(body.data));
      case 'deleteShift':    return jsonRes(deleteShift(body.staffId, body.date));
      default:
        return jsonRes({ error: 'unknown action: ' + action });
    }
  } catch(err) {
    return jsonRes({ error: err.message });
  }
}

// ============================================================
// 読み取り関数
// ============================================================

function sheetToObjects(shName) {
  const sh = SS2.getSheetByName(shName);
  if (!sh) return [];
  const [headers, ...rows] = sh.getDataRange().getValues();
  return rows
    .filter(r => r[0] !== '') // 空行スキップ
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
}

function getTenants() {
  return sheetToObjects('事業所マスタ').map(r => ({
    id:      r['id'],
    name:    r['事業所名'],
    code:    r['コード'],
    email:   r['メールアドレス'],
    password:r['パスワード'],
    isAdmin: r['管理者フラグ'] === true || r['管理者フラグ'] === 'TRUE',
  }));
}

function getStaff(tenantId) {
  const all = sheetToObjects('スタッフマスタ').map(r => ({
    id:            r['スタッフID'],
    name:          r['氏名'],
    tenantId:      r['事業所ID'],
    role:          r['権限'],
    status:        r['ステータス'],
    joined:        formatDate(r['入社日']),
    email:         r['メールアドレス'],
    phone:         r['電話番号'],
    address:       r['住所'],
    salaryType:    r['給与種別'],
    salaryAmount:  Number(r['給与額']) || 0,
    transportType: r['交通費種別'],
    transportFee:  Number(r['交通費']) || 0,
    paidLeave:     Number(r['有給残日数']) || 0,
  }));
  return tenantId ? all.filter(s => s.tenantId === tenantId) : all;
}

function getShiftMaster() {
  return sheetToObjects('シフトマスタ').map(r => ({
    id:    r['シフトID'],
    label: r['名称'],
    start: formatTime(r['開始時刻']),
    end:   formatTime(r['終了時刻']),
    break: Number(r['休憩(分)']) || 0,
    color: r['カラー'],
  }));
}

function getPunches(tenantId, staffId, month) {
  const SITE_SHEETS = {
    siteA:'打刻_藤沢事業所', siteB:'打刻_藤沢市民病院',
    siteC:'打刻_藤沢湘南台病院', siteD:'打刻_平塚市民病院',
    siteE:'打刻_西横浜国際総合病院', siteF:'打刻_休日診療所'
  };
  const targets = tenantId && SITE_SHEETS[tenantId]
    ? [{ id: tenantId, shName: SITE_SHEETS[tenantId] }]
    : Object.entries(SITE_SHEETS).map(([id, shName]) => ({ id, shName }));

  const result = [];
  targets.forEach(({ id, shName }) => {
    sheetToObjects(shName).forEach(r => {
      const dateStr = formatDate(r['日付']);
      if (month && !dateStr.startsWith(month)) return;
      if (staffId && r['スタッフID'] !== staffId) return;
      result.push({
        staffId:   r['スタッフID'],
        staffName: r['氏名'],
        tenantId:  r['事業所ID'] || id,
        date:      dateStr,
        clockIn:   r['出勤時刻'],
        clockOut:  r['退勤時刻'],
        breakMin:  Number(r['休憩(分)']) || 0,
        status:    r['状態'],
        note:      r['備考'],
        ts:        r['登録タイムスタンプ'],
        updatedAt: r['最終更新タイムスタンプ'],
      });
    });
  });
  return result;
}

function getRequests(tenantId) {
  const all = sheetToObjects('申請データ').map(r => {
    let fd = null;
    try { fd = r['フォームデータ(JSON)'] ? JSON.parse(r['フォームデータ(JSON)']) : null; } catch(e){}
    return {
      id:          r['申請ID'],
      staffId:     r['スタッフID'],
      staffName:   r['氏名'],
      tenantId:    r['事業所ID'],
      type:        r['申請種別'],
      date:        formatDate(r['対象日']),
      reason:      r['理由'],
      status:      r['ステータス'],
      submittedAt: formatDate(r['提出日時']),
      approverId:  r['承認者ID'],
      approvedAt:  r['承認日時'] ? formatDate(r['承認日時']) : '',
      formData:    fd,
    };
  });
  return tenantId ? all.filter(r => r.tenantId === tenantId) : all;
}

function getShiftData(tenantId, month) {
  const all = sheetToObjects('シフトデータ').map(r => ({
    staffId:   r['スタッフID'],
    date:      formatDate(r['日付']),
    typeId:    r['シフト種別ID'],
    override:  (r['開始時刻(上書)'] || r['終了時刻(上書)'])
               ? { start: formatTime(r['開始時刻(上書)']), end: formatTime(r['終了時刻(上書)']) }
               : null,
  }));
  let filtered = all;
  if (tenantId) filtered = filtered.filter(r => r.staffId.startsWith(tenantId));
  if (month)    filtered = filtered.filter(r => r.date.startsWith(month));
  // キー形式: staffId|date → typeId/override
  const map = {};
  filtered.forEach(r => { map[`${r.staffId}|${r.date}`] = { typeId: r.typeId, override: r.override }; });
  return map;
}

// ============================================================
// 書き込み関数
// ============================================================

function upsertPunch(data) {
  // data: { staffId, staffName, tenantId, date, clockIn, clockOut, breakMin, status, note }
  const SITE_SHEETS = {
    siteA:'打刻_藤沢事業所', siteB:'打刻_藤沢市民病院',
    siteC:'打刻_藤沢湘南台病院', siteD:'打刻_平塚市民病院',
    siteE:'打刻_西横浜国際総合病院', siteF:'打刻_休日診療所'
  };
  const shName = SITE_SHEETS[data.tenantId];
  if (!shName) return { error: '対応するシートが見つかりません: ' + data.tenantId };
  const sh = SS2.getSheetByName(shName);
  if (!sh) return { error: 'シートが存在しません: ' + shName };

  const now = new Date();
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const staffIdx = headers.indexOf('スタッフID');
  const dateIdx  = headers.indexOf('日付');

  // 実働計算
  let workMin = 0;
  if (data.clockIn && data.clockOut) {
    const [ih,im] = data.clockIn.split(':').map(Number);
    const [oh,om] = data.clockOut.split(':').map(Number);
    workMin = (oh*60+om)-(ih*60+im)-(data.breakMin||0);
  }

  // 既存行を探す
  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][staffIdx]) === String(data.staffId) &&
        formatDate(rows[i][dateIdx]) === data.date) {
      existingRow = i + 1; // 1-indexed
      break;
    }
  }

  const rowData = [
    existingRow > 0 ? rows[existingRow-1][0] : now, // 登録TS（新規のみ更新）
    now, // 最終更新TS
    data.staffId, data.staffName, data.tenantId, data.date,
    data.clockIn || '', data.clockOut || '',
    data.breakMin || 0, workMin,
    workMin > 0 ? (workMin/60).toFixed(2) : '',
    data.status || '正常', data.note || ''
  ];

  if (existingRow > 0) {
    sh.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sh.appendRow(rowData);
  }
  return { ok: true, action: existingRow > 0 ? 'updated' : 'inserted' };
}

function upsertStaff(data) {
  const sh = SS2.getSheetByName('スタッフマスタ');
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('スタッフID');
  const now = new Date();

  const rowData = [
    data.id, data.name, data.tenantId,
    (SS2.getSheetByName('事業所マスタ')
       ?.getDataRange().getValues()
       .find(r => r[0] === data.tenantId)?.[1] || ''),
    data.role, data.status, data.joined,
    data.email, data.phone, data.address,
    data.salaryType, data.salaryAmount,
    data.transportType, data.transportFee,
    data.paidLeave || 12,
    now, now
  ];

  // 既存チェック
  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(data.id)) {
      existingRow = i + 1;
      break;
    }
  }
  if (existingRow > 0) {
    rowData[15] = rows[existingRow-1][15]; // 登録日時保持
    sh.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    rowData[0] = rowData[0] || `${data.tenantId}-${String(sh.getLastRow()).padStart(2,'0')}`;
    sh.appendRow(rowData);
  }
  return { ok: true, staffId: rowData[0] };
}

function deleteStaff(staffId) {
  const sh = SS2.getSheetByName('スタッフマスタ');
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(staffId)) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { error: 'スタッフが見つかりません: ' + staffId };
}

function upsertRequest(data) {
  const sh = SS2.getSheetByName('申請データ');
  const now = new Date();
  const fd = data.formData ? JSON.stringify(data.formData) : '';
  sh.appendRow([
    data.id || `R${Date.now()}`,
    data.staffId, data.staffName, data.tenantId,
    (SS2.getSheetByName('事業所マスタ')
       ?.getDataRange().getValues()
       .find(r => r[0] === data.tenantId)?.[1] || ''),
    data.type, data.date, data.reason,
    '承認待ち', now, '', '', fd
  ]);
  return { ok: true };
}

function approveRequest(requestId, status, approverId) {
  const sh = SS2.getSheetByName('申請データ');
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const idIdx  = headers.indexOf('申請ID');
  const stIdx  = headers.indexOf('ステータス');
  const apIdx  = headers.indexOf('承認者ID');
  const atIdx  = headers.indexOf('承認日時');
  const fdIdx  = headers.indexOf('フォームデータ(JSON)');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(requestId)) {
      sh.getRange(i+1, stIdx+1).setValue(status);
      sh.getRange(i+1, apIdx+1).setValue(approverId || 'admin');
      sh.getRange(i+1, atIdx+1).setValue(new Date());

      // スタッフ申請の場合は自動反映
      if (status === '承認済み') {
        const type = rows[i][headers.indexOf('申請種別')];
        let fd = null;
        try { fd = rows[i][fdIdx] ? JSON.parse(rows[i][fdIdx]) : null; } catch(e){}
        if (type === 'スタッフ登録申請' && fd) {
          const newId = `${fd.tenantId}-${String(Date.now()).slice(-4)}`;
          upsertStaff({ ...fd, id: newId });
        } else if (type === 'スタッフ変更申請' && fd) {
          const targetId = rows[i][headers.indexOf('スタッフID')];
          upsertStaff({ ...fd, id: targetId });
        } else if (type === 'スタッフ削除申請') {
          deleteStaff(rows[i][headers.indexOf('スタッフID')]);
        }
      }
      return { ok: true };
    }
  }
  return { error: '申請が見つかりません: ' + requestId };
}

function upsertShift(data) {
  // data: { staffId, staffName, tenantId, date, typeId, overrideStart, overrideEnd }
  const sh = SS2.getSheetByName('シフトデータ');
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const now = new Date();

  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === data.staffId && formatDate(rows[i][3]) === data.date) {
      existingRow = i + 1;
      break;
    }
  }

  const masterName = SS2.getSheetByName('シフトマスタ')
    ?.getDataRange().getValues()
    .find(r => r[0] === data.typeId)?.[1] || '';

  const rowData = [
    data.staffId, data.staffName, data.tenantId, data.date,
    data.typeId, masterName,
    data.overrideStart || '', data.overrideEnd || '',
    existingRow > 0 ? rows[existingRow-1][8] : now, now
  ];

  if (existingRow > 0) {
    sh.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sh.appendRow(rowData);
  }
  return { ok: true };
}

function deleteShift(staffId, date) {
  const sh = SS2.getSheetByName('シフトデータ');
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === staffId && formatDate(rows[i][3]) === date) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { error: 'シフトが見つかりません' };
}

// ============================================================
// ユーティリティ
// ============================================================
function formatTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  const s = String(val);
  return s.length > 5 ? s.slice(0, 5) : s; // 念のためHH:MMに切り詰め
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return String(val).slice(0, 10);
}
