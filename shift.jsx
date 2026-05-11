// ============================================================
// シフト関連画面
// ============================================================
const { useState: useStateS, useMemo: useMemoS, useContext: useContextS, useEffect: useEffectS } = React;

function ShiftPage({ auth }) {
  const { shifts, setShifts, shiftMaster, staff, showToast } = useContextS(AppCtx);
  const [view, setView] = useStateS(window.__shiftView || 'month'); // month | week | gantt
  const [year, setYear] = useStateS(2026);
  const [month, setMonth] = useStateS(5);
  const [tenant, setTenant] = useStateS(auth.isAdmin ? 'siteA' : auth.tenantId);
  const [editing, setEditing] = useStateS(null); // { staffId, date }

  useEffectS(() => {
    function onTweak(e) {
      if (e.data?.type === '__shift_view') setView(e.data.view);
    }
    window.addEventListener('message', onTweak);
    return () => window.removeEventListener('message', onTweak);
  }, []);

  const tenantStaff = staff.filter((s) => s.tenantId === tenant);
  const monthStart = new Date(year, month - 1, 1);
  const dim = new Date(year, month, 0).getDate();
  const days = Array.from({ length: dim }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return { d, n: i + 1, dow: d.getDay(), iso: d.toISOString().slice(0, 10) };
  });

  function setShift(staffId, iso, typeId, override) {
    const key = `${staffId}|${iso}`;
    setShifts((s) => ({ ...s, [key]: { typeId, override } }));
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>シフト作成</h1><p className="muted">月単位でシフトを編集できます。マスを直接クリックして編集</p></div>
        <div className="actions">
          <button className="btn-ghost" onClick={()=>{
            const tname = TENANTS.find(t=>t.id===tenant)?.name || '';
            const title = `${year}年${month}月 ${tname}`;
            const now = new Date();
            const stamp = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            const w = window.open('','_blank');
            w.document.write(`<title>${title}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Noto Sans JP',sans-serif;padding:0;margin:0;color:#0f172a}h1{margin:0 0 12px;font-size:18px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #999;padding:3px;text-align:center}th{background:#f1f5f9}.foot{margin-top:8px;font-size:9px;color:#64748b;text-align:left}@media print{button{display:none}}</style><h1>${title}</h1>${document.querySelector('.shift-matrix-wrap, .week-view, .gantt')?.outerHTML||''}<div class="foot">出力日時: ${stamp}</div><button onclick="window.print()" style="margin-top:16px;padding:8px 16px">🖨 印刷 / PDF保存</button>`);
            w.document.close();
          }}>📄 PDF作成</button>
          <button className="btn-primary" onClick={() => showToast('シフトを公開しました')}>シフトを公開</button>
        </div>
      </div>

      <div className="card">
        <div className="shift-toolbar">
          <div className="month-nav">
            <button className="btn-icon" onClick={() => {if (month === 1) {setMonth(12);setYear((y) => y - 1);} else setMonth((m) => m - 1);}}>◀</button>
            <strong>{year}年 {month}月</strong>
            <button className="btn-icon" onClick={() => {if (month === 12) {setMonth(1);setYear((y) => y + 1);} else setMonth((m) => m + 1);}}>▶</button>
          </div>
          {auth.isAdmin &&
          <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
              {TENANTS.filter((t) => !t.isAdmin).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          }
          <div className="view-tabs">
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>月</button>
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>週</button>
            <button className={view === 'gantt' ? 'active' : ''} onClick={() => setView('gantt')}>日</button>
          </div>
          <div className="legend">
            {shiftMaster.map((t) => <span key={t.id} className="leg"><span className="sw" style={{ background: t.color }}></span>{t.label}{t.start && ` ${t.start}-${t.end}`}</span>)}
          </div>
        </div>

        {view === 'month' &&
        <div className="shift-matrix-wrap">
            <table className="shift-matrix">
              <thead>
                <tr>
                  <th className="sticky-l">スタッフ</th>
                  {days.map((d) =>
                <th key={d.n} className={`day-h ${d.dow === 0 ? 'sun' : d.dow === 6 ? 'sat' : ''}`}>
                      <div className="dn">{d.n}</div>
                      <div className="dw">{['日', '月', '火', '水', '木', '金', '土'][d.dow]}</div>
                    </th>
                )}
                  <th className="total">合計</th>
                </tr>
              </thead>
              <tbody>
                {tenantStaff.map((s) => {
                let totalH = 0;
                return (
                  <tr key={s.id}>
                      <td className="sticky-l">
                        <div className="row-name"><span className="avatar sm">{s.name.slice(0, 1)}</span><strong>{s.name}</strong></div>
                      </td>
                      {days.map((d) => {
                      const sh = shifts[`${s.id}|${d.iso}`];
                      const m = sh ? shiftMaster.find((x) => x.id === sh.typeId) : null;
                      const start = sh?.override?.start || m?.start;
                      const end = sh?.override?.end || m?.end;
                      if (start && end) {
                        const [ih, im] = start.split(':').map(Number);
                        const [oh, om] = end.split(':').map(Number);
                        totalH += (oh * 60 + om - (ih * 60 + im) - 60) / 60;
                      }
                      return (
                        <td key={d.n} className={`shift-cell ${d.dow === 0 ? 'sun' : d.dow === 6 ? 'sat' : ''}`} onClick={() => setEditing({ staffId: s.id, date: d.iso })}>
                            {m &&
                          <div className="cell-shift" style={{ background: m.color }}>
                                <div className="lbl">{m.label}</div>
                                {start && <div className="time mono">{start}</div>}
                              </div>
                          }
                          </td>);

                    })}
                      <td className="total mono"><strong>{Math.round(totalH)}</strong>h</td>
                    </tr>);

              })}
              </tbody>
            </table>
          </div>
        }

        {view === 'week' && <WeekView staff={tenantStaff} shifts={shifts} master={shiftMaster} year={year} month={month} onCellClick={(s, d) => setEditing({ staffId: s, date: d })} />}
        {view === 'gantt' && <GanttView staff={tenantStaff} shifts={shifts} master={shiftMaster} year={year} month={month} />}
      </div>

      {editing && <ShiftEditModal sel={editing} master={shiftMaster} current={shifts[`${editing.staffId}|${editing.date}`]} onClose={() => setEditing(null)}
        onSave={(typeId, override) => {setShift(editing.staffId, editing.date, typeId, override);showToast('シフトを更新しました');setEditing(null);}}
        onDelete={() => {
          const key = `${editing.staffId}|${editing.date}`;
          setShifts(s => { const n = {...s}; delete n[key]; return n; });
          showToast('シフトを削除しました'); setEditing(null);
        }}
        staffName={tenantStaff.find((s) => s.id === editing.staffId)?.name} />}
    </div>);

}

