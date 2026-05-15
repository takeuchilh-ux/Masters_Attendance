// ============================================================
// MasuTa! 打刻アプリ - 事業所管理者向け
// ============================================================

const { useState, useEffect, useMemo, useRef } = React;

const SUPABASE_URL  = 'https://dzwsdmcffrubjimnrfyf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6d3NkbWNmZnJ1YmppbW5yZnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjkxODAsImV4cCI6MjA5NDMwNTE4MH0.VXEGijG64gi9TMWDhrvZE6qcs0ZnArbZRrquGbpN-Kg';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const mdb  = (table) => supa.schema('masuta').from(table);

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

function fmtTime(t) {
  if (!t) return '';
  if (typeof t === 'string' && t.includes('T')) {
    const d = new Date(t);
    if (!isNaN(d)) {
      const j = new Date(d.getTime() + 9 * 3600000);
      return `${String(j.getUTCHours()).padStart(2,'0')}:${String(j.getUTCMinutes()).padStart(2,'0')}`;
    }
  }
  return String(t).slice(0, 5);
}

// ============================================================
// Toast
// ============================================================
let _showToast = null;
function showToast(msg, kind = 'success') { if (_showToast) _showToast({ msg, kind }); }
function Toast({ msg, kind }) {
  return <div className={`toast ${kind}`}>{msg}</div>;
}

