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
  const R = 6371000; // meters
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
    const configTenantId = appConfig.defaultTenantId;
    if (configTenantId && !["/", "master", "MASTER_UNIVERSAL"].includes(configTenantId)) {
      localStorage.setItem('tenant_id', configTenantId);
      return configTenantId;
    }
    return null;
  });

  const [setupId, setSetupId] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('cached_id') || '');
  const [departments, setDepartments] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('all_departments')) || initialData.departments;
    } catch (e) { return initialData.departments; }
  });
  const [status, setStatus] = useState('System Online');
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tenant_info')) || null;
    } catch (e) { return null; }
  });
  const [pendingLogs, setPendingLogs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pending_logs')) || [];
    } catch (e) { return []; }
  });

  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [personalLogs, setPersonalLogs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('personal_logs')) || [];
    } catch (e) { return []; }
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
    const syncTimer = setInterval(() => {
      attemptSync();
    }, 10000);
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
      const latestFromStorage = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      const remaining = latestFromStorage.slice(processedCount);
      setPendingLogs(remaining);
      localStorage.setItem('pending_logs', JSON.stringify(remaining));
      setStatus(forcedLogs ? `Sync completed ✓` : `Auto-synced ${processedCount} records!`);
      syncSystemData();
    }
    setIsSyncing(false);
  };

  const checkConnection = async () => {
    if (!apiUrl.startsWith('http')) return;
    try {
      const res = await fetchWithTimeout(`${apiUrl}/settings`, { timeout: 3000 });
      if (res.ok) {
        setIsServerDown(false);
        if (status === 'Offline Mode') setStatus('System Online');
      } else throw new Error('Unreachable');
    } catch (e) {
      setIsServerDown(true);
      setStatus('Offline Mode');
      discoverNewLink();
    }
  };

  const discoverNewLink = async () => {
    const REGISTRY_URL = 'https://ntfy.sh/attendance_hub_60003078_active_link/raw?poll=1&last=1';
    try {
      const res = await fetch(REGISTRY_URL);
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        const newUrl = lines[lines.length - 1];
        if (newUrl && newUrl.includes('trycloudflare.com')) {
          const formatted = newUrl.endsWith('/api') ? newUrl : `${newUrl}/api`;
          if (formatted !== apiUrl) {
            setApiUrl(formatted);
            localStorage.setItem('server_url', formatted);
            setIsServerDown(false);
            setStatus('System Updated ✓');
            syncSystemData();
            fetchTenantInfo();
          }
        }
      }
    } catch (err) { }
  };

  const handleUpdateServer = () => {
    const newUrl = prompt('Update Server Link:', apiUrl);
    if (newUrl) {
      const formatted = newUrl.endsWith('/api') ? newUrl : `${newUrl}/api`;
      setApiUrl(formatted);
      localStorage.setItem('server_url', formatted);
      window.location.reload();
    }
  };

  const syncSystemData = async (forcedTenantId = null, forcedEmpId = null) => {
    if (isSyncing || isServerDown) return;
    setIsSyncing(true);
    try {
      const targetTenantId = forcedTenantId || tenantId;
      const targetEmpId = forcedEmpId || localStorage.getItem('cached_id');
      const headers = { 'x-tenant-id': targetTenantId };
      const [empRes, deptRes, logRes] = await Promise.all([
        getJson(`${apiUrl}/employees`, headers),
        getJson(`${apiUrl}/departments?employeeId=${targetEmpId}`, headers),
        getJson(`${apiUrl}/logs`, headers)
      ]);
      if (empRes.status === 200 && deptRes.status === 200) {
        localStorage.setItem('all_employees', JSON.stringify(empRes.data));
        localStorage.setItem('all_departments', JSON.stringify(deptRes.data));
        setDepartments(deptRes.data);
      }
      if (logRes.status === 200) {
        const myLogs = logRes.data.filter(l => l.employeeId === targetEmpId);
        localStorage.setItem('personal_logs', JSON.stringify(myLogs));
        setPersonalLogs(myLogs);
      }
      setStatus('Updated ✓');
    } catch (e) {}
    setIsSyncing(false);
  };

  const handleSetupTenant = async () => {
    if (!setupId.trim()) return alert('Please enter a valid Company ID');
    setIsSettingUp(true);
    setStatus('Linking Company...');
    try {
      const res = await getJson(`${apiUrl}/tenant-info/${setupId.trim()}`);
      if (res.ok && res.data) {
        const tid = res.data.tenantId || setupId.trim();
        localStorage.setItem('tenant_id', tid);
        localStorage.setItem('tenant_info', JSON.stringify(res.data));
        setTenantId(tid);
        setTenantInfo(res.data);
        setStatus('Company Linked ✓');
        alert(`SUCCESS!\n\nLinked to: ${res.data.companyName}\nSystem is ngayong ready.`);
      } else { alert('INVALID COMPANY ID'); }
    } catch (e) { alert('CONNECTION ERROR'); } finally { setIsSettingUp(false); setStatus('System Ready'); }
  };

  const login = async () => {
    if (!employeeId.trim()) return alert('Please enter your Employee ID');
    setLoading(true);
    setStatus('Authenticating...');
    const cleanId = employeeId.trim();
    try {
      const idInfo = await Device.getId();
      const devInfo = await Device.getInfo();
      const res = await postJson(`${apiUrl}/device/register`, { employeeId: cleanId, deviceId: idInfo.identifier, deviceName: `${devInfo.model}` }, { 'x-tenant-id': tenantId });
      if (res.status === 200) {
        const empData = res.data.employee;
        setLoggedIn(true);
        localStorage.setItem('cached_id', empData.employeeId);
        localStorage.setItem('cached_name', empData.name);
        setStatus('Login Success ✓');
        syncSystemData(tenantId, empData.employeeId);
        fetchTenantInfo();
        setLoading(false);
        return;
      } else if (res.status === 404) { alert('Employee ID Not Found'); }
      else if (res.status === 403) { alert(res.data?.error || 'Security Rejection'); }
      else if (res.status === 0) { console.warn('Offline Mode Access'); }
    } catch (e) { }

    const allEmployees = JSON.parse(localStorage.getItem('all_employees') || '[]');
    const cachedEmployee = allEmployees.find(e => e.employeeId === cleanId);
    if (cachedEmployee) {
      setLoggedIn(true);
      localStorage.setItem('cached_id', cachedEmployee.employeeId);
      localStorage.setItem('cached_name', cachedEmployee.name);
      setStatus('Offline Access ✓');
      alert('OFFLINE MODE: Logged in using cached credentials.');
    } else {
      alert(`CONNECTION REQUIRED: First-time login must be performed while online.`);
    }
    setLoading(false);
  };

  const recordAttendance = async (type) => {
    if (!selectedDepartment) return alert('Please select a branch first!');
    const dept = departments.find(d => d.departmentId === selectedDepartment);
    if (!dept) return;

    setLoading(true);
    setStatus('📡 Checking Location...');
    let pos;
    try {
      pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    } catch (e) {
      try { pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 }); }
      catch (err) { alert('LOCATION ERROR: Please enable GPS.'); setLoading(false); return; }
    }

    const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
    const allowedRadius = dept.radiusMeters || 50;

    if (dist > allowedRadius) {
      alert(`ACCESS DENIED!\n\nYou are ${Math.round(dist)}m away from ${dept.name}. Max: ${allowedRadius}m.`);
      setLoading(false);
      return;
    }

    const logData = { employeeId: localStorage.getItem('cached_id'), employeeName: localStorage.getItem('cached_name'), departmentId: selectedDepartment, departmentName: dept.name, type, timestamp: new Date().toISOString(), distanceMeters: Math.round(dist), tenantId };
    setStatus('💾 Saving log...');
    try {
      const response = await postJson(`${apiUrl}/timein`, logData, { 'x-tenant-id': tenantId });
      if (response.status === 200) { setStatus(`${type} Success ✓`); alert(`SUCCESS recorded on server.`); syncSystemData(); }
      else if (response.status === 400) { alert(response.data?.error || 'Attendance already recorded.'); syncSystemData(); }
      else { throw new Error('Network Issue'); }
    } catch (err) {
      const currentPending = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      localStorage.setItem('pending_logs', JSON.stringify([...currentPending, logData]));
      setPendingLogs([...currentPending, logData]);
      setStatus('Log Cached ✓');
      alert(`OFFLINE SUCCESS! Saved locally.`);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const checkUpdate = async () => {
      if (!apiUrl.startsWith('http') || isServerDown) return;
      try {
        const res = await getJson(`${apiUrl}/app-version`);
        if (res.ok && res.data) {
          const latest = res.data;
          const currentParts = appConfig.version.split('.').map(Number);
          const latestParts = latest.version.split('.').map(Number);
          let isNewer = false;
          for (let i = 0; i < 3; i++) {
            if (latestParts[i] > currentParts[i]) { isNewer = true; break; }
            if (latestParts[i] < currentParts[i]) break;
          }
          if (isNewer) setUpdateAvailable(latest);
        }
      } catch (err) { }
    };
    const timer = setTimeout(checkUpdate, 5000);
    const updateInterval = setInterval(checkUpdate, 60000);
    return () => { clearTimeout(timer); clearInterval(updateInterval); };
  }, [apiUrl, isServerDown]);

  const handleDownloadUpdate = () => {
    if (!updateAvailable) return;
    const downloadUrl = updateAvailable.apkUrl.startsWith('http') ? updateAvailable.apkUrl : `${apiUrl.replace('/api', '')}${updateAvailable.apkUrl}`;
    window.open(downloadUrl, '_blank');
  };

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
        .pulse { animation: pulseAnim 2s infinite; }
        @keyframes pulseAnim { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
        .update-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.98); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); padding: 25px; }
        .update-card { background: linear-gradient(145deg, #1e293b, #0f172a); width: 100%; max-width: 350px; border-radius: 40px; padding: 40px 30px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; box-shadow: 0 40px 100px rgba(0,0,0,0.8); }
        .badge { padding: 8px 16px; border-radius: 14px; font-size: 0.7rem; font-weight: 900; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.95); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(15px); padding: 20px; }
        .modal-content { background: #1e293b; width: 100%; max-width: 400px; max-height: 85vh; border-radius: 35px; padding: 35px; border: 1px solid rgba(255,255,255,0.1); overflow-y: auto; position: relative; }
        .log-item { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 20px 0; display: flex; justify-content: space-between; align-items: center; }
      `}</style>

      {updateAvailable && (
        <div className="update-overlay fade-in">
           <div className="update-card">
              <div style={{fontSize: '5rem', marginBottom: '20px'}}>🚀</div>
              <h2 style={{fontSize: '1.8rem', fontWeight: '900'}}>Upgrade Available</h2>
              <div style={{color: '#3b82f6', fontWeight: '900', marginBottom: '20px'}}>V{updateAvailable.version}</div>
              <button className="btn-primary" onClick={handleDownloadUpdate}>INSTALL UPDATE</button>
              {!updateAvailable.forceUpdate && <button onClick={() => setUpdateAvailable(null)} style={{background: 'transparent', border: 'none', color: '#64748b', marginTop: '20px'}}>MAYBE LATER</button>}
           </div>
        </div>
      )}

      <div style={{textAlign: 'center', padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '25px'}}>
          <div style={{fontSize: '0.65rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '10px'}}>Official Attendance Hub</div>
          <h1 style={{fontSize: '1.6rem', margin: 0, fontWeight: '900'}}>{tenantInfo?.companyName?.toUpperCase() || 'TIMEKEY HUB'}</h1>
      </div>

      {!tenantId ? (
        <div style={{padding: '40px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: '60vh'}}>
           <div className="glass-card fade-in">
              <div style={{fontSize: '6rem', marginBottom: '20px'}} className="pulse">🌐</div>
              <h1 style={{fontSize: '2rem', fontWeight: '900'}}>System Setup</h1>
              <p style={{color: '#94a3b8', marginBottom: '40px'}}>Enter Company ID to activate terminal.</p>
              <input value={setupId} onChange={e => setSetupId(e.target.value)} placeholder="571044" className="input-field" style={{textAlign: 'center', fontSize: '1.5rem', fontWeight: '900'}} />
              <button onClick={handleSetupTenant} disabled={isSettingUp} className="btn-primary">{isSettingUp ? 'LINKING...' : 'ACTIVATE TERMINAL'}</button>
           </div>
        </div>
      ) : (
        <div className="fade-in">
          <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '25px'}} onDoubleClick={handleUpdateServer}>
            <div>
              <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>SYSTEM STATUS</div>
              <span style={{fontSize: '0.9rem', fontWeight: '900', color: isServerDown ? '#ef4444' : '#10b981'}}>{isServerDown ? 'OFFLINE' : 'ONLINE'}</span>
            </div>
            <div style={{textAlign: 'right'}}>
              <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>QUEUE</div>
              <span className="badge" style={{background: pendingLogs.length > 0 ? '#f59e0b' : '#10b981'}}>{pendingLogs.length} Records</span>
            </div>
          </header>

          {!loggedIn ? (
            <div className="glass-card fade-in" style={{padding: '50px 30px'}}>
              <div style={{textAlign: 'center', marginBottom: '45px'}}><div style={{fontSize: '5.5rem'}} className="pulse">🛡️</div><h3>Identity Verification</h3></div>
              <span className="label-visible">EMPLOYEE ID</span>
              <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="0001" className="input-field" style={{textAlign: 'center', fontSize: '1.4rem', fontWeight: '900'}} />
              <button onClick={login} disabled={loading} className="btn-primary">SIGN IN TO SYSTEM</button>
            </div>
          ) : (
            <div className="glass-card fade-in">
              <div style={{display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '35px', background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '25px'}}>
                <div style={{fontSize: '2.5rem'}}>👤</div>
                <div><span className="label-visible">WELCOME BACK</span><div style={{fontSize: '1.5rem', fontWeight: '900'}}>{localStorage.getItem('cached_name')}</div></div>
              </div>
              <span className="label-visible">WORK LOCATION</span>
              <select value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)} className="input-field" style={{cursor: 'pointer'}}>
                <option value="" style={{color: '#000'}}>-- Select Office Branch --</option>
                {departments.map(d => <option key={d.departmentId} value={d.departmentId} style={{color: '#000'}}>{d.name}</option>)}
              </select>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px'}}>
                <button onClick={() => recordAttendance('IN')} disabled={loading} style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: '28px', fontWeight: '900', padding: '30px 10px'}} className="btn-hover">📥 TIME IN</button>
                <button onClick={() => recordAttendance('OUT')} disabled={loading} style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', borderRadius: '28px', fontWeight: '900', padding: '30px 10px'}} className="btn-hover">📤 TIME OUT</button>
              </div>
              <button onClick={() => { syncSystemData(); setShowLogsModal(true); }} style={{width: '100%', padding: '20px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '2px solid rgba(59, 130, 246, 0.3)', borderRadius: '22px', fontWeight: '900', marginBottom: '25px'}}>📋 VIEW ACTIVITY HISTORY</button>
              <button onClick={() => {if(confirm('Logout?')){setLoggedIn(false); localStorage.clear(); window.location.reload();}}} style={{width: '100%', background: 'transparent', color: '#64748b', border: 'none', fontSize: '0.8rem', fontWeight: '800'}}>LOGOUT ACCOUNT</button>
            </div>
          )}
        </div>
      )}

      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px'}}>
               <h2 style={{margin: 0, color: '#60a5fa', fontWeight: '900'}}>History</h2>
               <button onClick={() => setShowLogsModal(false)} style={{background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', width: '40px', height: '40px', borderRadius: '50%', fontWeight: 'bold'}}>✕</button>
            </div>
            <div style={{margin: '0 0 35px 0'}}>
               {personalLogs.length === 0 ? <p style={{textAlign:'center', padding:'50px'}}>No logs yet.</p> : personalLogs.slice().reverse().slice(0, 10).map((l, i) => (
                 <div key={i} className="log-item">
                   <div>
                     <div style={{fontWeight: '900'}}>{l.departmentName}</div>
                     <div style={{fontSize: '0.75rem', color: '#94a3b8'}}>{new Date(l.timestamp).toLocaleDateString()} • {l.status}</div>
                   </div>
                 </div>
               ))}
            </div>
            <button className="btn-primary" onClick={() => setShowLogsModal(false)}>CLOSE</button>
          </div>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 15, left: 0, right: 0, textAlign: 'center', fontSize: '0.65rem', color: '#64748b', fontWeight: '900'}}>
        {status.toUpperCase()} | V{appConfig.version}
      </footer>
    </div>
  );
}
export default App;
