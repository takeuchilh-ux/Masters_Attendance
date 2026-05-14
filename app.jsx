// ============================================================
// MasuTa! 大本管理者画面 - メインアプリ
// ============================================================

const { useState, useEffect, useMemo, createContext, useContext } = React;

// ============================================================
// Supabase クライアント
// ============================================================
const SUPABASE_URL  = 'https://dzwsdmcffrubjimnrfyf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6d3NkbWNmZnJ1YmppbW5yZnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjkxODAsImV4cCI6MjA5NDMwNTE4MH0.VXEGijG64gi9TMWDhrvZE6qcs0ZnArbZRrquGbpN-Kg';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// masuta スキーマへのショートカット
const mdb = (table) => supa.schema('masuta').from(table);

// ============================================================
// 定数
// ============================================================
const ADMIN_PASS = 'masuta2026';

const REQUEST_TYPE_LABELS = {
  late:             '遅刻',
  early_leave:      '早退',
  paid_leave_full:  '有給（全日）',
  paid_leave_am:    '有給（午前半日）',
  paid_leave_pm:    '有給（午後半日）',
};

const STATUS_LABELS = {
  pending:  '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

// ============================================================
// AppContext
// ============================================================
const AppCtx = createContext(null);

function AppProvider({ children }) {
  const [offices,    setOffices]    = useState([]);
  const [staff,      setStaff]      = useState([]);
  const [shiftTypes, setShiftTypes] = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [dbStatus,   setDbStatus]   = useState('loading');
  const [toast,      setToast]      = useState(null);

  async function loadMaster() {
    try {
      const [offRes, stRes, stypeRes, alertRes] = await Promise.all([
        mdb('offices').select('*').order('name'),
        mdb('staff').select('*').eq('is_active', true).order('name'),
        mdb('shift_types').select('*').order('label'),
        mdb('alerts')
          .select('*, staff(name), offices(name), requests(type, date, reason)')
          .order('created_at', { ascending: false }),
      ]);
      if (offRes.data)   setOffices(offRes.data);
      if (stRes.data)    setStaff(stRes.data);
      if (stypeRes.data) setShiftTypes(stypeRes.data);
      if (alertRes.data) setAlerts(alertRes.data);
      setDbStatus('ok');
    } catch (e) {
      console.error('DB load error:', e);
      setDbStatus('error');
    }
  }

  useEffect(() => { loadMaster(); }, []);

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  }

  const unreadAlerts = useMemo(() => alerts.filter(a => !a.is_read).length, [alerts]);

  return (
    <AppCtx.Provider value={{
      offices, setOffices,
      staff, setStaff,
      shiftTypes, setShiftTypes,
      alerts, setAlerts,
      unreadAlerts,
      dbStatus,
      showToast,
      reload: loadMaster,
      mdb,
    }}>
      {children}
      {toast && <Toast {...toast} />}
    </AppCtx.Provider>
  );
}

// ============================================================
// App（ルーティング）
// ============================================================
function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('masuta-auth')); } catch { return null; }
  });

  useEffect(() => {
    if (auth) sessionStorage.setItem('masuta-auth', JSON.stringify(auth));
    else sessionStorage.removeItem('masuta-auth');
  }, [auth]);

  return (
    <AppProvider>
      {auth ? <Shell auth={auth} setAuth={setAuth} /> : <Login onLogin={setAuth} />}
    </AppProvider>
  );
}

// ============================================================
// Login
// ============================================================
function Login({ onLogin }) {
  const [pw,  setPw]  = useState('');
  const [err, setErr] = useState('');

  function submit(e) {
    e.preventDefault();
    if (pw === ADMIN_PASS) {
      onLogin({ role: 'admin', name: '大本管理者' });
    } else {
      setErr('パスワードが違います');
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-head">
          <div className="brand-square big">M</div>
          <h1>MasuTa!</h1>
          <p className="muted">大本管理者ログイン</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>パスワード</span>
            <input
              className="text-input mono"
              type="password"
              value={pw}
              onChange={e => { setPw(e.target.value); setErr(''); }}
              placeholder="••••••••"
              autoFocus
            />
          </label>
          {err && <div className="err">{err}</div>}
          <button className="btn-primary big" type="submit">ログイン</button>
        </form>
      </div>
      <div className="login-foot">© 2026 Masters Staff Inc. — 内部利用専用</div>
    </div>
  );
}

// ============================================================
// Shell
// ============================================================
function Shell({ auth, setAuth }) {
  const [route, setRoute] = useState('dashboard');
  const { dbStatus, unreadAlerts } = useContext(AppCtx);

  const navItems = [
    { id: 'dashboard', label: 'ダッシュボード', icon: '🏠' },
    { id: 'shift',     label: 'シフト',         icon: '📅' },
    { id: 'requests',  label: '申請一覧',        icon: '📝' },
    { id: 'monthly',   label: '月次集計',        icon: '📊' },
    { id: 'touchlog',  label: 'タッチログ',      icon: '🔍' },
    { id: 'staff',     label: 'スタッフ管理',    icon: '👥' },
    { id: 'alerts',    label: 'アラート',        icon: '🔔', badge: unreadAlerts },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-square">M</div>
          <div className="brand-title">
            <strong>MasuTa!</strong>
            <span>管理者パネル</span>
          </div>
        </div>

        <nav className="nav">
          {navItems.map(it => (
            <button
              key={it.id}
              className={`nav-item ${route === it.id ? 'active' : ''}`}
              onClick={() => setRoute(it.id)}
            >
              <span className="nav-ic">{it.icon}</span>
              <span>{it.label}</span>
              {it.badge > 0 && <span className="nav-badge">{it.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <div className="user">
            <div className="user-av">管</div>
            <div>
              <strong>大本管理者</strong>
              <span>全事業所</span>
            </div>
          </div>
          <span
            title={dbStatus === 'ok' ? 'DB接続中' : dbStatus === 'error' ? 'DB接続エラー' : '接続中...'}
            style={{ fontSize: 16, lineHeight: 1 }}
          >
            {dbStatus === 'ok' ? '🟢' : dbStatus === 'error' ? '🔴' : '🟡'}
          </span>
          <button className="btn-ghost" onClick={() => setAuth(null)}>ログアウト</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>MasuTa!</span>
            <span className="sep">／</span>
            <strong>{navItems.find(n => n.id === route)?.label}</strong>
          </div>
          <div className="topbar-right">
            <Clock />
          </div>
        </header>

        <div className="page">
          {route === 'dashboard' && <DashboardPage />}
          {route === 'shift'     && <ShiftPage auth={auth} />}
          {route === 'requests'  && <RequestsViewPage />}
          {route === 'monthly'   && <MonthlyPage />}
          {route === 'touchlog'  && <TouchLogPage />}
          {route === 'staff'     && <StaffAdminPage />}
          {route === 'alerts'    && <AlertsPage />}
        </div>
      </main>
    </div>
  );
}

// ============================================================
// Clock / Toast
// ============================================================
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const wd = ['日','月','火','水','木','金','土'][now.getDay()];
  return (
    <div className="topclock">
      <span>{now.getFullYear()}/{String(now.getMonth()+1).padStart(2,'0')}/{String(now.getDate()).padStart(2,'0')} ({wd})</span>
      <strong>{String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}:{String(now.getSeconds()).padStart(2,'0')}</strong>
    </div>
  );
}

function Toast({ msg, kind }) {
  return <div className={`toast ${kind}`}>{msg}</div>;
}

// グローバル公開
Object.assign(window, { App, AppCtx, mdb, REQUEST_TYPE_LABELS, STATUS_LABELS });
