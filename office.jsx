// ============================================================
// MasuTa! - 事業所責任者用画面
// ============================================================

const { useState: useStateO, useEffect: useEffectO, useMemo: useMemoO, useContext: useContextO, createContext: createContextO } = React;

const OfficeCtx = createContextO(null);

function OfficeProvider({ officeId, children }) {
  const [staff,      setStaff]      = useStateO([]);
  const [shiftTypes, setShiftTypes] = useStateO([]);
  const [toast,      setToast]      = useStateO(null);
  const [dbStatus,   setDbStatus]   = useStateO('loading');

  async function loadMaster() {
    try {
      const [stRes, stypeRes] = await Promise.all([
        mdb('staff').select('*').eq('office_id', officeId).eq('is_active', true).order('name'),
        mdb('shift_types').select('*').eq('office_id', officeId).order('label'),
      ]);
      if (stRes.data)    setStaff(stRes.data);
      if (stypeRes.data) setShiftTypes(stypeRes.data);
      setDbStatus('ok');
    } catch(e) {
      console.error(e);
      setDbStatus('error');
    }
  }

  useEffectO(() => { loadMaster(); }, [officeId]);

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  }

  return (
    <OfficeCtx.Provider value={{ officeId, staff, setStaff, shiftTypes, setShiftTypes, showToast, reload: loadMaster, dbStatus }}>
      {children}
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </OfficeCtx.Provider>
  );
}

