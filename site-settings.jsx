// ============================================================
// 事業所責任者向け 設定画面 (タブ集約)
// ============================================================
const { useState: useStateSet, useContext: useContextSet } = React;

function SiteSettings({ auth, setRoute }) {
  const [tab, setTab] = useStateSet('staff');
  const tabs = [
    { id:'staff',    label:'スタッフ登録', icon:'👥' },
    { id:'master',   label:'シフトマスタ', icon:'📋' },
    { id:'requests', label:'有給・申請',   icon:'📝' },
  ];
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>⚙ 設定</h1><p className="muted">事業所のスタッフ・シフトマスタ・各種設定を管理します</p></div>
      </div>
      <div className="settings-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`s-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {tab==='staff'    && <SiteStaffAdmin auth={auth} />}
      {tab==='master'   && <ShiftMasterPage />}
      {tab==='requests' && <RequestsPage isAdmin={false} auth={auth} />}
    </div>
  );
}

function SiteStaffAdmin({ auth }) {
  const { staff, setRequests, showToast } = useContextSet(AppCtx);
  const [editing, setEditing] = useStateSet(null);
  const [q, setQ] = useStateSet('');
  const list = staff.filter(s => s.tenantId === auth.tenantId && (!q || s.name.includes(q)));

  const FIELD_JP = {
    name:'氏名', tenantId:'所属事業所', role:'権限', status:'ステータス',
    email:'メール', phone:'電話', address:'住所',
    salaryType:'給与種別', salaryAmount:'給与額',
    transportType:'交通費種別', transportFee:'交通費',
  };
  const SKIP_FIELDS = ['paidLeave'];

  function submitRequest(type, staffData, targetStaff) {
    const detail = Object.entries(staffData)
      .filter(([k, v]) => !SKIP_FIELDS.includes(k) && v !== '' && v != null)
      .map(([k, v]) => {
        const label = FIELD_JP[k] || k;
        const val = k === 'tenantId' ? (TENANTS.find(t => t.id === v)?.name || v) : v;
        return `${label}: ${val}`;
      })
      .join(' / ');
    setRequests(rs => [...rs, {
      id: `R${Date.now()}`,
      staffId: targetStaff?.id || '新規',
      staffName: staffData.name || targetStaff?.name || '',
      tenantId: auth.tenantId,
      type,
      date: new Date().toISOString().slice(0, 10),
      reason: detail,
      formData: staffData,
      targetStaffId: targetStaff?.id || null,
      status: '承認待ち',
      submittedAt: new Date().toISOString().slice(0, 10),
    }]);
    showToast('申請を送信しました。本社の承認をお待ちください');
  }

  return (
    <div className="card">
      <div className="hint" style={{margin:'0 0 12px', background:'#eff6ff', borderColor:'#93c5fd'}}>
        💡 スタッフの登録・変更・削除は <strong>本社への申請</strong> として送信されます。本社が承認後に反映されます。
      </div>
      <div className="filter-bar">
        <label className="field inline grow"><span>検索</span><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="氏名で検索" /></label>
        <button className="btn-primary" onClick={()=>setEditing({ name:'', tenantId:auth.tenantId, role:'パート', paidLeave:10 })}>＋ スタッフ登録申請</button>
      </div>
      <table className="sheet">
        <thead><tr>
          <th className="rownum"></th><th>ID</th><th>氏名</th><th>権限</th><th>ステータス</th><th>入社日</th><th>操作</th>
        </tr></thead>
        <tbody>
          {list.map((s, i) => (
            <tr key={s.id}>
              <td className="rownum">{i+1}</td>
              <td className="mono">{s.id}</td>
              <td><div className="row-name"><span className="avatar sm">{s.name.slice(0,1)}</span><strong>{s.name}</strong></div></td>
              <td><span className={`pill ${s.role==='責任者'?'role-mgr':s.role==='正社員'?'role-full':'role-part'}`}>{s.role}</span></td>
              <td><span className={`pill ${s.status==='在職'?'done':s.status==='休職'?'caution':'warn'}`}>{s.status||'在職'}</span></td>
              <td className="mono">{s.joined}</td>
              <td>
                <button className="btn-mini" onClick={()=>setEditing(s)}>変更申請</button>
                <button className="btn-mini danger" onClick={()=>{
                  if(confirm(`${s.name} さんの削除を申請しますか？`)) {
                    submitRequest('スタッフ削除申請', { name: s.name, id: s.id }, s);
                  }
                }}>削除申請</button>
              </td>
            </tr>
          ))}
          {list.length===0 && <tr><td colSpan={7} className="empty">スタッフがいません。「＋ スタッフ登録申請」から申請してください</td></tr>}
        </tbody>
      </table>
      {editing && <StaffEditModal staff={editing} onClose={()=>setEditing(null)} onSave={(s)=>{
        const type = editing.id ? 'スタッフ変更申請' : 'スタッフ登録申請';
        submitRequest(type, s, editing.id ? editing : null);
        setEditing(null);
      }} />}
    </div>
  );
}

Object.assign(window, { SiteSettings });
