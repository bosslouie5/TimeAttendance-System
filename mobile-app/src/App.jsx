import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import initialData from './initial_data.json';
import appConfig from './app_config.json';
import './styles.css';

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 8000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, { ...options, signal: controller.signal });
  clearTimeout(id);
  return response;
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetchWithTimeout(url, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    return { status: response.status, ok: response.ok, data, url: response.url };
  } catch (err) {
    return { status: 0, ok: false, data: err.message };
  }
}

async function getJson(url, headers = {}) {
  return fetchJson(url, { method: 'GET', headers });
}

async function postJson(url, body, headers = {}) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * (Math.PI / 180);
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function App() {
  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('server_url');
    const isNative = Capacitor.getPlatform() !== 'web';
    const isLocalHost = !isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    let base = appConfig.defaultApiUrl || 'https://timeattendance-system.onrender.com/api';
    if (isLocalHost && base.includes('onrender.com')) base = 'http://127.0.0.1:4002/api';

    if (saved) {
      if (isNative && saved.startsWith('http://localhost')) return saved.replace('localhost', '127.0.0.1');
      return saved;
    }
    if (isNative && base.startsWith('/')) base = `http://127.0.0.1:4002${base}`;
    return isNative ? base.replace('localhost', '127.0.0.1') : (base.startsWith('http') ? base : `${window.location.origin}${base}`);
  });

  const [tenantId, setTenantId] = useState(() => {
    const saved = localStorage.getItem('tenant_id');
    if (saved) return saved;
    const cfgId = appConfig.defaultTenantId;
    if (cfgId && !["/", "master", "MASTER_UNIVERSAL"].includes(cfgId)) {
      localStorage.setItem('tenant_id', cfgId);
      return cfgId;
    }
    return null;
  });

  const [setupId, setSetupId] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('cached_id') || '');
  const [departments, setDepartments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('all_departments')) || initialData.departments; } catch (e) { return initialData.departments; }
  });
  const [status, setStatus] = useState('System Online');
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tenant_info')) || null; } catch (e) { return null; }
  });
  const [pendingLogs, setPendingLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pending_logs')) || []; } catch (e) { return []; }
  });

  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [personalLogs, setPersonalLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('personal_logs')) || []; } catch (e) { return []; }
  });
  const [isServerDown, setIsServerDown] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  useEffect(() => {
    checkConnection();
    const connInterval = setInterval(checkConnection, 15000);
    if (!localStorage.getItem('all_employees')) {
      localStorage.setItem('all_employees', JSON.stringify(initialData.employees));
      localStorage.setItem('all_departments', JSON.stringify(initialData.departments));
    }
    if (tenantId) {
        fetchTenantInfo();
        if (loggedIn) syncSystemData();
    }
    return () => clearInterval(connInterval);
  }, [tenantId]);

  const fetchTenantInfo = async () => {
    if (!apiUrl.startsWith('http')) return;
    try {
        const res = await getJson(`${apiUrl}/tenant-info/${tenantId}`);
        if (res.ok && res.data) {
            localStorage.setItem('tenant_info', JSON.stringify(res.data));
            setTenantInfo(res.data);
        }
    } catch (e) {}
  };

  useEffect(() => {
    const syncTimer = setInterval(() => { attemptSync(); }, 10000);
    return () => clearInterval(syncTimer);
  }, [apiUrl, tenantId, isSyncing]);

  const attemptSync = async (forcedLogs = null) => {
    if (isSyncing || isServerDown) return;
    const currentLogs = forcedLogs || JSON.parse(localStorage.getItem('pending_logs') || '[]');
    if (currentLogs.length === 0) return;
    setIsSyncing(true);
    let processedCount = 0;
    for (const log of currentLogs) {
      try {
        const response = await postJson(`${apiUrl}/timein`, { ...log, tenantId }, { 'x-tenant-id': tenantId });
        if (response.status === 200 || response.status === 400) { processedCount++; } else { break; }
      } catch (e) { break; }
    }
    if (processedCount > 0) {
      const latest = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      const remaining = latest.slice(processedCount);
      setPendingLogs(remaining);
      localStorage.setItem('pending_logs', JSON.stringify(remaining));
      setStatus(`Synced ${processedCount} records!`);
      syncSystemData();
    }
    setIsSyncing(false);
  };

  const checkConnection = async () => {
    if (!apiUrl.startsWith('http')) return;
    try {
      const res = await fetchWithTimeout(`${apiUrl}/settings`, { timeout: 3000 });
      if (res.ok) { setIsServerDown(false); setStatus('System Online'); }
      else throw new Error();
    } catch (e) { setIsServerDown(true); setStatus('Offline Mode'); }
  };

  const syncSystemData = async () => {
    if (isSyncing || isServerDown) return;
    setIsSyncing(true);
    try {
      const targetEmpId = localStorage.getItem('cached_id');
      const headers = { 'x-tenant-id': tenantId };
      const [empRes, deptRes, logRes] = await Promise.all([
        getJson(`${apiUrl}/employees`, headers),
        getJson(`${apiUrl}/departments?employeeId=${targetEmpId}`, headers),
        getJson(`${apiUrl}/logs`, headers)
      ]);
      if (empRes.ok) localStorage.setItem('all_employees', JSON.stringify(empRes.data));
      if (deptRes.ok) { localStorage.setItem('all_departments', JSON.stringify(deptRes.data)); setDepartments(deptRes.data); }
      if (logRes.ok) { const myLogs = logRes.data.filter(l => l.employeeId === targetEmpId); localStorage.setItem('personal_logs', JSON.stringify(myLogs)); setPersonalLogs(myLogs); }
    } catch (e) {}
    setIsSyncing(false);
  };

  const handleSetupTenant = async () => {
    if (!setupId.trim()) return alert('Please enter Company ID');
    setIsSettingUp(true);
    try {
      const res = await getJson(`${apiUrl}/tenant-info/${setupId.trim()}`);
      if (res.ok && res.data) {
        localStorage.setItem('tenant_id', setupId.trim());
        localStorage.setItem('tenant_info', JSON.stringify(res.data));
        setTenantId(setupId.trim());
        setTenantInfo(res.data);
        alert(`Linked to: ${res.data.companyName}`);
      } else { alert('Invalid Company ID'); }
    } catch (e) { alert('Connection Error'); } finally { setIsSettingUp(false); }
  };

  const login = async () => {
    if (!employeeId.trim()) return alert('Enter Employee ID');
    setLoading(true);
    setStatus('Authenticating...');
    try {
      const idInfo = await Device.getId();
      const devInfo = await Device.getInfo();
      const res = await postJson(`${apiUrl}/device/register`, { employeeId, deviceId: idInfo.identifier, deviceName: devInfo.model }, { 'x-tenant-id': tenantId });
      if (res.status === 200) {
        setLoggedIn(true);
        localStorage.setItem('cached_id', res.data.employee.employeeId);
        localStorage.setItem('cached_name', res.data.employee.name);
        syncSystemData();
        return;
      } else { alert(res.data?.error || 'Login Failed'); }
    } catch (e) {
      const allEmps = JSON.parse(localStorage.getItem('all_employees') || '[]');
      const cached = allEmps.find(e => e.employeeId === employeeId.trim());
      if (cached) { setLoggedIn(true); setStatus('Offline Login ✓'); } else { alert('Connection Required for first login'); }
    } finally { setLoading(false); }
  };

  const recordAttendance = async (type) => {
    if (!selectedDepartment) return alert('Select branch!');
    const dept = departments.find(d => d.departmentId === selectedDepartment);
    setLoading(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ timeout: 10000 });
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
      if (dist > (dept.radiusMeters || 50)) return alert(`Too far! ${Math.round(dist)}m away.`);
      const log = { employeeId: localStorage.getItem('cached_id'), employeeName: localStorage.getItem('cached_name'), departmentId: selectedDepartment, departmentName: dept.name, type, timestamp: new Date().toISOString(), tenantId };
      const res = await postJson(`${apiUrl}/timein`, log, { 'x-tenant-id': tenantId });
      if (res.ok) { alert('Success!'); syncSystemData(); } else { throw new Error(); }
    } catch (e) {
      const logs = [...pendingLogs, { employeeId, type, timestamp: new Date().toISOString() }];
      localStorage.setItem('pending_logs', JSON.stringify(logs));
      setPendingLogs(logs);
      alert('Log saved offline.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await getJson(`${apiUrl}/app-version`);
        if (res.ok && res.data) {
          const currentParts = appConfig.version.split('.').map(Number);
          const latestParts = res.data.version.split('.').map(Number);
          let newer = false;
          for(let i=0; i<3; i++) { if(latestParts[i]>currentParts[i]){newer=true;break;} if(latestParts[i]<currentParts[i])break; }
          if(newer) setUpdateAvailable(res.data);
        }
      } catch (e) {}
    };
    setTimeout(checkUpdate, 5000);
  }, [apiUrl]);

  if (!tenantId) {
    return (
      <div style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '40px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', fontFamily: 'system-ui'}}>
         <div className="glass-card fade-in">
            <div style={{fontSize: '5rem', marginBottom: '20px'}}>🌐</div>
            <h1 style={{fontSize: '2rem', fontWeight: '900'}}>System Setup</h1>
            <p style={{color: '#94a3b8', marginBottom: '40px'}}>Enter Company ID to activate.</p>
            <input value={setupId} onChange={e => setSetupId(e.target.value)} placeholder="e.g. 571044" className="input-field" style={{textAlign: 'center', fontSize: '1.5rem', border: '1px solid #3b82f6'}} />
            <button onClick={handleSetupTenant} disabled={isSettingUp} className="btn-primary" style={{marginTop: '20px'}}>{isSettingUp ? 'LINKING...' : 'ACTIVATE'}</button>
         </div>
      </div>
    );
  }

  return (
    <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '10px 15px 60px 15px', fontFamily: 'system-ui, sans-serif'}}>
      <style>{`
        body { background: #0f172a !important; margin: 0; }
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(15px); padding: 30px 25px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 20px; font-weight: 800; width: 100%; cursor: pointer; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; }
        .btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .input-field { width: 100%; padding: 18px; margin-bottom: 20px; border-radius: 20px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.6); color: white; font-size: 1.1rem; outline: none; box-sizing: border-box; }
        .label-visible { color: #94a3b8; font-size: 0.75rem; font-weight: 800; margin-bottom: 12px; display: block; letter-spacing: 1.5px; text-transform: uppercase; }
        .fade-in { animation: fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .update-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.98); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); padding: 25px; }
        .update-card { background: linear-gradient(145deg, #1e293b, #0f172a); width: 100%; max-width: 350px; border-radius: 40px; padding: 40px 30px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; box-shadow: 0 40px 100px rgba(0,0,0,0.8); }
        .log-item { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 15px 0; display: flex; justify-content: space-between; }
      `}</style>

      {updateAvailable && (
        <div className="update-overlay fade-in">
           <div className="update-card">
              <div style={{fontSize: '5rem', marginBottom: '20px'}}>🚀</div>
              <h2 style={{fontSize: '1.8rem', fontWeight: '900'}}>Upgrade Available</h2>
              <div style={{color: '#3b82f6', fontWeight: '900', marginBottom: '20px'}}>V{updateAvailable.version}</div>
              <button className="btn-primary" onClick={handleDownloadUpdate}>INSTALL UPDATE</button>
              {!updateAvailable.forceUpdate && <button onClick={() => setUpdateAvailable(null)} style={{background: 'transparent', border: 'none', color: '#64748b', marginTop: '20px', fontWeight: '800'}}>MAYBE LATER</button>}
           </div>
        </div>
      )}

      <div style={{textAlign: 'center', padding: '20px 0'}}>
          <div style={{fontSize: '0.6rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '4px'}}>OFFICIAL ATTENDANCE HUB</div>
          <h1 style={{fontSize: '1.6rem', margin: '5px 0', fontWeight: '900'}}>{tenantInfo?.companyName?.toUpperCase() || 'TIMEKEY HUB'}</h1>
      </div>

      <header style={{display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '25px', marginBottom: '25px'}}>
        <div>
          <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>STATUS</div>
          <span style={{fontSize: '0.9rem', fontWeight: '900', color: isServerDown ? '#ef4444' : '#10b981'}}>{isServerDown ? 'OFFLINE' : 'ONLINE'}</span>
        </div>
        <div style={{textAlign: 'right'}}>
          <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>QUEUE</div>
          <span style={{fontSize: '0.9rem', fontWeight: '900', color: '#3b82f6'}}>{pendingLogs.length} Records</span>
        </div>
      </header>

      {!loggedIn ? (
        <div className="glass-card fade-in" style={{padding: '50px 30px'}}>
          <div style={{textAlign: 'center', marginBottom: '40px'}}><div style={{fontSize: '5rem', marginBottom: '10px'}}>🛡️</div><h2 style={{margin:0}}>Security Login</h2></div>
          <span className="label-visible">EMPLOYEE ID</span>
          <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="Enter ID" className="input-field" style={{textAlign: 'center', fontSize: '1.5rem', fontWeight: '900'}} />
          <button onClick={login} disabled={loading} className="btn-primary">SIGN IN</button>
        </div>
      ) : (
        <div className="glass-card fade-in">
          <div style={{background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '22px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '15px'}}>
             <div style={{fontSize: '2.5rem'}}>👤</div>
             <div><span className="label-visible" style={{marginBottom:0}}>WELCOME BACK</span><div style={{fontSize: '1.2rem', fontWeight: '900'}}>{localStorage.getItem('cached_name')}</div></div>
          </div>
          <span className="label-visible">WORK LOCATION</span>
          <select value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)} className="input-field" style={{cursor: 'pointer', fontWeight: '700'}}>
            <option value="" style={{color: '#000'}}>-- Select Office Branch --</option>
            {departments.map(d => <option key={d.departmentId} value={d.departmentId} style={{color: '#000'}}>{d.name}</option>)}
          </select>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px'}}>
            <button onClick={() => recordAttendance('IN')} className="btn-primary" style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '30px 10px'}}>IN</button>
            <button onClick={() => recordAttendance('OUT')} className="btn-primary" style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '30px 10px'}}>OUT</button>
          </div>
          <button onClick={() => { syncSystemData(); setShowLogsModal(true); }} style={{width: '100%', padding: '20px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '2px solid rgba(59, 130, 246, 0.3)', borderRadius: '22px', fontWeight: '900', marginBottom: '20px'}}>📋 VIEW HISTORY</button>
          <button onClick={() => {if(confirm('Logout?')){localStorage.clear(); window.location.reload();}}} style={{width: '100%', background: 'transparent', color: '#64748b', border: 'none', fontSize: '0.8rem', fontWeight: '800'}}>LOGOUT ACCOUNT</button>
        </div>
      )}

      {showLogsModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
          <div style={{background: '#1e293b', width: '100%', borderRadius: '30px', padding: '30px', maxHeight: '80vh', overflowY: 'auto'}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}><h2>History</h2><button onClick={()=>setShowLogsModal(false)} style={{background:'none', border:'none', color:'white', fontSize:'1.5rem'}}>✕</button></div>
            {personalLogs.slice().reverse().slice(0, 10).map((l, i) => (
              <div key={i} className="log-item">
                <div><div style={{fontWeight:'900'}}>{l.departmentName}</div><div style={{fontSize:'0.7rem', color:'#94a3b8'}}>{new Date(l.timestamp).toLocaleDateString()}</div></div>
                <div style={{fontWeight:'900', color: l.status==='Completed'?'#10b981':'#3b82f6'}}>{l.status}</div>
              </div>
            ))}
            <button className="btn-primary" onClick={()=>setShowLogsModal(false)} style={{marginTop:'20px'}}>CLOSE</button>
          </div>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: '900'}}>
        STATUS: {status.toUpperCase()} | V{appConfig.version}
      </footer>
    </div>
  );
}
export default App;