// ============================================================
// DesktopApp - ルート
// ============================================================
function DesktopApp() {
  const [session,  setSession]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [offices,  setOffices]  = useState([]);
  const [officeId, setOfficeId] = useState(() => localStorage.getItem('masuta-office-id') || '');
  const [toast,    setToast]    = useState(null);

  _showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 2800); };

  // Supabase Auth
  useEffect(() => {
    supa.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supa.auth.onAuthStateChange((_, s) => {
      setSession(s);
      if (!s) { setOfficeId(''); localStorage.removeItem('masuta-office-id'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 事業所一覧
  useEffect(() => {
    if (!session) return;
    mdb('offices').select('*').order('name').then(({ data }) => setOffices(data || []));
  }, [session]);

  function selectOffice(id) {
    localStorage.setItem('masuta-office-id', id);
    setOfficeId(id);
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#f1f5f9' }}>
      <span className="muted">読み込み中...</span>
    </div>
  );

  const officeName = offices.find(o => o.id === officeId)?.name || '';

  return (
    <>
      {!session && <LoginPage />}
      {session && !officeId && (
        <OfficePicker
          offices={offices}
          onSelect={selectOffice}
          onLogout={() => supa.auth.signOut()}
        />
      )}
      {session && officeId && (
        <MainShell
          officeId={officeId}
          officeName={officeName}
          onChangeOffice={() => { localStorage.removeItem('masuta-office-id'); setOfficeId(''); }}
        />
      )}
      {toast && <Toast {...toast} />}
    </>
  );
}

// ============================================================
// LoginPage
// ============================================================
function LoginPage() {
  const [email,   setEmail]   = useState('');
  const [pw,      setPw]      = useState('');
  const [err,     setErr]     = useState('');
  const [busy,    setBusy]    = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await supa.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr('メールアドレスまたはパスワードが違います');
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-head">
          <div className="brand-square big">M</div>
          <h1>MasuTa!</h1>
          <p className="muted">事業所責任者ログイン</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" value={email} autoFocus
              onChange={e => { setEmail(e.target.value); setErr(''); }}
              placeholder="manager@example.com" />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input type="password" className="mono" value={pw}
              onChange={e => { setPw(e.target.value); setErr(''); }}
              placeholder="••••••••" />
          </label>
          {err && <div className="err">{err}</div>}
          <button className="btn-primary big" type="submit" disabled={busy}>
            {busy ? '認証中...' : 'ログイン'}
          </button>
        </form>
      </div>
      <div className="login-foot">© 2026 Masters Staff Inc.</div>
    </div>
  );
}

// ============================================================
// OfficePicker - 担当事業所選択
// ============================================================
function OfficePicker({ offices, onSelect, onLogout }) {
  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-head">
          <div className="brand-square big">M</div>
          <h1>MasuTa!</h1>
          <p className="muted">担当事業所を選択してください</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {offices.length === 0 && <p className="muted" style={{ textAlign: 'center' }}>事業所データを読み込み中...</p>}
          {offices.map(o => (
            <button key={o.id} className="tenant-btn" onClick={() => onSelect(o.id)}
              style={{ width: '100%', padding: '14px 16px', fontSize: 15, fontWeight: 600 }}>
              🏢 {o.name}
            </button>
          ))}
        </div>
        <button className="btn-ghost" style={{ marginTop: 16, width: '100%' }} onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MainShell - サイドバー＋ルーティング
// ============================================================
function MainShell({ officeId, officeName, onChangeOffice }) {
  const [route,      setRoute]      = useState('dashboard');
  const [pendingCnt, setPendingCnt] = useState(0);

  // 未承認申請数バッジ
  useEffect(() => {
    function load() {
      mdb('requests').select('id', { count: 'exact', head: true })
        .eq('office_id', officeId).eq('status', 'pending')
        .then(({ count }) => setPendingCnt(count || 0));
    }
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [officeId]);

  const nav = [
    { id: 'dashboard', label: 'ダッシュボード', icon: '🏠' },
    { id: 'shifts',    label: 'シフト',         icon: '📅' },
    { id: 'requests',  label: '申請承認',        icon: '📝', badge: pendingCnt },
    { id: 'touchlog',  label: 'タッチログ',      icon: '🔍' },
    { id: 'staff',     label: 'スタッフ',        icon: '👥' },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-square">M</div>
          <div className="brand-title">
            <strong>MasuTa!</strong>
            <span>打刻アプリ</span>
          </div>
        </div>

        <nav className="nav">
          {nav.map(it => (
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
            <div className="user-av">{officeName.slice(0, 1)}</div>
            <div>
              <strong style={{ fontSize: 12 }}>{officeName}</strong>
              <span>事業所責任者</span>
            </div>
          </div>
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={onChangeOffice}>事業所切替</button>
          <button className="btn-ghost" onClick={() => supa.auth.signOut()}>ログアウト</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>MasuTa!</span>
            <span className="sep">／</span>
            <strong>{nav.find(n => n.id === route)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="muted small">{officeName}</span>
          </div>
        </header>
        <div className="page">
          {route === 'dashboard' && <DashboardPage officeId={officeId} />}
          {route === 'shifts'    && <ShiftPage    officeId={officeId} />}
          {route === 'requests'  && <RequestsPage officeId={officeId} onCountChange={setPendingCnt} />}
          {route === 'touchlog'  && <TouchLogPage officeId={officeId} />}
          {route === 'staff'     && <StaffPage    officeId={officeId} />}
        </div>
      </main>
    </div>
  );
}

// ============================================================
// DashboardPage - 今日の出欠
// ============================================================
function DashboardPage({ officeId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [staff,   setStaff]   = useState([]);
  const [shifts,  setShifts]  = useState([]);
  const [touches, setTouches] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [sRes, shRes, tRes] = await Promise.all([
      mdb('staff').select('*').eq('office_id', officeId).eq('is_active', true).order('name'),
      mdb('shifts').select('*, shift_types(label,color,start_time,end_time)')
        .eq('office_id', officeId).eq('date', today).not('shift_type_id','is',null),
      mdb('touch_logs').select('staff_id,touch_type,touched_at')
        .eq('office_id', officeId)
        .gte('touched_at', `${today}T00:00:00`)
        .lte('touched_at', `${today}T23:59:59`),
    ]);
    setStaff(sRes.data || []);
    setShifts(shRes.data || []);
    setTouches(tRes.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [officeId]);

  const shiftedIds = useMemo(() => new Set(shifts.map(s => s.staff_id)), [shifts]);
  const touchInIds = useMemo(() => new Set(touches.filter(t => t.touch_type === 'in').map(t => t.staff_id)), [touches]);
  const touchOutIds = useMemo(() => new Set(touches.filter(t => t.touch_type === 'out').map(t => t.staff_id)), [touches]);

  const present = shifts.filter(s => touchInIds.has(s.staff_id)).length;
  const absent  = shifts.length - present;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>ダッシュボード</h1><p className="muted">本日 {today} の出欠状況（30秒自動更新）</p></div>
        <button className="btn-ghost" onClick={load}>🔄 更新</button>
      </div>

      <div className="kpis">
        <div className="kpi"><span>本日シフト</span><strong>{shifts.length}<small>名</small></strong></div>
        <div className="kpi ok"><span>出勤確認済み</span><strong>{present}<small>名</small></strong></div>
        <div className="kpi warn"><span>未確認</span><strong>{absent}<small>名</small></strong></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>出欠一覧</h3></div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }} className="muted">読み込み中...</div>
        ) : (
          <div className="attendance-list">
            {staff.filter(s => shiftedIds.has(s.id)).map(s => {
              const sh       = shifts.find(x => x.staff_id === s.id);
              const st       = sh?.shift_types;
              const hasIn    = touchInIds.has(s.id);
              const hasOut   = touchOutIds.has(s.id);
              const inTouch  = touches.filter(t => t.staff_id === s.id && t.touch_type === 'in').slice(-1)[0];
              const outTouch = touches.filter(t => t.staff_id === s.id && t.touch_type === 'out').slice(-1)[0];
              return (
                <div key={s.id} className="attendance-row">
                  <span title={hasIn ? '出勤確認済み' : '未出勤'}>{hasIn ? '🟢' : '🔴'}</span>
                  <span className="att-name">{s.name}</span>
                  {st && <span className="att-shift" style={{ background: st.color }}>{st.label}</span>}
                  <span className="muted small" style={{ marginLeft: 'auto' }}>
                    {hasIn  && `IN ${new Date(inTouch.touched_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`}
                    {hasOut && ` → OUT ${new Date(outTouch.touched_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`}
                  </span>
                </div>
              );
            })}
            {shifts.length === 0 && <div className="muted small" style={{ padding: '16px' }}>本日のシフトはありません</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ShiftPage - シフト作成・編集
// ============================================================
function ShiftPage({ officeId }) {
  const today = new Date();
  const [year,        setYear]        = useState(today.getFullYear());
  const [month,       setMonth]       = useState(today.getMonth() + 1);
  const [staff,       setStaff]       = useState([]);
  const [shiftTypes,  setShiftTypes]  = useState([]);
  const [shifts,      setShifts]      = useState({});
  const [editing,     setEditing]     = useState(null);
  const [loading,     setLoading]     = useState(false);

  // スタッフ・シフト種別
  useEffect(() => {
    mdb('staff').select('*').eq('office_id', officeId).eq('is_active', true).order('name')
      .then(({ data }) => setStaff(data || []));
    mdb('shift_types').select('*').eq('office_id', officeId).order('label')
      .then(({ data }) => setShiftTypes(data || []));
  }, [officeId]);

  // 月シフト
  useEffect(() => {
    setLoading(true);
    const ms  = `${year}-${String(month).padStart(2,'0')}`;
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    mdb('shifts').select('*').eq('office_id', officeId)
      .gte('date', `${ms}-01`).lte('date', end)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(s => {
          map[`${s.staff_id}|${s.date}`] = { typeId: s.shift_type_id, dbId: s.id,
            override: (s.override_start || s.override_end)
              ? { start: fmtTime(s.override_start), end: fmtTime(s.override_end) } : null };
        });
        setShifts(map);
        setLoading(false);
      });
  }, [officeId, year, month]);

  const days = useMemo(() => {
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      return { n: i + 1, dow: d.getDay(), iso: d.toISOString().slice(0, 10) };
    });
  }, [year, month]);

  async function saveShift(staffId, iso, typeId, override) {
    const key = `${staffId}|${iso}`;
    const ex  = shifts[key];
    if (!typeId) {
      if (ex?.dbId) await mdb('shifts').delete().eq('id', ex.dbId);
      setShifts(s => { const n = { ...s }; delete n[key]; return n; });
      return;
    }
    const payload = { staff_id: staffId, office_id: officeId, date: iso, shift_type_id: typeId,
      override_start: override?.start || null, override_end: override?.end || null };
    if (ex?.dbId) {
      await mdb('shifts').update(payload).eq('id', ex.dbId);
      setShifts(s => ({ ...s, [key]: { typeId, override, dbId: ex.dbId } }));
    } else {
      const { data } = await mdb('shifts').insert(payload).select().single();
      setShifts(s => ({ ...s, [key]: { typeId, override, dbId: data?.id } }));
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>シフト</h1><p className="muted">月単位でシフトを作成・編集できます</p></div>
      </div>
      <div className="card">
        <div className="shift-toolbar">
          <div className="month-nav">
            <button className="btn-icon" onClick={() => { if (month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); }}>◀</button>
            <strong>{year}年 {month}月</strong>
            <button className="btn-icon" onClick={() => { if (month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); }}>▶</button>
          </div>
          <div className="legend">
            {shiftTypes.map(t => (
              <span key={t.id} className="leg">
                <span className="sw" style={{ background: t.color }}></span>
                {t.label} {t.start_time && `${fmtTime(t.start_time)}〜${fmtTime(t.end_time)}`}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }} className="muted">読み込み中...</div>
        ) : (
          <div className="shift-matrix-wrap">
            <table className="shift-matrix">
              <thead>
                <tr>
                  <th className="sticky-l">スタッフ</th>
                  {days.map(d => (
                    <th key={d.n} className={`day-h ${d.dow===0?'sun':d.dow===6?'sat':''}`}>
                      <div className="dn">{d.n}</div>
                      <div className="dw">{['日','月','火','水','木','金','土'][d.dow]}</div>
                    </th>
                  ))}
                  <th className="total">合計</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => {
                  let totalH = 0;
                  return (
                    <tr key={s.id}>
                      <td className="sticky-l">
                        <div className="row-name">
                          <span className="avatar sm">{s.name.slice(0,1)}</span>
                          <strong>{s.name}</strong>
                        </div>
                      </td>
                      {days.map(d => {
                        const sh  = shifts[`${s.id}|${d.iso}`];
                        const sm  = sh ? shiftTypes.find(x => x.id === sh.typeId) : null;
                        const st  = fmtTime(sh?.override?.start || sm?.start_time);
                        const en  = fmtTime(sh?.override?.end   || sm?.end_time);
                        if (st && en) {
                          const [ih,im]=st.split(':').map(Number);
                          const [oh,om]=en.split(':').map(Number);
                          totalH += ((oh*60+om)-(ih*60+im)-(sm?.break_minutes||60))/60;
                        }
                        return (
                          <td key={d.n}
                            className={`shift-cell ${d.dow===0?'sun':d.dow===6?'sat':''}`}
                            onClick={() => setEditing({ staffId: s.id, date: d.iso })}>
                            {sm && (
                              <div className="cell-shift" style={{ background: sm.color }}>
                                <div className="lbl">{sm.label}</div>
                                {st && <div className="time mono">{st}〜{en}</div>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="total mono"><strong>{Math.max(0,Math.round(totalH))}</strong>h</td>
                    </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr><td colSpan={days.length + 2} className="empty">スタッフが登録されていません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ShiftEditModal
          staffName={staff.find(s => s.id === editing.staffId)?.name || ''}
          date={editing.date}
          shiftTypes={shiftTypes}
          current={shifts[`${editing.staffId}|${editing.date}`]}
          onClose={() => setEditing(null)}
          onSave={async (typeId, override) => {
            await saveShift(editing.staffId, editing.date, typeId, override);
            showToast('シフトを更新しました');
            setEditing(null);
          }}
          onDelete={async () => {
            await saveShift(editing.staffId, editing.date, null, null);
            showToast('シフトを削除しました');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ShiftEditModal({ staffName, date, shiftTypes, current, onClose, onSave, onDelete }) {
  const [selType,   setSelType]   = useState(current?.typeId || '');
  const [overStart, setOverStart] = useState(current?.override?.start || '');
  const [overEnd,   setOverEnd]   = useState(current?.override?.end   || '');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{staffName} — {date}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="shift-pick">
            <button
              className={`shift-chip ${!selType ? 'active' : ''}`}
              onClick={() => setSelType('')}
              style={{ borderColor: '#e2e8f0' }}>
              <strong>— なし —</strong>
            </button>
            {shiftTypes.map(t => (
              <button key={t.id}
                className={`shift-chip ${selType === t.id ? 'active' : ''}`}
                style={{ borderColor: t.color }}
                onClick={() => setSelType(t.id)}>
                <span className="sw" style={{ background: t.color }}></span>
                <div>
                  <strong>{t.label}</strong>
                  <div className="small">{fmtTime(t.start_time)}〜{fmtTime(t.end_time)}</div>
                </div>
              </button>
            ))}
          </div>
          {selType && (
            <>
              <div className="override-note">時刻を上書きする場合のみ入力</div>
              <div className="time-edit">
                <label className="field"><span>開始（上書）</span>
                  <input type="time" value={overStart} onChange={e => setOverStart(e.target.value)} /></label>
                <label className="field"><span>終了（上書）</span>
                  <input type="time" value={overEnd}   onChange={e => setOverEnd(e.target.value)}   /></label>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          {current?.typeId && <button className="btn-ghost danger" onClick={onDelete}>削除</button>}
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => onSave(selType, overStart||overEnd ? { start: overStart, end: overEnd } : null)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RequestsPage - 申請承認
// ============================================================
function RequestsPage({ officeId, onCountChange }) {
  const [requests,     setRequests]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [month,        setMonth]        = useState(new Date().toISOString().slice(0, 7));

  async function load() {
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const end    = new Date(y, m, 0).toISOString().slice(0, 10);
    const { data } = await mdb('requests')
      .select('*, staff(name)')
      .eq('office_id', officeId)
      .gte('date', `${month}-01`)
      .lte('date', end)
      .order('created_at', { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [officeId, month]);

  const filtered = useMemo(() =>
    requests.filter(r => statusFilter === 'all' || r.status === statusFilter),
    [requests, statusFilter]);

  async function updateStatus(id, status) {
    const { error } = await mdb('requests').update({ status }).eq('id', id);
    if (!error) {
      setRequests(rs => rs.map(r => r.id === id ? { ...r, status } : r));
      const newPending = requests.filter(r => r.id !== id && r.status === 'pending').length;
      onCountChange(newPending);
      showToast(status === 'approved' ? '承認しました' : '却下しました');
    }
  }

  const pillStatus = s => s === 'approved' ? 'done' : s === 'rejected' ? 'warn' : 'caution';

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>申請承認</h1><p className="muted">スタッフからの申請を承認・却下します</p></div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>月</span>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </label>
          <label className="field inline">
            <span>状態</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="pending">承認待ち</option>
              <option value="all">すべて</option>
              <option value="approved">承認済み</option>
              <option value="rejected">却下</option>
            </select>
          </label>
          <button className="btn-ghost" onClick={load}>🔄 更新</button>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }} className="muted">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">申請がありません ✅</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 18px',
                borderBottom: '1px solid var(--line)',
                background: r.status === 'pending' ? '#fffbeb' : '#fff',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    <strong>{r.staff?.name}</strong>
                    <span className={`pill ${pillStatus(r.status)}`}>{STATUS_LABELS[r.status]}</span>
                    <span className="pill caution">{REQUEST_TYPE_LABELS[r.type] || r.type}</span>
                    <span className="mono muted" style={{ fontSize: 12 }}>{r.date}</span>
                  </div>
                  {r.adjust_minutes > 0 && (
                    <div className="muted small">{r.adjust_minutes}分</div>
                  )}
                  {r.reason && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{r.reason}</div>}
                  <div className="muted small" style={{ marginTop: 4 }}>申請日: {r.created_at?.slice(0, 10)}</div>
                </div>
                {r.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn-mini ok"     onClick={() => updateStatus(r.id, 'approved')}>✓ 承認</button>
                    <button className="btn-mini danger" onClick={() => updateStatus(r.id, 'rejected')}>✗ 却下</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TouchLogPage - タッチログ
// ============================================================
function TouchLogPage({ officeId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(today);
  const [to,      setTo]      = useState(today);
  const [q,       setQ]       = useState('');

  async function load() {
    setLoading(true);
    const { data } = await mdb('touch_logs')
      .select('*, staff(name)')
      .eq('office_id', officeId)
      .gte('touched_at', `${from}T00:00:00`)
      .lte('touched_at', `${to}T23:59:59`)
      .order('touched_at', { ascending: false })
      .limit(500);
    setLogs(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [officeId, from, to]);

  const filtered = useMemo(() =>
    logs.filter(l => !q || l.staff?.name?.includes(q)),
    [logs, q]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>タッチログ</h1></div>
        <button className="btn-ghost" onClick={load}>🔄 更新</button>
      </div>
      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>期間</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            <span className="dash">〜</span>
            <input type="date" value={to}   onChange={e => setTo(e.target.value)} />
          </label>
          <label className="field inline grow">
            <span>名前</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="スタッフ名で絞込" />
          </label>
        </div>
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>日時</th><th>スタッフ</th><th>IDm</th><th>種別</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">読み込み中...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="empty">タッチログがありません</td></tr>}
            {filtered.map((l, i) => (
              <tr key={l.id}>
                <td className="rownum">{i + 1}</td>
                <td className="mono">{new Date(l.touched_at).toLocaleString('ja-JP')}</td>
                <td><strong>{l.staff?.name || <span className="muted small">未登録</span>}</strong></td>
                <td className="mono" style={{ fontSize: 11 }}>{l.ic_card_idm || '—'}</td>
                <td>
                  <span className={`pill ${l.touch_type === 'in' ? 'done' : 'caution'}`}>
                    {l.touch_type === 'in' ? '出勤' : '退勤'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sheet-foot">{filtered.length}件</div>
      </div>
    </div>
  );
}

// ============================================================
// StaffPage - スタッフ管理（事業所内）
// ============================================================
function StaffPage({ officeId }) {
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  async function load() {
    const { data } = await mdb('staff').select('*').eq('office_id', officeId).eq('is_active', true).order('name');
    setStaff(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [officeId]);

  async function save(form) {
    if (form.id) {
      const { id, ...rest } = form;
      const { error } = await mdb('staff').update(rest).eq('id', id);
      if (!error) { setStaff(ss => ss.map(s => s.id === id ? { ...s, ...rest } : s)); showToast('更新しました'); }
    } else {
      const { data, error } = await mdb('staff').insert({ ...form, office_id: officeId, is_active: true }).select().single();
      if (!error && data) { setStaff(ss => [...ss, data]); showToast('スタッフを登録しました'); }
    }
    setEditing(null);
  }

  async function del(id) {
    if (!confirm('このスタッフを削除しますか？')) return;
    const { error } = await mdb('staff').update({ is_active: false }).eq('id', id);
    if (!error) { setStaff(ss => ss.filter(s => s.id !== id)); showToast('削除しました'); }
  }

  const ROLE_LABELS = { staff: '一般', office_manager: '事業所責任者', admin: '本部' };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>スタッフ</h1><p className="muted">この事業所のスタッフ {staff.length}名</p></div>
        <button className="btn-primary" onClick={() => setEditing({ role: 'staff' })}>＋ スタッフ登録</button>
      </div>
      <div className="card">
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>氏名</th><th>権限</th><th>IC Card IDm</th><th>操作</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">読み込み中...</td></tr>}
            {!loading && staff.length === 0 && <tr><td colSpan={5} className="empty">スタッフがいません</td></tr>}
            {staff.map((s, i) => (
              <tr key={s.id}>
                <td className="rownum">{i + 1}</td>
                <td><div className="row-name">
                  <span className="avatar sm">{s.name.slice(0,1)}</span>
                  <strong>{s.name}</strong>
                </div></td>
                <td><span className="pill role-part">{ROLE_LABELS[s.role] || s.role}</span></td>
                <td className="mono" style={{ fontSize: 11 }}>{s.ic_card_idm || <span className="muted">未登録</span>}</td>
                <td>
                  <button className="btn-mini" onClick={() => setEditing(s)}>編集</button>
                  <button className="btn-mini danger" onClick={() => del(s.id)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sheet-foot">{staff.length}名</div>
      </div>

      {editing !== null && (
        <StaffEditModal
          staff={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function StaffEditModal({ staff: s, onClose, onSave }) {
  const [form, setForm] = useState({
    id:          s.id          || null,
    name:        s.name        || '',
    role:        s.role        || 'staff',
    ic_card_idm: s.ic_card_idm || '',
    email:       s.email       || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{s.id ? 'スタッフ編集' : 'スタッフ登録'}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row2">
            <label className="field"><span>氏名</span>
              <input value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
            </label>
            <label className="field"><span>権限</span>
              <select value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="staff">一般</option>
                <option value="office_manager">事業所責任者</option>
              </select>
            </label>
          </div>
          <label className="field"><span>メールアドレス（ログイン用）</span>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="manager@example.com" />
          </label>
          <label className="field"><span>IC Card IDm（フェリカ登録後に入力）</span>
            <input className="mono" value={form.ic_card_idm} onChange={e => set('ic_card_idm', e.target.value)} placeholder="01 23 45 67 89 AB CD EF" />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => { if (form.name.trim()) onSave(form); }}>保存</button>
        </div>
      </div>
    </div>
  );
}
