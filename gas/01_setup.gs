// ============================================================
// マスターズ勤怠システム - スプレッドシートDB セットアップ
// 使い方: スプレッドシートのApps Scriptエディタに貼り付け →
//         「setupAll」を選択して実行
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// ---- 事業所定義 ----
const TENANTS = [
  { id:'hq',    name:'本社',               code:'HQ', isAdmin:true  },
  { id:'siteA', name:'藤沢事業所',         code:'FA', isAdmin:false },
  { id:'siteB', name:'藤沢市民病院',       code:'FH', isAdmin:false },
  { id:'siteC', name:'藤沢湘南台病院',     code:'FS', isAdmin:false },
  { id:'siteD', name:'平塚市民病院',       code:'HH', isAdmin:false },
  { id:'siteE', name:'西横浜国際総合病院', code:'NK', isAdmin:false },
  { id:'siteF', name:'休日診療所',         code:'KD', isAdmin:false },
];

// ---- メイン実行 ----
function setupAll() {
  setup事業所マスタ();
  setupスタッフマスタ();
  setupシフトマスタ();
  setupシフトデータ();
  setup申請データ();
  TENANTS.forEach(t => setup打刻シート(t));
  setup概要ダッシュボード();
  Logger.log('✅ セットアップ完了');
  SpreadsheetApp.getUi().alert('✅ セットアップ完了！\n全シートが作成されました。');
}

// ============================================================
// 共通ユーティリティ
// ============================================================
function getOrCreateSheet(name) {
  let sh = SS.getSheetByName(name);
  if (!sh) sh = SS.insertSheet(name);
  return sh;
}

function styleHeader(sh, lastCol) {
  const hdr = sh.getRange(1, 1, 1, lastCol);
  hdr.setBackground('#1e40af')
     .setFontColor('#ffffff')
     .setFontWeight('bold')
     .setFontSize(11)
     .setHorizontalAlignment('center');
  sh.setFrozenRows(1);
}

function autoResize(sh) {
  sh.autoResizeColumns(1, sh.getLastColumn() || 1);
}

// ============================================================
// 事業所マスタ
// ============================================================
function setup事業所マスタ() {
  const sh = getOrCreateSheet('事業所マスタ');
  sh.clearContents();

  const headers = [
    'id','事業所名','コード','メールアドレス','パスワード','管理者フラグ','登録日時'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sh, headers.length);

  const rows = TENANTS.map(t => [
    t.id,
    t.name,
    t.code,
    `${t.id}@masters.co.jp`,
    t.isAdmin ? 'admin123' : `${t.id}123`,
    t.isAdmin ? 'TRUE' : 'FALSE',
    new Date(),
  ]);
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  autoResize(sh);
  Logger.log('事業所マスタ 作成完了');
}

