// ============================================================
// MasuTa! - メインアプリ（ロール振り分け）
// ============================================================

const { useState, useEffect, useMemo, createContext, useContext } = React;

// ============================================================
// Supabase クライアント
// ============================================================
const SUPABASE_URL  = 'https://dzwsdmcffrubjimnrfyf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6d3NkbWNmZnJ1YmppbW5yZnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjkxODAsImV4cCI6MjA5NDMwNTE4MH0.VXEGijG64gi9TMWDhrvZE6qcs0ZnArbZRrquGbpN-Kg';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const mdb  = (table) => supa.schema('masuta').from(table);

const EDGE_URL = `${SUPABASE_URL}/functions/v1/manage-user`;

// ============================================================
// 定数
// ============================================================
const REQUEST_TYPE_LABELS = {
  late:            '遅刻',
  early_leave:     '早退',
  paid_leave_full: '有給（全日）',
  paid_leave_am:   '有給（午前半日）',
  paid_leave_pm:   '有給（午後半日）',
};
const STATUS_LABELS = {
  pending:  '承認待ち',
  approved: '承認済み',
  rejected: '却下',
};

// ============================================================
// AppContext（本部用）
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
        mdb('offices').select('*').order('sort_order').order('name'),
        mdb('staff').select('*').eq('is_active', true).order('sort_order').order('name'),
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
      console.error(e);
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
      offices, setOffices, staff, setStaff,
      shiftTypes, setShiftTypes, alerts, setAlerts,
      unreadAlerts, dbStatus, showToast, reload: loadMaster, mdb,
    }}>
      {children}
      {toast && <Toast {...toast} />}
    </AppCtx.Provider>
  );
}

// ============================================================
// App（ルート）
// ============================================================
function App() {
  const [session,  setSession]  = useState(null);
  const [profile,  setProfile]  = useState(null); // masuta.staff レコード
  const [loading,  setLoading]  = useState(true);
  const [noProfile, setNoProfile] = useState(false);

  async function loadProfile(email) {
    const { data } = await mdb('staff')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();
    return data;
  }

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supa.auth.getSession();
        setSession(session);
        if (session) {
          const p = await loadProfile(session.user.email);
          setProfile(p);
          if (!p) setNoProfile(true);
        }
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        setLoading(false);
      }
    }
    init();

    const { data: { subscription } } = supa.auth.onAuthStateChange(async (_, session) => {
      setSession(session);
      if (session) {
        try {
          const p = await loadProfile(session.user.email);
          setProfile(p);
          setNoProfile(!p);
        } catch(e) { console.error('Profile load error:', e); }
      } else {
        setProfile(null);
        setNoProfile(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{ height:'100vh', display:'grid', placeItems:'center', background:'#f1f5f9' }}>
      <span style={{ color:'#64748b' }}>読み込み中...</span>
    </div>
  );

  if (!session) return <Login />;

  if (noProfile) return (
    <div style={{ height:'100vh', display:'grid', placeItems:'center', background:'#f1f5f9', padding:24 }}>
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'32px 28px', textAlign:'center', maxWidth:380 }}>
        <div style={{ fontSize:40, marginBottom:16 }}>🔒</div>
        <h2 style={{ margin:'0 0 10px', fontSize:18 }}>アカウントが設定されていません</h2>
        <p style={{ color:'#64748b', fontSize:14, lineHeight:1.7, marginBottom:24 }}>
          このメールアドレスにはアカウントが紐づいていません。<br />
          本部にアカウントの設定を依頼してください。
        </p>
        <button className="btn-ghost" onClick={() => supa.auth.signOut()}>ログアウト</button>
      </div>
    </div>
  );

  if (profile?.role === 'admin') {
    return (
      <AppProvider>
        <AdminShell profile={profile} />
      </AppProvider>
    );
  }

  if (profile?.role === 'office_manager') {
    return <OfficeShell profile={profile} />;
  }

  return (
    <div style={{ height:'100vh', display:'grid', placeItems:'center', background:'#f1f5f9' }}>
      <div style={{ textAlign:'center', padding:24 }}>
        <p style={{ color:'#64748b', marginBottom:16 }}>このアカウントではアクセスできません。</p>
        <button className="btn-ghost" onClick={() => supa.auth.signOut()}>ログアウト</button>
      </div>
    </div>
  );
}