function WeekView({ staff, shifts, master, year, month, onCellClick }) {
  const [weekStart, setWeekStart] = useStateS(() => {
    const d = new Date(year, month - 1, 1);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const days = Array.from({ length: 7 }, (_, i) => {const d = new Date(weekStart);d.setDate(weekStart.getDate() + i);return d;});
  return (
    <div className="week-view">
      <div className="week-nav">
        <button className="btn-icon" onClick={() => {const d = new Date(weekStart);d.setDate(d.getDate() - 7);setWeekStart(d);}}>◀</button>
        <strong>{weekStart.getMonth() + 1}/{weekStart.getDate()} 週</strong>
        <button className="btn-icon" onClick={() => {const d = new Date(weekStart);d.setDate(d.getDate() + 7);setWeekStart(d);}}>▶</button>
      </div>
      <div className="week-grid" style={{ gridTemplateColumns: `200px repeat(7, 1fr)` }}>
        <div className="wk-h"></div>
        {days.map((d, i) => <div key={i} className={`wk-h ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}>{['日', '月', '火', '水', '木', '金', '土'][d.getDay()]}<br /><strong>{d.getMonth() + 1}/{d.getDate()}</strong></div>)}
        {staff.map((s) =>
        <React.Fragment key={s.id}>
            <div className="wk-name"><span className="avatar sm">{s.name.slice(0, 1)}</span><strong>{s.name}</strong></div>
            {days.map((d, i) => {
            const iso = d.toISOString().slice(0, 10);
            const sh = shifts[`${s.id}|${iso}`];
            const m = sh ? master.find((x) => x.id === sh.typeId) : null;
            return (
              <div key={i} className="wk-cell" onClick={() => onCellClick(s.id, iso)}>
                  {m && <div className="wk-shift" style={{ background: m.color }}><strong>{m.label}</strong>{m.start && <span className="mono">{m.start}-{m.end}</span>}</div>}
                </div>);

          })}
          </React.Fragment>
        )}
      </div>
    </div>);

}

function GanttView({ staff, shifts, master, year, month }) {
  const today = new Date(year, month - 1, 7);
  const iso = today.toISOString().slice(0, 10);
  const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00-23:00
  return (
    <div className="gantt">
      <div className="gantt-head" style={{ gridTemplateColumns: `200px repeat(${HOURS.length}, 1fr)` }}>
        <div></div>
        {HOURS.map((h) => <div key={h} className="gantt-hr">{h}:00</div>)}
      </div>
      <div className="gantt-body">
        <div className="gantt-date muted">{iso} の予定</div>
        {staff.map((s) => {
          const sh = shifts[`${s.id}|${iso}`];
          const m = sh ? master.find((x) => x.id === sh.typeId) : null;
          let leftPct = 0,widthPct = 0;
          if (m && m.start) {
            const [sh1, sm1] = m.start.split(':').map(Number);
            const [eh1, em1] = m.end.split(':').map(Number);
            const startMin = sh1 * 60 + sm1 - 6 * 60;
            const endMin = eh1 * 60 + em1 - 6 * 60;
            leftPct = startMin / (HOURS.length * 60) * 100;
            widthPct = (endMin - startMin) / (HOURS.length * 60) * 100;
          }
          return (
            <div key={s.id} className="gantt-row" style={{ gridTemplateColumns: `200px 1fr` }}>
              <div className="wk-name"><span className="avatar sm">{s.name.slice(0, 1)}</span><strong>{s.name}</strong></div>
              <div className="gantt-track">
                {m && m.start &&
                <div className="gantt-bar" style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: m.color }}>
                    <strong>{m.label}</strong> <span className="mono">{m.start}-{m.end}</span>
                  </div>
                }
              </div>
            </div>);

        })}
      </div>
    </div>);

}

function ShiftEditModal({ sel, master, current, onClose, onSave, onDelete, staffName }) {
  const [typeId, setTypeId] = useStateS(current?.typeId || 'mid');
  const baseM = master.find((m) => m.id === typeId);
  const [start, setStart] = useStateS(current?.override?.start || baseM?.start || '');
  const [end, setEnd] = useStateS(current?.override?.end || baseM?.end || '');

  function pickType(id) {
    setTypeId(id);
    const m = master.find((x) => x.id === id);
    setStart(m.start);setEnd(m.end);
  }
  const isOverride = baseM && (start !== baseM.start || end !== baseM.end);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>シフト編集</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="muted">{staffName} ／ {sel.date}</div>
          <label className="field"><span>シフト種別</span>
            <div className="shift-pick">
              {master.map((m) =>
              <button key={m.id} type="button" className={`shift-chip ${typeId === m.id ? 'active' : ''}`} onClick={() => pickType(m.id)} style={{ borderColor: typeId === m.id ? '#1e40af' : '#cbd5e1' }}>
                  <span className="sw" style={{ background: m.color }}></span>
                  <strong>{m.label}</strong>
                  {m.start && <span className="mono small">{m.start}-{m.end}</span>}
                </button>
              )}
            </div>
          </label>
          {typeId !== 'off' &&
          <>
              <div className="time-edit">
                <label className="field"><span>開始時刻</span><input className="mono" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
                <label className="field"><span>終了時刻</span><input className="mono" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
              </div>
              {isOverride && <div className="override-note">⚠ マスタ時間から変更されています（手打ち調整）</div>}
            </>
          }
        </div>
        <div className="modal-foot">
          {current && onDelete && (
            <button className="btn-mini danger" style={{marginRight:'auto'}} onClick={()=>{ if(confirm('このシフトを削除しますか？')) onDelete(); }}>🗑 削除</button>
          )}
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => onSave(typeId, isOverride ? { start, end } : null)}>保存</button>
        </div>
      </div>
    </div>);

}

// ---------- シフトマスタ ----------
function ShiftMasterPage() {
  const { shiftMaster, setShiftMaster, showToast } = useContextS(AppCtx);
  const [draft, setDraft] = useStateS(shiftMaster);

  function update(i, k, v) {setDraft((d) => d.map((x, j) => j === i ? { ...x, [k]: v } : x));}
  function save() {setShiftMaster(draft);showToast('シフトマスタを更新しました');}
  function addRow() {setDraft((d) => [...d, { id: `c${Date.now()}`, label: '新区分', start: '09:00', end: '18:00', break: 60, color: '#fecaca' }]);}
  function remove(i) {if (confirm('削除しますか?')) setDraft((d) => d.filter((_, j) => j !== i));}
  function preset(p) {
    const map = {
      '有給': { label: '有給', start: '', end: '', break: 0, color: '#bbf7d0' },
      '半休': { label: '半休', start: '09:00', end: '13:00', break: 0, color: '#a7f3d0' },
      '研修': { label: '研修', start: '10:00', end: '17:00', break: 60, color: '#fbcfe8' },
      '夜勤': { label: '夜勤', start: '22:00', end: '07:00', break: 60, color: '#312e81' }
    };
    setDraft((d) => [...d, { id: `p${Date.now()}`, ...map[p] }]);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>シフトマスタ</h1><p className="muted">早番・中番・遅番のほか、有給／半休／研修／夜勤など自由に追加できます</p></div>
        <div className="actions">
          <button className="btn-ghost" onClick={() => setDraft(SHIFT_MASTER_DEFAULT)}>初期値に戻す</button>
          <button className="btn-primary" onClick={save}>変更を保存</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <span className="muted small">クイック追加：</span>
          {['有給', '半休', '研修', '夜勤'].map((p) => <button key={p} className="btn-ghost" onClick={() => preset(p)}>＋ {p}</button>)}
          <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={addRow}>＋ 区分を追加</button>
        </div>
        <table className="sheet">
          <thead><tr>
            <th className="rownum"></th><th>ID</th><th>名称</th><th>開始時刻</th><th>終了時刻</th><th>休憩(分)</th><th>所定実働</th><th>カラー</th><th>操作</th>
          </tr></thead>
          <tbody>
            {draft.map((s, i) => {
              let work = '-';
              if (s.start && s.end) {
                const [ih, im] = s.start.split(':').map(Number);
                const [oh, om] = s.end.split(':').map(Number);
                let m = oh * 60 + om - (ih * 60 + im) - (s.break || 0);
                if (m < 0) m += 24 * 60;
                work = `${Math.floor(m / 60)}h ${m % 60}m`;
              }
              const isCore = ['early', 'mid', 'late', 'off'].includes(s.id);
              return (
                <tr key={s.id}>
                  <td className="rownum">{i + 1}</td>
                  <td className="mono">{s.id}</td>
                  <td><input className="cell-input" value={s.label} onChange={(e) => update(i, 'label', e.target.value)} /></td>
                  <td><input className="cell-input mono" type="time" value={s.start} onChange={(e) => update(i, 'start', e.target.value)} /></td>
                  <td><input className="cell-input mono" type="time" value={s.end} onChange={(e) => update(i, 'end', e.target.value)} /></td>
                  <td><input className="cell-input mono" type="number" value={s.break} onChange={(e) => update(i, 'break', +e.target.value)} /></td>
                  <td className="mono">{work}</td>
                  <td><div className="color-cell"><input type="color" value={s.color} onChange={(e) => update(i, 'color', e.target.value)} /><span className="mono small">{s.color}</span></div></td>
                  <td>{!isCore && <button className="btn-mini danger" onClick={() => remove(i)}>削除</button>}</td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head"><h3>プレビュー</h3></div>
        <div className="shift-preview">
          {draft.map((s) =>
          <div key={s.id} className="preview-card" style={{ borderColor: s.color }}>
              <div className="preview-color" style={{ background: s.color }}></div>
              <div className="preview-body">
                <strong>{s.label}</strong>
                <div className="mono big">{s.start || '—'} <span className="muted">〜</span> {s.end || '—'}</div>
                <div className="muted small">休憩 {s.break}分</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>);

}

// ---------- 申請（ホームの申請一覧 / 承認） ----------
function RequestsPage({ isAdmin, auth }) {
  const { requests, setRequests, staff, setStaff, showToast } = useContextS(AppCtx);
  const [tab, setTab] = useStateS('pending');
  const myReqs = requests.filter((r) => isAdmin || r.tenantId === auth.tenantId);
  const filtered = myReqs.filter((r) => {
    if (tab === 'pending') return r.status === '承認待ち';
    if (tab === 'approved') return r.status === '承認済み';
    if (tab === 'rejected') return r.status === '却下';
    return true;
  });

  function decide(id, status) {
    // 承認時にスタッフ申請を反映する
    if (status === '承認済み') {
      const r = requests.find(x => x.id === id);
      if (r?.type === 'スタッフ登録申請' && r.formData) {
        const fd = r.formData;
        const newId = `${fd.tenantId}-${String(Date.now()).slice(-4)}`;
        if (typeof PASSCODES !== 'undefined') PASSCODES[newId] = '1234';
        setStaff(list => [...list, { ...fd, id: newId, joined: r.date || new Date().toISOString().slice(0,10) }]);
        showToast(`${fd.name} をスタッフ登録しました`);
      } else if (r?.type === 'スタッフ変更申請' && r.formData && r.targetStaffId) {
        setStaff(list => list.map(s => s.id === r.targetStaffId ? { ...s, ...r.formData } : s));
        showToast(`${r.staffName} の情報を更新しました`);
      } else if (r?.type === 'スタッフ削除申請' && r.staffId) {
        setStaff(list => list.filter(s => s.id !== r.staffId));
        showToast(`${r.staffName} を削除しました`);
      } else {
        showToast('承認済みにしました');
      }
    } else {
      showToast('却下しました');
    }
    setRequests((rs) => rs.map((r) => r.id === id ? { ...r, status } : r));
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{isAdmin ? '申請承認' : '有給・申請'}</h1><p className="muted">{isAdmin ? '各種申請を承認・却下します' : '提出済みの申請を確認できます'}</p></div>
        <div className="actions"><button className="btn-primary">＋ 新規申請</button></div>
      </div>

      <div className="kpis four">
        <div className="kpi"><span>承認待ち</span><strong>{myReqs.filter((r) => r.status === '承認待ち').length}<small>件</small></strong></div>
        <div className="kpi"><span>承認済</span><strong>{myReqs.filter((r) => r.status === '承認済み').length}<small>件</small></strong></div>
        <div className="kpi"><span>却下</span><strong>{myReqs.filter((r) => r.status === '却下').length}<small>件</small></strong></div>
      </div>

      <div className="card">
        <div className="tabs">
          {[['pending', '承認待ち'], ['approved', '承認済み'], ['rejected', '却下'], ['all', 'すべて']].map(([k, l]) =>
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          )}
        </div>
        <table className="sheet">
          <thead><tr><th className="rownum"></th><th>ID</th><th>提出日</th><th>申請者</th><th>事業所</th><th>種別</th><th>対象日</th><th>理由</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            {filtered.map((r, i) =>
            <tr key={r.id}>
                <td className="rownum">{i + 1}</td>
                <td className="mono">{r.id}</td>
                <td className="mono">{r.submittedAt}</td>
                <td><strong>{r.staffName}</strong></td>
                <td>{TENANTS.find((t) => t.id === r.tenantId)?.name}</td>
                <td><span className={`pill type-${{ '有給申請': 'paid', '打刻修正申請': 'fix', '残業申請': 'ot', 'シフト変更希望': 'sh', '欠勤連絡': 'ab', 'スタッフ登録申請': 'fix', 'スタッフ変更申請': 'sh', 'スタッフ削除申請': 'ab' }[r.type]}`}>{r.type}</span></td>
                <td className="mono">{r.date}</td>
                <td className="muted">{r.reason}</td>
                <td><span className={`pill ${r.status === '承認待ち' ? 'caution' : r.status === '承認済み' ? 'done' : 'warn'}`}>{r.status}</span></td>
                <td>
                  {r.status === '承認待ち' && isAdmin ?
                <div className="row-actions">
                      <button className="btn-mini ok" onClick={() => decide(r.id, '承認済み')}>承認</button>
                      <button className="btn-mini danger" onClick={() => decide(r.id, '却下')}>却下</button>
                    </div> :
                <button className="btn-mini">詳細</button>}
                </td>
              </tr>
            )}
            {filtered.length === 0 && <tr><td colSpan={10} className="empty">該当する申請はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>);

}

Object.assign(window, { ShiftPage, ShiftMasterPage, RequestsPage });