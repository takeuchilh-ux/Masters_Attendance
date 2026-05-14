// ============================================================
// MasuTa! - シフト管理ページ
// ============================================================
const { useState: useStateS, useMemo: useMemoS, useContext: useContextS, useEffect: useEffectS } = React;

// ============================================================
// 時刻フォーマット（Supabase time型 "HH:MM:SS" → "HH:MM"）
// ============================================================
function fmtTime(t) {
  if (!t) return '';
  // GAS由来のISO文字列対応（後方互換）
  if (typeof t === 'string' && t.includes('T')) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return `${String(jst.getUTCHours()).padStart(2,'0')}:${String(jst.getUTCMinutes()).padStart(2,'0')}`;
    }
  }
  return String(t).slice(0, 5);
}

// ============================================================
// ShiftPage - シフト作成・編集
// ============================================================
function ShiftPage({ auth }) {
  const { offices, shiftTypes: allShiftTypes, showToast } = useContextS(AppCtx);

  const [year,   setYear]   = useStateS(new Date().getFullYear());
  const [month,  setMonth]  = useStateS(new Date().getMonth() + 1);
  const [officeId, setOfficeId] = useStateS('');
  const [view,   setView]   = useStateS('month'); // month | week | gantt
  const [shifts, setShifts] = useStateS({}); // key: staffId|date
  const [officeStaff, setOfficeStaff] = useStateS([]);
  const [editing, setEditing] = useStateS(null);
  const [loadingShifts, setLoadingShifts] = useStateS(false);

  // 事業所リストが読み込まれたら最初の事業所を選択
  useEffectS(() => {
    if (offices.length > 0 && !officeId) {
      setOfficeId(offices[0].id);
    }
  }, [offices]);

  // 選択事業所のスタッフを取得
  useEffectS(() => {
    if (!officeId) return;
    mdb('staff').select('*').eq('office_id', officeId).eq('is_active', true).order('name')
      .then(({ data }) => setOfficeStaff(data || []));
  }, [officeId]);

  // 選択事業所・月のシフトを取得
  useEffectS(() => {
    if (!officeId) return;
    setLoadingShifts(true);
    const monthStr  = `${year}-${String(month).padStart(2,'0')}`;
    const monthEnd  = new Date(year, month, 0).toISOString().slice(0, 10);
    mdb('shifts')
      .select('*')
      .gte('date', `${monthStr}-01`)
      .lte('date', monthEnd)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(s => {
          map[`${s.staff_id}|${s.date}`] = {
            typeId:   s.shift_type_id,
            override: (s.override_start || s.override_end)
              ? { start: fmtTime(s.override_start), end: fmtTime(s.override_end) }
              : null,
            dbId: s.id,
          };
        });
        setShifts(map);
        setLoadingShifts(false);
      });
  }, [officeId, year, month]);

  // 事業所のシフト種別
  const shiftMaster = useMemoS(() =>
    allShiftTypes.filter(t => t.office_id === officeId),
    [allShiftTypes, officeId]
  );

  // 日付配列
  const days = useMemoS(() => {
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      return { d, n: i + 1, dow: d.getDay(), iso: d.toISOString().slice(0, 10) };
    });
  }, [year, month]);

  async function saveShift(staffId, iso, typeId, override) {
    const key      = `${staffId}|${iso}`;
    const existing = shifts[key];

    if (!typeId) {
      // 削除
      if (existing?.dbId) {
        await mdb('shifts').delete().eq('id', existing.dbId);
      }
      setShifts(s => { const n = { ...s }; delete n[key]; return n; });
      return;
    }

    const payload = {
      staff_id:       staffId,
      office_id:      officeId,
      date:           iso,
      shift_type_id:  typeId,
      override_start: override?.start || null,
      override_end:   override?.end   || null,
    };

    if (existing?.dbId) {
      await mdb('shifts').update(payload).eq('id', existing.dbId);
      setShifts(s => ({ ...s, [key]: { typeId, override, dbId: existing.dbId } }));
    } else {
      const { data } = await mdb('shifts').insert(payload).select().single();
      setShifts(s => ({ ...s, [key]: { typeId, override, dbId: data?.id } }));
    }
  }

  // PDF印刷
  function printPDF() {
    const tname = offices.find(o => o.id === officeId)?.name || '';
    const title = `${year}年${month}月 ${tname}`;
    const now   = new Date();
    const stamp = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const w = window.open('', '_blank');
    w.document.write(`<title>${title}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Noto Sans JP',sans-serif;padding:0;margin:0;color:#0f172a}h1{margin:0 0 12px;font-size:18px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #999;padding:3px;text-align:center}th{background:#f1f5f9}.foot{margin-top:8px;font-size:9px;color:#64748b;text-align:left}@media print{button{display:none}}</style><h1>${title}</h1>${document.querySelector('.shift-matrix-wrap, .week-view, .gantt')?.outerHTML||''}<div class="foot">出力日時: ${stamp}</div><button onclick="window.print()" style="margin-top:16px;padding:8px 16px">🖨 印刷 / PDF保存</button>`);
    w.document.close();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>シフト作成</h1>
          <p className="muted">月単位でシフトを編集できます。マスを直接クリックして編集</p>
        </div>
        <div className="actions">
          <button className="btn-ghost" onClick={printPDF}>📄 PDF作成</button>
          <button className="btn-primary" onClick={() => showToast('シフトを保存しました')}>シフトを保存</button>
        </div>
      </div>

      <div className="card">
        <div className="shift-toolbar">
          <div className="month-nav">
            <button className="btn-icon" onClick={() => {
              if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
            }}>◀</button>
            <strong>{year}年 {month}月</strong>
            <button className="btn-icon" onClick={() => {
              if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
            }}>▶</button>
          </div>

          <select value={officeId} onChange={e => setOfficeId(e.target.value)}>
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>

          <div className="view-tabs">
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>月</button>
            <button className={view === 'week'  ? 'active' : ''} onClick={() => setView('week')}>週</button>
            <button className={view === 'gantt' ? 'active' : ''} onClick={() => setView('gantt')}>日</button>
          </div>

          <div className="legend">
            {shiftMaster.map(t => (
              <span key={t.id} className="leg">
                <span className="sw" style={{ background: t.color }}></span>
                {t.label}
                {t.start_time && ` ${fmtTime(t.start_time)}-${fmtTime(t.end_time)}`}
              </span>
            ))}
          </div>
        </div>

        {loadingShifts && (
          <div style={{ padding: 24, textAlign: 'center' }} className="muted">読み込み中...</div>
        )}

        {!loadingShifts && view === 'month' && (
          <div className="shift-matrix-wrap">
            <table className="shift-matrix">
              <thead>
                <tr>
                  <th className="sticky-l">スタッフ</th>
                  {days.map(d => (
                    <th key={d.n} className={`day-h ${d.dow === 0 ? 'sun' : d.dow === 6 ? 'sat' : ''}`}>
                      <div className="dn">{d.n}</div>
                      <div className="dw">{['日','月','火','水','木','金','土'][d.dow]}</div>
                    </th>
                  ))}
                  <th className="total">合計</th>
                </tr>
              </thead>
              <tbody>
                {officeStaff.map(s => {
                  let totalH = 0;
                  return (
                    <tr key={s.id}>
                      <td className="sticky-l">
                        <div className="row-name">
                          <span className="avatar sm">{s.name.slice(0, 1)}</span>
                          <strong>{s.name}</strong>
                        </div>
                      </td>
                      {days.map(d => {
                        const sh  = shifts[`${s.id}|${d.iso}`];
                        const sm  = sh ? shiftMaster.find(x => x.id === sh.typeId) : null;
                        const start = fmtTime(sh?.override?.start || sm?.start_time);
                        const end   = fmtTime(sh?.override?.end   || sm?.end_time);
                        if (start && end) {
                          const [ih, im] = start.split(':').map(Number);
                          const [oh, om] = end.split(':').map(Number);
                          totalH += (oh * 60 + om - ih * 60 - im - (sm?.break_minutes || 60)) / 60;
                        }
                        return (
                          <td
                            key={d.n}
                            className={`shift-cell ${d.dow === 0 ? 'sun' : d.dow === 6 ? 'sat' : ''}`}
                            onClick={() => setEditing({ staffId: s.id, date: d.iso })}
                          >
                            {sm && (
                              <div className="cell-shift" style={{ background: sm.color }}>
                                <div className="lbl">{sm.label}</div>
                                {start && <div className="time mono">{start}〜{end}</div>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="total mono"><strong>{Math.round(totalH)}</strong>h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loadingShifts && view === 'week' && (
          <WeekView
            staff={officeStaff}
            shifts={shifts}
            master={shiftMaster}
            year={year}
            month={month}
            onCellClick={(sId, d) => setEditing({ staffId: sId, date: d })}
          />
        )}
        {!loadingShifts && view === 'gantt' && (
          <GanttView
            staff={officeStaff}
            shifts={shifts}
            master={shiftMaster}
            year={year}
            month={month}
          />
        )}
      </div>

      {editing && (
        <ShiftEditModal
          sel={editing}
          master={shiftMaster}
          current={shifts[`${editing.staffId}|${editing.date}`]}
          staffName={officeStaff.find(s => s.id === editing.staffId)?.name}
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

      {/* シフトマスタ管理 */}
      {officeId && <ShiftMasterSection officeId={officeId} />}
    </div>
  );
}

// ============================================================
// WeekView
// ============================================================
function WeekView({ staff, shifts, master, year, month, onCellClick }) {
  const [weekStart, setWeekStart] = useStateS(() => {
    const d = new Date(year, month - 1, 1);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  return (
    <div className="week-view">
      <div className="week-nav">
        <button className="btn-icon" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>◀</button>
        <strong>{weekStart.getMonth() + 1}/{weekStart.getDate()} 週</strong>
        <button className="btn-icon" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>▶</button>
      </div>
      <div className="week-grid" style={{ gridTemplateColumns: `200px repeat(7, 1fr)` }}>
        <div className="wk-h"></div>
        {days.map((d, i) => (
          <div key={i} className={`wk-h ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}>
            {['日','月','火','水','木','金','土'][d.getDay()]}<br />
            <strong>{d.getMonth() + 1}/{d.getDate()}</strong>
          </div>
        ))}
        {staff.map(s => (
          <React.Fragment key={s.id}>
            <div className="wk-name">
              <span className="avatar sm">{s.name.slice(0, 1)}</span>
              <strong>{s.name}</strong>
            </div>
            {days.map((d, i) => {
              const iso = d.toISOString().slice(0, 10);
              const sh  = shifts[`${s.id}|${iso}`];
              const sm  = sh ? master.find(x => x.id === sh.typeId) : null;
              return (
                <div key={i} className="wk-cell" onClick={() => onCellClick(s.id, iso)}>
                  {sm && (
                    <div className="wk-shift" style={{ background: sm.color }}>
                      <strong>{sm.label}</strong>
                      {sm.start_time && (
                        <span className="mono">{fmtTime(sm.start_time)}-{fmtTime(sm.end_time)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// GanttView
// ============================================================
function GanttView({ staff, shifts, master, year, month }) {
  const today = new Date(year, month - 1, 7);
  const iso   = today.toISOString().slice(0, 10);
  const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
  return (
    <div className="gantt">
      <div className="gantt-head" style={{ gridTemplateColumns: `200px repeat(${HOURS.length}, 1fr)` }}>
        <div></div>
        {HOURS.map(h => <div key={h} className="gantt-hr">{h}:00</div>)}
      </div>
      <div className="gantt-body">
        <div className="gantt-date muted">{iso} の予定</div>
        {staff.map(s => {
          const sh = shifts[`${s.id}|${iso}`];
          const sm = sh ? master.find(x => x.id === sh.typeId) : null;
          let leftPct = 0, widthPct = 0;
          if (sm?.start_time) {
            const [sh1, sm1] = fmtTime(sm.start_time).split(':').map(Number);
            const [eh1, em1] = fmtTime(sm.end_time).split(':').map(Number);
            leftPct  = (sh1 * 60 + sm1 - 360) / (HOURS.length * 60) * 100;
            widthPct = (eh1 * 60 + em1 - sh1 * 60 - sm1) / (HOURS.length * 60) * 100;
          }
          return (
            <div key={s.id} className="gantt-row" style={{ gridTemplateColumns: `200px 1fr` }}>
              <div className="wk-name">
                <span className="avatar sm">{s.name.slice(0, 1)}</span>
                <strong>{s.name}</strong>
              </div>
              <div className="gantt-track">
                {sm?.start_time && (
                  <div className="gantt-bar" style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: sm.color }}>
                    <strong>{sm.label}</strong>
                    <span className="mono">{fmtTime(sm.start_time)}-{fmtTime(sm.end_time)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ShiftEditModal
// ============================================================
function ShiftEditModal({ sel, master, current, onClose, onSave, onDelete, staffName }) {
  const [typeId, setTypeId] = useStateS(current?.typeId || master[0]?.id || '');
  const baseM = master.find(m => m.id === typeId);
  const [start, setStart] = useStateS(fmtTime(current?.override?.start || baseM?.start_time || ''));
  const [end,   setEnd]   = useStateS(fmtTime(current?.override?.end   || baseM?.end_time   || ''));

  function pickType(id) {
    setTypeId(id);
    const m = master.find(x => x.id === id);
    setStart(fmtTime(m?.start_time));
    setEnd(fmtTime(m?.end_time));
  }

  const isOverride = baseM && start && (
    fmtTime(start) !== fmtTime(baseM.start_time) ||
    fmtTime(end)   !== fmtTime(baseM.end_time)
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>シフト編集</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="muted">{staffName} ／ {sel.date}</div>
          <label className="field">
            <span>シフト種別</span>
            <div className="shift-pick">
              {master.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`shift-chip ${typeId === m.id ? 'active' : ''}`}
                  onClick={() => pickType(m.id)}
                  style={{ borderColor: typeId === m.id ? '#1e40af' : '#cbd5e1' }}
                >
                  <span className="sw" style={{ background: m.color }}></span>
                  <strong>{m.label}</strong>
                  {m.start_time && (
                    <span className="mono small">{fmtTime(m.start_time)}-{fmtTime(m.end_time)}</span>
                  )}
                </button>
              ))}
            </div>
          </label>
          {baseM?.start_time && (
            <>
              <div className="time-edit">
                <label className="field">
                  <span>開始時刻</span>
                  <input className="mono" type="time" value={start} onChange={e => setStart(e.target.value)} />
                </label>
                <label className="field">
                  <span>終了時刻</span>
                  <input className="mono" type="time" value={end}   onChange={e => setEnd(e.target.value)} />
                </label>
              </div>
              {isOverride && (
                <div className="override-note">⚠ マスタ時間から変更されています（手動調整）</div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          {current && onDelete && (
            <button
              className="btn-mini danger"
              style={{ marginRight: 'auto' }}
              onClick={() => { if (confirm('このシフトを削除しますか？')) onDelete(); }}
            >🗑 削除</button>
          )}
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={() => onSave(typeId, isOverride ? { start, end } : null)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ShiftMasterSection - シフト種別マスタ管理
// ============================================================
function ShiftMasterSection({ officeId }) {
  const { shiftTypes, setShiftTypes, showToast } = useContextS(AppCtx);
  const [open, setOpen] = useStateS(false);

  const officeTypes = useMemoS(
    () => shiftTypes.filter(t => t.office_id === officeId),
    [shiftTypes, officeId]
  );

  async function addType() {
    const newType = {
      office_id:     officeId,
      label:         '新シフト',
      start_time:    '09:00',
      end_time:      '18:00',
      break_minutes: 60,
      color:         '#bfdbfe',
    };
    const { data } = await mdb('shift_types').insert(newType).select().single();
    if (data) setShiftTypes(ts => [...ts, data]);
  }

  async function updateType(id, field, value) {
    await mdb('shift_types').update({ [field]: value }).eq('id', id);
    setShiftTypes(ts => ts.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  async function deleteType(id) {
    if (!confirm('このシフト種別を削除しますか？')) return;
    await mdb('shift_types').delete().eq('id', id);
    setShiftTypes(ts => ts.filter(t => t.id !== id));
    showToast('シフト種別を削除しました');
  }

  if (!open) {
    return (
      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        ⚙ シフト種別マスタを編集
      </button>
    );
  }

  return (
    <div className="card">
      <div className="page-head" style={{ padding: '12px 16px' }}>
        <div><h3>シフト種別マスタ</h3><p className="muted small">この事業所のシフト種別を管理します</p></div>
        <div className="actions">
          <button className="btn-ghost" onClick={addType}>＋ 追加</button>
          <button className="btn-ghost" onClick={() => setOpen(false)}>閉じる</button>
        </div>
      </div>
      <table className="sheet">
        <thead><tr>
          <th className="rownum"></th><th>名称</th><th>開始</th><th>終了</th>
          <th>休憩(分)</th><th>所定実働</th><th>カラー</th><th>操作</th>
        </tr></thead>
        <tbody>
          {officeTypes.length === 0 && (
            <tr><td colSpan={8} className="empty">シフト種別がありません。「＋ 追加」から作成してください</td></tr>
          )}
          {officeTypes.map((t, i) => {
            let work = '—';
            if (t.start_time && t.end_time) {
              const [sh, sm2] = t.start_time.slice(0,5).split(':').map(Number);
              const [eh, em2] = t.end_time.slice(0,5).split(':').map(Number);
              const m = (eh * 60 + em2) - (sh * 60 + sm2) - (t.break_minutes || 0);
              work = `${Math.floor(m / 60)}h ${m % 60}m`;
            }
            return (
              <tr key={t.id}>
                <td className="rownum">{i + 1}</td>
                <td>
                  <input
                    className="cell-input"
                    value={t.label}
                    onChange={e => updateType(t.id, 'label', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="cell-input mono"
                    type="time"
                    value={t.start_time?.slice(0,5) || ''}
                    onChange={e => updateType(t.id, 'start_time', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="cell-input mono"
                    type="time"
                    value={t.end_time?.slice(0,5) || ''}
                    onChange={e => updateType(t.id, 'end_time', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="cell-input mono"
                    type="number"
                    value={t.break_minutes}
                    onChange={e => updateType(t.id, 'break_minutes', +e.target.value)}
                    style={{ width: 60 }}
                  />
                </td>
                <td className="mono">{work}</td>
                <td>
                  <div className="color-cell">
                    <input
                      type="color"
                      value={t.color}
                      onChange={e => updateType(t.id, 'color', e.target.value)}
                    />
                    <span className="mono small">{t.color}</span>
                  </div>
                </td>
                <td>
                  <button className="btn-mini danger" onClick={() => deleteType(t.id)}>削除</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

Object.assign(window, { ShiftPage, fmtTime });
