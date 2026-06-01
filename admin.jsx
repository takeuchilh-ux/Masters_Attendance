// ============================================================
// MasuTa! 大本管理者 - 各ページ
// ============================================================
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useContext: useContextA } = React;

// ============================================================
// DashboardPage - 全事業所の今日の出欠（タブ切替）
// ============================================================
function DashboardPage() {
  const { offices, staff } = useContextA(AppCtx);
  const [todayShifts,  setTodayShifts]  = useStateA([]);
  const [todayTouches, setTodayTouches] = useStateA([]);
  const [loading,      setLoading]      = useStateA(true);
  const [activeTab,    setActiveTab]    = useStateA('all');
  const today = new Date().toISOString().slice(0, 10);

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
          .lte('touched_at', `${today}T23:59:59`)
          .eq('touch_type', 'in'),
      ]);
      setTodayShifts(shiftRes.data || []);
      setTodayTouches(touchRes.data || []);
      setLoading(false);
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [today]);

  const touchedIds = useMemoA(() => new Set(todayTouches.map(t => t.staff_id)), [todayTouches]);
  const presentCount = todayShifts.filter(s => touchedIds.has(s.staff_id)).length;
  const absentCount  = todayShifts.filter(s => !touchedIds.has(s.staff_id)).length;

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
        <div className="card">
          <div className="attendance-list">
            {offStaff.filter(s => shiftedIds.has(s.id)).map(s => {
              const shift      = offShifts.find(sh => sh.staff_id === s.id);
              const hasTouched = touchedIds.has(s.id);
              const st         = shift?.shift_types;
              return (
                <div key={s.id} className="attendance-row">
                  <span title={hasTouched ? '出勤確認済み' : '未出勤'}>
                    {hasTouched ? '🟢' : '🔴'}
                  </span>
                  <span className="att-name">{s.name}</span>
                  {st && <span className="att-shift" style={{ background: st.color }}>{st.label}</span>}
                </div>
              );
            })}
            {offShifts.length === 0 && (
              <div className="muted small" style={{ padding: '12px 16px' }}>本日のシフトなし</div>
            )}
          </div>
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

      {/* 事業所タブ */}
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
                <div key={office.id} className="card office-card">
                  <div className="office-card-head">
                    <strong>{office.name}</strong>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="pill done">{present}名出勤</span>
                      <span className="muted small">{offShifts.length}名予定</span>
                    </div>
                  </div>
                  <div className="attendance-list">
                    {offStaff.filter(s => shiftedIds.has(s.id)).map(s => {
                      const shift      = offShifts.find(sh => sh.staff_id === s.id);
                      const hasTouched = touchedIds.has(s.id);
                      const st         = shift?.shift_types;
                      return (
                        <div key={s.id} className="attendance-row">
                          <span title={hasTouched ? '出勤確認済み' : '未出勤'}>{hasTouched ? '🟢' : '🔴'}</span>
                          <span className="att-name">{s.name}</span>
                          {st && <span className="att-shift" style={{ background: st.color }}>{st.label}</span>}
                        </div>
                      );
                    })}
                    {offShifts.length === 0 && (
                      <div className="muted small" style={{ padding: '8px 12px' }}>本日のシフトなし</div>
                    )}
                  </div>
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
// TouchLogPage - タッチログ（大本のみ）
// ============================================================
function TouchLogPage() {
  const { offices } = useContextA(AppCtx);
  const today = new Date().toISOString().slice(0, 10);
  const [logs,         setLogs]         = useStateA([]);
  const [loading,      setLoading]      = useStateA(true);
  const [officeFilter, setOfficeFilter] = useStateA('all');
  const [from,         setFrom]         = useStateA(today);
  const [to,           setTo]           = useStateA(today);
  const [q,            setQ]            = useStateA('');

  useEffectA(() => {
    async function load() {
      setLoading(true);
      const res = await mdb('touch_logs')
        .select('*, staff(name), offices(name)')
        .gte('touched_at', `${from}T00:00:00`)
        .lte('touched_at', `${to}T23:59:59`)
        .order('touched_at', { ascending: false })
        .limit(500);
      setLogs(res.data || []);
      setLoading(false);
    }
    load();
  }, [from, to]);

  const filtered = useMemoA(() => logs.filter(l => {
    if (officeFilter !== 'all' && l.office_id !== officeFilter) return false;
    if (q && !l.staff?.name?.includes(q)) return false;
    return true;
  }), [logs, officeFilter, q]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>タッチログ</h1>
        </div>
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
            <th>日時</th><th>事業所</th><th>スタッフ名</th><th>IDm</th><th>種別</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">読み込み中...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="empty">タッチログがありません</td></tr>}
            {filtered.map((l, i) => (
              <tr key={l.id}>
                <td className="rownum">{i + 1}</td>
                <td className="mono">{new Date(l.touched_at).toLocaleString('ja-JP')}</td>
                <td>{l.offices?.name || '—'}</td>
                <td><strong>{l.staff?.name || <span className="muted small">未登録</span>}</strong></td>
                <td className="mono" style={{ fontSize: 11 }}>{l.ic_card_idm}</td>
                <td>
                  <span className={`pill ${l.touch_type === 'in' ? 'done' : 'caution'}`}>
                    {l.touch_type === 'in' ? '出勤' : '退勤'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sheet-foot">{filtered.length}件表示</div>
      </div>
    </div>
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
        mdb('touch_logs').select('staff_id, touched_at')
          .gte('touched_at', `${start}T00:00:00`)
          .lte('touched_at', `${end}T23:59:59`)
          .eq('touch_type', 'in'),
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
      const presentDays = sTouches.length;
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

      return { s, office, shiftDays, presentDays, absentDays, paidLeave, lateMin, earlyMin, effectiveH };
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
              <th className="rownum"></th>
              <th>氏名</th><th>事業所</th>
              <th>シフト日数</th><th>出勤確認</th><th>欠勤</th>
              <th>有給</th><th>遅刻(分)</th><th>早退(分)</th><th>実働(h)</th>
            </tr></thead>
            <tbody>
              {summaries.length === 0 && <tr><td colSpan={10} className="empty">データがありません</td></tr>}
              {summaries.map((r, i) => (
                <tr key={r.s.id}>
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
              ))}
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
  const { offices, staff, setStaff, showToast } = useContextA(AppCtx);
  const [officeFilter, setOfficeFilter] = useStateA('all');
  const [q,            setQ]            = useStateA('');
  const [editing,      setEditing]      = useStateA(null);
  const [viewing,      setViewing]      = useStateA(null);

  const filtered = useMemoA(() => staff.filter(s =>
    (officeFilter === 'all' || s.office_id === officeFilter) &&
    (!q || s.name.includes(q))
  ), [staff, officeFilter, q]);

  async function saveStaff(form) {
    if (form.id) {
      const { id, ...rest } = form;
      const { error } = await mdb('staff').update(rest).eq('id', id);
      if (!error) {
        setStaff(ss => ss.map(s => s.id === id ? { ...s, ...rest } : s));
        showToast('スタッフを更新しました');
      }
    } else {
      const { data, error } = await mdb('staff').insert({ ...form, is_active: true }).select().single();
      if (!error && data) {
        setStaff(ss => [...ss, data]);
        showToast('スタッフを登録しました');
      }
    }
    setEditing(null);
  }

  async function deleteStaff(id) {
    if (!confirm('このスタッフを削除しますか？')) return;
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
            <th className="rownum"></th><th>氏名</th><th>事業所</th><th>権限</th>
            <th>IC Card IDm</th><th>登録日</th><th>操作</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="empty">スタッフがいません</td></tr>}
            {filtered.map((s, i) => {
              const office = offices.find(o => o.id === s.office_id);
              return (
                <tr key={s.id}>
                  <td className="rownum">{i + 1}</td>
                  <td>
                    <div className="row-name" style={{ cursor: 'pointer' }} onClick={() => setViewing(s)}>
                      <span className="avatar sm">{s.name.slice(0, 1)}</span>
                      <strong style={{ textDecoration: 'underline', color: 'var(--primary)' }}>{s.name}</strong>
                    </div>
                  </td>
                  <td>{office?.name || '—'}</td>
                  <td><span className={`pill ${roleColor(s.role)}`}>{ROLE_LABELS[s.role] || s.role}</span></td>
                  <td className="mono" style={{ fontSize: 11 }}>{s.ic_card_idm || <span className="muted">未登録</span>}</td>
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
          <div className="form-section-label" style={{ marginTop: 16 }}>フェリカ情報</div>
          <div style={{ fontSize: 13 }}>
            <span className="muted">IC Card IDm</span><br />
            <span className="mono">{s.ic_card_idm || '未登録'}</span>
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

function StaffEditModal({ staff: s, offices, onClose, onSave }) {
  const [form, setForm] = useStateA({
    id:          s.id,
    name:        s.name        || '',
    office_id:   s.office_id   || offices[0]?.id,
    role:        s.role        || 'staff',
    birth_mmdd:  s.birth_mmdd  || '',
    email:       s.email       || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
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
                <option value="admin">本部</option>
              </select>
            </label>
          </div>
          <label className="field"><span>所属事業所</span>
            <select value={form.office_id} onChange={e => set('office_id', e.target.value)}>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
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
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => { if (!form.name.trim()) return; onSave(form); }}>保存</button>
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

  async function saveOffice(form) {
    const payload = {
      name:      form.name,
      address:   form.address   || null,
      latitude:  form.latitude  ? parseFloat(form.latitude)  : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
    };
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
    setEditing(null);
  }

  async function geocode(address, form, setForm) {
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, { headers: { 'Accept-Language': 'ja' } });
      const data = await res.json();
      if (data.length > 0) {
        setForm(f => ({ ...f, latitude: parseFloat(data[0].lat).toFixed(6), longitude: parseFloat(data[0].lon).toFixed(6) }));
        showToast('位置情報を取得しました');
      } else { showToast('住所が見つかりませんでした', 'error'); }
    } catch { showToast('位置情報の取得に失敗しました', 'error'); }
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
            <th className="rownum"></th><th>事業所名</th><th>住所</th><th>位置情報</th><th>操作</th>
          </tr></thead>
          <tbody>
            {offices.length === 0 && <tr><td colSpan={5} className="empty">事業所がありません</td></tr>}
            {offices.map((o, i) => (
              <tr key={o.id}>
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

function OfficeEditModal({ office, geocoding, onGeocode, onClose, onSave }) {
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
          <label className="field"><span>住所</span>
            <div style={{ display:'flex', gap:8 }}>
              <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="例: 神奈川県藤沢市..." style={{ flex:1 }} />
              <button className="btn-ghost" style={{ whiteSpace:'nowrap' }}
                onClick={() => onGeocode(form.address, form, setForm)}
                disabled={geocoding}>
                {geocoding ? '取得中...' : '📍 位置取得'}
              </button>
            </div>
          </label>
          <div className="form-row2">
            <label className="field"><span>緯度</span>
              <input className="mono" value={form.latitude}  onChange={e => set('latitude',  e.target.value)} placeholder="35.336..." />
            </label>
            <label className="field"><span>経度</span>
              <input className="mono" value={form.longitude} onChange={e => set('longitude', e.target.value)} placeholder="139.487..." />
            </label>
          </div>
          {!form.latitude && (
            <div style={{ fontSize:12, color:'var(--warn)', background:'var(--warn-soft)', padding:'8px 12px', borderRadius:6 }}>
              ⚠️ 位置情報未設定の場合、スタッフは場所を問わず打刻できます
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => { if (form.name.trim()) onSave(form); }}>保存</button>
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
          <div style={{ fontSize:11, color:'var(--muted)', wordBreak:'break-all', textAlign:'center', maxWidth:340 }}>{punchUrl}</div>
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
  const { offices, staff, setStaff, showToast } = useContextA(AppCtx);
  const [creating,  setCreating]  = useStateA(false);
  const [pwTarget,  setPwTarget]  = useStateA(null); // PW変更対象staff
  const [form,      setForm]      = useStateA({ name:'', email:'', password:'', office_id:'', role:'office_manager' });
  const [pwForm,    setPwForm]    = useStateA({ new_password:'' });
  const [busy,      setBusy]      = useStateA(false);

  const managed = useMemoA(() =>
    staff.filter(s => s.role === 'office_manager' || s.role === 'admin').sort((a,b) => a.name.localeCompare(b.name,'ja')),
    [staff]);

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
      const { data } = await mdb('staff').select('*').eq('email', form.email).single();
      if (data) setStaff(ss => [...ss.filter(s => s.email !== form.email), data]);
      showToast('アカウントを作成しました');
      setCreating(false);
      setForm({ name:'', email:'', password:'', office_id:'', role:'office_manager' });
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
            <th className="rownum"></th><th>氏名</th><th>メールアドレス</th>
            <th>権限</th><th>事業所</th><th>操作</th>
          </tr></thead>
          <tbody>
            {managed.length === 0 && <tr><td colSpan={6} className="empty">アカウントがありません</td></tr>}
            {managed.map((s, i) => {
              const office = offices.find(o => o.id === s.office_id);
              return (
                <tr key={s.id}>
                  <td className="rownum">{i+1}</td>
                  <td><strong>{s.name}</strong></td>
                  <td className="mono" style={{ fontSize:12 }}>{s.email || <span className="muted">—</span>}</td>
                  <td><span className="pill role-full">{ROLE_LABELS[s.role] || s.role}</span></td>
                  <td>{office?.name || '—'}</td>
                  <td>
                    <button className="btn-mini" onClick={() => { setPwTarget(s); setPwForm({ new_password:'' }); }}>
                      🔑 PW変更
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

Object.assign(window, { DashboardPage, RequestsViewPage, TouchLogPage, MonthlyPage, StaffAdminPage, AlertsPage, OfficesPage, AccountsPage });
