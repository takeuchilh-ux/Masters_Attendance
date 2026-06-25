// ============================================================
// MasuTa! 大本管理者 - 各ページ
// ============================================================
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useContext: useContextA, useRef: useRefA } = React;

// ドラッグ＆ドロップ（SortableJS）ヘルパー
function useSortableRows(tbodyRef, onReorder) {
  const reorderRef = useRefA(null);
  reorderRef.current = onReorder;
  useEffectA(() => {
    const el = tbodyRef.current;
    if (!el || typeof Sortable === 'undefined') return;
    const s = Sortable.create(el, {
      handle: '.drag-handle',
      delay: 300,
      delayOnTouchOnly: true,
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: () => {
        const ids = [...el.querySelectorAll('tr[data-id]')].map(r => r.dataset.id);
        reorderRef.current(ids);
      },
    });
    return () => s.destroy();
  }, []);
}

// ============================================================
// DashboardPage - 全事業所の今日の出欠（タブ切替）
// ============================================================
function DashboardPage() {
  const { offices, staff } = useContextA(AppCtx);
  const [todayShifts,  setTodayShifts]  = useStateA([]);
  const [todayTouches, setTodayTouches] = useStateA([]);
  const [loading,      setLoading]      = useStateA(true);
  const [activeTab,    setActiveTab]    = useStateA('all');
  const today = localISOA(new Date());

  useEffectA(() => {
    async function load() {
      const [shiftRes, touchRes] = await Promise.all([
        mdb('shifts')
          .select('*, shift_types(label, color, start_time, end_time)')
          .eq('date', today)
          .not('shift_type_id', 'is', null),
        mdb('touch_logs')
          .select('staff_id, touched_at, touch_type')
          .gte('touched_at', `${today}T00:00:00`)
          .lte('touched_at', `${today}T23:59:59`),
      ]);
      setTodayShifts(shiftRes.data || []);
      setTodayTouches(touchRes.data || []);
      setLoading(false);
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [today]);

  // staff_id → { inTime, outTime } のマップ
  const touchMap = useMemoA(() => {
    const map = {};
    todayTouches.forEach(t => {
      if (!map[t.staff_id]) map[t.staff_id] = { inTime: null, outTime: null };
      const hhmm = new Date(t.touched_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
      if (t.touch_type === 'in'  && !map[t.staff_id].inTime)  map[t.staff_id].inTime  = hhmm;
      if (t.touch_type === 'out')                              map[t.staff_id].outTime = hhmm;
    });
    return map;
  }, [todayTouches]);

  const touchedIds   = useMemoA(() => new Set(Object.keys(touchMap)), [touchMap]);
  const presentCount = todayShifts.filter(s => touchedIds.has(s.staff_id)).length;
  const absentCount  = todayShifts.filter(s => !touchedIds.has(s.staff_id)).length;

  // 出勤予定時刻をHH:MM形式で返す（override優先）
  function shiftExpected(shift) {
    const st = shift?.shift_types;
    const s  = shift?.override_start ? fmtTime(shift.override_start) : fmtTime(st?.start_time);
    const e  = shift?.override_end   ? fmtTime(shift.override_end)   : fmtTime(st?.end_time);
    return (s && e) ? `${s}〜${e}` : null;
  }

  function AttendanceRow({ s, shift }) {
    const punch    = touchMap[s.id];
    const hasPunch = !!punch?.inTime;
    const st       = shift?.shift_types;
    const expected = shiftExpected(shift);
    return (
      <div className="attendance-row" style={{ alignItems:'flex-start', padding:'10px 12px', borderBottom:'1px solid var(--line)', gap:10 }}>
        {/* 未打刻バッジ or 出勤済みマーク */}
        <div style={{ minWidth:56, paddingTop:2 }}>
          {hasPunch
            ? <span style={{ fontSize:11, background:'#dcfce7', color:'#15803d', borderRadius:4, padding:'2px 6px', fontWeight:600 }}>出勤済</span>
            : <span style={{ fontSize:11, background:'#fee2e2', color:'#b91c1c', borderRadius:4, padding:'2px 6px', fontWeight:700, animation:'pulse 1.5s infinite' }}>未打刻</span>
          }
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{s.name}</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, fontSize:12 }}>
            {st && <span className="att-shift" style={{ background: st.color }}>{st.label}</span>}
            {expected && (
              <span style={{ color:'#475569' }}>
                <span style={{ color:'#94a3b8', marginRight:2 }}>予定</span>{expected}
              </span>
            )}
            {hasPunch && (
              <span style={{ color:'#15803d' }}>
                <span style={{ color:'#94a3b8', marginRight:2 }}>実績</span>
                {punch.inTime}{punch.outTime ? `〜${punch.outTime}` : '〜（退勤未）'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  function OfficeAttendance({ office }) {
    const offShifts  = todayShifts.filter(s => s.office_id === office.id);
    const offStaff   = staff.filter(s => s.office_id === office.id);
    const shiftedIds = new Set(offShifts.map(s => s.staff_id));
    const present    = offShifts.filter(s => touchedIds.has(s.staff_id)).length;
    const absent     = offShifts.length - present;

    return (
      <div className="stack">
        <div className="kpis">
          <div className="kpi"><span>本日シフト</span><strong>{offShifts.length}<small>名</small></strong></div>
          <div className="kpi ok"><span>出勤確認済み</span><strong>{present}<small>名</small></strong></div>
          <div className="kpi warn"><span>未確認</span><strong>{absent}<small>名</small></strong></div>
        </div>
        <div className="card" style={{ padding:0 }}>
          {offStaff.filter(s => shiftedIds.has(s.id)).map(s => (
            <AttendanceRow key={s.id} s={s} shift={offShifts.find(sh => sh.staff_id === s.id)} />
          ))}
          {offShifts.length === 0 && (
            <div className="muted small" style={{ padding: '12px 16px' }}>本日のシフトなし</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>ダッシュボード</h1>
          <p className="muted">本日 {today} の全事業所出欠状況</p>
        </div>
      </div>

      <div className="tabs" style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)', padding: '0 8px' }}>
        <button className={`tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>全体</button>
        {offices.map(o => (
          <button key={o.id} className={`tab ${activeTab === o.id ? 'active' : ''}`} onClick={() => setActiveTab(o.id)}>
            {o.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}><span className="muted">読み込み中...</span></div>
      ) : activeTab === 'all' ? (
        <>
          <div className="kpis four">
            <div className="kpi"><span>本日シフト人数</span><strong>{todayShifts.length}<small>名</small></strong></div>
            <div className="kpi ok"><span>出勤確認済み</span><strong>{presentCount}<small>名</small></strong></div>
            <div className="kpi warn"><span>未確認</span><strong>{absentCount}<small>名</small></strong></div>
            <div className="kpi"><span>事業所数</span><strong>{offices.length}<small>箇所</small></strong></div>
          </div>
          <div className="office-grid">
            {offices.map(office => {
              const offShifts  = todayShifts.filter(s => s.office_id === office.id);
              const offStaff   = staff.filter(s => s.office_id === office.id);
              const shiftedIds = new Set(offShifts.map(s => s.staff_id));
              const present    = offShifts.filter(s => touchedIds.has(s.staff_id)).length;
              return (
                <div key={office.id} className="card office-card" style={{ padding:0 }}>
                  <div className="office-card-head" style={{ padding:'12px 14px' }}>
                    <strong>{office.name}</strong>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="pill done">{present}名出勤</span>
                      <span className="muted small">{offShifts.length}名予定</span>
                    </div>
                  </div>
                  {offStaff.filter(s => shiftedIds.has(s.id)).map(s => (
                    <AttendanceRow key={s.id} s={s} shift={offShifts.find(sh => sh.staff_id === s.id)} />
                  ))}
                  {offShifts.length === 0 && (
                    <div className="muted small" style={{ padding: '8px 14px' }}>本日のシフトなし</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <OfficeAttendance office={offices.find(o => o.id === activeTab)} />
      )}
    </div>
  );
}

function localISOA(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// ============================================================
// RequestsViewPage - 申請一覧（閲覧のみ）
// ============================================================
function RequestsViewPage() {
  const { offices } = useContextA(AppCtx);
  const [requests,     setRequests]     = useStateA([]);
  const [loading,      setLoading]      = useStateA(true);
  const [officeFilter, setOfficeFilter] = useStateA('all');
  const [typeFilter,   setTypeFilter]   = useStateA('all');
  const [statusFilter, setStatusFilter] = useStateA('all');
  const [month, setMonth] = useStateA(new Date().toISOString().slice(0, 7));

  useEffectA(() => {
    async function load() {
      setLoading(true);
      const [y, m] = month.split('-').map(Number);
      const end = new Date(y, m, 0).toISOString().slice(0, 10);
      const res = await mdb('requests')
        .select('*, staff(name, office_id, offices(name))')
        .gte('date', `${month}-01`)
        .lte('date', end)
        .order('created_at', { ascending: false });
      setRequests(res.data || []);
      setLoading(false);
    }
    load();
  }, [month]);

  const filtered = useMemoA(() => requests.filter(r => {
    if (officeFilter !== 'all' && r.staff?.office_id !== officeFilter) return false;
    if (typeFilter   !== 'all' && r.type !== typeFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  }), [requests, officeFilter, typeFilter, statusFilter]);

  const pillStatus = s => s === 'approved' ? 'done' : s === 'rejected' ? 'warn' : 'caution';

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>申請一覧</h1>
          <p className="muted">全事業所の申請を確認できます（承認は各事業所で対応）</p>
        </div>
      </div>
      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>月</span>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </label>
          <label className="field inline">
            <span>事業所</span>
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
              <option value="all">すべて</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="field inline">
            <span>種別</span>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">すべて</option>
              {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field inline">
            <span>状態</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">すべて</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>

        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>申請日</th><th>対象日</th><th>事業所</th><th>スタッフ</th>
            <th>種別</th><th>分数</th><th>理由</th><th>状態</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">読み込み中...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="empty">申請データがありません</td></tr>}
            {filtered.map((r, i) => (
              <tr key={r.id}>
                <td className="rownum">{i + 1}</td>
                <td className="mono">{r.created_at?.slice(0, 10)}</td>
                <td className="mono">{r.date}</td>
                <td>{r.staff?.offices?.name || '—'}</td>
                <td><strong>{r.staff?.name || '—'}</strong></td>
                <td><span className="pill caution" style={{ whiteSpace: 'nowrap' }}>{REQUEST_TYPE_LABELS[r.type] || r.type}</span></td>
                <td className="mono">{r.adjust_minutes ? `${r.adjust_minutes}分` : '—'}</td>
                <td>{r.reason || '—'}</td>
                <td><span className={`pill ${pillStatus(r.status)}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
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
// TouchLogPage - QRログ（本部）
// ============================================================
function TouchLogPage() {
  const { offices, showToast } = useContextA(AppCtx);
  const today = new Date().toISOString().slice(0, 10);
  const [logs,         setLogs]         = useStateA([]);
  const [loading,      setLoading]      = useStateA(true);
  const [officeFilter, setOfficeFilter] = useStateA('all');
  const [from,         setFrom]         = useStateA(today);
  const [to,           setTo]           = useStateA(today);
  const [q,            setQ]            = useStateA('');
  const [editTarget,   setEditTarget]   = useStateA(null); // { row, field:'in'|'out' }

  async function load() {
    setLoading(true);
    const res = await mdb('touch_logs')
      .select('*, staff(name), offices(name)')
      .gte('touched_at', `${from}T00:00:00`)
      .lte('touched_at', `${to}T23:59:59`)
      .order('touched_at', { ascending: true })
      .limit(1000);
    setLogs(res.data || []);
    setLoading(false);
  }

  useEffectA(() => { load(); }, [from, to]);

  const filtered = useMemoA(() => logs.filter(l => {
    if (officeFilter !== 'all' && l.office_id !== officeFilter) return false;
    if (q && !l.staff?.name?.includes(q)) return false;
    return true;
  }), [logs, officeFilter, q]);

  // 1人1日1行に集約（ログIDも保持）
  const grouped = useMemoA(() => {
    const map = {};
    filtered.forEach(l => {
      const date = new Date(l.touched_at).toISOString().slice(0, 10);
      const key  = `${l.staff_id}|${date}`;
      if (!map[key]) map[key] = {
        key, date, staffId: l.staff_id,
        staffName:  l.staff?.name || '—',
        officeName: l.offices?.name || '—',
        inId: null, outId: null,
        inTime: null, outTime: null,
        inRaw: null, outRaw: null,
      };
      const t = new Date(l.touched_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      if (l.touch_type === 'in'  && !map[key].inId)  { map[key].inId  = l.id; map[key].inTime  = t; map[key].inRaw  = l.touched_at; }
      if (l.touch_type === 'out')                     { map[key].outId = l.id; map[key].outTime = t; map[key].outRaw = l.touched_at; }
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName, 'ja'));
  }, [filtered]);

  async function deleteLog(id) {
    if (!id) return;
    const { error } = await mdb('touch_logs').delete().eq('id', id);
    if (error) { showToast('削除に失敗しました', 'error'); return; }
    showToast('削除しました');
    await load();
  }

  async function deleteRow(r) {
    if (!confirm(`${r.staffName} ${r.date} の打刻を全て削除しますか？`)) return;
    const ids = [r.inId, r.outId].filter(Boolean);
    for (const id of ids) await mdb('touch_logs').delete().eq('id', id);
    showToast('削除しました');
    await load();
  }

  async function saveEdit(id, date, hhmm) {
    // hhmm = "HH:MM", date = "YYYY-MM-DD"
    const iso = `${date}T${hhmm}:00+09:00`;
    const { error } = await mdb('touch_logs').update({ touched_at: iso }).eq('id', id);
    if (error) { showToast('更新に失敗しました', 'error'); return; }
    showToast('更新しました');
    setEditTarget(null);
    await load();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>QRログ</h1></div>
      </div>
      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>期間</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            <span className="dash">〜</span>
            <input type="date" value={to}   onChange={e => setTo(e.target.value)} />
          </label>
          <label className="field inline">
            <span>事業所</span>
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
              <option value="all">すべて</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="field inline grow">
            <span>名前</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="例: 山田" />
          </label>
        </div>

        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>日付</th><th>事業所</th><th>スタッフ名</th>
            <th style={{ textAlign:'center' }}>出勤</th>
            <th style={{ textAlign:'center' }}>退勤</th>
            <th style={{ textAlign:'center' }}>操作</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">読み込み中...</td></tr>}
            {!loading && grouped.length === 0 && <tr><td colSpan={7} className="empty">QRログがありません</td></tr>}
            {grouped.map((r, i) => (
              <tr key={r.key}>
                <td className="rownum">{i + 1}</td>
                <td className="mono">{r.date}</td>
                <td>{r.officeName}</td>
                <td><strong>{r.staffName}</strong></td>
                <td className="mono" style={{ textAlign:'center' }}>
                  {r.inTime ? (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                      <span className="pill done">{r.inTime}</span>
                      <button className="btn-ghost" style={{ padding:'1px 5px', fontSize:11 }} onClick={() => setEditTarget({ row: r, field: 'in' })}>編集</button>
                      <button className="btn-ghost danger" style={{ padding:'1px 5px', fontSize:11 }} onClick={() => { if(confirm('出勤打刻を削除しますか？')) deleteLog(r.inId); }}>削除</button>
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="mono" style={{ textAlign:'center' }}>
                  {r.outTime ? (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                      <span className="pill caution">{r.outTime}</span>
                      <button className="btn-ghost" style={{ padding:'1px 5px', fontSize:11 }} onClick={() => setEditTarget({ row: r, field: 'out' })}>編集</button>
                      <button className="btn-ghost danger" style={{ padding:'1px 5px', fontSize:11 }} onClick={() => { if(confirm('退勤打刻を削除しますか？')) deleteLog(r.outId); }}>削除</button>
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={{ textAlign:'center' }}>
                  <button className="btn-ghost danger" style={{ padding:'2px 8px', fontSize:11 }} onClick={() => deleteRow(r)}>行削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sheet-foot">{grouped.length}件</div>
      </div>

      {editTarget && (
        <TouchLogEditModal
          row={editTarget.row}
          field={editTarget.field}
          onClose={() => setEditTarget(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function TouchLogEditModal({ row, field, onClose, onSave }) {
  const isIn   = field === 'in';
  const logId  = isIn ? row.inId  : row.outId;
  const curRaw = isIn ? row.inRaw : row.outRaw;
  const curHHMM = curRaw
    ? new Date(curRaw).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const [time, setTime] = useStateA(curHHMM);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth:320 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{row.staffName} — {row.date} {isIn ? '出勤' : '退勤'}時刻編集</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="field">
            <span>{isIn ? '出勤' : '退勤'}時刻</span>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ fontSize:18, padding:6 }} />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => onSave(logId, row.date, time)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MonthlyDetailTable - 月次集計の日別詳細展開
// ============================================================
function MonthlyDetailTable({ sShifts, sTouches, sRequests, shiftTypesDB }) {
  const DOW = ['日','月','火','水','木','金','土'];

  // 日付ごとにまとめる
  const days = sShifts.map(sh => {
    const st      = shiftTypesDB.find(t => t.id === sh.shift_type_id);
    const start   = (sh.override_start || st?.start_time || '').slice(0, 5);
    const end     = (sh.override_end   || st?.end_time   || '').slice(0, 5);
    const toHHMM = ts => ts ? new Date(ts).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }) : null;
    const touchIn  = sTouches.find(t => t.touch_type === 'in'  && t.touched_at?.slice(0, 10) === sh.date);
    const touchOut = sTouches.find(t => t.touch_type === 'out' && t.touched_at?.slice(0, 10) === sh.date);
    const touchInTime  = toHHMM(touchIn?.touched_at);
    const touchOutTime = toHHMM(touchOut?.touched_at);
    const reqs    = sRequests.filter(r => r.date === sh.date);
    const d       = new Date(sh.date);
    const dow     = d.getDay();

    let workMin = 0;
    if (start && end) {
      const [sh_, sm_] = start.split(':').map(Number);
      const [eh_, em_] = end.split(':').map(Number);
      workMin = (eh_ * 60 + em_) - (sh_ * 60 + sm_) - (st?.break_minutes || 0);
    }

    return { date: sh.date, dow, label: st?.label || '—', color: st?.color, start, end, workMin, touchInTime, touchOutTime, reqs };
  }).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
      <thead>
        <tr style={{ background:'#e2e8f0', color:'#475569' }}>
          <th style={{ padding:'4px 12px', textAlign:'left', fontWeight:600, width:90 }}>日付</th>
          <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, width:80 }}>シフト</th>
          <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, width:130 }}>予定時間</th>
          <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, width:70 }}>打刻</th>
          <th style={{ padding:'4px 8px', textAlign:'left', fontWeight:600 }}>申請</th>
          <th style={{ padding:'4px 8px', textAlign:'right', fontWeight:600, width:60 }}>実働</th>
        </tr>
      </thead>
      <tbody>
        {days.map(d => {
          const isSun = d.dow === 0, isSat = d.dow === 6;
          return (
            <tr key={d.date} style={{ borderBottom:'1px solid #e2e8f0', background: isSun ? '#fff5f5' : isSat ? '#f0f8ff' : '#fff' }}>
              <td style={{ padding:'4px 12px', fontFamily:'monospace' }}>
                <span style={{ color: isSun ? '#ef4444' : isSat ? '#3b82f6' : '#334155' }}>
                  {d.date.slice(5).replace('-','/')} ({DOW[d.dow]})
                </span>
              </td>
              <td style={{ padding:'4px 8px', textAlign:'center' }}>
                <span style={{ display:'inline-block', padding:'1px 8px', borderRadius:4, background: d.color || '#e2e8f0', fontSize:11, fontWeight:600 }}>
                  {d.label}
                </span>
              </td>
              <td style={{ padding:'4px 8px', textAlign:'center', fontFamily:'monospace', color:'#475569' }}>
                {d.start && d.end ? `${d.start} 〜 ${d.end}` : '—'}
              </td>
              <td style={{ padding:'4px 8px', textAlign:'center', fontFamily:'monospace', whiteSpace:'nowrap' }}>
                {!d.touchInTime && !d.touchOutTime
                  ? <span style={{ color:'#94a3b8' }}>未打刻</span>
                  : <span style={{ color:'#16a34a', fontWeight:600 }}>
                      {d.touchInTime || '—'}
                      <span style={{ color:'#94a3b8', fontWeight:400, margin:'0 3px' }}>→</span>
                      {d.touchOutTime || <span style={{ color:'#f59e0b' }}>未退勤</span>}
                    </span>
                }
              </td>
              <td style={{ padding:'4px 8px', color:'#64748b' }}>
                {d.reqs.length === 0 ? <span style={{ color:'#cbd5e1' }}>—</span>
                  : d.reqs.map((req, i) => (
                    <span key={i} style={{ marginRight:4, display:'inline-block', padding:'1px 6px', borderRadius:4, fontSize:11, background: req.type === 'late' || req.type === 'early_leave' ? '#fef3c7' : '#dcfce7', color: req.type === 'late' || req.type === 'early_leave' ? '#92400e' : '#166534' }}>
                      {REQUEST_TYPE_LABELS[req.type] || req.type}
                      {req.adjust_minutes > 0 && ` ${req.adjust_minutes}分`}
                    </span>
                  ))
                }
              </td>
              <td style={{ padding:'4px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#334155' }}>
                {d.workMin > 0 ? `${(d.workMin/60).toFixed(1)}h` : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================================
// MonthlyPage - 月次集計（給与計算用）
// ============================================================
function MonthlyPage() {
  const { offices, staff: allStaff } = useContextA(AppCtx);
  const [month,        setMonth]        = useStateA(new Date().toISOString().slice(0, 7));
  const [officeFilter, setOfficeFilter] = useStateA('all');
  const [loading,      setLoading]      = useStateA(false);
  const [shifts,       setShifts]       = useStateA([]);
  const [shiftTypesDB, setShiftTypesDB] = useStateA([]);
  const [requests,     setRequests]     = useStateA([]);
  const [touches,      setTouches]      = useStateA([]);
  const [expanded,     setExpanded]     = useStateA(new Set());

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffectA(() => {
    async function load() {
      setLoading(true);
      const [y, m] = month.split('-').map(Number);
      const start = `${month}-01`;
      const end   = new Date(y, m, 0).toISOString().slice(0, 10);
      const [sRes, stRes, rRes, tRes] = await Promise.all([
        mdb('shifts').select('*').gte('date', start).lte('date', end),
        mdb('shift_types').select('*'),
        mdb('requests').select('*').gte('date', start).lte('date', end).eq('status', 'approved'),
        mdb('touch_logs').select('staff_id, touched_at, touch_type')
          .gte('touched_at', `${start}T00:00:00`)
          .lte('touched_at', `${end}T23:59:59`),
      ]);
      setShifts(sRes.data || []);
      setShiftTypesDB(stRes.data || []);
      setRequests(rRes.data || []);
      setTouches(tRes.data || []);
      setLoading(false);
    }
    load();
  }, [month]);

  const summaries = useMemoA(() => {
    const staffList = officeFilter === 'all'
      ? allStaff
      : allStaff.filter(s => s.office_id === officeFilter);

    return staffList.map(s => {
      const sShifts   = shifts.filter(sh => sh.staff_id === s.id && sh.shift_type_id);
      const sTouches  = touches.filter(t => t.staff_id === s.id);
      const sRequests = requests.filter(r => r.staff_id === s.id);

      const shiftDays   = sShifts.length;
      const presentDays = sTouches.filter(t => t.touch_type === 'in').length;
      const absentDays  = Math.max(0, shiftDays - presentDays);

      const paidLeave = sRequests
        .filter(r => r.type.startsWith('paid_leave'))
        .reduce((acc, r) => acc + (r.type === 'paid_leave_full' ? 1 : 0.5), 0);

      const lateMin  = sRequests.filter(r => r.type === 'late').reduce((a, r) => a + (r.adjust_minutes || 0), 0);
      const earlyMin = sRequests.filter(r => r.type === 'early_leave').reduce((a, r) => a + (r.adjust_minutes || 0), 0);

      let totalShiftMin = 0;
      sShifts.forEach(sh => {
        const st = shiftTypesDB.find(t => t.id === sh.shift_type_id);
        if (!st) return;
        const s2 = (sh.override_start || st.start_time || '').slice(0, 5);
        const e2 = (sh.override_end   || st.end_time   || '').slice(0, 5);
        if (s2 && e2) {
          const [sh_, sm_] = s2.split(':').map(Number);
          const [eh_, em_] = e2.split(':').map(Number);
          totalShiftMin += (eh_ * 60 + em_) - (sh_ * 60 + sm_) - (st.break_minutes || 0);
        }
      });

      const effectiveMin = Math.max(0, totalShiftMin - lateMin - earlyMin - paidLeave * 8 * 60);
      const effectiveH   = (effectiveMin / 60).toFixed(1);
      const office       = offices.find(o => o.id === s.office_id);

      return { s, office, shiftDays, presentDays, absentDays, paidLeave, lateMin, earlyMin, effectiveH, sShifts, sTouches, sRequests };
    }).filter(r => r.shiftDays > 0);
  }, [allStaff, shifts, shiftTypesDB, requests, touches, officeFilter, offices]);

  function exportCSV() {
    const rows = [
      ['氏名', '事業所', 'シフト日数', '出勤確認', '欠勤', '有給', '遅刻(分)', '早退(分)', '実働(h)'].join(','),
      ...summaries.map(r =>
        [r.s.name, r.office?.name, r.shiftDays, r.presentDays, r.absentDays,
          r.paidLeave, r.lateMin, r.earlyMin, r.effectiveH].join(',')
      ),
    ].join('\n');
    const blob = new Blob(['﻿' + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `月次集計_${month}.csv`;
    a.click();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>月次集計</h1><p className="muted">給与計算用の月次勤怠データです</p></div>
        <div className="actions">
          <button className="btn-ghost" onClick={exportCSV}>📥 CSV出力</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>対象月</span>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </label>
          <label className="field inline">
            <span>事業所</span>
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
              <option value="all">すべて</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }} className="muted">読み込み中...</div>
        ) : (
          <table className="sheet">
            <thead><tr>
              <th style={{width:28}}></th>
              <th className="rownum"></th>
              <th>氏名</th><th>事業所</th>
              <th>シフト日数</th><th>出勤確認</th><th>欠勤</th>
              <th>有給</th><th>遅刻(分)</th><th>早退(分)</th><th>実働(h)</th>
            </tr></thead>
            <tbody>
              {summaries.length === 0 && <tr><td colSpan={11} className="empty">データがありません</td></tr>}
              {summaries.map((r, i) => {
                const isOpen = expanded.has(r.s.id);
                return (
                  <React.Fragment key={r.s.id}>
                    <tr>
                      <td style={{ textAlign:'center', padding:'0 4px' }}>
                        <button
                          onClick={() => toggleExpand(r.s.id)}
                          style={{ background:'none', border:'1px solid var(--line-strong)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:9, lineHeight:'18px', color:'var(--muted)', padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}
                          title="詳細を表示"
                        >{isOpen ? '▼' : '▶'}</button>
                      </td>
                      <td className="rownum">{i + 1}</td>
                      <td><strong>{r.s.name}</strong></td>
                      <td>{r.office?.name || '—'}</td>
                      <td className="mono">{r.shiftDays}日</td>
                      <td className="mono">{r.presentDays}日</td>
                      <td className="mono">{r.absentDays > 0 ? <span className="pill warn">{r.absentDays}日</span> : <span className="muted">0</span>}</td>
                      <td className="mono">{r.paidLeave > 0 ? `${r.paidLeave}日` : <span className="muted">0</span>}</td>
                      <td className="mono">{r.lateMin > 0  ? <span className="pill warn">{r.lateMin}分</span>  : <span className="muted">0</span>}</td>
                      <td className="mono">{r.earlyMin > 0 ? <span className="pill caution">{r.earlyMin}分</span> : <span className="muted">0</span>}</td>
                      <td className="mono"><strong>{r.effectiveH}h</strong></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={11} style={{ padding:0, background:'#f8fafc' }}>
                          <MonthlyDetailTable
                            sShifts={r.sShifts}
                            sTouches={r.sTouches}
                            sRequests={r.sRequests}
                            shiftTypesDB={shiftTypesDB}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="sheet-foot">{summaries.length}名</div>
      </div>
    </div>
  );
}

// ============================================================
// StaffAdminPage - スタッフ管理
// ============================================================
function StaffAdminPage() {
  const { offices, staff, setStaff, showToast, positionTypes, setPositionTypes } = useContextA(AppCtx);
  const [officeFilter, setOfficeFilter] = useStateA('all');
  const [q,            setQ]            = useStateA('');
  const [editing,      setEditing]      = useStateA(null);
  const [viewing,      setViewing]      = useStateA(null);
  const tbodyRef = useRefA(null);

  useSortableRows(tbodyRef, async (ids) => {
    const reordered = ids.map(id => staff.find(s => s.id === id)).filter(Boolean);
    const others = staff.filter(s => !ids.includes(s.id));
    setStaff([...reordered, ...others]);
    await Promise.all(reordered.map((s, i) => mdb('staff').update({ sort_order: (i+1)*10 }).eq('id', s.id)));
  });

  const filtered = useMemoA(() => staff.filter(s =>
    s.is_worker !== false &&
    (officeFilter === 'all' || s.office_id === officeFilter) &&
    (!q || s.name.includes(q))
  ), [staff, officeFilter, q]);

  async function saveStaff(form) {
    // DBに送るフィールドを明示的に指定（UI専用フィールドを除外）
    const payload = {
      name:           form.name,
      office_id:      form.office_id      || null,
      role:           form.role           || 'staff',
      birth_mmdd:     form.birth_mmdd     || null,
      email:          form.email          || null,
      position:       form.position       || null,
      duty_category:  form.duty_category  || null,
    };

    if (form.id) {
      const { error } = await mdb('staff').update(payload).eq('id', form.id);
      if (error) {
        console.error('[saveStaff] update error:', error);
        showToast(`更新失敗: ${error.message}`, 'error');
        return;
      }
      setStaff(ss => ss.map(s => s.id === form.id ? { ...s, ...payload } : s));
      showToast('スタッフを更新しました');
    } else {
      const { data, error } = await mdb('staff').insert({ ...payload, is_active: true }).select().single();
      if (error) {
        console.error('[saveStaff] insert error:', error);
        showToast(`登録失敗: ${error.message}`, 'error');
        return;
      }
      if (data) setStaff(ss => [...ss, data]);
      showToast('スタッフを登録しました');
    }
    setEditing(null);
  }

  async function deleteStaff(id) {
    const target = staff.find(s => s.id === id);
    if (target?.role === 'office_manager' || target?.role === 'admin') {
      if (!confirm(`「${target.name}」はログインアカウントが設定されています。\nスタッフ削除するとアカウント管理からも消えます。\n本当に削除しますか？`)) return;
    } else {
      if (!confirm('このスタッフを削除しますか？')) return;
    }
    const { error } = await mdb('staff').update({ is_active: false }).eq('id', id);
    if (!error) {
      setStaff(ss => ss.filter(s => s.id !== id));
      showToast('スタッフを削除しました');
    }
  }

  const ROLE_LABELS = { staff: '一般', office_manager: '事業所責任者', admin: '本部' };
  const roleColor   = r => r === 'admin' ? 'role-mgr' : r === 'office_manager' ? 'role-full' : 'role-part';

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>スタッフ管理</h1><p className="muted">全{staff.length}名のスタッフを管理します</p></div>
        <div className="actions">
          <button className="btn-primary" onClick={() => setEditing({ role: 'staff', office_id: offices[0]?.id })}>
            ＋ スタッフ登録
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>事業所</span>
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
              <option value="all">すべて</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="field inline grow">
            <span>検索</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="氏名で検索" />
          </label>
        </div>

        <table className="sheet">
          <thead><tr>
            <th style={{width:32}}></th><th className="rownum"></th><th>氏名</th><th>担当</th><th>役割</th><th>事業所</th><th>権限</th>
            <th>生年月日</th><th>登録日</th><th>操作</th>
          </tr></thead>
          <tbody ref={tbodyRef}>
            {filtered.length === 0 && <tr><td colSpan={10} className="empty">スタッフがいません</td></tr>}
            {filtered.map((s, i) => {
              const office = offices.find(o => o.id === s.office_id);
              return (
                <tr key={s.id} data-id={s.id}>
                  <td><span className="drag-handle">⠿</span></td>
                  <td className="rownum">{i + 1}</td>
                  <td>
                    <div className="row-name" style={{ cursor: 'pointer' }} onClick={() => setViewing(s)}>
                      <span className="avatar sm">{s.name.slice(0, 1)}</span>
                      <strong style={{ textDecoration: 'underline', color: 'var(--primary)' }}>{s.name}</strong>
                    </div>
                  </td>
                  <td style={{ fontSize:11 }}>
                    {s.duty_category
                      ? <span style={{ background: s.duty_category === '日直' ? '#dbeafe' : s.duty_category === '当直' ? '#fce7f3' : '#f3e8ff', color: s.duty_category === '日直' ? '#1d4ed8' : s.duty_category === '当直' ? '#be185d' : '#7e22ce', borderRadius:4, padding:'1px 6px', fontWeight:700, fontSize:11 }}>{s.duty_category}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td style={{ fontSize:12 }}>{s.position || <span className="muted">—</span>}</td>
                  <td>{office?.name || '—'}</td>
                  <td><span className={`pill ${roleColor(s.role)}`}>{ROLE_LABELS[s.role] || s.role}</span></td>
                  <td className="mono">{s.birth_mmdd || <span className="muted">未登録</span>}</td>
                  <td className="mono">{s.created_at?.slice(0, 10)}</td>
                  <td>
                    <button className="btn-mini" onClick={() => setEditing(s)}>編集</button>
                    <button className="btn-mini danger" onClick={() => deleteStaff(s.id)}>削除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sheet-foot">{filtered.length}名</div>
      </div>

      {editing && (
        <StaffEditModal
          staff={editing}
          offices={offices}
          positionTypes={positionTypes}
          setPositionTypes={setPositionTypes}
          onClose={() => setEditing(null)}
          onSave={saveStaff}
        />
      )}
      {viewing && (
        <StaffDetailModal
          staff={viewing}
          offices={offices}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
        />
      )}
    </div>
  );
}

function StaffDetailModal({ staff: s, offices, onClose, onEdit }) {
  const office = offices.find(o => o.id === s.office_id);
  const ROLE_LABELS = { staff: '一般', office_manager: '事業所責任者', admin: '本部' };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>スタッフ詳細</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '8px 0 16px', borderBottom: '1px solid var(--line)' }}>
            <div className="avatar lg">{s.name.slice(0, 1)}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{s.name}</div>
              <div className="muted small">{office?.name}　<span className="pill role-part">{ROLE_LABELS[s.role]}</span></div>
              <div className="muted small mono" style={{ marginTop: 4 }}>ID: {s.id}</div>
            </div>
          </div>
          <div className="form-section-label" style={{ marginTop: 16 }}>打刻用パスワード</div>
          <div style={{ fontSize: 13 }}>
            <span className="muted">生年月日（月日4桁）</span><br />
            <span className="mono">{s.birth_mmdd || '未登録'}</span>
          </div>
          <div className="muted small" style={{ marginTop: 16 }}>
            登録日: {s.created_at?.slice(0, 10)}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>閉じる</button>
          <button className="btn-primary" onClick={onEdit}>✏️ 編集</button>
        </div>
      </div>
    </div>
  );
}

function StaffEditModal({ staff: s, offices, positionTypes: ptProp = [], setPositionTypes, onClose, onSave }) {
  const parts = (s.name || '').split(/\s+/);
  const [form, setForm] = useStateA({
    id:             s.id,
    last_name:      parts[0] || '',
    first_name:     parts.slice(1).join(' ') || '',
    office_id:      s.office_id      || offices[0]?.id,
    role:           s.role           || 'staff',
    birth_mmdd:     s.birth_mmdd     || '',
    email:          s.email          || '',
    position:       s.position       || '',
    duty_category:  s.duty_category  || '',
  });
  const [newPos,       setNewPos]       = useStateA('');
  const [positionTypes, setLocalPT]    = useStateA(ptProp);

  useEffectA(() => {
    mdb('position_types').select('*').order('sort_order').then(({ data }) => {
      if (data && data.length > 0) {
        setLocalPT(data);
        if (setPositionTypes) setPositionTypes(data);
      }
    });
  }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const fullName = () => [form.last_name.trim(), form.first_name.trim()].filter(Boolean).join(' ');

  async function addPositionType() {
    const label = newPos.trim();
    if (!label) return;
    const { data } = await mdb('position_types').insert({ label, sort_order: (positionTypes.length + 1) * 10 }).select().single();
    if (data && setPositionTypes) setPositionTypes(prev => [...prev, data]);
    setNewPos('');
  }
  async function deletePositionType(id) {
    await mdb('position_types').delete().eq('id', id);
    if (setPositionTypes) setPositionTypes(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{s.id ? 'スタッフ編集' : 'スタッフ登録'}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row2">
            <label className="field"><span>姓</span>
              <input value={form.last_name} onChange={e => set('last_name', e.target.value)} autoFocus placeholder="山田" />
            </label>
            <label className="field"><span>名</span>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="太郎" />
            </label>
          </div>
          <div className="form-row2">
            <label className="field"><span>権限</span>
              <select value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="staff">一般</option>
                <option value="office_manager">事業所責任者</option>
                <option value="admin">本部</option>
              </select>
            </label>
            <label className="field"><span>所属事業所</span>
              <select value={form.office_id} onChange={e => set('office_id', e.target.value)}>
                {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row2">
            <label className="field">
              <span>生年月日（月日4桁）※打刻用</span>
              <input className="mono" value={form.birth_mmdd}
                onChange={e => set('birth_mmdd', e.target.value.replace(/\D/g,'').slice(0,4))}
                placeholder="0415" maxLength={4} />
            </label>
            <label className="field">
              <span>メールアドレス（ログイン用）</span>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="任意" />
            </label>
          </div>
          <div className="form-row2">
            <label className="field">
              <span>担当区分</span>
              <select value={form.duty_category} onChange={e => set('duty_category', e.target.value)}>
                <option value="">— 未設定 —</option>
                <option value="日直">日直</option>
                <option value="当直">当直</option>
                <option value="両方">両方（日直・当直）</option>
              </select>
            </label>
            <label className="field">
              <span>役割</span>
              <select value={form.position} onChange={e => set('position', e.target.value)}>
                <option value="">— 未設定 —</option>
                {positionTypes.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
                {form.position && !positionTypes.find(p => p.label === form.position) && (
                  <option value={form.position}>{form.position}</option>
                )}
              </select>
            </label>
          </div>
          <details style={{ marginTop:8 }}>
            <summary style={{ fontSize:12, color:'var(--muted)', cursor:'pointer', userSelect:'none' }}>役割マスタを編集</summary>
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 12px', marginTop:6 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {positionTypes.map(p => (
                  <span key={p.id} style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#e2e8f0', borderRadius:6, padding:'2px 8px', fontSize:12 }}>
                    {p.label}
                    <button onClick={() => deletePositionType(p.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:12, padding:0, lineHeight:1 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <input value={newPos} onChange={e => setNewPos(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPositionType()}
                  placeholder="新しい役割名" style={{ flex:1, border:'1px solid #d1d5db', borderRadius:6, padding:'4px 8px', fontSize:13 }} />
                <button className="btn-mini" onClick={addPositionType}>追加</button>
              </div>
            </div>
          </details>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => { if (!fullName()) return; onSave({ ...form, name: fullName() }); }}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AlertsPage - 有給超過アラート
// ============================================================
function AlertsPage() {
  const { offices, alerts, setAlerts } = useContextA(AppCtx);
  const [officeFilter, setOfficeFilter] = useStateA('all');

  const filtered = useMemoA(() =>
    alerts.filter(a => officeFilter === 'all' || a.office_id === officeFilter),
    [alerts, officeFilter]
  );

  async function markRead(id) {
    await mdb('alerts').update({ is_read: true }).eq('id', id);
    setAlerts(as => as.map(a => a.id === id ? { ...a, is_read: true } : a));
  }

  async function markAllRead() {
    const unread = filtered.filter(a => !a.is_read);
    if (!unread.length) return;
    await mdb('alerts').update({ is_read: true }).in('id', unread.map(a => a.id));
    setAlerts(as => as.map(a => ({ ...a, is_read: true })));
  }

  const unreadCount = filtered.filter(a => !a.is_read).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>アラート</h1>
        </div>
        <div className="actions">
          {unreadCount > 0 && (
            <button className="btn-ghost" onClick={markAllRead}>すべて既読にする</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>事業所</span>
            <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
              <option value="all">すべて</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center' }} className="muted">アラートはありません ✅</div>
        )}

        {filtered.map(a => (
          <div key={a.id} className={`alert-item ${a.is_read ? 'read' : 'unread'}`}>
            <div className="alert-icon">🔔</div>
            <div className="alert-body">
              <div className="alert-title">
                <strong>{a.staff?.name}</strong>（{a.offices?.name}）の
                {a.month}の有給申請がシフト日数を超過しています
                {a.requests && (
                  <span className="muted small"> ／ {REQUEST_TYPE_LABELS[a.requests.type]} ・ {a.requests.date}</span>
                )}
              </div>
              <div className="muted small">{new Date(a.created_at).toLocaleString('ja-JP')}</div>
            </div>
            {!a.is_read
              ? <button className="btn-mini" onClick={() => markRead(a.id)}>既読</button>
              : <span className="pill done" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>既読</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// OfficesPage - 事業所管理（住所・位置情報・QR）
// ============================================================
function OfficesPage() {
  const { offices, setOffices, showToast } = useContextA(AppCtx);
  const [editing,  setEditing]  = useStateA(null);
  const [qrOffice, setQrOffice] = useStateA(null);
  const [geocoding, setGeocoding] = useStateA(false);
  const [saving, setSaving] = useStateA(false);
  const tbodyRef = useRefA(null);

  useSortableRows(tbodyRef, async (ids) => {
    const reordered = ids.map(id => offices.find(o => o.id === id)).filter(Boolean);
    setOffices(reordered);
    await Promise.all(reordered.map((o, i) => mdb('offices').update({ sort_order: (i+1)*10 }).eq('id', o.id)));
  });

  async function saveOffice(form) {
    setSaving(true);
    const payload = {
      name:      form.name,
      address:   form.address   || null,
      latitude:  form.latitude  ? parseFloat(form.latitude)  : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      ...(!form.id && { code: form.name.slice(0, 10) }),
    };
    try {
      if (form.id) {
        const { error } = await mdb('offices').update(payload).eq('id', form.id);
        if (!error) {
          setOffices(os => os.map(o => o.id === form.id ? { ...o, ...payload } : o));
          showToast('事業所を更新しました');
        } else { showToast('更新に失敗しました', 'error'); }
      } else {
        const { data, error } = await mdb('offices').insert(payload).select().single();
        if (!error && data) {
          setOffices(os => [...os, data].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
          showToast('事業所を登録しました');
        } else { showToast('登録に失敗しました', 'error'); }
      }
    } catch (e) {
      console.error('saveOffice error:', e);
      showToast('保存に失敗しました', 'error');
    } finally {
      setSaving(false);
      setEditing(null);
    }
  }

  async function geocode(address, form, setForm) {
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      // 国土地理院 住所検索API（日本語住所特化・無料・キー不要）
      const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.length > 0) {
        // GeoJSON形式: coordinates = [longitude, latitude]
        const [lon, lat] = data[0].geometry.coordinates;
        const title = data[0].properties?.title || '';
        setForm(f => ({
          ...f,
          latitude:  parseFloat(lat).toFixed(6),
          longitude: parseFloat(lon).toFixed(6),
        }));
        showToast(`✅ 取得完了: ${title}`);
      } else {
        showToast('住所が見つかりませんでした。都道府県から入力してください', 'error');
      }
    } catch(e) {
      console.error('Geocode error:', e);
      showToast('位置情報の取得に失敗しました', 'error');
    }
    setGeocoding(false);
  }

  async function deleteOffice(id) {
    if (!confirm('この事業所を削除しますか？\n※所属スタッフがいる場合は削除できません')) return;
    const { error } = await mdb('offices').delete().eq('id', id);
    if (!error) { setOffices(os => os.filter(o => o.id !== id)); showToast('事業所を削除しました'); }
    else { showToast('削除できません（所属スタッフが存在します）', 'error'); }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>事業所管理</h1><p className="muted">全{offices.length}事業所</p></div>
        <div className="actions">
          <button className="btn-primary" onClick={() => setEditing({})}>＋ 事業所登録</button>
        </div>
      </div>
      <div className="card">
        <table className="sheet">
          <thead><tr>
            <th style={{width:32}}></th><th className="rownum"></th><th>事業所名</th><th>住所</th><th>位置情報</th><th>操作</th>
          </tr></thead>
          <tbody ref={tbodyRef}>
            {offices.length === 0 && <tr><td colSpan={6} className="empty">事業所がありません</td></tr>}
            {offices.map((o, i) => (
              <tr key={o.id} data-id={o.id}>
                <td><span className="drag-handle">⠿</span></td>
                <td className="rownum">{i+1}</td>
                <td><strong>{o.name}</strong></td>
                <td style={{ fontSize:12 }}>{o.address || <span className="muted">未設定</span>}</td>
                <td className="center">
                  {o.latitude ? <span className="pill done">設定済み</span> : <span className="pill warn">未設定</span>}
                </td>
                <td>
                  <button className="btn-mini" onClick={() => setEditing(o)}>編集</button>
                  <button className="btn-mini" onClick={() => setQrOffice(o)}>📲 QR</button>
                  <button className="btn-mini danger" onClick={() => deleteOffice(o.id)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sheet-foot">{offices.length}件</div>
      </div>

      {/* 編集モーダル */}
      {editing !== null && (
        <OfficeEditModal
          office={editing}
          geocoding={geocoding}
          saving={saving}
          onGeocode={geocode}
          onClose={() => setEditing(null)}
          onSave={saveOffice}
        />
      )}

      {/* QRモーダル */}
      {qrOffice && <OfficeQRModal office={qrOffice} onClose={() => setQrOffice(null)} />}
    </div>
  );
}

function OfficeEditModal({ office, geocoding, saving, onGeocode, onClose, onSave }) {
  const [form, setForm] = useStateA({
    id:        office.id,
    name:      office.name      || '',
    address:   office.address   || '',
    latitude:  office.latitude  || '',
    longitude: office.longitude || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{office.id ? '事業所編集' : '事業所登録'}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="field"><span>事業所名</span>
            <input autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder="例: 藤沢事業所" />
          </label>
          <div className="form-section-label">打刻位置制限（100m以内）</div>

          {/* ① 住所入力 */}
          <label className="field">
            <span>住所（番地まで入力すると精度が上がります）</span>
            <input
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="例: 神奈川県藤沢市辻堂神台2-2-1"
            />
          </label>

          {/* ② 位置取得ボタン */}
          <button
            className="btn-ghost"
            style={{ width:'100%', marginBottom:12 }}
            onClick={() => onGeocode(form.address, form, setForm)}
            disabled={geocoding || !form.address.trim()}>
            {geocoding ? '⏳ 取得中...' : '📍 住所から緯度経度を自動取得'}
          </button>

          {/* ③ 緯度経度（自動入力 or 手動入力） */}
          <div className="form-row2">
            <label className="field">
              <span>緯度（自動入力されます）</span>
              <input className="mono" value={form.latitude}  onChange={e => set('latitude',  e.target.value)} placeholder="35.336..." />
            </label>
            <label className="field">
              <span>経度（自動入力されます）</span>
              <input className="mono" value={form.longitude} onChange={e => set('longitude', e.target.value)} placeholder="139.487..." />
            </label>
          </div>

          {form.latitude && form.longitude && (
            <div style={{ fontSize:12, color:'var(--ok)', background:'var(--ok-soft)', padding:'8px 12px', borderRadius:6 }}>
              ✅ 位置情報設定済み — スタッフは事業所から100m以内でのみ打刻できます
            </div>
          )}
          {!form.latitude && (
            <div style={{ fontSize:12, color:'var(--warn)', background:'var(--warn-soft)', padding:'8px 12px', borderRadius:6 }}>
              ⚠️ 位置情報未設定 — 場所を問わず打刻できてしまいます
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>キャンセル</button>
          <button className="btn-primary" onClick={() => { if (form.name.trim()) onSave(form); }} disabled={saving || !form.name.trim()}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OfficeQRModal({ office, onClose }) {
  const punchUrl = `${location.origin}/punch.html?o=${office.id}`;

  useEffectA(() => {
    if (window.QRCode) {
      const el = document.getElementById('admin-qr-canvas');
      if (el) { el.innerHTML = ''; new window.QRCode(el, { text: punchUrl, width: 200, height: 200 }); }
    }
  }, [punchUrl]);

  function printQR() {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>QR - ${office.name}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px;}h2{margin-bottom:8px;}p{color:#64748b;font-size:14px;}.url{font-size:11px;color:#94a3b8;margin-top:12px;word-break:break-all;}</style>
      </head><body>
      <h2>${office.name}</h2><p>出勤・退勤 共通QRコード</p>
      <div id="qr"></div>
      <div class="url">${punchUrl}</div>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
      <script>new QRCode(document.getElementById('qr'),{text:'${punchUrl}',width:240,height:240});setTimeout(()=>window.print(),800);</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width:480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{office.name} — QRコード</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ alignItems:'center' }}>
          <div style={{ textAlign:'center', marginBottom:8 }}>
            <div className="muted small" style={{ marginBottom:12 }}>出勤・退勤 共通QRコード</div>
            <div id="admin-qr-canvas" style={{ display:'inline-block', border:'1px solid var(--line)', borderRadius:8, padding:12, background:'#fff' }}>
              {!window.QRCode && <div style={{ width:200, height:200, display:'grid', placeItems:'center', color:'var(--muted)', fontSize:12 }}>生成中...</div>}
            </div>
          </div>
          <div className="hint" style={{ textAlign:'center', lineHeight:1.7 }}>
            シールに印刷して事業所に貼り付けてください。<br/>スタッフがスマホで読み取ると打刻画面が開きます。
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>閉じる</button>
          <button className="btn-primary" onClick={printQR}>🖨 印刷</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AccountsPage - アカウント管理（本部のみ）
// ============================================================
function AccountsPage() {
  const { offices, staff, setStaff, showToast, reload } = useContextA(AppCtx);
  const [creating,  setCreating]  = useStateA(false);
  const [editing,   setEditing]   = useStateA(null);
  const [pwTarget,  setPwTarget]  = useStateA(null);
  const [form,      setForm]      = useStateA({ name:'', email:'', password:'', office_id:'', role:'office_manager' });
  const [editForm,  setEditForm]  = useStateA({ name:'', office_id:'', role:'office_manager', email:'' });
  const [pwForm,    setPwForm]    = useStateA({ new_password:'' });
  const [busy,      setBusy]      = useStateA(false);
  const tbodyRef = useRefA(null);

  const managed = useMemoA(() =>
    staff.filter(s => s.role === 'office_manager' || s.role === 'admin'),
    [staff]);

  useSortableRows(tbodyRef, async (ids) => {
    const reordered = ids.map(id => staff.find(s => s.id === id)).filter(Boolean);
    const others = staff.filter(s => !ids.includes(s.id));
    setStaff([...reordered, ...others]);
    await Promise.all(reordered.map((s, i) => mdb('staff').update({ sort_order: (i+1)*10 }).eq('id', s.id)));
  });

  const set   = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setPw = (k, v) => setPwForm(f => ({ ...f, [k]: v }));

  async function callEdge(body) {
    const { data: { session } } = await supa.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || '処理に失敗しました');
    return json;
  }

  async function createAccount() {
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.office_id) {
      showToast('全項目を入力してください', 'error'); return;
    }
    setBusy(true);
    try {
      await callEdge({ action:'create_user', ...form });
      await reload();
      showToast('アカウントを作成しました');
      setCreating(false);
      setForm({ name:'', email:'', password:'', office_id:'', role:'office_manager' });
    } catch(e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function updateAccount() {
    if (!editForm.name.trim()) { showToast('氏名を入力してください', 'error'); return; }
    setBusy(true);
    try {
      const newEmail = editForm.email.trim() || null;
      const oldEmail = editing.email || null;
      const emailChanged = oldEmail && newEmail && newEmail !== oldEmail;

      // 1. まずDB更新（セッション有効中に実行）
      const payload = { name: editForm.name, office_id: editForm.office_id || null, role: editForm.role, email: newEmail };
      const { error } = await mdb('staff').update(payload).eq('id', editing.id);
      if (error) throw new Error(error.message || error.details || JSON.stringify(error));

      // 2. Auth側のメール変更（失敗してもDB変更は確定済みのため警告のみ）
      if (emailChanged) {
        try {
          await callEdge({ action: 'change_email', target_email: oldEmail, new_email: newEmail });
        } catch(authErr) {
          console.warn('Auth email change skipped:', authErr.message);
        }
      }

      setStaff(ss => ss.map(s => s.id === editing.id ? { ...s, ...payload } : s));
      showToast('アカウントを更新しました');
      setEditing(null);
    } catch(e) {
      showToast(e.message || '更新に失敗しました', 'error');
    }
    setBusy(false);
  }

  async function deleteAccount(s) {
    if (!confirm(`「${s.name}」のアカウントを削除しますか？\nログインできなくなります。`)) return;
    setBusy(true);
    try {
      if (s.email) {
        // auth.usersからも削除
        await callEdge({ action: 'delete_user', target_email: s.email });
      }
      // staffのメール・権限をリセット
      await mdb('staff').update({ role: 'staff', email: null }).eq('id', s.id);
      setStaff(ss => ss.map(x => x.id === s.id ? { ...x, role: 'staff', email: null } : x));
      showToast('アカウントを削除しました');
    } catch(e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  async function changePassword() {
    if (!pwForm.new_password) return;
    setBusy(true);
    try {
      await callEdge({ action:'change_password', target_email: pwTarget.email, new_password: pwForm.new_password });
      showToast('パスワードを変更しました');
      setPwTarget(null); setPwForm({ new_password:'' });
    } catch(e) { showToast(e.message, 'error'); }
    setBusy(false);
  }

  const ROLE_LABELS = { office_manager:'事業所責任者', admin:'本部' };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>アカウント管理</h1><p className="muted">事業所責任者・本部のログインアカウントを管理します</p></div>
        <div className="actions">
          <button className="btn-primary" onClick={() => setCreating(true)}>＋ アカウント発行</button>
        </div>
      </div>
      <div className="card">
        <table className="sheet">
          <thead><tr>
            <th style={{width:32}}></th><th className="rownum"></th><th>氏名</th><th>メールアドレス</th>
            <th>権限</th><th>事業所</th><th>操作</th>
          </tr></thead>
          <tbody ref={tbodyRef}>
            {managed.length === 0 && <tr><td colSpan={7} className="empty">アカウントがありません</td></tr>}
            {managed.map((s, i) => {
              const office = offices.find(o => o.id === s.office_id);
              return (
                <tr key={s.id} data-id={s.id}>
                  <td><span className="drag-handle">⠿</span></td>
                  <td className="rownum">{i+1}</td>
                  <td><strong>{s.name}</strong></td>
                  <td className="mono" style={{ fontSize:12, whiteSpace:'nowrap' }}>{s.email || <span className="muted">—</span>}</td>
                  <td><span className="pill role-full">{ROLE_LABELS[s.role] || s.role}</span></td>
                  <td>{office?.name || '—'}</td>
                  <td style={{ display:'flex', gap:4 }}>
                    <button className="btn-mini" onClick={() => { setEditing(s); setEditForm({ name: s.name, office_id: s.office_id || '', role: s.role, email: s.email || '' }); }}>
                      ✏️ 編集
                    </button>
                    <button className="btn-mini" onClick={() => { setPwTarget(s); setPwForm({ new_password:'' }); }} disabled={!s.email || busy} title={!s.email ? 'メールアドレスがないためPW変更不可' : ''}>
                      🔑 PW変更
                    </button>
                    <button className="btn-mini btn-danger" onClick={() => deleteAccount(s)} disabled={busy}>
                      🗑 削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sheet-foot">{managed.length}件</div>
      </div>

      {/* アカウント作成モーダル */}
      {creating && (
        <div className="modal-bg" onClick={() => setCreating(false)}>
          <div className="modal" style={{ width:500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>アカウント発行</h3>
              <button className="x" onClick={() => setCreating(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row2">
                <label className="field"><span>氏名</span>
                  <input value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
                </label>
                <label className="field"><span>権限</span>
                  <select value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="office_manager">事業所責任者</option>
                    <option value="admin">本部</option>
                  </select>
                </label>
              </div>
              <label className="field"><span>所属事業所</span>
                <select value={form.office_id} onChange={e => set('office_id', e.target.value)}>
                  <option value="">選択してください</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="field"><span>メールアドレス</span>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="manager@example.com" />
              </label>
              <label className="field"><span>仮パスワード</span>
                <input type="text" className="mono" value={form.password} onChange={e => set('password', e.target.value)} placeholder="8文字以上" />
                <span className="hint">本人にパスワードをお伝えください</span>
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setCreating(false)}>キャンセル</button>
              <button className="btn-primary" onClick={createAccount} disabled={busy}>
                {busy ? '作成中...' : 'アカウント作成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* アカウント編集モーダル */}
      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <div className="modal" style={{ width:500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing.name} の編集</h3>
              <button className="x" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="field"><span>氏名</span>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </label>
              <div className="form-row2">
                <label className="field"><span>権限</span>
                  <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="office_manager">事業所責任者</option>
                    <option value="admin">本部</option>
                  </select>
                </label>
                <label className="field"><span>所属事業所</span>
                  <select value={editForm.office_id} onChange={e => setEditForm(f => ({ ...f, office_id: e.target.value }))}>
                    <option value="">選択してください</option>
                    {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>メールアドレス（ログイン用）</span>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="manager@example.com" />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setEditing(null)}>キャンセル</button>
              <button className="btn-primary" onClick={updateAccount} disabled={busy || !editForm.name.trim()}>
                {busy ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* パスワード変更モーダル */}
      {pwTarget && (
        <div className="modal-bg" onClick={() => setPwTarget(null)}>
          <div className="modal" style={{ width:400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{pwTarget.name} のパスワード変更</h3>
              <button className="x" onClick={() => setPwTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="field"><span>新しいパスワード</span>
                <input type="text" className="mono" value={pwForm.new_password}
                  onChange={e => setPw('new_password', e.target.value)}
                  placeholder="8文字以上" autoFocus />
                <span className="hint">本人にパスワードをお伝えください</span>
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setPwTarget(null)}>キャンセル</button>
              <button className="btn-primary" onClick={changePassword} disabled={busy || !pwForm.new_password}>
                {busy ? '変更中...' : '変更する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ManualTouchPage - 管理者手動打刻
// ============================================================
const FUJISAWA_OFFICE_ID = '416ff2a2-76f6-4087-b1de-86e1412dfd0b';

function ManualTouchPage() {
  const { offices, staff: allStaff, showToast } = useContextA(AppCtx);
  const [todayLogs, setTodayLogs] = useStateA([]);
  const [busy,      setBusy]      = useStateA(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffectA(() => { loadToday(); }, []);

  async function loadToday() {
    const { data } = await mdb('touch_logs')
      .select('*')
      .eq('office_id', FUJISAWA_OFFICE_ID)
      .gte('touched_at', `${today}T00:00:00`)
      .lte('touched_at', `${today}T23:59:59`);
    setTodayLogs(data || []);
  }

  const staffList = useMemoA(() =>
    allStaff.filter(s => s.is_worker !== false && s.office_id === FUJISAWA_OFFICE_ID),
    [allStaff]
  );

  function getLog(staffId, type) {
    return todayLogs.find(l => l.staff_id === staffId && l.touch_type === type) || null;
  }

  async function punch(staffId, officeId, type) {
    const key = `${staffId}|${type}`;
    setBusy(key);
    const { error } = await mdb('touch_logs').insert({
      staff_id:   staffId,
      office_id:  officeId,
      touch_type: type,
      touched_at: new Date().toISOString(),
    });
    if (error) { showToast('エラーが発生しました', 'error'); setBusy(null); return; }
    await loadToday();
    setBusy(null);
    showToast(`${type === 'in' ? '出勤' : '退勤'}打刻しました`);
  }

  async function deleteLog(id) {
    await mdb('touch_logs').delete().eq('id', id);
    await loadToday();
    showToast('打刻を削除しました');
  }

  const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }) : null;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>打刻</h1><p className="muted">今日（{today}）藤沢事業所の出退勤を記録・確認できます</p></div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <button className="btn-ghost" onClick={loadToday}>🔄 更新</button>
        </div>

        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>氏名</th>
            <th>事業所</th>
            <th style={{ width: 160 }}>出勤</th>
            <th style={{ width: 160 }}>退勤</th>
          </tr></thead>
          <tbody>
            {staffList.length === 0 && <tr><td colSpan={5} className="empty">スタッフがいません</td></tr>}
            {staffList.map((s, i) => {
              const inLog  = getLog(s.id, 'in');
              const outLog = getLog(s.id, 'out');
              const office = offices.find(o => o.id === s.office_id);
              return (
                <tr key={s.id}>
                  <td className="rownum">{i + 1}</td>
                  <td><strong>{s.name}</strong></td>
                  <td className="muted" style={{ fontSize: 12 }}>{office?.name || '—'}</td>
                  <td>
                    {inLog ? (
                      <span style={{ background:'#dcfce7', color:'#16a34a', borderRadius:6, padding:'2px 10px', fontWeight:700, fontSize:14, fontFamily:'monospace', display:'inline-block' }}>{fmtTime(inLog.touched_at)}</span>
                    ) : (
                      <button
                        className="btn-mini"
                        style={{ background:'#16a34a', color:'#fff', border:'none' }}
                        disabled={busy === `${s.id}|in`}
                        onClick={() => punch(s.id, s.office_id, 'in')}
                      >🟢 出勤打刻</button>
                    )}
                  </td>
                  <td>
                    {outLog ? (
                      <span style={{ background:'#fee2e2', color:'#dc2626', borderRadius:6, padding:'2px 10px', fontWeight:700, fontSize:14, fontFamily:'monospace', display:'inline-block' }}>{fmtTime(outLog.touched_at)}</span>
                    ) : (
                      <button
                        className="btn-mini"
                        style={{ background:'#dc2626', color:'#fff', border:'none', opacity: inLog ? 1 : .4 }}
                        disabled={busy === `${s.id}|out` || !inLog}
                        onClick={() => punch(s.id, s.office_id, 'out')}
                      >🔴 退勤打刻</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sheet-foot">{staffList.length}名</div>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardPage, RequestsViewPage, TouchLogPage, MonthlyPage, StaffAdminPage, AlertsPage, OfficesPage, AccountsPage, ManualTouchPage });