// ============================================================
// OfficeShell - 事業所責任者のシェル
// ============================================================
function OfficeShell({ profile }) {
  const officeId = profile.office_id;
  const [officeName, setOfficeName] = useStateO('');
  const [route,      setRoute]      = useStateO('dashboard');
  const [pendingCnt, setPendingCnt] = useStateO(0);
  const [sideOpen,   setSideOpen]   = useStateO(true);

  useEffectO(() => {
    mdb('offices').select('name').eq('id', officeId).single()
      .then(({ data }) => setOfficeName(data?.name || ''));
    loadPending();
  }, [officeId]);

  function loadPending() {
    mdb('requests').select('id', { count: 'exact', head: true })
      .eq('office_id', officeId).eq('status', 'pending')
      .then(({ count }) => setPendingCnt(count || 0));
  }

  const isFujisawa = officeName === '藤沢事業所';

  const nav = [
    { id: 'dashboard', label: 'ダッシュボード', icon: '🏠' },
    { id: 'shifts',    label: 'シフト',         icon: '📅' },
    { id: 'requests',  label: '申請承認',        icon: '📝', badge: pendingCnt },
    { id: 'touchlog',  label: 'QRログ',          icon: '🔍' },
    ...(isFujisawa ? [{ id: 'pcpunch', label: 'PC打刻', icon: '🖥️' }] : []),
    { id: 'staff',     label: 'スタッフ管理',    icon: '👥' },
    { id: 'qr',        label: 'QRコード',        icon: '📲' },
  ];

  return (
    <OfficeProvider officeId={officeId}>
      <div className={`shell${sideOpen ? '' : ' sidebar-collapsed'}`}>
        <aside className="sidebar">
          <div className="brand">
            <img src="logo.png" alt="Masters Staff" style={{ width:36, height:36, objectFit:'contain', background:'#fff', borderRadius:4, padding:2 }} />
            <div className="brand-title">
              <strong>MasuTa!</strong>
              <span>事業所パネル</span>
            </div>
          </div>
          <nav className="nav">
            {nav.map(it => (
              <button key={it.id}
                className={`nav-item ${route === it.id ? 'active' : ''}`}
                onClick={() => { setRoute(it.id); if (it.id === 'requests') loadPending(); }}>
                <span className="nav-ic">{it.icon}</span>
                <span>{it.label}</span>
                {it.badge > 0 && <span className="nav-badge">{it.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <div className="user">
              <div className="user-av">{officeName.slice(0,1) || '事'}</div>
              <div>
                <strong style={{ fontSize:12 }}>{officeName}</strong>
                <span>事業所責任者</span>
              </div>
            </div>
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
                <strong>{nav.find(n => n.id === route)?.label}</strong>
              </div>
            </div>
            <div className="topbar-right">
              <span className="muted small">{officeName}</span>
            </div>
          </header>
          <div className="page">
            {route === 'dashboard' && <OfficeDashboard    officeId={officeId} />}
            {route === 'shifts'    && <OfficeShiftPage    officeId={officeId} />}
            {route === 'requests'  && <OfficeRequestsPage officeId={officeId} onCountChange={setPendingCnt} />}
            {route === 'touchlog'  && <OfficeTouchLogPage officeId={officeId} />}
            {route === 'pcpunch'   && <OfficePCPunchPage  officeId={officeId} officeName={officeName} />}
            {route === 'staff'     && <OfficeStaffPage    officeId={officeId} />}
            {route === 'qr'        && <OfficeQRPage       officeId={officeId} officeName={officeName} />}
          </div>
        </main>
      </div>
    </OfficeProvider>
  );
}

// ============================================================
// OfficeDashboard - 今日の出欠
// ============================================================
function OfficeDashboard({ officeId }) {
  const today = localISO(new Date());
  const { staff } = useContextO(OfficeCtx);
  const [shifts,  setShifts]  = useStateO([]);
  const [touches, setTouches] = useStateO([]);
  const [loading, setLoading] = useStateO(true);

  async function load() {
    const [shRes, tRes] = await Promise.all([
      mdb('shifts').select('*, shift_types(label,color,start_time,end_time)')
        .eq('office_id', officeId).eq('date', today).not('shift_type_id','is',null),
      mdb('touch_logs').select('staff_id,touch_type,touched_at')
        .eq('office_id', officeId)
        .gte('touched_at', `${today}T00:00:00`).lte('touched_at', `${today}T23:59:59`),
    ]);
    setShifts(shRes.data || []);
    setTouches(tRes.data || []);
    setLoading(false);
  }

  useEffectO(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [officeId]);

  const shiftedIds = useMemoO(() => new Set(shifts.map(s => s.staff_id)), [shifts]);
  const touchInIds = useMemoO(() => new Set(touches.filter(t => t.touch_type === 'in').map(t => t.staff_id)), [touches]);
  const touchOutIds = useMemoO(() => new Set(touches.filter(t => t.touch_type === 'out').map(t => t.staff_id)), [touches]);
  const present = shifts.filter(s => touchInIds.has(s.staff_id)).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>ダッシュボード</h1><p className="muted">本日 {today}（30秒自動更新）</p></div>
        <button className="btn-ghost" onClick={load}>🔄 更新</button>
      </div>
      <div className="kpis">
        <div className="kpi"><span>本日シフト</span><strong>{shifts.length}<small>名</small></strong></div>
        <div className="kpi ok"><span>出勤確認済み</span><strong>{present}<small>名</small></strong></div>
        <div className="kpi warn"><span>未確認</span><strong>{shifts.length - present}<small>名</small></strong></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>出欠一覧</h3></div>
        {loading ? <div style={{ padding:24, textAlign:'center' }} className="muted">読み込み中...</div> : (
          <div className="attendance-list">
            {staff.filter(s => shiftedIds.has(s.id)).map(s => {
              const sh     = shifts.find(x => x.staff_id === s.id);
              const st     = sh?.shift_types;
              const hasIn  = touchInIds.has(s.id);
              const hasOut = touchOutIds.has(s.id);
              const inT    = touches.filter(t => t.staff_id === s.id && t.touch_type === 'in').slice(-1)[0];
              const outT   = touches.filter(t => t.staff_id === s.id && t.touch_type === 'out').slice(-1)[0];
              return (
                <div key={s.id} className="attendance-row">
                  <span>{hasIn ? '🟢' : '🔴'}</span>
                  <span className="att-name">{s.name}</span>
                  {st && <span className="att-shift" style={{ background: st.color }}>{st.label}</span>}
                  <span className="muted small" style={{ marginLeft:'auto' }}>
                    {hasIn  && `IN ${new Date(inT.touched_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`}
                    {hasOut && ` → OUT ${new Date(outT.touched_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`}
                  </span>
                </div>
              );
            })}
            {shifts.length === 0 && <div className="muted small" style={{ padding:16 }}>本日のシフトはありません</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// OfficeShiftPage - シフト管理
// ============================================================
function OfficeShiftPage({ officeId }) {
  const today = new Date();
  const { staff, shiftTypes } = useContextO(OfficeCtx);
  const [year,    setYear]    = useStateO(today.getFullYear());
  const [month,   setMonth]   = useStateO(today.getMonth() + 1);
  const [shifts,  setShifts]  = useStateO({});
  const [editing, setEditing] = useStateO(null);
  const [loading, setLoading] = useStateO(false);

  useEffectO(() => {
    setLoading(true);
    const ms  = `${year}-${String(month).padStart(2,'0')}`;
    const end = localISO(new Date(year, month, 0));
    mdb('shifts').select('*').eq('office_id', officeId)
      .gte('date', `${ms}-01`).lte('date', end)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(s => {
          map[`${s.staff_id}|${s.date}`] = {
            typeId: s.shift_type_id, dbId: s.id,
            override: (s.override_start || s.override_end)
              ? { start: fmtTime(s.override_start), end: fmtTime(s.override_end) } : null,
            notes: s.notes || '',
          };
        });
        setShifts(map); setLoading(false);
      });
  }, [officeId, year, month]);

  const days = useMemoO(() => {
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      return { n: i + 1, dow: d.getDay(), iso: localISO(d) };
    });
  }, [year, month]);

  async function saveShift(staffId, iso, typeId, override, notes) {
    const key = `${staffId}|${iso}`;
    const ex  = shifts[key];
    if (!typeId) {
      if (ex?.dbId) await mdb('shifts').delete().eq('id', ex.dbId);
      setShifts(s => { const n = {...s}; delete n[key]; return n; });
      return;
    }
    const payload = { staff_id: staffId, office_id: officeId, date: iso, shift_type_id: typeId,
      override_start: override?.start || null, override_end: override?.end || null,
      notes: notes || null };
    if (ex?.dbId) {
      await mdb('shifts').update(payload).eq('id', ex.dbId);
      setShifts(s => ({ ...s, [key]: { typeId, override, notes, dbId: ex.dbId } }));
    } else {
      const { data } = await mdb('shifts').insert(payload).select().single();
      setShifts(s => ({ ...s, [key]: { typeId, override, notes, dbId: data?.id } }));
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
            <button className="btn-icon" onClick={() => { if(month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); }}>◀</button>
            <strong>{year}年 {month}月</strong>
            <button className="btn-icon" onClick={() => { if(month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); }}>▶</button>
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
          <div style={{ padding:24, textAlign:'center' }} className="muted">読み込み中...</div>
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
                  let totalH = 0, kyukeiCnt = 0, yukyuCnt = 0, kyuCnt = 0;
                  return (
                    <tr key={s.id}>
                      <td className="sticky-l">
                        <div className="row-name">
                          <span className="avatar sm">{s.name.slice(0,1)}</span>
                          <strong>{s.name}</strong>
                        </div>
                      </td>
                      {days.map(d => {
                        const sh = shifts[`${s.id}|${d.iso}`];
                        const sm = sh ? shiftTypes.find(x => x.id === sh.typeId) : null;
                        const st = fmtTime(sh?.override?.start || sm?.start_time);
                        const en = fmtTime(sh?.override?.end   || sm?.end_time);
                        if (st && en) {
                          const [ih,im]=st.split(':').map(Number);
                          const [oh,om]=en.split(':').map(Number);
                          totalH += ((oh*60+om)-(ih*60+im)-(sm?.break_minutes||60))/60;
                        }
                        if (sm?.label === '公休') kyukeiCnt++;
                        if (sm?.label === '有給') yukyuCnt++;
                        if (sm?.label === '休')   kyuCnt++;
                        return (
                          <td key={d.n}
                            className={`shift-cell ${d.dow===0?'sun':d.dow===6?'sat':''}`}
                            onClick={() => setEditing({ staffId: s.id, date: d.iso })}>
                            {sm && (
                              <div className="cell-shift" style={{ background: sm.color }}>
                                <div className="lbl">{sm.label}</div>
                                {st && <div className="time mono">{fmtShort(st)}〜{fmtShort(en)}</div>}
                                {sh?.notes && <div className="lbl" style={{ fontSize:9, opacity:.8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{sh.notes.length > 6 ? sh.notes.slice(0,6)+'…' : sh.notes}</div>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="total" style={{ fontSize:11, lineHeight:1.6 }}>
                        <strong className="mono">{Math.max(0,Math.round(totalH))}h</strong>
                        {kyukeiCnt > 0 && <div style={{ color:'#ef4444' }}>公休{kyukeiCnt}</div>}
                        {yukyuCnt  > 0 && <div style={{ color:'#16a34a' }}>有給{yukyuCnt}</div>}
                        {kyuCnt    > 0 && <div style={{ color:'#dc2626' }}>休{kyuCnt}</div>}
                      </td>
                    </tr>
                  );
                })}
                {staff.length === 0 && <tr><td colSpan={days.length+2} className="empty">スタッフが登録されていません</td></tr>}
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
          onSave={async (typeId, override, notes) => { await saveShift(editing.staffId, editing.date, typeId, override, notes); setEditing(null); }}
          onDelete={async () => { await saveShift(editing.staffId, editing.date, null, null); setEditing(null); }}
        />
      )}
    </div>
  );
}

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
function fmtShort(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const dec = m === 0 ? '' : m === 15 ? '.25' : m === 30 ? '.5' : '.75';
  return `${h}${dec}`;
}
function localISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function ShiftEditModal({ staffName, date, shiftTypes, current, onClose, onSave, onDelete }) {
  const [selType,   setSelType]   = useStateO(current?.typeId || '');
  const [overStart, setOverStart] = useStateO(current?.override?.start || '');
  const [overEnd,   setOverEnd]   = useStateO(current?.override?.end   || '');
  const [notes,     setNotes]     = useStateO(current?.notes || '');
  function pickType(id) {
    setSelType(id);
    const m = shiftTypes.find(x => x.id === id);
    setOverStart(fmtTime(m?.start_time) || '');
    setOverEnd(fmtTime(m?.end_time) || '');
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{staffName} — {date}</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="shift-pick">
            <button className={`shift-chip ${!selType?'active':''}`} onClick={() => { setSelType(''); setOverStart(''); setOverEnd(''); }} style={{ borderColor:'#e2e8f0' }}>
              <strong>— なし —</strong>
            </button>
            {shiftTypes.map(t => (
              <button key={t.id} className={`shift-chip ${selType===t.id?'active':''}`} style={{ borderColor:t.color }} onClick={() => pickType(t.id)}>
                <span className="sw" style={{ background:t.color }}></span>
                <div><strong>{t.label}</strong><div className="small">{fmtTime(t.start_time)}〜{fmtTime(t.end_time)}</div></div>
              </button>
            ))}
          </div>
          {selType && (
            <>
              <div className="override-note">時刻を上書きする場合のみ入力</div>
              <div className="time-edit">
                <label className="field"><span>開始（上書）</span><input type="time" value={overStart} onChange={e => setOverStart(e.target.value)} /></label>
                <label className="field"><span>終了（上書）</span><input type="time" value={overEnd}   onChange={e => setOverEnd(e.target.value)} /></label>
              </div>
            </>
          )}
          <label className="field" style={{ marginTop:8 }}>
            <span>備考</span>
            <textarea rows={2} style={{ width:'100%', resize:'vertical', fontSize:13 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="自由記入" />
          </label>
        </div>
        <div className="modal-foot">
          {current?.typeId && <button className="btn-ghost danger" onClick={onDelete}>削除</button>}
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => onSave(selType, overStart||overEnd?{start:overStart,end:overEnd}:null, notes)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// OfficeRequestsPage - 申請承認・却下
// ============================================================
function OfficeRequestsPage({ officeId, onCountChange }) {
  const [requests,     setRequests]     = useStateO([]);
  const [loading,      setLoading]      = useStateO(true);
  const [statusFilter, setStatusFilter] = useStateO('pending');
  const [month,        setMonth]        = useStateO(localISO(new Date()).slice(0,7));

  async function load() {
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const end = localISO(new Date(y, m, 0));
    const { data } = await mdb('requests').select('*, staff(name)')
      .eq('office_id', officeId).gte('date', `${month}-01`).lte('date', end)
      .order('created_at', { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  useEffectO(() => { load(); }, [officeId, month]);

  const filtered = useMemoO(() =>
    requests.filter(r => statusFilter === 'all' || r.status === statusFilter),
    [requests, statusFilter]);

  async function updateStatus(id, status) {
    const { error } = await mdb('requests').update({ status }).eq('id', id);
    if (!error) {
      setRequests(rs => rs.map(r => r.id === id ? { ...r, status } : r));
      onCountChange(requests.filter(r => r.id !== id && r.status === 'pending').length);
    }
  }

  const pillStatus = s => s === 'approved' ? 'done' : s === 'rejected' ? 'warn' : 'caution';

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>申請承認</h1><p className="muted">スタッフの申請を承認・却下します</p></div>
      </div>
      <div className="card">
        <div className="filter-bar">
          <label className="field inline"><span>月</span><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
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
          <div style={{ padding:24, textAlign:'center' }} className="muted">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">申請がありません ✅</div>
        ) : (
          filtered.map(r => (
            <div key={r.id} style={{
              display:'flex', alignItems:'flex-start', gap:16, padding:'14px 18px',
              borderBottom:'1px solid var(--line)', background: r.status==='pending'?'#fffbeb':'#fff',
            }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:4, flexWrap:'wrap' }}>
                  <strong>{r.staff?.name}</strong>
                  <span className={`pill ${pillStatus(r.status)}`}>{STATUS_LABELS[r.status]}</span>
                  <span className="pill caution">{REQUEST_TYPE_LABELS[r.type] || r.type}</span>
                  <span className="mono muted" style={{ fontSize:12 }}>{r.date}</span>
                  {r.adjust_minutes > 0 && <span className="muted small">{r.adjust_minutes}分</span>}
                </div>
                {r.reason && <div style={{ fontSize:13, color:'var(--ink2)' }}>{r.reason}</div>}
                <div className="muted small">申請日: {r.created_at?.slice(0,10)}</div>
              </div>
              {r.status === 'pending' && (
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  <button className="btn-mini ok"     onClick={() => updateStatus(r.id, 'approved')}>✓ 承認</button>
                  <button className="btn-mini danger" onClick={() => updateStatus(r.id, 'rejected')}>✗ 却下</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// OfficeTouchLogPage - QRログ
// ============================================================
function OfficeTouchLogPage({ officeId }) {
  const today = localISO(new Date());
  const [logs,    setLogs]    = useStateO([]);
  const [loading, setLoading] = useStateO(true);
  const [from,    setFrom]    = useStateO(today);
  const [to,      setTo]      = useStateO(today);
  const [q,       setQ]       = useStateO('');

  async function load() {
    setLoading(true);
    const { data } = await mdb('touch_logs').select('*, staff(name)')
      .eq('office_id', officeId)
      .gte('touched_at', `${from}T00:00:00`).lte('touched_at', `${to}T23:59:59`)
      .order('touched_at', { ascending: true }).limit(1000);
    setLogs(data || []); setLoading(false);
  }

  useEffectO(() => { load(); }, [officeId, from, to]);

  const filtered = useMemoO(() =>
    logs.filter(l => !q || l.staff?.name?.includes(q)),
    [logs, q]);

  // 1人1日1行に集約
  const grouped = useMemoO(() => {
    const map = {};
    filtered.forEach(l => {
      const date = new Date(l.touched_at).toISOString().slice(0, 10);
      const key  = `${l.staff_id}|${date}`;
      if (!map[key]) map[key] = {
        key, date,
        staffName: l.staff?.name || '—',
        inTime: null, outTime: null,
      };
      const t = new Date(l.touched_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      if (l.touch_type === 'in'  && !map[key].inTime)  map[key].inTime  = t;
      if (l.touch_type === 'out')                       map[key].outTime = t;
    });
    return Object.values(map).sort((a, b) =>
      b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName, 'ja'));
  }, [filtered]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>QRログ</h1></div>
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
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="名前で絞込" />
          </label>
        </div>
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>日付</th><th>スタッフ</th>
            <th style={{ textAlign:'center' }}>出勤</th>
            <th style={{ textAlign:'center' }}>退勤</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">読み込み中...</td></tr>}
            {!loading && grouped.length === 0 && <tr><td colSpan={5} className="empty">QRログがありません</td></tr>}
            {grouped.map((r, i) => (
              <tr key={r.key}>
                <td className="rownum">{i+1}</td>
                <td className="mono">{r.date}</td>
                <td><strong>{r.staffName}</strong></td>
                <td className="mono" style={{ textAlign:'center' }}>
                  {r.inTime  ? <span className="pill done">{r.inTime}</span>    : <span className="muted">—</span>}
                </td>
                <td className="mono" style={{ textAlign:'center' }}>
                  {r.outTime ? <span className="pill caution">{r.outTime}</span> : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sheet-foot">{grouped.length}件</div>
      </div>
    </div>
  );
}

// ============================================================
// OfficeStaffPage - スタッフ管理（誕生日含む）
// ============================================================
function OfficeStaffPage({ officeId }) {
  const { staff, setStaff, showToast } = useContextO(OfficeCtx);
  const [editing, setEditing] = useStateO(null);

  async function save(form) {
    if (form.id) {
      const { id, ...rest } = form;
      const { error } = await mdb('staff').update(rest).eq('id', id);
      if (!error) { setStaff(ss => ss.map(s => s.id === id ? { ...s, ...rest } : s)); showToast('更新しました'); }
    } else {
      const { data, error } = await mdb('staff').insert({ ...form, office_id: officeId, is_active: true }).select().single();
      if (!error && data) { setStaff(ss => [...ss, data]); showToast('登録しました'); }
    }
    setEditing(null);
  }

  async function del(id) {
    if (!confirm('このスタッフを削除しますか？')) return;
    const { error } = await mdb('staff').update({ is_active: false }).eq('id', id);
    if (!error) { setStaff(ss => ss.filter(s => s.id !== id)); showToast('削除しました'); }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>スタッフ管理</h1><p className="muted">{staff.length}名</p></div>
        <button className="btn-primary" onClick={() => setEditing({ role:'staff' })}>＋ スタッフ登録</button>
      </div>
      <div className="card">
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th><th>氏名</th><th>権限</th>
            <th>生年月日（打刻用）</th><th>操作</th>
          </tr></thead>
          <tbody>
            {staff.length === 0 && <tr><td colSpan={5} className="empty">スタッフがいません</td></tr>}
            {staff.map((s, i) => (
              <tr key={s.id}>
                <td className="rownum">{i+1}</td>
                <td><div className="row-name"><span className="avatar sm">{s.name.slice(0,1)}</span><strong>{s.name}</strong></div></td>
                <td><span className="pill role-part">{{ staff:'一般', office_manager:'事業所責任者', admin:'本部' }[s.role] || s.role}</span></td>
                <td className="mono">{s.birth_mmdd || <span className="muted">未登録</span>}</td>
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
        <OfficeStaffModal staff={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

function OfficeStaffModal({ staff: s, onClose, onSave }) {
  const [form, setForm] = useStateO({
    id: s.id, name: s.name || '', role: s.role || 'staff',
    birth_mmdd: s.birth_mmdd || '', email: s.email || '',
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
            <label className="field"><span>氏名</span><input value={form.name} onChange={e => set('name', e.target.value)} autoFocus /></label>
            <label className="field"><span>権限</span>
              <select value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="staff">一般</option>
                <option value="office_manager">事業所責任者</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>生年月日（月日4桁）※打刻用パスワード</span>
            <input className="mono" value={form.birth_mmdd}
              onChange={e => set('birth_mmdd', e.target.value.replace(/\D/g,'').slice(0,4))}
              placeholder="0415" maxLength={4} />
          </label>
          <label className="field">
            <span>メールアドレス（ログイン用・責任者のみ）</span>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="manager@example.com" />
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

// ============================================================
// OfficeQRPage - QRコード表示・印刷
// ============================================================
function OfficeQRPage({ officeId, officeName }) {
  const punchUrl = `${location.origin}/punch.html?o=${officeId}`;

  useEffectO(() => {
    if (window.QRCode) {
      const el = document.getElementById('qr-canvas');
      if (el) { el.innerHTML = ''; new window.QRCode(el, { text: punchUrl, width: 220, height: 220 }); }
    }
  }, [punchUrl]);

  function printQR() {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>QRコード - ${officeName}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px;}h2{margin-bottom:8px;}p{color:#64748b;font-size:14px;margin-bottom:24px;}.url{font-size:11px;color:#94a3b8;margin-top:16px;word-break:break-all;}</style>
      </head><body>
      <h2>${officeName}</h2>
      <p>出勤・退勤 共通QRコード</p>
      <div id="qr"></div>
      <div class="url">${punchUrl}</div>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
      <script>new QRCode(document.getElementById('qr'),{text:'${punchUrl}',width:240,height:240});setTimeout(()=>window.print(),800);</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>QRコード</h1><p className="muted">スタッフの出退勤打刻用QRコードです</p></div>
        <button className="btn-primary" onClick={printQR}>🖨 印刷</button>
      </div>
      <div className="card" style={{ padding:32, display:'flex', flexDirection:'column', alignItems:'center', gap:20 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12, color:'var(--ink2)' }}>{officeName} — 打刻用QR（出勤・退勤共通）</div>
          <div id="qr-canvas" style={{ display:'inline-block', border:'1px solid var(--line)', borderRadius:8, padding:12, background:'#fff' }}>
            {!window.QRCode && <div style={{ width:220, height:220, display:'grid', placeItems:'center', color:'var(--muted)', fontSize:13 }}>QRコードを生成中...</div>}
          </div>
        </div>
        <div className="hint" style={{ maxWidth:360, textAlign:'center', lineHeight:1.7 }}>
          このQRコードをシールに印刷して事業所に貼り付けてください。<br />
          スタッフがスマートフォンで読み取ると打刻画面が開きます。
        </div>
      </div>
    </div>
  );
}

// ============================================================
// OfficePCPunchPage - PC打刻（藤沢事業所専用）
// ============================================================
function OfficePCPunchPage({ officeId, officeName }) {
  const { staff } = useContextO(OfficeCtx);
  const officeStaff = staff.filter(s => s.office_id === officeId && s.is_active);

  const [selectedId, setSelectedId] = useStateO('');
  const [birthInput, setBirthInput] = useStateO('');
  const [status,     setStatus]     = useStateO(null); // null | 'confirm' | 'done' | 'error'
  const [message,    setMessage]    = useStateO('');
  const [punchType,  setPunchType]  = useStateO(''); // 'in' | 'out'
  const [loading,    setLoading]    = useStateO(false);
  const [todayLog,   setTodayLog]   = useStateO({}); // staffId → { inTime, outTime }

  const today = localISO(new Date());

  // 今日の打刻状況を取得
  useEffectO(() => {
    mdb('touch_logs')
      .select('staff_id, touched_at, touch_type')
      .gte('touched_at', `${today}T00:00:00`)
      .lte('touched_at', `${today}T23:59:59`)
      .eq('office_id', officeId)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(t => {
          if (!map[t.staff_id]) map[t.staff_id] = { inTime: null, outTime: null };
          const hhmm = new Date(t.touched_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
          if (t.touch_type === 'in'  && !map[t.staff_id].inTime)  map[t.staff_id].inTime  = hhmm;
          if (t.touch_type === 'out')                              map[t.staff_id].outTime = hhmm;
        });
        setTodayLog(map);
      });
  }, [officeId, today]);

  async function doPunch(type) {
    const sel = officeStaff.find(s => s.id === selectedId);
    if (!sel) { setMessage('スタッフを選択してください'); setStatus('error'); return; }
    if (!birthInput || birthInput.length !== 4) { setMessage('生年月日（月日4桁）を入力してください'); setStatus('error'); return; }
    if (sel.birth_mmdd !== birthInput) { setMessage('生年月日が一致しません'); setStatus('error'); return; }

    setLoading(true);
    const now = new Date();
    const { error } = await mdb('touch_logs').insert({
      staff_id:   selectedId,
      office_id:  officeId,
      touch_type: type,
      touched_at: now.toISOString(),
      method:     'pc',
    });
    setLoading(false);

    if (error) { setMessage('打刻に失敗しました: ' + error.message); setStatus('error'); return; }

    const hhmm = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
    setTodayLog(prev => {
      const cur = prev[selectedId] || {};
      return { ...prev, [selectedId]: type === 'in' ? { ...cur, inTime: hhmm } : { ...cur, outTime: hhmm } };
    });
    setPunchType(type);
    setMessage(`${sel.name} さんの${type === 'in' ? '出勤' : '退勤'}を記録しました（${hhmm}）`);
    setStatus('done');
    setSelectedId('');
    setBirthInput('');
  }

  const sel = officeStaff.find(s => s.id === selectedId);
  const log = todayLog[selectedId];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>PC打刻</h1><p className="muted">{officeName} — 出退勤打刻</p></div>
      </div>

      {/* 今日の打刻状況 */}
      <div className="card">
        <div style={{ fontWeight:600, marginBottom:10, fontSize:14 }}>本日 {today} の打刻状況</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {officeStaff.map(s => {
            const l = todayLog[s.id];
            return (
              <div key={s.id} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px', minWidth:140 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>{s.name}</div>
                <div style={{ fontSize:12, color:'#475569' }}>
                  {l?.inTime  ? <span style={{ color:'#15803d' }}>出勤 {l.inTime}</span>  : <span style={{ color:'#b91c1c' }}>未出勤</span>}
                  {l?.outTime && <span style={{ color:'#1e40af', marginLeft:8 }}>退勤 {l.outTime}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 打刻フォーム */}
      <div className="card" style={{ maxWidth:420 }}>
        <div style={{ fontWeight:600, fontSize:15, marginBottom:16 }}>打刻する</div>

        <label className="field" style={{ marginBottom:12 }}>
          <span>スタッフ選択</span>
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setStatus(null); setBirthInput(''); }}>
            <option value="">— 選択してください —</option>
            {officeStaff.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        {selectedId && (
          <>
            {log && (
              <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'8px 12px', fontSize:13, marginBottom:12 }}>
                {log.inTime  && <div>出勤打刻済み: <strong>{log.inTime}</strong></div>}
                {log.outTime && <div>退勤打刻済み: <strong>{log.outTime}</strong></div>}
              </div>
            )}
            <label className="field" style={{ marginBottom:16 }}>
              <span>生年月日（月日4桁）</span>
              <input type="text" inputMode="numeric" maxLength={4} placeholder="例: 0315"
                value={birthInput} onChange={e => { setBirthInput(e.target.value); setStatus(null); }}
                style={{ fontSize:20, letterSpacing:4, textAlign:'center' }} />
            </label>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn-primary" style={{ flex:1, fontSize:16, padding:'12px 0', background:'#15803d' }}
                disabled={loading || birthInput.length !== 4}
                onClick={() => doPunch('in')}>
                出勤
              </button>
              <button className="btn-primary" style={{ flex:1, fontSize:16, padding:'12px 0', background:'#1e40af' }}
                disabled={loading || birthInput.length !== 4}
                onClick={() => doPunch('out')}>
                退勤
              </button>
            </div>
          </>
        )}

        {status === 'done' && (
          <div style={{ marginTop:14, background:'#dcfce7', border:'1px solid #86efac', borderRadius:8, padding:'12px 14px', color:'#15803d', fontWeight:600 }}>
            ✓ {message}
          </div>
        )}
        {status === 'error' && (
          <div style={{ marginTop:14, background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'12px 14px', color:'#b91c1c', fontWeight:600 }}>
            ✗ {message}
          </div>
        )}
      </div>
    </div>
  );
}

// グローバル公開
Object.assign(window, { OfficeShell });
