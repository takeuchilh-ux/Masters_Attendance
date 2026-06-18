// ============================================================
// MasuTa! - シフト管理ページ
// ============================================================
const { useState: useStateS, useMemo: useMemoS, useContext: useContextS, useEffect: useEffectS } = React;

// ============================================================
// 時刻フォーマット（Supabase time型 "HH:MM:SS" → "HH:MM"）
// ============================================================
function fmtTime(t) {
  if (!t) return '';
  if (typeof t === 'string' && t.includes('T')) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return `${String(jst.getUTCHours()).padStart(2,'0')}:${String(jst.getUTCMinutes()).padStart(2,'0')}`;
    }
  }
  return String(t).slice(0, 5);
}
// セル用簡略表示: "09:30" → "9.5"、"09:00" → "9"
function fmtShort(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const dec = m === 0 ? '' : m === 15 ? '.25' : m === 30 ? '.5' : '.75';
  return `${h}${dec}`;
}
// ローカル日付を YYYY-MM-DD 文字列に変換（toISOString()はUTC変換でJSTでずれるため）
function localISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// ============================================================
// ShiftPage - シフト作成・編集
// ============================================================
function ShiftPage({ auth }) {
  const { offices, shiftTypes: allShiftTypes, showToast } = useContextS(AppCtx);

  const [year,   setYear]   = useStateS(new Date().getFullYear());
  const [month,  setMonth]  = useStateS(new Date().getMonth() + 1);
  const [officeId, setOfficeId] = useStateS('ALL');
  const [view,   setView]   = useStateS('month'); // month | week | gantt
  const [shifts, setShifts] = useStateS({}); // key: staffId|date
  const [officeStaff, setOfficeStaff] = useStateS([]);
  const [editing, setEditing] = useStateS(null);
  const [loadingShifts, setLoadingShifts] = useStateS(false);
  const [masterOpen, setMasterOpen] = useStateS(false);

  // 事業所リストが読み込まれたら（officeIdが空の場合のみ）最初の事業所を選択
  useEffectS(() => {
    if (offices.length > 0 && !officeId) {
      setOfficeId(offices[0].id);
    }
  }, [offices]);

  // 選択事業所のスタッフを取得
  useEffectS(() => {
    if (!officeId) return;
    if (officeId === 'ALL') {
      mdb('staff').select('*').eq('is_active', true).order('sort_order').order('name')
        .then(({ data }) => setOfficeStaff(data || []));
    } else {
      mdb('staff').select('*').eq('office_id', officeId).eq('is_active', true).order('sort_order').order('name')
        .then(({ data }) => setOfficeStaff(data || []));
    }
  }, [officeId]);

  // 選択事業所・月のシフトを取得
  useEffectS(() => {
    if (!officeId) return;
    setLoadingShifts(true);
    const monthStr  = `${year}-${String(month).padStart(2,'0')}`;
    const monthEnd  = localISO(new Date(year, month, 0));
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
            notes: s.notes || '',
            dbId: s.id,
          };
        });
        setShifts(map);
        setLoadingShifts(false);
      });
  }, [officeId, year, month]);

  // 事業所のシフト種別
  const shiftMaster = useMemoS(() =>
    officeId === 'ALL' ? allShiftTypes : allShiftTypes.filter(t => t.office_id === officeId),
    [allShiftTypes, officeId]
  );

  // 日付配列
  const days = useMemoS(() => {
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      return { d, n: i + 1, dow: d.getDay(), iso: localISO(d) };
    });
  }, [year, month]);

  async function saveShift(staffId, iso, typeId, override, notes) {
    const key      = `${staffId}|${iso}`;
    const existing = shifts[key];

    if (!typeId) {
      if (existing?.dbId) {
        await mdb('shifts').delete().eq('id', existing.dbId);
      }
      setShifts(s => { const n = { ...s }; delete n[key]; return n; });
      return;
    }

    const payload = {
      staff_id:       staffId,
      office_id:      officeId === 'ALL' ? (editing?.officeId || officeId) : officeId,
      date:           iso,
      shift_type_id:  typeId,
      override_start: override?.start || null,
      override_end:   override?.end   || null,
      notes:          notes || null,
    };

    if (existing?.dbId) {
      await mdb('shifts').update(payload).eq('id', existing.dbId);
      setShifts(s => ({ ...s, [key]: { typeId, override, notes, dbId: existing.dbId } }));
    } else {
      const { data } = await mdb('shifts').insert(payload).select().single();
      setShifts(s => ({ ...s, [key]: { typeId, override, notes, dbId: data?.id } }));
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
          <h1>シフト</h1>
          <p className="muted">全事業所のシフトを閲覧・作成・編集できます。セルをクリックして編集</p>
        </div>
        <div className="actions">
          <button className="btn-ghost" onClick={printPDF}>📄 PDF作成</button>
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

          <label className="field inline" style={{ background: '#fff', padding: '4px 10px', border: '1px solid var(--line-strong)', borderRadius: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>事業所</span>
            <select value={officeId} onChange={e => { setOfficeId(e.target.value); setMasterOpen(false); }} style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: 13 }}>
              <option value="ALL">ALL</option>
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>

          {officeId !== 'ALL' && (
            <button
              className={masterOpen ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setMasterOpen(o => !o)}
            >⚙ 種別編集</button>
          )}

          <div className="view-tabs">
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>月</button>
            <button className={view === 'week'  ? 'active' : ''} onClick={() => setView('week')}>週</button>
            <button className={view === 'gantt' ? 'active' : ''} onClick={() => setView('gantt')}>日</button>
          </div>

          {officeId !== 'ALL' && (
            <div className="legend">
              {shiftMaster.map(t => (
                <span key={t.id} className="leg">
                  <span className="sw" style={{ background: t.color }}></span>
                  {t.label}
                  {t.start_time && ` ${fmtTime(t.start_time)}-${fmtTime(t.end_time)}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {loadingShifts && (
          <div style={{ padding: 24, textAlign: 'center' }} className="muted">読み込み中...</div>
        )}

        {!loadingShifts && view === 'month' && officeId !== 'ALL' && (
          <ShiftMonthMatrix
            staff={officeStaff}
            master={shiftMaster}
            shifts={shifts}
            days={days}
            onCellClick={(staffId, iso, staffOfficeId) => setEditing({ staffId, date: iso, officeId: staffOfficeId })}
          />
        )}

        {!loadingShifts && view === 'month' && officeId === 'ALL' && (
          offices.map(office => {
            const staffForOffice = officeStaff.filter(s => s.office_id === office.id);
            const masterForOffice = allShiftTypes.filter(t => t.office_id === office.id);
            if (staffForOffice.length === 0) return null;
            return (
              <div key={office.id}>
                <div style={{ padding: '6px 16px', background: 'var(--bg)', borderTop: '2px solid var(--primary)', display:'flex', alignItems:'center', gap:8 }}>
                  <strong style={{ fontSize:13 }}>{office.name}</strong>
                  <span className="muted" style={{ fontSize:11 }}>{staffForOffice.length}名</span>
                </div>
                <ShiftMonthMatrix
                  staff={staffForOffice}
                  master={masterForOffice}
                  shifts={shifts}
                  days={days}
                  onCellClick={(staffId, iso, staffOfficeId) => setEditing({ staffId, date: iso, officeId: staffOfficeId })}
                />
              </div>
            );
          })
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
        <ShiftEditModalAdmin
          sel={editing}
          master={allShiftTypes.filter(t => t.office_id === (editing.officeId || officeId))}
          current={shifts[`${editing.staffId}|${editing.date}`]}
          staffName={officeStaff.find(s => s.id === editing.staffId)?.name}
          onClose={() => setEditing(null)}
          onSave={async (typeId, override, notes) => {
            await saveShift(editing.staffId, editing.date, typeId, override, notes);
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

      {/* シフトマスタ管理（種別編集ボタンはツールバーに配置） */}
      {officeId && officeId !== 'ALL' && masterOpen && (
        <ShiftMasterSection officeId={officeId} onClose={() => setMasterOpen(false)} />
      )}
    </div>
  );
}

// ============================================================
// ShiftMonthMatrix - 月次シフト表（単一事業所）
// ============================================================
function ShiftMonthMatrix({ staff, master, shifts, days, onCellClick }) {
  return (
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
          {staff.map(s => {
            let totalH = 0, kyukeiCnt = 0, yukyuCnt = 0, kyuCnt = 0;
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
                  const sm  = sh ? master.find(x => x.id === sh.typeId) : null;
                  const start = fmtTime(sh?.override?.start || sm?.start_time);
                  const end   = fmtTime(sh?.override?.end   || sm?.end_time);
                  if (start && end) {
                    const [ih, im] = start.split(':').map(Number);
                    const [oh, om] = end.split(':').map(Number);
                    totalH += (oh * 60 + om - ih * 60 - im - (sm?.break_minutes || 60)) / 60;
                  }
                  if (sm?.label === '公休') kyukeiCnt++;
                  if (sm?.label === '有給') yukyuCnt++;
                  if (sm?.label === '休')   kyuCnt++;
                  return (
                    <td
                      key={d.n}
                      className={`shift-cell ${d.dow === 0 ? 'sun' : d.dow === 6 ? 'sat' : ''}`}
                      onClick={() => onCellClick(s.id, d.iso, s.office_id)}
                    >
                      {sm && (
                        <div className="cell-shift" style={{ background: sm.color }}>
                          <div className="lbl">{sm.label}</div>
                          {start && <div className="time mono">{fmtShort(start)}〜{fmtShort(end)}</div>}
                          {sh?.notes && <div className="lbl" style={{ fontSize:9, opacity:.8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{sh.notes.length > 6 ? sh.notes.slice(0,6)+'…' : sh.notes}</div>}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="total" style={{ fontSize:11, lineHeight:1.6 }}>
                  <strong className="mono">{Math.round(totalH)}h</strong>
                  {kyukeiCnt > 0 && <div style={{ color:'#ef4444' }}>公休{kyukeiCnt}</div>}
                  {yukyuCnt  > 0 && <div style={{ color:'#16a34a' }}>有給{yukyuCnt}</div>}
                  {kyuCnt    > 0 && <div style={{ color:'#dc2626' }}>休{kyuCnt}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
              const iso = localISO(d);
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
  const iso   = localISO(today);
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
// ShiftEditModalAdmin
// ============================================================
function ShiftEditModalAdmin({ sel, master, current, onClose, onSave, onDelete, staffName }) {
  const [typeId,    setTypeId]    = useStateS(current?.typeId || '');
  const [overStart, setOverStart] = useStateS(current?.override?.start || '');
  const [overEnd,   setOverEnd]   = useStateS(current?.override?.end   || '');
  const [notes,     setNotes]     = useStateS(current?.notes || '');

  function pickType(id) {
    setTypeId(id);
    // 種別選択時にマスタの時刻をデフォルトとしてセット
    const m = master.find(x => x.id === id);
    setOverStart(fmtTime(m?.start_time) || '');
    setOverEnd(fmtTime(m?.end_time)     || '');
  }

  const selectedM = master.find(m => m.id === typeId);
  const masterStart = fmtTime(selectedM?.start_time) || '';
  const masterEnd   = fmtTime(selectedM?.end_time)   || '';
  const isOverride  = typeId && selectedM?.start_time && (
    overStart !== masterStart || overEnd !== masterEnd
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>シフト編集</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="muted" style={{ marginBottom: 12 }}>{staffName} ／ {sel?.date}</div>

          {/* シフト種別選択 */}
          <div className="shift-pick">
            <button
              type="button"
              className={`shift-chip ${!typeId ? 'active' : ''}`}
              onClick={() => { setTypeId(''); setOverStart(''); setOverEnd(''); }}
              style={{ borderColor: !typeId ? '#1e40af' : '#e2e8f0' }}
            >
              <strong>— なし —</strong>
            </button>
            {master.length === 0 && (
              <div className="muted small" style={{ padding: '8px 0' }}>
                ⚠ シフト種別マスタが未登録です。先にシフト種別マスタを登録してください。
              </div>
            )}
            {master.map(m => (
              <button
                key={m.id}
                type="button"
                className={`shift-chip ${typeId === m.id ? 'active' : ''}`}
                onClick={() => pickType(m.id)}
                style={{ borderColor: typeId === m.id ? '#1e40af' : '#cbd5e1' }}
              >
                <span className="sw" style={{ background: m.color }}></span>
                <div>
                  <strong>{m.label}</strong>
                  {m.start_time && (
                    <div className="mono small">{fmtTime(m.start_time)}〜{fmtTime(m.end_time)}</div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* 時刻（選択後に表示・手動上書き可） */}
          {typeId && selectedM?.start_time && (
            <>
              <div style={{ marginTop: 12, marginBottom: 4, fontSize: 12, color: 'var(--muted)' }}>
                時刻を変更する場合のみ修正してください
              </div>
              <div className="time-edit">
                <label className="field">
                  <span>開始時刻</span>
                  <input className="mono" type="time" value={overStart} onChange={e => setOverStart(e.target.value)} />
                </label>
                <label className="field">
                  <span>終了時刻</span>
                  <input className="mono" type="time" value={overEnd} onChange={e => setOverEnd(e.target.value)} />
                </label>
              </div>
              {isOverride && (
                <div className="override-note">⚠ マスタ時間から変更されています（個別調整）</div>
              )}
            </>
          )}

          {/* 備考 */}
          <label className="field">
            <span>備考（任意）</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="自由記入"
              rows={2}
              style={{ resize:'vertical', fontFamily:'inherit', fontSize:13 }}
            />
          </label>
        </div>
        <div className="modal-foot">
          {current?.typeId && onDelete && (
            <button
              className="btn-mini danger"
              style={{ marginRight: 'auto' }}
              onClick={() => { if (confirm('このシフトを削除しますか？')) onDelete(); }}
            >🗑 削除</button>
          )}
          <button className="btn-ghost" onClick={onClose}>キャンセル</button>
          <button
            className="btn-primary"
            onClick={() => onSave(typeId, isOverride ? { start: overStart, end: overEnd } : null, notes)}
          >保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ShiftMasterSection - シフト種別マスタ管理
// ============================================================
function ShiftMasterSection({ officeId, onClose }) {
  const { shiftTypes, setShiftTypes, showToast } = useContextS(AppCtx);
  // ローカル編集用state（入力中はここだけ更新し、blur時にDBへ保存）
  const [localEdits, setLocalEdits] = useStateS({});

  const officeTypes = useMemoS(
    () => shiftTypes.filter(t => t.office_id === officeId),
    [shiftTypes, officeId]
  );

  // ローカル値を取得（編集中ならそちらを優先）
  const localVal = (id, field, fallback) =>
    (localEdits[id] && localEdits[id][field] !== undefined) ? localEdits[id][field] : fallback;

  function handleChange(id, field, value) {
    setLocalEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  }

  async function handleBlur(id, field, value) {
    await mdb('shift_types').update({ [field]: value }).eq('id', id);
    setShiftTypes(ts => ts.map(t => t.id === id ? { ...t, [field]: value } : t));
    setLocalEdits(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id][field];
      return next;
    });
  }

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

  return (
    <div className="card">
      <div className="page-head" style={{ padding: '12px 16px' }}>
        <div><h3>シフト種別マスタ</h3><p className="muted small">この事業所のシフト種別を管理します</p></div>
        <div className="actions">
          <button className="btn-ghost" onClick={addType}>＋ 追加</button>
          <button className="btn-ghost" onClick={onClose}>閉じる</button>
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
                    value={localVal(t.id, 'label', t.label)}
                    onChange={e => handleChange(t.id, 'label', e.target.value)}
                    onBlur={e => handleBlur(t.id, 'label', e.target.value)}
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
