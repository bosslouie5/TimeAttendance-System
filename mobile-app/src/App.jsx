import React, { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import initialData from './initial_data.json';
import appConfig from './app_config.json';
import './styles.css';

// --- HELPER FUNCTIONS ---

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 8000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
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
  // --- STATE MANAGEMENT ---

  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('server_url');
    const isNative = Capacitor.getPlatform() !== 'web';
    const isLocalHost = !isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    let base = appConfig.defaultApiUrl || 'https://timeattendance-system.onrender.com/api';

    // Testing ground logic: If on localhost, use port 4002
    if (isLocalHost && base.includes('onrender.com')) {
       base = 'http://127.0.0.1:4002/api';
    }

    if (saved) {
      if (isNative && saved.startsWith('http://localhost')) return saved.replace('localhost', '127.0.0.1');
      return saved;
    }

    if (isNative && base.startsWith('/')) {
       base = `http://127.0.0.1:4002${base}`;
    }

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
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('cached_id') || '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('System Online');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isServerDown, setIsServerDown] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState('');

  const [departments, setDepartments] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('all_departments')) || initialData.departments;
    } catch (e) { return initialData.departments; }
  });

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

  const [personalLogs, setPersonalLogs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('personal_logs')) || [];
    } catch (e) { return []; }
  });

  // --- LOGIC FUNCTIONS ---

  const checkConnection = useCallback(async () => {
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
  }, [apiUrl, status]);

  const discoverNewLink = async () => {
    const REGISTRY_URL = 'https://ntfy.sh/attendance_hub_60003078_active_link/raw?poll=1&last=1';
    try {
      const res = await fetch(REGISTRY_URL);
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        const newUrl = lines[lines.length - 1];
        if (newUrl && (newUrl.includes('trycloudflare.com') || newUrl.includes('onrender.com'))) {
          const formatted = newUrl.endsWith('/api') ? newUrl : `${newUrl}/api`;
          if (formatted !== apiUrl) {
            setApiUrl(formatted);
            localStorage.setItem('server_url', formatted);
            setIsServerDown(false);
            setStatus('System Updated ✓');
            syncSystemData(tenantId, localStorage.getItem('cached_id'));
          }
        }
      }
    } catch (err) { }
  };

  const syncSystemData = async (forcedTenantId = null, forcedEmpId = null) => {
    if (isSyncing || isServerDown) return;
    setIsSyncing(true);
    try {
      const targetTenantId = forcedTenantId || tenantId;
      const targetEmpId = forcedEmpId || localStorage.getItem('cached_id');
      if (!targetTenantId) return;

      const headers = { 'x-tenant-id': targetTenantId };
      const [empRes, deptRes, logRes] = await Promise.all([
        getJson(`${apiUrl}/employees`, headers),
        getJson(`${apiUrl}/departments?employeeId=${targetEmpId}`, headers),
        getJson(`${apiUrl}/logs`, headers)
      ]);

      if (empRes.status === 200) {
        localStorage.setItem('all_employees', JSON.stringify(empRes.data));
      }
      if (deptRes.status === 200) {
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

  const attemptSync = useCallback(async (forcedLogs = null) => {
    if (isSyncing || isServerDown) return;
    const currentLogs = forcedLogs || JSON.parse(localStorage.getItem('pending_logs') || '[]');
    if (currentLogs.length === 0) return;

    setIsSyncing(true);
    let processedCount = 0;
    for (const log of currentLogs) {
      try {
        const response = await postJson(`${apiUrl}/timein`, { ...log, tenantId }, { 'x-tenant-id': tenantId });
        if (response.status === 200 || response.status === 400) {
           processedCount++;
        } else {
           break;
        }
      } catch (e) {
        break;
      }
    }

    if (processedCount > 0) {
      const latestFromStorage = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      const remaining = latestFromStorage.slice(processedCount);
      setPendingLogs(remaining);
      localStorage.setItem('pending_logs', JSON.stringify(remaining));
      setStatus(forcedLogs ? `Sync completed ✓` : `Auto-synced ${processedCount} records!`);
    }
    setIsSyncing(false);
  }, [apiUrl, tenantId, isSyncing, isServerDown]);

  const fetchTenantInfo = useCallback(async () => {
    if (!apiUrl.startsWith('http') || !tenantId) return;
    try {
        const res = await getJson(`${apiUrl}/tenant-info/${tenantId}`);
        if (res.ok && res.data) {
            localStorage.setItem('tenant_info', JSON.stringify(res.data));
            setTenantInfo(res.data);
        }
    } catch (e) {}
  }, [apiUrl, tenantId]);

  useEffect(() => {
    checkConnection();
    const connInterval = setInterval(checkConnection, 15000);
    const syncInterval = setInterval(attemptSync, 20000);

    if (tenantId) {
        fetchTenantInfo();
        if (loggedIn) syncSystemData();
    }
    return () => {
      clearInterval(connInterval);
      clearInterval(syncInterval);
    };
  }, [tenantId, loggedIn, checkConnection, attemptSync, fetchTenantInfo]);

  // OTA Update Logic
  useEffect(() => {
    const checkUpdate = async () => {
      if (!apiUrl.startsWith('http') || isServerDown) return;
      try {
        const res = await getJson(`${apiUrl}/app-version`);
        if (res.ok && res.data) {
          const latest = res.data;
          const currentVer = appConfig.version;
          const currentParts = currentVer.split('.').map(Number);
          const latestParts = latest.version.split('.').map(Number);
          let isNewer = false;
          for (let i = 0; i < 3; i++) {
            if (latestParts[i] > currentParts[i]) { isNewer = true; break; }
            if (latestParts[i] < currentParts[i]) { isNewer = false; break; }
          }
          if (isNewer) setUpdateAvailable(latest);
        }
      } catch (err) { console.warn('[OTA] Update check failed'); }
    };
    const timer = setTimeout(checkUpdate, 5000);
    return () => clearTimeout(timer);
  }, [apiUrl, isServerDown]);

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
        alert(`SUCCESS!\n\nLinked to: ${res.data.companyName}\nSystem is now ready.`);
      } else {
        alert('INVALID COMPANY ID');
      }
    } catch (e) {
      alert('CONNECTION ERROR: Offline linking not supported.');
    } finally {
      setIsSettingUp(false);
      setStatus('System Ready');
    }
  };

  const login = async () => {
    if (!employeeId.trim()) return alert('Please enter your Employee ID');
    setLoading(true);
    setStatus('Authenticating...');
    const cleanId = employeeId.trim();

    // Attempt Online Registration/Login
    try {
      const idInfo = await Device.getId();
      const devInfo = await Device.getInfo();
      const res = await postJson(`${apiUrl}/device/register`, {
        employeeId: cleanId,
        deviceId: idInfo.identifier,
        deviceName: `${devInfo.model}`
      }, { 'x-tenant-id': tenantId });

      if (res.status === 200) {
        const empData = res.data.employee;
        const actualTenantId = res.data.tenantId || tenantId;
        setLoggedIn(true);
        localStorage.setItem('cached_id', empData.employeeId);
        localStorage.setItem('cached_name', empData.name);
        localStorage.setItem('tenant_id', actualTenantId);
        setStatus('Login Success ✓');
        syncSystemData(actualTenantId, empData.employeeId);
        setLoading(false);
        return;
      } else if (res.status === 404) {
        alert('ID Not Found in Cloud Portal.');
      } else if (res.status === 403) {
        alert(res.data?.error || 'Access Denied');
      }
    } catch (e) { console.warn('Online login failed, trying cache...'); }

    // Offline Fallback
    const allEmployees = JSON.parse(localStorage.getItem('all_employees') || '[]');
    const cachedEmployee = allEmployees.find(e => e.employeeId === cleanId);
    if (cachedEmployee) {
      setLoggedIn(true);
      localStorage.setItem('cached_id', cachedEmployee.employeeId);
      localStorage.setItem('cached_name', cachedEmployee.name);
      setStatus('Offline Access ✓');
      alert('OFFLINE MODE: Logged in using cached credentials.');
    } else {
      alert('CONNECTION REQUIRED for first-time login.');
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
      try {
        pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
      } catch (err) {
        setStatus('❌ GPS Error');
        alert('LOCATION ERROR: Please enable GPS.');
        setLoading(false);
        return;
      }
    }

    const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
    const allowedRadius = dept.radiusMeters || 50;

    if (dist > allowedRadius) {
      setStatus('❌ Too Far');
      alert(`ACCESS DENIED!\n\nYou are ${Math.round(dist)}m away.\nAllowed: ${allowedRadius}m.`);
      setLoading(false);
      return;
    }

    const logData = {
      employeeId: localStorage.getItem('cached_id'),
      employeeName: localStorage.getItem('cached_name'),
      departmentId: selectedDepartment,
      departmentName: dept.name,
      type,
      timestamp: new Date().toISOString(),
      distanceMeters: Math.round(dist),
      tenantId
    };

    setStatus('💾 Saving log...');
    try {
      const response = await postJson(`${apiUrl}/timein`, logData, { 'x-tenant-id': tenantId });
      if (response.status === 200) {
        setStatus(`${type} Success ✓`);
        alert(`SUCCESS recorded.`);
        syncSystemData();
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      const currentPending = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      const updatedPending = [...currentPending, logData];
      localStorage.setItem('pending_logs', JSON.stringify(updatedPending));
      setPendingLogs(updatedPending);
      setStatus('Log Cached ✓');
      alert(`OFFLINE SUCCESS! Saved locally.`);
    } finally {
      setLoading(false);
    }
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

  const handleDownloadUpdate = () => {
    if (!updateAvailable) return;
    const downloadUrl = updateAvailable.apkUrl.startsWith('http') ? updateAvailable.apkUrl : `${apiUrl.replace('/api', '')}${updateAvailable.apkUrl}`;
    window.open(downloadUrl, '_blank');
  };

  // --- RENDER ---

  return (
    <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '10px 15px 80px 15px', fontFamily: 'system-ui, sans-serif', overflowX: 'hidden'}}>
      <style>{`
        body { background: #0f172a !important; margin: 0; }
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(15px); padding: 30px 25px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 20px; font-weight: 800; cursor: pointer; width: 100%; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; }
        .btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .input-field { width: 100%; padding: 18px; margin-bottom: 20px; border-radius: 20px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.6); color: white; font-size: 1.1rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .input-field:focus { border-color: #3b82f6; background: rgba(15, 23, 42, 0.8); }
        .label-visible { color: #94a3b8; font-size: 0.75rem; font-weight: 800; margin-bottom: 12px; display: block; letter-spacing: 1.5px; text-transform: uppercase; }
        .fade-in { animation: fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pulse { animation: pulseAnim 2s infinite; }
        @keyframes pulseAnim { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
        .badge { padding: 8px 16px; border-radius: 14px; font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
        .badge-pending { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
        .badge-online { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.95); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(15px); padding: 20px; }
        .modal-content { background: #1e293b; width: 100%; max-width: 400px; max-height: 85vh; border-radius: 35px; padding: 35px; border: 1px solid rgba(255,255,255,0.1); overflow-y: auto; position: relative; }
        .log-item { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 20px 0; display: flex; justify-content: space-between; align-items: center; }
        .update-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.98); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); padding: 25px; }
        .update-card { background: linear-gradient(145deg, #1e293b, #0f172a); width: 100%; max-width: 350px; border-radius: 40px; padding: 40px 30px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; }
      `}</style>

      {!tenantId ? (
        <div style={{padding: '40px 10px', textAlign: 'center'}}>
           <div className="glass-card fade-in">
              <div style={{fontSize: '6rem', marginBottom: '20px'}} className="pulse">🌐</div>
              <h1 style={{fontSize: '2rem', fontWeight: '900', marginBottom: '10px'}}>System Setup</h1>
              <p style={{color: '#94a3b8', marginBottom: '40px'}}>Enter Company ID to activate terminal.</p>
              <input value={setupId} onChange={e => setSetupId(e.target.value)} placeholder="e.g. 571044" className="input-field" style={{textAlign: 'center', fontSize: '1.5rem', fontWeight: '900'}} />
              <button onClick={handleSetupTenant} disabled={isSettingUp} className="btn-primary">{isSettingUp ? 'LINKING...' : 'ACTIVATE TERMINAL'}</button>
           </div>
        </div>
      ) : (
        <div className="fade-in">
          {updateAvailable && (
            <div className="update-overlay fade-in">
               <div className="update-card">
                  <span style={{fontSize: '5rem', marginBottom: '20px', display: 'block'}}>🚀</span>
                  <h2 style={{fontSize: '1.8rem', fontWeight: '900', color: '#fff', marginBottom: '10px'}}>Upgrade Available</h2>
                  <div style={{color: '#3b82f6', fontWeight: '900', marginBottom: '20px'}}>V{updateAvailable.version}</div>
                  <div style={{color: '#94a3b8', fontSize: '0.9rem', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '15px'}}>
                     {updateAvailable.changelog || 'Stability updates and performance improvements.'}
                  </div>
                  <button className="btn-primary" onClick={handleDownloadUpdate}>INSTALL UPDATE</button>
               </div>
            </div>
          )}

          <div style={{textAlign: 'center', padding: '20px 0', marginBottom: '25px'}} onDoubleClick={handleUpdateServer}>
              <div style={{fontSize: '0.6rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '10px'}}>Official Attendance Hub</div>
              <h1 style={{fontSize: '1.8rem', margin: 0, fontWeight: '900', color: '#fff'}}>{tenantInfo?.companyName?.toUpperCase() || 'TIMEKEY HUB'}</h1>
          </div>

          <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.05)'}}>
            <div>
              <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>SYSTEM STATUS</div>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px'}}>
                <div style={{width: '10px', height: '10px', borderRadius: '50%', background: isServerDown ? '#ef4444' : '#10b981'}}></div>
                <span style={{fontSize: '0.9rem', fontWeight: '900', color: isServerDown ? '#ef4444' : '#10b981'}}>{isServerDown ? 'OFFLINE' : 'ONLINE'}</span>
              </div>
            </div>
            <div style={{textAlign: 'right'}}>
              <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>QUEUE</div>
              <div style={{marginTop: '6px'}}><span className={`badge ${pendingLogs.length > 0 ? 'badge-pending' : 'badge-online'}`}>{pendingLogs.length} Records</span></div>
            </div>
          </header>

          {!loggedIn ? (
            <div className="glass-card fade-in">
              <div style={{textAlign: 'center', marginBottom: '40px'}}>
                 <div style={{fontSize: '5rem', marginBottom: '15px'}} className="pulse">🛡️</div>
                 <h2>Security Hub</h2>
                 <p style={{color: '#94a3b8'}}>Identity Verification Required</p>
              </div>
              <span className="label-visible">EMPLOYEE ID</span>
              <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="0001" className="input-field" style={{textAlign: 'center', fontSize: '1.4rem'}} />
              <button onClick={login} disabled={loading} className="btn-primary">{loading ? 'VERIFYING...' : 'SIGN IN'}</button>
            </div>
          ) : (
            <div className="glass-card fade-in">
              <div style={{display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '35px', background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '25px'}}>
                <div style={{width: '60px', height: '60px', borderRadius: '20px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'}}>👤</div>
                <div>
                  <span className="label-visible" style={{marginBottom: '4px'}}>WELCOME BACK</span>
                  <div style={{fontSize: '1.4rem', fontWeight: '900'}}>{localStorage.getItem('cached_name')}</div>
                </div>
              </div>

              <span className="label-visible">SELECT WORK LOCATION</span>
              <select value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)} className="input-field" style={{cursor: 'pointer'}}>
                <option value="" style={{color: '#000'}}>-- Select Office/Branch --</option>
                {departments.map(d => <option key={d.departmentId} value={d.departmentId} style={{color: '#000'}}>{d.name}</option>)}
              </select>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px'}}>
                <button onClick={() => recordAttendance('IN')} className="btn-primary" style={{background: '#10b981', padding: '30px 10px'}}>
                  <span style={{fontSize: '2rem', display: 'block'}}>📥</span>
                  <span>IN</span>
                </button>
                <button onClick={() => recordAttendance('OUT')} className="btn-primary" style={{background: '#f59e0b', padding: '30px 10px'}}>
                  <span style={{fontSize: '2rem', display: 'block'}}>📤</span>
                  <span>OUT</span>
                </button>
              </div>

              <button onClick={() => { syncSystemData(); setShowLogsModal(true); }} style={{width: '100%', padding: '20px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '2px solid rgba(59, 130, 246, 0.3)', borderRadius: '22px', fontWeight: '900', marginBottom: '20px'}}>📋 ACTIVITY HISTORY</button>
              <button onClick={() => {if(confirm('Logout?')){localStorage.removeItem('cached_id'); localStorage.removeItem('cached_name'); window.location.reload();}}} style={{width: '100%', padding: '10px', background: 'transparent', color: '#64748b', border: 'none', fontSize: '0.8rem'}}>LOGOUT ACCOUNT</button>
            </div>
          )}
        </div>
      )}

      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px'}}>
               <h2 style={{margin: 0, color: '#60a5fa'}}>Personal Logs</h2>
               <button onClick={() => setShowLogsModal(false)} style={{background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem'}}>✕</button>
            </div>
            {personalLogs.length === 0 ? (
              <p style={{textAlign: 'center', color: '#475569'}}>No history found.</p>
            ) : (
              personalLogs.slice().reverse().map((l, i) => (
                <div key={i} className="log-item">
                  <div>
                    <div style={{fontWeight:'900', color: '#fff'}}>{l.departmentName}</div>
                    <div style={{fontSize:'0.75rem', color:'#94a3b8'}}>{new Date(l.timestamp).toLocaleString()}</div>
                  </div>
                  <span className="badge" style={{background: l.type === 'IN' ? '#10b981' : '#f59e0b'}}>{l.type}</span>
                </div>
              ))
            )}
            <button className="btn-primary" onClick={() => setShowLogsModal(false)} style={{marginTop: '25px'}}>CLOSE</button>
          </div>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 0, left: 0, right: 0, padding: '20px', textAlign: 'center', background: 'linear-gradient(to top, #0f172a 80%, transparent)'}}>
         <div style={{fontWeight: '900', fontSize: '0.7rem', color: '#64748b', letterSpacing: '1px'}}>
            {status.toUpperCase()} | V{appConfig.version} | DEBUG: {apiUrl.includes('127.0.0.1') ? 'LAB' : 'CLOUD'}
         </div>
      </footer>
    </div>
  );
}

export default App;
