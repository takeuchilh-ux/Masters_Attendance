// ============================================================
// マスターズ勤怠システム - GAS API クライアント
// app.jsx の先頭付近に追記して使用する
//
// 使い方:
//   1. GASをデプロイしてURLを取得
//   2. GAS_URL にセット
//   3. AppProvider の useState を下記に置き換える
// ============================================================

// ★ デプロイ後にここを書き換える
const GAS_URL = 'https://script.google.com/macros/s/【デプロイID】/exec';

// ---- 汎用フェッチ ----
async function gasGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_URL}?${qs}`);
  return res.json();
}

async function gasPost(body) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---- データ読み込み ----
async function loadAllData() {
  const [staff, tenants, shiftMaster, requests] = await Promise.all([
    gasGet({ type: 'staff' }),
    gasGet({ type: 'tenants' }),
    gasGet({ type: 'shifts' }),
    gasGet({ type: 'requests' }),
  ]);
  return { staff, tenants, shiftMaster, requests };
}

// ---- 打刻 ----
async function savePunchToGas(punchData) {
  return gasPost({ action: 'upsertPunch', data: punchData });
}

// ---- 申請 ----
async function saveRequestToGas(requestData) {
  return gasPost({ action: 'upsertRequest', data: requestData });
}

async function approveRequestInGas(requestId, status, approverId) {
  return gasPost({ action: 'approveRequest', requestId, status, approverId });
}

// ---- スタッフ ----
async function saveStaffToGas(staffData) {
  return gasPost({ action: 'upsertStaff', data: staffData });
}

async function deleteStaffFromGas(staffId) {
  return gasPost({ action: 'deleteStaff', staffId });
}

// ---- シフト ----
async function saveShiftToGas(shiftData) {
  return gasPost({ action: 'upsertShift', data: shiftData });
}

async function deleteShiftFromGas(staffId, date) {
  return gasPost({ action: 'deleteShift', staffId, date });
}

// ============================================================
// AppProvider を GAS連携版に置き換える場合のテンプレート
// （app.jsx の AppProvider 関数全体を以下で差し替える）
// ============================================================
/*
function AppProvider({ children }) {
  const [punches, setPunches] = useState([]);
  const [shiftMaster, setShiftMaster] = useState(SHIFT_MASTER_DEFAULT);
  const [shifts, setShifts] = useState({});
  const [requests, setRequests] = useState([]);
  const [staff, setStaff] = useState([]);
  const [tenants, setTenants] = useState(TENANTS);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // 初回ロード
  useEffect(() => {
    loadAllData().then(data => {
      if (data.staff?.length)    setStaff(data.staff);
      if (data.tenants?.length)  setTenants(data.tenants);
      if (data.shiftMaster?.length) setShiftMaster(data.shiftMaster);
      if (data.requests?.length) setRequests(data.requests);
      setLoading(false);
    }).catch(err => {
      console.warn('GAS読込失敗、ローカルデータを使用:', err);
      setStaff(ALL_STAFF);
      setShifts(genShifts(shiftMaster_(), STAFF_NAMES));
      setRequests(genRequests());
      setPunches(genPunchData());
      setLoading(false);
    });
  }, []);

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind, t: Date.now() });
    setTimeout(() => setToast(t => t?.msg === msg ? null : t), 2800);
  }

  // 打刻をGASに保存しローカルにも反映
  async function syncPunch(punchData) {
    setPunches(ps => {
      const exists = ps.findIndex(p => p.staffId===punchData.staffId && p.date===punchData.date);
      if (exists>=0) return ps.map((p,i) => i===exists ? {...p,...punchData} : p);
      return [punchData, ...ps];
    });
    try { await savePunchToGas(punchData); } catch(e) { console.warn('GAS保存失敗:', e); }
  }

  const value = {
    punches, setPunches,
    shiftMaster, setShiftMaster,
    shifts, setShifts,
    requests, setRequests,
    staff, setStaff,
    tenants, setTenants,
    toast, showToast,
    loading,
    syncPunch,
    savePunchToGas, saveRequestToGas, approveRequestInGas,
    saveStaffToGas, deleteStaffFromGas,
    saveShiftToGas, deleteShiftFromGas,
  };
  return (
    <AppCtx.Provider value={value}>
      {loading ? <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16}}>
        <div style={{width:40,height:40,border:'4px solid #e2e8f0',borderTopColor:'#1e40af',borderRadius:'50%',animation:'spin 1s linear infinite'}}></div>
        <div className="muted">スプレッドシートからデータを読み込み中...</div>
      </div> : children}
      {toast && <Toast {...toast} />}
    </AppCtx.Provider>
  );
}
*/
