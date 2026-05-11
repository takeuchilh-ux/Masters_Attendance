// ============================================================
// 管理者画面群
// ============================================================
const { useState: useStateA, useMemo: useMemoA, useContext: useContextA } = React;

// ---------- 打刻管理 ----------
function PunchAdmin() {
  const { punches, setPunches, tenants, staff, showToast, shifts, shiftMaster } = useContextA(AppCtx);
  const [view, setView] = useStateA('all'); // 'all' | 'staff'
  const [tab, setTab] = useStateA('list'); // 'list' | 'monthly' | 'dept'
  const [tenant, setTenant] = useStateA('all');
  const [from, setFrom] = useStateA('2026-04-24');
  const [to, setTo] = useStateA('2026-05-07');
  const [q, setQ] = useStateA('');
  const [csvOpen, setCsvOpen] = useStateA(false);
  const [editingPunch, setEditingPunch] = useStateA(null);
  const [addingPunch, setAddingPunch] = useStateA(false);
  const [staffId, setStaffId] = useStateA(staff[0]?.id || '');
  const [month, setMonth] = useStateA('2026-05');

  const filtered = useMemoA(() => punches.filter(p => {
    if (tenant !== 'all' && p.tenantId !== tenant) return false;
    if (p.date < from || p.date > to) return false;
    if (q && !p.staffName.includes(q)) return false;
    return true;
  }), [punches, tenant, from, to, q]);

  const stats = useMemoA(() => {
    const total = filtered.length;
    const late = filtered.filter(p => p.status==='遅刻').length;
    const early = filtered.filter(p => p.status==='早退').length;
    const totalHrs = filtered.reduce((acc,p)=>{
      if (!p.clockIn || !p.clockOut) return acc;
      const [ih,im] = p.clockIn.split(':').map(Number);
      const [oh,om] = p.clockOut.split(':').map(Number);
      return acc + ((oh*60+om) - (ih*60+im) - (p.breakMin||0))/60;
    }, 0);
    return { total, late, early, totalHrs: Math.round(totalHrs) };
  }, [filtered]);

  // 月次集計
  const monthlySum = useMemoA(() => {
    const map = {};
    filtered.forEach(p => {
      const ym = p.date.slice(0,7);
      const key = `${ym}|${p.staffId}`;
      if (!map[key]) map[key] = { ym, staffId: p.staffId, staffName: p.staffName, tenantId: p.tenantId, days: 0, totalMin: 0, late: 0, early: 0 };
      const r = map[key];
      if (p.clockIn && p.clockOut) {
        const [ih,im] = p.clockIn.split(':').map(Number);
        const [oh,om] = p.clockOut.split(':').map(Number);
        r.totalMin += (oh*60+om)-(ih*60+im)-(p.breakMin||0);
        r.days++;
      }
      if (p.status==='遅刻') r.late++;
      if (p.status==='早退') r.early++;
    });
    return Object.values(map).sort((a,b)=>a.staffName.localeCompare(b.staffName,'ja'));
  }, [filtered]);

  // 部門（事業所）別
  const deptSum = useMemoA(() => {
    const map = {};
    filtered.forEach(p => {
      if (!map[p.tenantId]) map[p.tenantId] = { tenantId: p.tenantId, count: 0, totalMin: 0, late: 0, early: 0, staffSet: new Set() };
      const r = map[p.tenantId];
      r.count++;
      r.staffSet.add(p.staffId);
      if (p.clockIn && p.clockOut) {
        const [ih,im] = p.clockIn.split(':').map(Number);
        const [oh,om] = p.clockOut.split(':').map(Number);
        r.totalMin += (oh*60+om)-(ih*60+im)-(p.breakMin||0);
      }
      if (p.status==='遅刻') r.late++;
      if (p.status==='早退') r.early++;
    });
    return Object.values(map);
  }, [filtered]);

  function savePunch(updated) {
    setPunches(ps => ps.map(p => (p.staffId===updated.staffId && p.date===updated.date) ? { ...p, ...updated } : p));
    gasPost({ action:'upsertPunch', data: updated }); // GASへ書き込み
    showToast('打刻を更新しました');
    setEditingPunch(null);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>打刻管理</h1>
          <p className="muted">全スタッフの打刻データを一覧・絞り込み・CSV出力できます</p>
        </div>
        <div className="actions">
          <div className="view-tabs" style={{marginRight:8}}>
            <button className={view==='all'?'active':''} onClick={()=>setView('all')}>📊 全体一覧</button>
            <button className={view==='staff'?'active':''} onClick={()=>setView('staff')}>👤 個人別月次</button>
          </div>
          <button className="btn-ghost" onClick={()=>setCsvOpen(true)}>📥 CSV出力</button>
          <button className="btn-primary" onClick={()=>setAddingPunch(true)}>＋ 打刻を追加</button>
        </div>
      </div>

      {view === 'staff' ? <StaffMonthlyView staff={staff} staffId={staffId} setStaffId={setStaffId} month={month} setMonth={setMonth} punches={punches} tenants={tenants} shifts={shifts} shiftMaster={shiftMaster} /> : (<>

      <div className="kpis four">
        <div className="kpi"><span>表示件数</span><strong>{stats.total}<small>件</small></strong></div>
        <div className="kpi"><span>合計勤務</span><strong>{stats.totalHrs}<small>h</small></strong></div>
        <div className="kpi warn"><span>遅刻</span><strong>{stats.late}<small>件</small></strong></div>
        <div className="kpi warn"><span>早退</span><strong>{stats.early}<small>件</small></strong></div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>事業所</span>
            <select value={tenant} onChange={e=>setTenant(e.target.value)}>
              <option value="all">すべて</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field inline">
            <span>期間</span>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
            <span className="dash">〜</span>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
          </label>
          <label className="field inline grow">
            <span>名前検索</span>
            <input type="search" placeholder="例: 山田" value={q} onChange={e=>setQ(e.target.value)} />
          </label>
          <div className="legend">
            <span className="dot ok"></span>正常
            <span className="dot late"></span>遅刻
            <span className="dot early"></span>早退
          </div>
        </div>

        <div className="sheet-wrap">
          <div className="sheet-tabbar">
            <button className={`sheet-tab ${tab==='list'?'active':''}`} onClick={()=>setTab('list')}>📊 打刻データ</button>
            <button className={`sheet-tab ${tab==='monthly'?'active':''}`} onClick={()=>setTab('monthly')}>月次集計</button>
            <button className={`sheet-tab ${tab==='dept'?'active':''}`} onClick={()=>setTab('dept')}>部門別</button>
            <span className="sheet-meta">スプレッドシート連携: 同期済 (1分前)</span>
          </div>
          {tab==='list' && (
          <table className="sheet">
            <thead>
              <tr>
                <th className="rownum"></th>
                <th>日付</th>
                <th>事業所</th>
                <th>氏名</th>
                <th>出勤</th>
                <th>退勤</th>
                <th>休憩</th>
                <th>実働</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,80).map((p,i) => {
                const brk = p.breakMin || 0;
                let work = '';
                if (p.clockIn && p.clockOut) {
                  const [ih,im] = p.clockIn.split(':').map(Number);
                  const [oh,om] = p.clockOut.split(':').map(Number);
                  const m = (oh*60+om)-(ih*60+im)-brk;
                  work = `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
                }
                const tname = tenants.find(t=>t.id===p.tenantId)?.name;
                return (
                  <tr key={i}>
                    <td className="rownum">{i+1}</td>
                    <td className="mono">{p.date}</td>
                    <td>{tname}</td>
                    <td><strong>{p.staffName}</strong></td>
                    <td className="mono">{p.clockIn||'—'}</td>
                    <td className="mono">{p.clockOut||'—'}</td>
                    <td className="mono muted">{brk?`${Math.floor(brk/60)}:${String(brk%60).padStart(2,'0')}`:'0:00'}</td>
                    <td className="mono"><strong>{work||'—'}</strong></td>
                    <td>
                      <span className={`pill ${p.status==='正常'?'done':p.status==='遅刻'?'warn':'caution'}`}>{p.status}</span>
                    </td>
                    <td>
                      <button className="btn-mini" onClick={()=>setEditingPunch(p)}>編集</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          {tab==='monthly' && (
          <table className="sheet">
            <thead><tr>
              <th className="rownum"></th><th>月</th><th>事業所</th><th>氏名</th><th>出勤日数</th><th>実働合計</th><th>平均実働</th><th>遅刻</th><th>早退</th>
            </tr></thead>
            <tbody>
              {monthlySum.length===0 && <tr><td colSpan={9} className="empty">表示するデータがありません</td></tr>}
              {monthlySum.map((r,i) => {
                const tname = tenants.find(t=>t.id===r.tenantId)?.name;
                const totalH = (r.totalMin/60).toFixed(1);
                const avgH = r.days?(r.totalMin/r.days/60).toFixed(1):'0.0';
                return (
                  <tr key={i}>
                    <td className="rownum">{i+1}</td>
                    <td className="mono">{r.ym}</td>
                    <td>{tname}</td>
                    <td><strong>{r.staffName}</strong></td>
                    <td className="mono">{r.days}日</td>
                    <td className="mono"><strong>{totalH}h</strong></td>
                    <td className="mono muted">{avgH}h</td>
                    <td className="mono">{r.late?<span className="pill warn">{r.late}</span>:<span className="muted">0</span>}</td>
                    <td className="mono">{r.early?<span className="pill caution">{r.early}</span>:<span className="muted">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          {tab==='dept' && (
          <table className="sheet">
            <thead><tr>
              <th className="rownum"></th><th>事業所</th><th>打刻件数</th><th>スタッフ数</th><th>実働合計</th><th>1人あたり</th><th>遅刻</th><th>早退</th>
            </tr></thead>
            <tbody>
              {deptSum.length===0 && <tr><td colSpan={8} className="empty">表示するデータがありません</td></tr>}
              {deptSum.map((r,i) => {
                const tname = tenants.find(t=>t.id===r.tenantId)?.name || r.tenantId;
                const total = (r.totalMin/60).toFixed(1);
                const per = r.staffSet.size?(r.totalMin/r.staffSet.size/60).toFixed(1):'0.0';
                return (
                  <tr key={i}>
                    <td className="rownum">{i+1}</td>
                    <td><strong>{tname}</strong></td>
                    <td className="mono">{r.count}件</td>
                    <td className="mono">{r.staffSet.size}名</td>
                    <td className="mono"><strong>{total}h</strong></td>
                    <td className="mono muted">{per}h</td>
                    <td className="mono">{r.late?<span className="pill warn">{r.late}</span>:<span className="muted">0</span>}</td>
                    <td className="mono">{r.early?<span className="pill caution">{r.early}</span>:<span className="muted">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          <div className="sheet-foot">{tab==='list' ? `${filtered.length}件中 ${Math.min(80, filtered.length)}件を表示` : tab==='monthly' ? `${monthlySum.length}行` : `${deptSum.length}事業所`}</div>
        </div>
      </div>
      </>)}

      {csvOpen && <CsvModal onClose={()=>setCsvOpen(false)} count={filtered.length} />}
      {editingPunch && <PunchEditModal punch={editingPunch} onClose={()=>setEditingPunch(null)} onSave={savePunch} />}
      {addingPunch && <AddPunchModal staff={staff} tenants={tenants} onClose={()=>setAddingPunch(false)} onSave={(p)=>{ setPunches(ps=>[p,...ps]); showToast('打刻を追加しました'); setAddingPunch(false); }} />}
    </div>
  );
}

function PunchEditModal({ punch, onClose, onSave }) {
  const [form, setForm] = useStateA({
    clockIn: punch.clockIn || '',
    clockOut: punch.clockOut || '',
    breakMin: punch.breakMin || 0,
    status: punch.status || '正常',
    note: punch.note || '',
  });
  let work = '—';
  if (form.clockIn && form.clockOut) {
    const [ih,im] = form.clockIn.split(':').map(Number);
    const [oh,om] = form.clockOut.split(':').map(Number);
    let m = (oh*60+om)-(ih*60+im)-(+form.breakMin||0);
    if (m < 0) m += 24*60;
    work = `${Math.floor(m/60)}h ${m%60}m`;
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>打刻データを編集</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div style={{padding:'8px 0', display:'flex', gap:12, alignItems:'center'}}>
            <div className="avatar">{punch.staffName?.slice(0,1)}</div>
            <div>
              <div style={{fontWeight:600}}>{punch.staffName}</div>
              <div className="muted small mono">{punch.date}</div>
            </div>
          </div>
          <div className="time-edit">
            <label className="field"><span>出勤</span><input type="time" className="mono" value={form.clockIn} onChange={e=>setForm({...form, clockIn:e.target.value})} /></label>
            <label className="field"><span>退勤</span><input type="time" className="mono" value={form.clockOut} onChange={e=>setForm({...form, clockOut:e.target.value})} /></label>
          </div>
          <label className="field"><span>休憩（分）</span>
            <input type="number" className="mono" min="0" step="5" value={form.breakMin} onChange={e=>setForm({...form, breakMin:+e.target.value})} />
          </label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[0,30,45,60,90].map(v => <button key={v} type="button" className="btn-mini" onClick={()=>setForm({...form, breakMin:v})}>{v}分</button>)}
          </div>
          <label className="field"><span>状態</span>
            <select value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>
              <option>正常</option><option>遅刻</option><option>早退</option><option>欠勤</option>
            </select>
          </label>
          <label className="field"><span>備考</span><textarea rows={2} value={form.note} onChange={e=>setForm({...form, note:e.target.value})} placeholder="修正理由など" /></label>
          <div className="hint"><strong>実働: <span className="mono">{work}</span></strong></div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={()=>onSave({ staffId:punch.staffId, date:punch.date, ...form })}>保存</button>
        </div>
      </div>
    </div>
  );
}

function StaffMonthlyView({ staff, staffId, setStaffId, month, setMonth, punches, tenants, shifts, shiftMaster }) {
  const { setPunches, showToast } = useContextA(AppCtx);
  const sel = staff.find(s => s.id === staffId);
  const [editingPunch, setEditingPunch] = useStateA(null);

  function savePunch(updated) {
    setPunches(ps => ps.map(p =>
      (p.staffId === updated.staffId && p.date === updated.date) ? { ...p, ...updated } : p
    ));
    showToast('打刻を更新しました');
    setEditingPunch(null);
  }

  const monthRows = useMemoA(() => {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const out = [];
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${String(d).padStart(2,'0')}`;
      const p = punches.find(x => x.staffId === staffId && x.date === date);
      const dt = new Date(y, m-1, d);
      const sh = shifts ? shifts[`${staffId}|${date}`] : null;
      const sm = sh && shiftMaster ? shiftMaster.find(x => x.id === sh.typeId) : null;
      out.push({ date, day: d, dow: ['日','月','火','水','木','金','土'][dt.getDay()], dowI: dt.getDay(), p, sm, shOverride: sh?.override });
    }
    return out;
  }, [staffId, month, punches, shifts, shiftMaster]);

  const summary = useMemoA(() => {
    let totalMin = 0, roundedMin = 0, late = 0, early = 0, days = 0, ot = 0;
    monthRows.forEach(r => {
      if (r.p?.clockIn && r.p?.clockOut) {
        const [ih,im] = r.p.clockIn.split(':').map(Number);
        const [oh,om] = r.p.clockOut.split(':').map(Number);
        const min = (oh*60+om) - (ih*60+im) - (r.p.breakMin||0);
        totalMin += min;
        // 15分単位で切り捨て（例: 9h14m → 9h、9h17m → 9h15m）
        roundedMin += Math.floor(min / 15) * 15;
        days++;
        if (min > 480) ot += min - 480;
      }
      if (r.p?.status === '遅刻') late++;
      if (r.p?.status === '早退') early++;
    });
    const totalH   = (totalMin / 60).toFixed(2);
    const roundedH = (roundedMin / 60).toFixed(2); // 時給計算用（15分単位切り捨て）
    const otH = (ot / 60).toFixed(1);

    // 給与計算（種別に応じて分岐）
    let baseSalary = null;
    if (sel?.salaryAmount > 0) {
      if (sel.salaryType === '時給') {
        baseSalary = Math.round(roundedMin / 60 * sel.salaryAmount);
      } else if (sel.salaryType === '日給') {
        baseSalary = days * sel.salaryAmount;
      } else if (sel.salaryType === '月給') {
        baseSalary = sel.salaryAmount; // 月額固定
      }
    }
    // 交通費計算（種別に応じて分岐）
    let transport = null;
    if (sel?.transportFee > 0) {
      transport = sel.transportType === '定期' ? sel.transportFee : days * sel.transportFee;
    }
    const totalPay = baseSalary != null && transport != null ? baseSalary + transport
                   : baseSalary != null ? baseSalary : null;
    return { totalH, roundedH, totalMin, roundedMin, days, late, early, otH, baseSalary, transport, totalPay };
  }, [monthRows, sel]);

  const tname = tenants.find(t => t.id === sel?.tenantId)?.name;
  const fmt = n => n != null ? `¥${n.toLocaleString()}` : '—';

  return (
    <>
      <div className="card">
        <div className="filter-bar">
          <label className="field inline"><span>スタッフ</span>
            <select value={staffId} onChange={e=>setStaffId(e.target.value)} style={{minWidth:200}}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}（{tenants.find(t=>t.id===s.tenantId)?.name}）</option>)}
            </select>
          </label>
          <label className="field inline"><span>対象月</span>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)} />
          </label>
          <button className="btn-ghost" onClick={()=>{
            const [y,m] = month.split('-').map(Number);
            const d = new Date(y, m-2, 1);
            setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
          }}>◀ 前月</button>
          <button className="btn-ghost" onClick={()=>{
            const [y,m] = month.split('-').map(Number);
            const d = new Date(y, m, 1);
            setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
          }}>翌月 ▶</button>
        </div>

        {/* スタッフ情報ヘッダー */}
        <div style={{padding:'16px 20px', display:'flex', gap:16, alignItems:'center', borderBottom:'1px solid var(--line)'}}>
          <div className="avatar lg">{sel?.name.slice(0,1)}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:18, fontWeight:600}}>{sel?.name}</div>
            <div className="muted small">{tname} ・ {sel?.role} ・ ID: <span className="mono">{sel?.id}</span></div>
            <div className="muted small" style={{marginTop:2}}>
              {sel?.salaryAmount > 0
                ? <>{sel.salaryType}: <strong className="mono">¥{sel.salaryAmount.toLocaleString()}</strong></>
                : <span>給与: 未設定</span>
              }
              　交通費:&nbsp;
              {sel?.transportFee > 0
                ? <strong className="mono">¥{sel.transportFee.toLocaleString()}/{sel.transportType === '定期' ? '月' : '日'}</strong>
                : <span>未設定</span>
              }
            </div>
          </div>
          <div style={{flex:'0 0 auto', display:'flex', gap:8, flexWrap:'wrap'}}>
            <div className="kpi"><span>出勤日数</span><strong>{summary.days}<small>日</small></strong></div>
            <div className="kpi"><span>合計実働</span><strong>{summary.totalH}<small>h</small></strong></div>
            <div className="kpi"><span>残業</span><strong>{summary.otH}<small>h</small></strong></div>
            <div className="kpi warn"><span>遅刻/早退</span><strong>{summary.late}/{summary.early}</strong></div>
          </div>
        </div>

        {/* 給与計算サマリー */}
        {sel?.salaryAmount > 0 && (
          <div className="salary-summary">
            {/* 時給のみ15分単位の注記を表示 */}
            {sel.salaryType === '時給' && (
              <div className="salary-row" style={{fontSize:11, color:'var(--muted)', gridColumn:'1/-1', marginBottom:2}}>
                ※ 15分単位切り捨て（実働 {summary.totalH}h → 計算対象 {summary.roundedH}h）
              </div>
            )}
            <div className="salary-row">
              <span>基本給<span className="salary-type-badge">{sel.salaryType}</span></span>
              <span className="mono">
                {sel.salaryType === '時給' && `${summary.roundedH}h × ¥${sel.salaryAmount.toLocaleString()}`}
                {sel.salaryType === '日給' && `${summary.days}日 × ¥${sel.salaryAmount.toLocaleString()}`}
                {sel.salaryType === '月給' && '月額固定'}
              </span>
              <strong className="mono">{fmt(summary.baseSalary)}</strong>
            </div>
            {sel.transportFee > 0 && (
              <div className="salary-row">
                <span>交通費<span className="salary-type-badge">{sel.transportType}</span></span>
                <span className="mono">
                  {sel.transportType === '日ごと' && `${summary.days}日 × ¥${sel.transportFee.toLocaleString()}/日`}
                  {sel.transportType === '定期'   && `¥${sel.transportFee.toLocaleString()}/月`}
                </span>
                <strong className="mono">{fmt(summary.transport)}</strong>
              </div>
            )}
            <div className="salary-row total">
              <span>合計支給額（概算）</span>
              <span></span>
              <strong className="mono">{fmt(summary.totalPay)}</strong>
            </div>
          </div>
        )}
      </div>

      {editingPunch && <PunchEditModal punch={editingPunch} onClose={()=>setEditingPunch(null)} onSave={savePunch} />}

      {/* 日次明細テーブル */}
      <div className="card">
        <div style={{overflowX:'auto'}}>
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th>
            <th>日付</th><th>曜日</th>
            <th style={{background:'#f0f9ff'}}>シフト</th>
            <th style={{background:'#f0f9ff'}}>予定開始</th>
            <th style={{background:'#f0f9ff'}}>予定終了</th>
            <th>実績出勤</th><th>実績退勤</th><th>休憩</th>
            <th>実働</th><th>差異</th><th>状態</th><th>操作</th>
          </tr></thead>
          <tbody>
            {monthRows.map((r,i) => {
              // 実績
              let workMin = 0, workStr = '';
              if (r.p?.clockIn && r.p?.clockOut) {
                const [ih,im] = r.p.clockIn.split(':').map(Number);
                const [oh,om] = r.p.clockOut.split(':').map(Number);
                workMin = (oh*60+om)-(ih*60+im)-(r.p.breakMin||0);
                workStr = `${Math.floor(workMin/60)}:${String(workMin%60).padStart(2,'0')}`;
              }
              // シフト予定
              const planStart = r.shOverride?.start || r.sm?.start || '';
              const planEnd   = r.shOverride?.end   || r.sm?.end   || '';
              let planMin = 0;
              if (planStart && planEnd) {
                const [ph,pm] = planStart.split(':').map(Number);
                const [eh,em] = planEnd.split(':').map(Number);
                planMin = (eh*60+em)-(ph*60+pm)-(r.sm?.break||60);
              }
              // 差異 (実績-予定)
              let diffStr = '', diffColor = '';
              if (workMin > 0 && planMin > 0) {
                const diff = workMin - planMin;
                diffStr = (diff >= 0 ? '+' : '') + `${Math.floor(Math.abs(diff)/60)}:${String(Math.abs(diff)%60).padStart(2,'0')}`;
                diffColor = diff > 15 ? 'var(--ok)' : diff < -15 ? 'var(--danger)' : 'var(--muted)';
              }
              const isWeekend = r.dowI === 0 || r.dowI === 6;
              const isOff = r.sm?.id === 'off' || (!r.sm && isWeekend);
              return (
                <tr key={r.date} style={isWeekend?{background:r.dowI===0?'#fef2f2':'#eff6ff'}:{}}>
                  <td className="rownum">{i+1}</td>
                  <td className="mono">{r.day}日</td>
                  <td style={{color:r.dowI===0?'var(--danger)':r.dowI===6?'var(--primary)':''}}>{r.dow}</td>
                  {/* シフト */}
                  <td style={{background:'#f8faff'}}>
                    {r.sm ? (
                      <span className="cell-shift-label" style={{background:r.sm.color, padding:'2px 6px', borderRadius:4, fontSize:11, fontWeight:600}}>
                        {r.sm.label}
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="mono" style={{background:'#f8faff'}}>{planStart || '—'}</td>
                  <td className="mono" style={{background:'#f8faff'}}>{planEnd || '—'}</td>
                  {/* 実績 */}
                  <td className="mono">{r.p?.clockIn || (isOff ? <span className="muted small">休</span> : '—')}</td>
                  <td className="mono">{r.p?.clockOut || '—'}</td>
                  <td className="mono muted">{r.p?.breakMin ? `${Math.floor(r.p.breakMin/60)}:${String(r.p.breakMin%60).padStart(2,'0')}` : r.p ? '0:00' : '—'}</td>
                  <td className="mono"><strong>{workStr || '—'}</strong></td>
                  <td className="mono" style={{color:diffColor, fontWeight:600}}>{diffStr || '—'}</td>
                  <td>{r.p ? <span className={`pill ${r.p.status==='正常'?'done':r.p.status==='遅刻'?'warn':'caution'}`}>{r.p.status}</span> : <span className="muted small">—</span>}</td>
                  <td>{r.p && <button className="btn-mini" onClick={()=>setEditingPunch(r.p)}>編集</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

function CsvModal({ onClose, count }) {
  const { showToast } = useContextA(AppCtx);
  const [unit, setUnit] = useStateA('monthly_all');
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>CSV出力</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="radio-list">
            {[
              {v:'monthly_all', l:'月次・全スタッフ', s:'2026年5月分 / 全事業所'},
              {v:'daily_site', l:'日次・事業所別', s:'指定日 / 事業所単位で出力'},
              {v:'period_site', l:'期間指定・事業所別', s:'絞り込み中の条件で出力 (' + count + '件)'},
              {v:'staff_summary', l:'スタッフ別集計', s:'労働時間・残業・有給を集計'},
            ].map(o => (
              <label key={o.v} className={`radio-card ${unit===o.v?'active':''}`}>
                <input type="radio" checked={unit===o.v} onChange={()=>setUnit(o.v)} />
                <div>
                  <strong>{o.l}</strong>
                  <span className="muted">{o.s}</span>
                </div>
              </label>
            ))}
          </div>
          <label className="field">
            <span>文字コード</span>
            <select><option>UTF-8 (BOM付き)</option><option>Shift-JIS</option></select>
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={()=>{showToast('CSVをダウンロードしました'); onClose();}}>📥 ダウンロード</button>
        </div>
      </div>
    </div>
  );
}

function AddPunchModal({ staff, tenants, onClose, onSave }) {
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useStateA({
    staffId: staff[0]?.id || '',
    date: today,
    clockIn: '09:00',
    clockOut: '18:00',
    breakMin: 60,
    status: '正常',
    note: '',
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const selStaff = staff.find(s=>s.id===form.staffId);
  let work = '—';
  if (form.clockIn && form.clockOut) {
    const [ih,im]=form.clockIn.split(':').map(Number);
    const [oh,om]=form.clockOut.split(':').map(Number);
    let m=(oh*60+om)-(ih*60+im)-(+form.breakMin||0);
    if(m<0)m+=24*60;
    work=`${Math.floor(m/60)}h ${m%60}m`;
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width:480}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>打刻を追加</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <label className="field"><span>スタッフ</span>
            <select value={form.staffId} onChange={e=>set('staffId',e.target.value)}>
              {staff.map(s=><option key={s.id} value={s.id}>{s.name}（{tenants.find(t=>t.id===s.tenantId)?.name}）</option>)}
            </select>
          </label>
          <label className="field"><span>日付</span><input type="date" value={form.date} onChange={e=>set('date',e.target.value)} /></label>
          <div className="time-edit">
            <label className="field"><span>出勤</span><input type="time" className="mono" value={form.clockIn} onChange={e=>set('clockIn',e.target.value)} /></label>
            <label className="field"><span>退勤</span><input type="time" className="mono" value={form.clockOut} onChange={e=>set('clockOut',e.target.value)} /></label>
          </div>
          <label className="field"><span>休憩（分）</span>
            <input type="number" className="mono" min="0" step="5" value={form.breakMin} onChange={e=>set('breakMin',+e.target.value)} />
          </label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[0,30,45,60,90].map(v=><button key={v} type="button" className="btn-mini" onClick={()=>set('breakMin',v)}>{v}分</button>)}
          </div>
          <label className="field"><span>状態</span>
            <select value={form.status} onChange={e=>set('status',e.target.value)}>
              <option>正常</option><option>遅刻</option><option>早退</option><option>欠勤</option>
            </select>
          </label>
          <label className="field"><span>備考</span><textarea rows={2} value={form.note} onChange={e=>set('note',e.target.value)} placeholder="追加理由など" /></label>
          <div className="hint"><strong>実働: <span className="mono">{work}</span></strong></div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={()=>{
            if(!form.staffId||!form.date){return;}
            onSave({ staffId:form.staffId, staffName:selStaff?.name||'', tenantId:selStaff?.tenantId||'', date:form.date, clockIn:form.clockIn, clockOut:form.clockOut, breakMin:+form.breakMin, status:form.status, note:form.note });
          }}>追加</button>
        </div>
      </div>
    </div>
  );
}

// ---------- スタッフ管理 ----------
function StaffAdmin() {
  const { staff, setStaff, tenants, showToast } = useContextA(AppCtx);
  const [tenant, setTenant] = useStateA('all');
  const [q, setQ] = useStateA('');
  const [editing, setEditing] = useStateA(null);
  const [viewing, setViewing] = useStateA(null);
  const filtered = staff.filter(s => (tenant==='all'||s.tenantId===tenant) && (!q || s.name.includes(q)));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>スタッフ管理</h1><p className="muted">全{staff.length}名のスタッフを登録・編集できます</p></div>
        <div className="actions">
          <button className="btn-ghost">📥 CSV取込</button>
          <button className="btn-primary" onClick={()=>setEditing({ name:'', tenantId: (tenant!=='all'?tenant:tenants[0]?.id), role:'パート' })}>＋ スタッフ登録</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <label className="field inline">
            <span>事業所</span>
            <select value={tenant} onChange={e=>setTenant(e.target.value)}>
              <option value="all">すべて</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field inline grow">
            <span>検索</span>
            <input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="氏名で検索" />
          </label>
        </div>
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th><th>ID</th><th>氏名</th><th>所属</th><th>権限</th>
            <th>ステータス</th><th>入社日</th><th>操作</th>
          </tr></thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.id}>
                <td className="rownum">{i+1}</td>
                <td className="mono">{s.id}</td>
                <td>
                  <div className="row-name" style={{cursor:'pointer'}} onClick={()=>setViewing(s)}>
                    <span className="avatar sm">{s.name.slice(0,1)}</span>
                    <strong style={{textDecoration:'underline', color:'var(--primary)'}}>{s.name}</strong>
                  </div>
                </td>
                <td>{tenants.find(t=>t.id===s.tenantId)?.name || <span className="muted small">未割当</span>}</td>
                <td><span className={`pill ${s.role==='責任者'?'role-mgr':s.role==='正社員'?'role-full':'role-part'}`}>{s.role}</span></td>
                <td><span className={`pill ${s.status==='在職'?'done':s.status==='休職'?'caution':'warn'}`}>{s.status||'在職'}</span></td>
                <td className="mono">{s.joined}</td>
                <td>
                  <button className="btn-mini" onClick={()=>setEditing(s)}>編集</button>
                  <button className="btn-mini danger" onClick={()=>{ if(confirm('削除しますか?')) { setStaff(ls => ls.filter(x=>x.id!==s.id)); gasPost({ action:'deleteStaff', staffId:s.id }); } }}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <StaffEditModal staff={editing} onClose={()=>setEditing(null)} onSave={(s)=>{
        setStaff(list => {
          if (editing.id) {
            gasPost({ action:'upsertStaff', data:{ ...s, id:editing.id } });
            return list.map(x => x.id===editing.id ? {...x, ...s} : x);
          }
          const id = `${s.tenantId}-${String(list.length+1).padStart(2,'0')}`;
          gasPost({ action:'upsertStaff', data:{ ...s, id } });
          return [...list, { ...s, id, joined: new Date().toISOString().slice(0,10) }];
        });
        showToast('スタッフ情報を保存しました'); setEditing(null);
      }} />}
      {viewing && <StaffDetailModal staff={viewing} tenants={tenants} onClose={()=>setViewing(null)} onEdit={()=>{ setEditing(viewing); setViewing(null); }} />}
    </div>
  );
}

function StaffDetailModal({ staff: s, tenants, onClose, onEdit }) {
  const tname = tenants.find(t=>t.id===s.tenantId)?.name || '—';
  const statusColor = s.status==='在職'?'done':s.status==='休職'?'caution':'warn';
  const roleColor = s.role==='責任者'?'role-mgr':s.role==='正社員'?'role-full':'role-part';
  const salaryLabel = s.salaryType==='月給'?'月給':s.salaryType==='日給'?'日給':'時給';
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width:480}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h3>スタッフ詳細</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* ヘッダー */}
          <div style={{display:'flex',gap:16,alignItems:'center',padding:'8px 0 16px',borderBottom:'1px solid var(--line)'}}>
            <div className="avatar lg" style={{flexShrink:0}}>{s.name.slice(0,1)}</div>
            <div>
              <div style={{fontSize:20,fontWeight:700}}>{s.name}</div>
              <div className="muted small">{tname}　<span className={`pill ${roleColor}`}>{s.role}</span>　<span className={`pill ${statusColor}`}>{s.status||'在職'}</span></div>
              <div className="muted small mono" style={{marginTop:4}}>ID: {s.id}　入社: {s.joined}</div>
            </div>
          </div>
          {/* 連絡先 */}
          <div className="form-section-label" style={{marginTop:16}}>連絡先</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',fontSize:13}}>
            <div><span className="muted">メール</span><br/><span className="mono">{s.email||'—'}</span></div>
            <div><span className="muted">電話</span><br/><span className="mono">{s.phone||'—'}</span></div>
            <div style={{gridColumn:'1/-1'}}><span className="muted">住所</span><br/>{s.address||'—'}</div>
          </div>
          {/* 給与情報 */}
          <div className="form-section-label" style={{marginTop:16}}>給与情報</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',fontSize:13}}>
            <div><span className="muted">給与種別</span><br/><span className="salary-type-badge">{s.salaryType||'時給'}</span></div>
            <div><span className="muted">{salaryLabel}</span><br/><strong className="mono">¥{(s.salaryAmount||0).toLocaleString()}</strong></div>
            <div><span className="muted">交通費種別</span><br/><span className="salary-type-badge">{s.transportType||'日ごと'}</span></div>
            <div><span className="muted">交通費</span><br/><strong className="mono">¥{(s.transportFee||0).toLocaleString()}/{s.transportType==='定期'?'月':'日'}</strong></div>
          </div>
          {/* その他 */}
          <div className="form-section-label" style={{marginTop:16}}>その他</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',fontSize:13}}>
            <div><span className="muted">初期パスコード</span><br/><span className="mono">1234</span></div>
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

function StaffEditModal({ staff, onClose, onSave }) {
  const { tenants } = useContextA(AppCtx);
  const [form, setForm] = useStateA({
    name:          staff.name||'',
    tenantId:      staff.tenantId||tenants[0]?.id,
    role:          staff.role||'パート',
    status:        staff.status||'在職',
    email:         staff.email||'',
    phone:         staff.phone||'',
    address:       staff.address||'',
    salaryType:    staff.salaryType||'時給',
    salaryAmount:  staff.salaryAmount||1050,
    transportType: staff.transportType||'日ごと',
    transportFee:  staff.transportFee||0,
  });
  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  const salaryLabel = { '時給': '時給（円）', '日給': '日給（円）', '月給': '月給（円）' }[form.salaryType];
  const salaryStep  = form.salaryType === '月給' ? 1000 : 10;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width:560}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>{staff.id?'スタッフ編集':'スタッフ登録'}</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          {/* 基本情報 */}
          <div className="form-section-label">基本情報</div>
          <div className="form-row2">
            <label className="field"><span>氏名</span><input value={form.name} onChange={e=>set('name',e.target.value)} /></label>
            <label className="field"><span>ステータス</span>
              <select value={form.status} onChange={e=>set('status',e.target.value)}>
                <option>在職</option><option>休職</option><option>離職</option>
              </select>
            </label>
          </div>
          <div className="form-row2">
            <label className="field"><span>所属事業所</span>
              <select value={form.tenantId} onChange={e=>set('tenantId',e.target.value)}>
                {tenants.filter(t=>!t.isAdmin).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field"><span>権限</span>
              <select value={form.role} onChange={e=>set('role',e.target.value)}>
                <option>責任者</option><option>正社員</option><option>パート</option>
              </select>
            </label>
          </div>
          {/* 連絡先 */}
          <div className="form-section-label">連絡先</div>
          <label className="field"><span>メールアドレス</span><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="example@mail.com" /></label>
          <div className="form-row2">
            <label className="field"><span>電話番号</span><input className="mono" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="090-0000-0000" /></label>
            <label className="field"><span>初期パスコード</span><input className="mono" defaultValue="1234" /></label>
          </div>
          <label className="field"><span>住所</span><input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="神奈川県藤沢市..." /></label>
          {/* 給与情報 */}
          <div className="form-section-label">給与情報</div>
          <div className="form-row2">
            <label className="field"><span>給与種別</span>
              <select value={form.salaryType} onChange={e=>set('salaryType',e.target.value)}>
                <option>時給</option><option>日給</option><option>月給</option>
              </select>
            </label>
            <label className="field"><span>{salaryLabel}</span>
              <input className="mono" type="number" min="0" step={salaryStep} value={form.salaryAmount} onChange={e=>set('salaryAmount',+e.target.value)} />
            </label>
          </div>
          <div className="form-row2">
            <label className="field"><span>交通費種別</span>
              <select value={form.transportType} onChange={e=>set('transportType',e.target.value)}>
                <option>日ごと</option><option>定期</option>
              </select>
            </label>
            <label className="field">
              <span>{form.transportType === '定期' ? '定期代（円/月）' : '交通費（円/日）'}</span>
              <input className="mono" type="number" min="0" step="10" value={form.transportFee} onChange={e=>set('transportFee',+e.target.value)} />
            </label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={()=>onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 事業所管理 ----------
function TenantAdmin() {
  const { tenants, setTenants, staff, showToast } = useContextA(AppCtx);
  const [editing, setEditing] = useStateA(null);
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>事業所管理</h1><p className="muted">事業所マスタを登録・編集します</p></div>
        <div className="actions"><button className="btn-primary" onClick={()=>setEditing({})}>＋ 事業所登録</button></div>
      </div>

      <div className="tenant-cards">
        {tenants.map(t => {
          const count = staff.filter(s => s.tenantId===t.id).length;
          return (
            <div key={t.id} className="tenant-card">
              <div className="tenant-card-head">
                <div className="brand-square lg" style={{background: t.isAdmin?'#1e40af':'#475569'}}>{t.code}</div>
                <div>
                  <strong>{t.name}</strong>
                  <span className="muted">コード: {t.code}</span>
                </div>
                {t.isAdmin && <span className="pill role-mgr">管理者</span>}
              </div>
              <div className="tenant-stats">
                <div><span className="muted">スタッフ</span><strong>{count}<small>名</small></strong></div>
                <div><span className="muted">本日出勤</span><strong>{Math.floor(count*0.7)}<small>名</small></strong></div>
                <div><span className="muted">パスコード</span><strong className="mono">{t.password}</strong></div>
              </div>
              <div className="tenant-actions">
                <button className="btn-ghost" onClick={()=>setEditing(t)}>編集</button>
                {!t.isAdmin && <button className="btn-ghost danger" onClick={()=>{ if(confirm('削除しますか?')) setTenants(ts=>ts.filter(x=>x.id!==t.id)); }}>削除</button>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <TenantEditModal tenant={editing} onClose={()=>setEditing(null)} onSave={(t)=>{
        setTenants(ts => {
          if (editing.id) return ts.map(x => x.id===editing.id ? {...x, ...t} : x);
          return [...ts, { ...t, id:`site${Date.now()}`, isAdmin:false }];
        });
        showToast('事業所を保存しました'); setEditing(null);
      }} />}
    </div>
  );
}

function TenantEditModal({ tenant, onClose, onSave }) {
  const [form, setForm] = useStateA({ name: tenant.name||'', code: tenant.code||'', password: tenant.password||'0000' });
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>{tenant.id?'事業所編集':'事業所登録'}</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <label className="field"><span>事業所名</span><input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} /></label>
          <label className="field"><span>コード（2文字）</span><input className="mono" maxLength={2} value={form.code} onChange={e=>setForm({...form, code:e.target.value.toUpperCase()})} /></label>
          <label className="field"><span>ログインパスワード</span><input className="mono" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} /></label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={()=>onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 権限設定 ----------
function RoleAdmin() {
  const ROLES = [
    { id:'admin', label:'管理者（本社）', desc:'全データの閲覧・編集・出力' },
    { id:'leader', label:'事業所責任者', desc:'自事業所のシフト・申請承認' },
    { id:'fulltime', label:'正社員', desc:'打刻・申請のみ' },
    { id:'parttime', label:'パート・アルバイト', desc:'打刻・有給申請のみ' },
  ];
  const PERMISSIONS = [
    '打刻','打刻管理（自事業所）','打刻管理（全社）',
    'シフト作成','シフトマスタ変更','スタッフ登録','事業所登録',
    '権限設定','申請提出','申請承認','CSV出力',
  ];
  const [matrix, setMatrix] = useStateA(() => {
    const m = {};
    ROLES.forEach(r => {
      m[r.id] = {};
      PERMISSIONS.forEach(p => {
        if (r.id==='admin') m[r.id][p] = true;
        else if (r.id==='leader') m[r.id][p] = ['打刻','打刻管理（自事業所）','シフト作成','シフトマスタ変更','申請提出','申請承認','CSV出力'].includes(p);
        else if (r.id==='fulltime') m[r.id][p] = ['打刻','申請提出'].includes(p);
        else m[r.id][p] = ['打刻','申請提出'].includes(p);
      });
    });
    return m;
  });

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>権限設定</h1><p className="muted">役割ごとの操作権限を設定します</p></div>
        <div className="actions"><button className="btn-primary">変更を保存</button></div>
      </div>

      <div className="card">
        <table className="sheet roles">
          <thead><tr>
            <th>権限</th>
            {ROLES.map(r => <th key={r.id}><div className="role-head"><strong>{r.label}</strong><span className="muted">{r.desc}</span></div></th>)}
          </tr></thead>
          <tbody>
            {PERMISSIONS.map(p => (
              <tr key={p}>
                <td><strong>{p}</strong></td>
                {ROLES.map(r => (
                  <td key={r.id} className="center">
                    <label className="switch">
                      <input type="checkbox" checked={matrix[r.id][p]} onChange={e=>setMatrix(m=>({...m, [r.id]: {...m[r.id], [p]: e.target.checked}}))} />
                      <span className="slider"></span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { PunchAdmin, StaffAdmin, TenantAdmin, RoleAdmin });