// ============================================================
// スタッフマスタ
// ============================================================
function setupスタッフマスタ() {
  const sh = getOrCreateSheet('スタッフマスタ');
  sh.clearContents();

  const headers = [
    'スタッフID','氏名','事業所ID','事業所名','権限','ステータス',
    '入社日','メールアドレス','電話番号','住所',
    '給与種別','給与額','交通費種別','交通費','有給残日数',
    '登録日時','最終更新日時'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sh, headers.length);

  const STAFF_NAMES = {
    hq:    ['山田 太郎','佐藤 花子','鈴木 一郎','田中 美咲','高橋 健太','伊藤 さくら','渡辺 翔','中村 葵','小林 大輔','加藤 結衣'],
    siteA: ['吉田 蓮','山本 陽菜','井上 颯太','木村 凛','林 悠真','清水 紬','森 湊','池田 結菜','橋本 蒼','石川 七海'],
    siteB: ['前田 樹','藤田 美月','岡田 陸','長谷川 陽葵','後藤 海斗','村上 葵','坂本 律','遠藤 結','青木 翼','西村 凪'],
    siteC: ['宮崎 颯','三浦 心','酒井 結翔','金子 莉子','藤本 大和','原 杏奈','中島 朔','石田 詩','上田 蒼空','内田 椿'],
    siteD: ['松本 悠','中野 美羽','河野 凌','菊地 葵','斎藤 朱莉','藤井 大輝','西田 咲','山口 雄大','小野 瑞希','岩崎 颯'],
    siteE: ['久保 結衣','長田 蒼太','村田 のぞみ','伊東 拓海','横山 彩花','松田 健','石井 ひかり','大塚 遥','平野 翔太','野口 愛'],
    siteF: ['栗原 雄哉','田村 莉緒','根本 海','森田 澪','齊藤 翼','川上 日向','古川 萌','北村 颯真','高木 詩音','徳田 和'],
  };
  const SALARY_PRESETS = [
    ['時給',1050],['時給',1100],['時給',1200],['日給',10000],['日給',12000],
    ['月給',200000],['月給',250000],['時給',1500]
  ];
  const TRANSPORT_PRESETS = [
    ['日ごと',500],['日ごと',800],['日ごと',1000],['定期',8000],['定期',12000]
  ];
  const AREAS = ['本町','辻堂','片瀬','鵠沼','湘南台','茅ヶ崎','平塚'];
  const now = new Date();
  const rows = [];

  TENANTS.forEach(t => {
    const names = STAFF_NAMES[t.id] || [];
    names.forEach((name, i) => {
      const sid = `${t.id}-${String(i+1).padStart(2,'0')}`;
      const sp = SALARY_PRESETS[i % SALARY_PRESETS.length];
      const tp = TRANSPORT_PRESETS[i % TRANSPORT_PRESETS.length];
      const role = i===0 ? '責任者' : i<3 ? '正社員' : 'パート';
      const status = i<8 ? '在職' : i===8 ? '休職' : '離職';
      rows.push([
        sid, name, t.id, t.name, role, status,
        '2024-04-01',
        `${sid.replace('-','.')}@masters-staff.co.jp`,
        `090-${String(1000+(i*13+7)%9000).padStart(4,'0')}-${String(2000+(i*17+3)%9000).padStart(4,'0')}`,
        `神奈川県藤沢市${AREAS[i%AREAS.length]}${i+1}-${(i%9)+1}-${(i%20)+1}`,
        sp[0], sp[1], tp[0], tp[1],
        12 - i%5,
        now, now
      ]);
    });
  });

  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // ステータス列に色付け
  rows.forEach((r, i) => {
    const cell = sh.getRange(i+2, 6);
    if (r[5]==='在職') cell.setBackground('#d1fae5');
    else if (r[5]==='休職') cell.setBackground('#fef9c3');
    else cell.setBackground('#fee2e2');
  });

  autoResize(sh);
  Logger.log('スタッフマスタ 作成完了');
}

// ============================================================
// シフトマスタ
// ============================================================
function setupシフトマスタ() {
  const sh = getOrCreateSheet('シフトマスタ');
  sh.clearContents();

  const headers = ['シフトID','名称','開始時刻','終了時刻','休憩(分)','カラー','登録日時'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sh, headers.length);

  const rows = [
    ['early','早番','06:00','15:00',60,'#fde68a', new Date()],
    ['mid',  '中番','10:00','19:00',60,'#bfdbfe', new Date()],
    ['late', '遅番','13:00','22:00',60,'#c7d2fe', new Date()],
    ['off',  '休み','',     '',     0, '#e5e7eb', new Date()],
  ];
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  autoResize(sh);
  Logger.log('シフトマスタ 作成完了');
}