// ============================================================
// Login
// ============================================================
function Login() {
  const [email,   setEmail]   = useState('');
  const [pw,      setPw]      = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    const { error } = await supa.auth.signInWithPassword({ email, password: pw });
    setLoading(false);
    if (error) setErr('メールアドレスまたはパスワードが違います');
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-head">
          <img src="logo.png" alt="Masters Staff" style={{ width:80, height:80, objectFit:'contain', margin:'0 auto', display:'block' }} />
          <h1>MasuTa!</h1>
          <p className="muted">ログイン</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" value={email} autoFocus
              onChange={e => { setEmail(e.target.value); setErr(''); }}
              placeholder="email@example.com" />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input type="password" className="mono" value={pw}
              onChange={e => { setPw(e.target.value); setErr(''); }}
              placeholder="••••••••" />
          </label>
          {err && <div className="err">{err}</div>}
          <button className="btn-primary big" type="submit" disabled={loading}>
            {loading ? '認証中...' : 'ログイン'}
          </button>
        </form>
      </div>
      <div className="login-foot">© 2026 Masters Staff Inc. — 内部利用専用</div>
    </div>
  );
}

// ============================================================
// AdminShell（本部用シェル）
// ============================================================
function AdminShell({ profile }) {
  const [route, setRoute] = useState('dashboard');
  const [sideOpen, setSideOpen] = useState(true);
  const { dbStatus, unreadAlerts } = useContext(AppCtx);

  const navItems = [
    { id: 'dashboard', label: 'ダッシュボード', icon: '🏠' },
    { id: 'shift',     label: 'シフト',         icon: '📅' },
    { id: 'requests',  label: '申請一覧',        icon: '📝' },
    { id: 'monthly',   label: '月次集計',        icon: '📊' },
    { id: 'touchlog',  label: 'QRログ',           icon: '🔍' },
    { id: 'staff',     label: 'スタッフ管理',    icon: '👥' },
    { id: 'alerts',    label: 'アラート',        icon: '🔔', badge: unreadAlerts },
    { id: 'offices',   label: '事業所管理',      icon: '🏢' },
    { id: 'accounts',  label: 'アカウント管理',  icon: '🔑' },
  ];

  return (
    <div className={`shell${sideOpen ? '' : ' sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src="logo.png" alt="Masters Staff" style={{ width:36, height:36, objectFit:'contain', background:'#fff', borderRadius:4, padding:2 }} />
          <div className="brand-title">
            <strong>MasuTa!</strong>
            <span>本部管理パネル</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map(it => (
            <button key={it.id}
              className={`nav-item ${route === it.id ? 'active' : ''}`}
              onClick={() => setRoute(it.id)}>
              <span className="nav-ic">{it.icon}</span>
              <span>{it.label}</span>
              {it.badge > 0 && <span className="nav-badge">{it.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="user">
            <div className="user-av">本</div>
            <div>
              <strong>本部</strong>
              <span>全事業所</span>
            </div>
          </div>
          <span title={dbStatus === 'ok' ? 'DB接続中' : 'DB接続エラー'} style={{ fontSize:16, lineHeight:1 }}>
            {dbStatus === 'ok' ? '🟢' : dbStatus === 'error' ? '🔴' : '🟡'}
          </span>
          <button className="btn-ghost" onClick={() => supa.auth.signOut()}>ログアウト</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display:'flex', alignItems:'center' }}>
            <button className="hamburger" onClick={() => setSideOpen(o => !o)} title="メニュー">
              <span /><span /><span />
            </button>
            <div className="crumbs">
              <span>MasuTa!</span><span className="sep">／</span>
              <strong>{navItems.find(n => n.id === route)?.label}</strong>
            </div>
          </div>
          <div className="topbar-right"></div>
        </header>
        <div className="page">
          {route === 'dashboard' && <DashboardPage />}
          {route === 'shift'     && <ShiftPage />}
          {route === 'requests'  && <RequestsViewPage />}
          {route === 'monthly'   && <MonthlyPage />}
          {route === 'touchlog'  && <TouchLogPage />}
          {route === 'staff'     && <StaffAdminPage />}
          {route === 'alerts'    && <AlertsPage />}
          {route === 'offices'   && <OfficesPage />}
          {route === 'accounts'  && <AccountsPage />}
        </div>
      </main>
    </div>
  );
}

// ============================================================
// Toast
// ============================================================
function Toast({ msg, kind }) {
  return <div className={`toast ${kind}`}>{msg}</div>;
}

// グローバル公開
Object.assign(window, { App, AppCtx, mdb, supa, EDGE_URL, REQUEST_TYPE_LABELS, STATUS_LABELS });
