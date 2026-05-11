// ============================================================
// マスターズ勤怠システム - メインアプリ
// ============================================================

const { useState, useEffect, useMemo, useRef, createContext, useContext } = React;

// ============================================================
// Google Apps Script 連携
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz4uTCKEBv0Iehm3A_STdOiLkH34Ly2oIqTuwna3SGYdCJyv8-b9H8twEa5frAVIUwR/exec';

async function gasGet(params) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${GAS_URL}?${qs}`);
    return await res.json();
  } catch(e) { console.warn('GAS GET error:', e); return null; }
}

async function gasPost(body) {
  try {
    // no-cors で fire-and-forget（GAS側は受信・処理する）
    await fetch(GAS_URL, { method:'POST', mode:'no-cors', body: JSON.stringify(body) });
  } catch(e) { console.warn('GAS POST error:', e); }
}

// ---------- 仮データ ----------
const TENANTS = [
{ id: 'hq',    name: '本社',             code: 'HQ', email: 'admin@masters.co.jp',   password: 'admin123',  isAdmin: true  },
{ id: 'siteA', name: '藤沢事業所',       code: 'FA', email: 'siteA@masters.co.jp',   password: 'siteA123',  isAdmin: false },
{ id: 'siteB', name: '藤沢市民病院',     code: 'FH', email: 'siteB@masters.co.jp',   password: 'siteB123',  isAdmin: false },
{ id: 'siteC', name: '藤沢湘南台病院',   code: 'FS', email: 'siteC@masters.co.jp',   password: 'siteC123',  isAdmin: false },
{ id: 'siteD', name: '平塚市民病院',     code: 'HH', email: 'siteD@masters.co.jp',   password: 'siteD123',  isAdmin: false },
{ id: 'siteE', name: '西横浜国際総合病院', code: 'NK', email: 'siteE@masters.co.jp', password: 'siteE123',  isAdmin: false },
{ id: 'siteF', name: '休日診療所',       code: 'KD', email: 'siteF@masters.co.jp',   password: 'siteF123',  isAdmin: false }];


const STAFF_NAMES = {
  hq:    ['山田 太郎', '佐藤 花子', '鈴木 一郎', '田中 美咲', '高橋 健太', '伊藤 さくら', '渡辺 翔', '中村 葵', '小林 大輔', '加藤 結衣'],
  siteA: ['吉田 蓮', '山本 陽菜', '井上 颯太', '木村 凛', '林 悠真', '清水 紬', '森 湊', '池田 結菜', '橋本 蒼', '石川 七海'],
  siteB: ['前田 樹', '藤田 美月', '岡田 陸', '長谷川 陽葵', '後藤 海斗', '村上 葵', '坂本 律', '遠藤 結', '青木 翼', '西村 凪'],
  siteC: ['宮崎 颯', '三浦 心', '酒井 結翔', '金子 莉子', '藤本 大和', '原 杏奈', '中島 朔', '石田 詩', '上田 蒼空', '内田 椿'],
  siteD: ['松本 悠', '中野 美羽', '河野 凌', '菊地 葵', '斎藤 朱莉', '藤井 大輝', '西田 咲', '山口 雄大', '小野 瑞希', '岩崎 颯'],
  siteE: ['久保 結衣', '長田 蒼太', '村田 のぞみ', '伊東 拓海', '横山 彩花', '松田 健', '石井 ひかり', '大塚 遥', '平野 翔太', '野口 愛'],
  siteF: ['栗原 雄哉', '田村 莉緒', '根本 海', '森田 澪', '齊藤 翼', '川上 日向', '古川 萌', '北村 颯真', '高木 詩音', '徳田 和']
};

const PASSCODES = {}; // staffId -> '1234' (全員 1234 で固定 / プロト)
const SALARY_PRESETS = [
  { salaryType: '時給', salaryAmount: 1050 },
  { salaryType: '時給', salaryAmount: 1100 },
  { salaryType: '時給', salaryAmount: 1200 },
  { salaryType: '日給', salaryAmount: 10000 },
  { salaryType: '日給', salaryAmount: 12000 },
  { salaryType: '月給', salaryAmount: 200000 },
  { salaryType: '月給', salaryAmount: 250000 },
  { salaryType: '時給', salaryAmount: 1500 },
];
const TRANSPORT_PRESETS = [
  { transportType: '日ごと', transportFee: 500 },
  { transportType: '日ごと', transportFee: 800 },
  { transportType: '日ごと', transportFee: 1000 },
  { transportType: '定期',   transportFee: 8000 },
  { transportType: '定期',   transportFee: 12000 },
];
const AREAS = ['本町', '辻堂', '片瀬', '鵠沼', '湘南台', '茅ヶ崎', '平塚'];
const ALL_STAFF = (() => {
  const list = [];
  Object.entries(STAFF_NAMES).forEach(([tid, names]) => {
    names.forEach((n, i) => {
      const id = `${tid}-${String(i + 1).padStart(2, '0')}`;
      PASSCODES[id] = '1234';
      const sp = SALARY_PRESETS[i % SALARY_PRESETS.length];
      const tp = TRANSPORT_PRESETS[i % TRANSPORT_PRESETS.length];
      list.push({
        id,
        name: n,
        tenantId: tid,
        role: i === 0 ? '責任者' : i < 3 ? '正社員' : 'パート',
        joined: '2024-04-01',
        paidLeave: 12 - i % 5,
        email: `${id.replace('-','.')}@masters-staff.co.jp`,
        phone: `090-${String(1000 + (i * 13 + 7) % 9000).padStart(4,'0')}-${String(2000 + (i * 17 + 3) % 9000).padStart(4,'0')}`,
        address: `神奈川県藤沢市${AREAS[i % AREAS.length]}${i+1}-${(i%9)+1}-${(i%20)+1}`,
        status: i < 8 ? '在職' : i === 8 ? '休職' : '離職',
        salaryType:   sp.salaryType,
        salaryAmount: sp.salaryAmount,
        transportType: tp.transportType,
        transportFee:  tp.transportFee,
      });
    });
  });
  return list;
})();

const SHIFT_MASTER_DEFAULT = [
{ id: 'early', label: '早番', start: '06:00', end: '15:00', break: 60, color: '#fde68a' },
{ id: 'mid', label: '中番', start: '10:00', end: '19:00', break: 60, color: '#bfdbfe' },
{ id: 'late', label: '遅番', start: '13:00', end: '22:00', break: 60, color: '#c7d2fe' },
{ id: 'off', label: '休み', start: '', end: '', break: 0, color: '#e5e7eb' }];


// ---------- ダミー打刻データ生成 ----------
function genPunchData() {
  const today = new Date(2026, 4, 7); // 2026-05-07
  const rows = [];
  ALL_STAFF.forEach((s) => {
    for (let d = 0; d < 14; d++) {
      const date = new Date(today);date.setDate(today.getDate() - d);
      const dow = date.getDay();
      if (dow === 0 && Math.random() < 0.7) continue; // 日曜は休み多め
      const isLate = Math.random() < 0.08;
      const isEarly = Math.random() < 0.05;
      const inH = 9 + (isLate ? 1 : 0);
      const inM = isLate ? Math.floor(Math.random() * 30) + 1 : Math.floor(Math.random() * 15);
      const outH = 18 + (isEarly ? -1 : 0);
      const outM = Math.floor(Math.random() * 45);
      rows.push({
        staffId: s.id,
        staffName: s.name,
        tenantId: s.tenantId,
        date: date.toISOString().slice(0, 10),
        clockIn: `${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}`,
        clockOut: `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`,
        status: isLate ? '遅刻' : isEarly ? '早退' : '正常'
      });
    }
  });
  return rows;
}

// ---------- AppState (簡易ストア) ----------
const AppCtx = createContext(null);

function AppProvider({ children }) {
  const [punches, setPunches] = useState(() => genPunchData());
  const [shiftMaster, setShiftMaster] = useState(SHIFT_MASTER_DEFAULT);
  const [shifts, setShifts] = useState(() => genShifts(shiftMaster_(), STAFF_NAMES));
  const [requests, setRequests] = useState(genRequests());
  const [staff, setStaff] = useState(ALL_STAFF);
  const [tenants, setTenants] = useState(TENANTS);
  const [toast, setToast] = useState(null);
  const [gasStatus, setGasStatus] = useState('loading'); // 'loading' | 'ok' | 'error'

  // GAS からマスタデータを初回ロード
  useEffect(() => {
    Promise.all([
      gasGet({ type: 'staff' }),
      gasGet({ type: 'tenants' }),
      gasGet({ type: 'shifts' }),
      gasGet({ type: 'requests' }),
    ]).then(([staffData, tenantsData, shiftsData, requestsData]) => {
      if (Array.isArray(staffData)    && staffData.length    > 0) setStaff(staffData);
      if (Array.isArray(tenantsData)  && tenantsData.length  > 0) setTenants(tenantsData);
      if (Array.isArray(shiftsData)   && shiftsData.length   > 0) setShiftMaster(shiftsData);
      if (Array.isArray(requestsData) && requestsData.length > 0) setRequests(requestsData);
      setGasStatus('ok');
    }).catch(err => {
      console.warn('GAS読込失敗、ローカルデータを使用:', err);
      setGasStatus('error');
    });
  }, []);

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind, t: Date.now() });
    setTimeout(() => setToast((t) => t && t.msg === msg ? null : t), 2800);
  }

  const value = {
    punches, setPunches,
    shiftMaster, setShiftMaster,
    shifts, setShifts,
    requests, setRequests,
    staff, setStaff,
    tenants, setTenants,
    toast, showToast,
    gasStatus,
  };
  return <AppCtx.Provider value={value}>{children}{toast && <Toast {...toast} />}</AppCtx.Provider>;
}

function shiftMaster_() {return SHIFT_MASTER_DEFAULT;}

function genShifts(master, names) {
  // tenantId+staffId+date -> shiftTypeId, with optional override times
  const shifts = {};
  const today = new Date(2026, 4, 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = 31;
  Object.entries(names).forEach(([tid, list]) => {
    list.forEach((n, i) => {
      const sid = `${tid}-${String(i + 1).padStart(2, '0')}`;
      for (let d = 0; d < days; d++) {
        const date = new Date(monthStart);date.setDate(monthStart.getDate() + d);
        if (date.getMonth() !== monthStart.getMonth()) break;
        const dow = date.getDay();
        const r = (i + d) % 7;
        let typeId;
        if (dow === 0 || r === 6) typeId = 'off';else
        if (r < 2) typeId = 'early';else
        if (r < 4) typeId = 'mid';else
        typeId = 'late';
        shifts[`${sid}|${date.toISOString().slice(0, 10)}`] = { typeId };
      }
    });
  });
  return shifts;
}

function genRequests() {
  const types = ['有給申請', '打刻修正申請', '残業申請', 'シフト変更希望', '欠勤連絡'];
  const statuses = ['承認待ち', '承認済み', '却下'];
  const rows = [];
  for (let i = 0; i < 18; i++) {
    const s = ALL_STAFF[Math.floor(Math.random() * ALL_STAFF.length)];
    rows.push({
      id: `R${String(1000 + i)}`,
      staffId: s.id,
      staffName: s.name,
      tenantId: s.tenantId,
      type: types[i % types.length],
      date: `2026-05-${String(i % 28 + 1).padStart(2, '0')}`,
      reason: ['私用のため', '体調不良', '業務都合', '打刻忘れ', '家族都合'][i % 5],
      status: statuses[i % 3],
      submittedAt: `2026-05-0${i % 6 + 1}`
    });
  }
  return rows;
}

// ============================================================
// Auth / Routing
// ============================================================
function App() {
  const [auth, setAuth] = useState(null); // { tenantId, isAdmin }
  const [lang, setLang] = useState('ja');
  const [route, setRoute] = useState('home');

  useEffect(() => {
    const saved = sessionStorage.getItem('mk-auth');
    if (saved) try {setAuth(JSON.parse(saved));} catch (e) {}
  }, []);
  useEffect(() => {
    if (auth) sessionStorage.setItem('mk-auth', JSON.stringify(auth));else
    sessionStorage.removeItem('mk-auth');
  }, [auth]);

  if (!auth) return <AppProvider><Login onLogin={setAuth} lang={lang} setLang={setLang} /></AppProvider>;

  return (
    <AppProvider>
      <Shell auth={auth} setAuth={setAuth} route={route} setRoute={setRoute} lang={lang} setLang={setLang} />
    </AppProvider>);

}

// ============================================================
// Login
// ============================================================
function Login({ onLogin, lang, setLang }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  function submit(e) {
    e?.preventDefault();
    const t = TENANTS.find((t) => t.email.toLowerCase() === email.trim().toLowerCase());
    if (!t) return setErr('メールアドレスが見つかりません');
    if (pw !== t.password) return setErr('パスワードが違います');
    onLogin({ tenantId: t.id, isAdmin: t.isAdmin, tenantName: t.name });
  }

  function fillSample(t) {
    setEmail(t.email);setPw(t.password);setErr('');
  }

  return (
    <div className="login-bg">
      <div className="login-topbar">
        <div className="brand-mini">
          <div className="brand-square">M</div>
          <span>マスターズ勤怠システム</span>
        </div>
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="ja">日本語</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </div>

      <div className="login-card">
        <div className="login-head">
          <div className="brand-square big">M</div>
          <h1>{lang === 'en' ? 'Sign in' : 'ログイン'}</h1>
          <p className="muted">{lang === 'en' ? 'Enter your email and password' : 'メールアドレスとパスワードを入力してください'}</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>{lang === 'en' ? 'Email' : 'メールアドレス'}</span>
            <input className="text-input" type="email" value={email} onChange={(e) => {setEmail(e.target.value);setErr('');}} placeholder="name@masters.co.jp" autoFocus />
          </label>

          <label className="field">
            <span>{lang === 'en' ? 'Password' : 'パスワード'}</span>
            <input className="text-input mono" type="password" value={pw} onChange={(e) => {setPw(e.target.value);setErr('');}} placeholder="••••••••" />
          </label>

          {err && <div className="err">{err}</div>}

          <button className="btn-primary big" type="submit">{lang === 'en' ? 'Sign in' : 'ログイン'}</button>

          <div className="hint">
            <strong>テスト用アカウント（クリックで入力）</strong>
            <div className="sample-accounts">
              {TENANTS.map((t) =>
              <button type="button" key={t.id} className="sample-acc" onClick={() => fillSample(t)}>
                  <span className="sa-name">{t.name}{t.isAdmin && <span className="tbadge inline">管理者</span>}</span>
                  <span className="sa-mail mono">{t.email}</span>
                  <span className="sa-pw mono">pw: {t.password}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="login-foot">© 2026 Masters Inc. — 内部利用専用</div>
    </div>);

}

// ============================================================
// Shell
// ============================================================
function Shell({ auth, setAuth, route, setRoute, lang, setLang }) {
  const { gasStatus } = useContext(AppCtx);
  const tenant = TENANTS.find((t) => t.id === auth.tenantId);
  const isAdmin = auth.isAdmin;
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [pwPrompt, setPwPrompt] = useState(false);
  const { requests } = useContext(AppCtx);
  const pendingCount = isAdmin ? requests.filter((r) => r.status === '承認待ち').length : 0;

  const navItems = isAdmin ?
  [
  { id: 'home', label: '打刻', icon: '⏱' },
  { id: 'punches', label: '打刻管理', icon: '📋' },
  { id: 'staff', label: 'スタッフ管理', icon: '👥' },
  { id: 'tenants', label: '事業所管理', icon: '🏢' },
  { id: 'roles', label: '権限設定', icon: '🔐' },
  { id: 'requests', label: '申請承認', icon: '📝', badge: pendingCount },
  { id: 'shift', label: 'シフト', icon: '📅' }] :

  [
  { id: 'home', label: '打刻', icon: '⏱' },
  { id: 'shift', label: 'シフト', icon: '📅' },
  { id: 'settings', label: '設定', icon: '⚙', locked: !settingsUnlocked }];


  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-square">M</div>
          <div className="brand-title">
            <strong>Masters sutaff</strong>
            <span>勤怠システム</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((it) =>
          <button key={it.id} className={`nav-item ${route === it.id ? 'active' : ''}`} onClick={() => {
            if (it.locked && !settingsUnlocked) {setPwPrompt(true);return;}
            setRoute(it.id);
          }}>
              <span className="nav-ic">{it.icon}</span>
              <span>{it.label}</span>
              {it.badge > 0 && <span className="nav-badge">{it.badge}</span>}
              {it.locked && !settingsUnlocked && <span className="lock-badge">🔒</span>}
            </button>
          )}
        </nav>
        <div className="side-foot">
          <div className="user">
            <div className="user-av">{tenant?.code}</div>
            <div>
              <strong>{tenant?.name}</strong>
              <span>{isAdmin ? '管理者' : '事業所責任者'}</span>
            </div>
          </div>
          <button className="btn-ghost" onClick={() => setAuth(null)}>ログアウト</button>
        </div>
      </aside>

      {pwPrompt &&
      <div className="modal-bg" onClick={() => setPwPrompt(false)}>
          <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>🔒 設定を開く</h3><button className="x" onClick={() => setPwPrompt(false)}>×</button></div>
            <form onSubmit={(e) => {
            e.preventDefault();
            const pw = e.target.elements.pw.value;
            if (pw === tenant.password) {setSettingsUnlocked(true);setPwPrompt(false);setRoute('settings');} else
            {e.target.elements.pw.value = '';e.target.elements.pw.focus();}
          }}>
              <div className="modal-body">
                <p className="muted small" style={{ margin: 0 }}>事業所のログインパスワードを入力してください</p>
                <label className="field"><span>パスワード</span><input className="mono" name="pw" type="password" autoFocus /></label>
                <div className="hint"><strong>テスト用:</strong><div>{tenant.password}</div></div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn-ghost" onClick={() => setPwPrompt(false)}>キャンセル</button>
                <button type="submit" className="btn-primary">解除</button>
              </div>
            </form>
          </div>
        </div>
      }

      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>{tenant?.name}</span>
            <span className="sep">／</span>
            <strong>{navItems.find((n) => n.id === route)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span title={gasStatus==='ok'?'スプレッドシート連携中':gasStatus==='error'?'GAS接続エラー':'接続中...'} style={{fontSize:16,lineHeight:1}}>
              {gasStatus==='ok'?'🟢':gasStatus==='error'?'🔴':'🟡'}
            </span>
            <Clock />
            <select className="lang-select small" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
        </header>

        <div className="page">
          {route === 'home' && <HomePunch auth={auth} />}
          {route === 'punches' && isAdmin && <PunchAdmin />}
          {route === 'staff' && isAdmin && <StaffAdmin />}
          {route === 'tenants' && isAdmin && <TenantAdmin />}
          {route === 'roles' && isAdmin && <RoleAdmin />}
          {route === 'requests' && <RequestsPage isAdmin={isAdmin} auth={auth} />}
          {route === 'shift' && <ShiftPage auth={auth} />}
          {route === 'shiftmaster' && <ShiftMasterPage />}
          {route === 'settings' && !isAdmin && <SiteSettings auth={auth} setRoute={setRoute} />}
        </div>
      </main>
    </div>);

}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const d = now;
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return (
    <div className="topclock">
      <span>{d.getFullYear()}/{String(d.getMonth() + 1).padStart(2, '0')}/{String(d.getDate()).padStart(2, '0')} ({wd})</span>
      <strong>{String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}:{String(d.getSeconds()).padStart(2, '0')}</strong>
    </div>);

}

function Toast({ msg, kind }) {
  return <div className={`toast ${kind}`}>{msg}</div>;
}

// ============================================================
// HOME (打刻 + 申請)
// ============================================================
function HomePunch({ auth }) {
  const { punches, setPunches, showToast } = useContext(AppCtx);
  const tenantStaff = ALL_STAFF.filter((s) => s.tenantId === auth.tenantId);
  const [selectedId, setSelectedId] = useState('');
  const selected = tenantStaff.find((s) => s.id === selectedId) || null;
  const [pin, setPin] = useState('');
  const [step, setStep] = useState('pick'); // pick | action | done
  const [result, setResult] = useState(null);
  const [showRequest, setShowRequest] = useState(false);

  function authenticate(e) {
    e?.preventDefault();
    if (!selected) {showToast('氏名を選択してください', 'error');return;}
    if (PASSCODES[selected.id] !== pin) {showToast('パスワードが違います', 'error');return;}
    setStep('action');
  }
  function doPunch(kind) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0'),mm = String(now.getMinutes()).padStart(2, '0');
    const today = now.toISOString().slice(0, 10);
    const existing = punches.find((p) => p.staffId === selected.id && p.date === today);
    if (kind === 'in') {
      if (existing) {showToast('本日は既に出勤打刻済みです', 'error');} else {
        const newPunch = { staffId: selected.id, staffName: selected.name, tenantId: selected.tenantId, date: today, clockIn: `${hh}:${mm}`, clockOut: '', status: '正常' };
        setPunches((ps) => [newPunch, ...ps]);
        gasPost({ action: 'upsertPunch', data: newPunch }); // GASへ書き込み
        setResult({ kind: 'in', time: `${hh}:${mm}`, name: selected.name });
        setStep('done');
      }
    } else {
      if (!existing) {showToast('まず出勤打刻をしてください', 'error');} else {
        const updated = { ...existing, clockOut: `${hh}:${mm}` };
        setPunches((ps) => ps.map((p) => p.staffId === selected.id && p.date === today ? updated : p));
        gasPost({ action: 'upsertPunch', data: updated }); // GASへ書き込み
        setResult({ kind: 'out', time: `${hh}:${mm}`, name: selected.name });
        setStep('done');
      }
    }
  }
  function reset() {setSelectedId('');setPin('');setStep('pick');setResult(null);}

  return (
    <div className="punch-only">
      <section className="card big-card">
        <div className="card-head">
          <h2>打刻</h2>
          <span className="muted">氏名を選んでパスワードを入力してください</span>
        </div>

        {step === 'pick' &&
        <form className="punch-pick" onSubmit={authenticate}>
            <div className="pick-illust">
              <div className="avatar lg">{selected ? selected.name.slice(0, 1) : '?'}</div>
              <strong>{selected ? `${selected.name} さん` : '氏名を選択してください'}</strong>
              <span className="muted">{selected ? selected.role : ''}</span>
            </div>
            <label className="field">
              <span>氏名</span>
              <select className="big-select" value={selectedId} onChange={(e) => {setSelectedId(e.target.value);setPin('');}} autoFocus>
                <option value="">― 選択してください ―</option>
                {tenantStaff.map((s) =>
              <option key={s.id} value={s.id}>{s.name}（{s.role}）</option>
              )}
              </select>
            </label>
            <label className="field">
              <span>パスワード</span>
              <input className="big-input mono" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4桁のパスワード" maxLength={8} />
            </label>
            <button className="btn-primary big" type="submit" disabled={!selectedId || !pin}>認証して打刻画面へ</button>
            <div className="muted small center">テスト: 全員 1234</div>
          </form>
        }

        {step === 'action' &&
        <div className="punch-pane">
            <button className="back" onClick={reset}>← 戻る</button>
            <div className="hello">
              <div className="avatar lg">{selected.name.slice(0, 1)}</div>
              <div>
                <div className="muted">こんにちは</div>
                <strong>{selected.name} さん</strong>
              </div>
            </div>
            <div className="punch-buttons">
              <button className="punch-btn in" onClick={() => doPunch('in')}>
                <span className="ic">出勤</span>
                <span className="lbl"></span>
                <span className="sub"></span>
              </button>
              <button className="punch-btn out" onClick={() => doPunch('out')}>
                <span className="ic">退勤</span>
                <span className="lbl"></span>
                <span className="sub"></span>
              </button>
            </div>
            <button className="link-btn" onClick={() => setShowRequest(true)}>📝 申請を提出する</button>
          </div>
        }

        {step === 'done' &&
        <div className="done-pane">
            <div className={`done-badge ${result.kind}`}>
              <div className="check">✓</div>
              <strong>{result.kind === 'in' ? '出勤' : '退勤'}を打刻しました</strong>
              <div className="time">{result.time}</div>
              <div className="muted">{result.name} さん、{result.kind === 'in' ? '宜しくお願いします！' : 'お疲れ様でした！'}</div>
            </div>
            <button className="btn-primary" onClick={reset}>完了</button>
          </div>
        }
      </section>

      {showRequest && <RequestModal staff={selected} onClose={() => setShowRequest(false)} />}
    </div>);

}

// ============================================================
// REQUEST MODAL
// ============================================================
function RequestModal({ staff, onClose }) {
  const { setRequests, showToast } = useContext(AppCtx);
  const [type, setType] = useState('有給申請');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  function submit() {
    if (!staff) {showToast('スタッフが選択されていません', 'error');return;}
    const req = {
      id: `R${Date.now()}`,
      staffId: staff.id, staffName: staff.name, tenantId: staff.tenantId,
      type, date, reason, status: '承認待ち',
      submittedAt: new Date().toISOString().slice(0, 10)
    };
    setRequests((rs) => [req, ...rs]);
    gasPost({ action: 'upsertRequest', data: req }); // GASへ書き込み
    showToast('申請を送信しました');
    onClose();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>申請の提出</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="muted">申請者: <strong>{staff?.name || '-'}</strong></div>
          <label className="field">
            <span>申請種別</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {['有給申請', '打刻修正申請', '残業申請', 'シフト変更希望', '欠勤連絡'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            <span>対象日</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>理由・備考</span>
            <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 私用のため" />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={submit}>申請する</button>
        </div>
      </div>
    </div>);

}

Object.assign(window, { App, AppCtx, ALL_STAFF, TENANTS, SHIFT_MASTER_DEFAULT, STAFF_NAMES });