// ============================================================
// 打刻データシート（事業所別）
// ============================================================
function setup打刻シート(tenant) {
  if (tenant.isAdmin) return; // 本社は打刻なし
  const shName = `打刻_${tenant.name}`;
  const sh = getOrCreateSheet(shName);
  sh.clearContents();

  const headers = [
    '登録タイムスタンプ','最終更新タイムスタンプ',
    'スタッフID','氏名','事業所ID','日付',
    '出勤時刻','退勤時刻','休憩(分)',
    '実働時間(分)','実働時間(h)','状態','備考'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sh, headers.length);

  // ヘッダー色をサイト別に変える
  const colors = {siteA:'#1e40af',siteB:'#065f46',siteC:'#7e22ce',siteD:'#9a3412',siteE:'#1e3a5f',siteF:'#831843'};
  sh.getRange(1,1,1,headers.length).setBackground(colors[tenant.id] || '#334155');

  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  // タイムスタンプ列を日時形式に
  sh.getRange('A:B').setNumberFormat('yyyy/MM/dd HH:mm:ss');
  sh.getRange('F:F').setNumberFormat('yyyy-MM-dd');

  autoResize(sh);
  Logger.log(`打刻シート「${shName}」作成完了`);
}

// ============================================================
// シフトデータ
// ============================================================
function setupシフトデータ() {
  const sh = getOrCreateSheet('シフトデータ');
  sh.clearContents();

  const headers = [
    'スタッフID','氏名','事業所ID','日付',
    'シフト種別ID','シフト名','開始時刻(上書)','終了時刻(上書)',
    '登録タイムスタンプ','更新タイムスタンプ'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sh, headers.length);
  sh.getRange('D:D').setNumberFormat('yyyy-MM-dd');
  sh.getRange('I:J').setNumberFormat('yyyy/MM/dd HH:mm:ss');
  autoResize(sh);
  Logger.log('シフトデータ 作成完了');
}

// ============================================================
// 申請データ
// ============================================================
function setup申請データ() {
  const sh = getOrCreateSheet('申請データ');
  sh.clearContents();

  const headers = [
    '申請ID','スタッフID','氏名','事業所ID','事業所名',
    '申請種別','対象日','理由','ステータス',
    '提出日時','承認者ID','承認日時','フォームデータ(JSON)'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sh, headers.length);
  sh.getRange('J:L').setNumberFormat('yyyy/MM/dd HH:mm:ss');
  autoResize(sh);
  Logger.log('申請データ 作成完了');
}

// ============================================================
// 概要ダッシュボード
// ============================================================
function setup概要ダッシュボード() {
  const sh = getOrCreateSheet('📊 ダッシュボード');
  sh.clearContents();

  sh.getRange('A1').setValue('マスターズ勤怠システム - スプレッドシートDB')
    .setFontSize(16).setFontWeight('bold').setFontColor('#1e40af');
  sh.getRange('A2').setValue(`最終更新: ${new Date().toLocaleString('ja-JP')}`)
    .setFontColor('#64748b');

  sh.getRange('A4').setValue('シート一覧').setFontWeight('bold').setFontSize(12);
  const sheets = [
    ['事業所マスタ',    '事業所（本社・各サイト）の基本情報'],
    ['スタッフマスタ',  '全スタッフの個人情報・給与・権限'],
    ['シフトマスタ',    '早番・中番・遅番など区分定義'],
    ['打刻_藤沢事業所', '藤沢事業所の打刻記録（タイムスタンプ付）'],
    ['打刻_藤沢市民病院','藤沢市民病院の打刻記録'],
    ['打刻_藤沢湘南台病院','藤沢湘南台病院の打刻記録'],
    ['打刻_平塚市民病院','平塚市民病院の打刻記録'],
    ['打刻_西横浜国際総合病院','西横浜国際総合病院の打刻記録'],
    ['打刻_休日診療所', '休日診療所の打刻記録'],
    ['シフトデータ',    'スタッフ×日付のシフト割当'],
    ['申請データ',      '有給・打刻修正・スタッフ変更等の申請'],
  ];
  sh.getRange(5, 1, sheets.length, 2).setValues(sheets);
  sh.getRange(5, 1, sheets.length, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 320);
  SS.moveActiveSheet(0);
}
