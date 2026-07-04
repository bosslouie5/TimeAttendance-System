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
    const isNative = Capacitor.getPlatform ? Capacitor.getPlatform() !== 'web' : false;
    const nativeDefaultUrl = 'http://127.0.0.1:4002/api';
    const webDefaultUrl = `${window.location.origin}/api`;

    const isLocalBuild = appConfig.defaultApiUrl && (appConfig.defaultApiUrl.includes('127.0.0.1') || appConfig.defaultApiUrl.includes('localhost'));

    if (isLocalBuild && isNative) {
       if (saved && saved.includes('trycloudflare.com')) {
          return appConfig.defaultApiUrl.replace('localhost', '127.0.0.1');
       }
    }

    if (saved) {
      if (isNative) {
        if (saved.startsWith('http://localhost')) return saved.replace('localhost', '127.0.0.1');
        if (saved.startsWith('http://127.0.0.1')) return saved;
      }
      return saved;
    }

    if (isNative) {
      return (appConfig.defaultApiUrl || nativeDefaultUrl).replace('localhost', '127.0.0.1');
    }
    return webDefaultUrl;
  });

  const [tenantId, setTenantId] = useState(localStorage.getItem('tenant_id') || appConfig.defaultTenantId);
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('cached_id') || '');
  const [departments, setDepartments] = useState(JSON.parse(localStorage.getItem('all_departments')) || initialData.departments);
  const [status, setStatus] = useState('System Online');
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(JSON.parse(localStorage.getItem('tenant_info')) || null);
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
    }

    // Refresh data if already logged in
    if (loggedIn) {
        syncSystemData();
    }

    return () => clearInterval(connInterval);
  }, []);

  const fetchTenantInfo = async () => {
    try {
        const res = await getJson(`${apiUrl}/tenant-info/${tenantId}`);
        if (res.ok) {
            localStorage.setItem('tenant_info', JSON.stringify(res.data));
            setTenantInfo(res.data);
        }
    } catch (e) {}
  };

  useEffect(() => {
    const syncTimer = setInterval(() => {
      attemptSync();
    }, 8000);
    return () => clearInterval(syncTimer);
  }, [apiUrl, tenantId, isSyncing]);

  const attemptSync = async (forcedLogs = null) => {
    if (isSyncing) return;
    const currentLogs = forcedLogs || JSON.parse(localStorage.getItem('pending_logs') || '[]');
    if (currentLogs.length === 0) return;

    setIsSyncing(true);
    const logsToSync = [...currentLogs];
    let processedCount = 0;

    for (const log of logsToSync) {
      try {
        const response = await postJson(
          `${apiUrl}/timein`,
          { ...log, tenantId },
          { 'x-tenant-id': tenantId }
        );

        // Success or Permanent Rejection (Duplicate)
        if (response.status === 200 || response.status === 400) {
           processedCount++;
           if (response.status === 400) console.log("Cleaning up duplicate/invalid pending log:", log);
        } else {
           // Network error or server busy, stop and try again later
           break;
        }
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
          }
        }
      }
    } catch (err) { }
  };

  const handleUpdateServer = () => {
    const newUrl = prompt('Server Link:', apiUrl);
    if (newUrl) {
      const formatted = newUrl.endsWith('/api') ? newUrl : `${newUrl}/api`;
      setApiUrl(formatted);
      localStorage.setItem('server_url', formatted);
      window.location.reload();
    }
  };

  const syncSystemData = async (forcedTenantId = null, forcedEmpId = null) => {
    if (isSyncing) return;
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
        setStatus('Updated ✓');
      }
      if (logRes.status === 200) {
        const myLogs = logRes.data.filter(l => l.employeeId === targetEmpId);
        localStorage.setItem('personal_logs', JSON.stringify(myLogs));
        setPersonalLogs(myLogs);
      }
    } catch (e) { console.error('Sync failed', e); }
    setIsSyncing(false);
  };

  const login = async () => {
    if (!employeeId.trim()) return alert('Enter Employee ID');
    setLoading(true);
    setStatus('Authenticating...');

    const cleanId = employeeId.trim();
    const allEmployees = JSON.parse(localStorage.getItem('all_employees') || '[]');
    const cachedEmployee = allEmployees.find(e => e.employeeId === cleanId);

    try {
      const idInfo = await Device.getId();
      const devInfo = await Device.getInfo();
      const res = await postJson(
        `${apiUrl}/device/register`,
        { employeeId: cleanId, deviceId: idInfo.identifier, deviceName: `${devInfo.model}` },
        { 'x-tenant-id': tenantId }
      );

      if (res.status === 200) {
        const empData = res.data.employee;
        const actualTenantId = res.data.tenantId || tenantId;
        setLoggedIn(true);
        setTenantId(actualTenantId);
        localStorage.setItem('cached_id', empData.employeeId);
        localStorage.setItem('cached_name', empData.name);
        localStorage.setItem('tenant_id', actualTenantId);
        setStatus('Login Success ✓');
        syncSystemData(actualTenantId, empData.employeeId);
        fetchTenantInfo();
        setLoading(false);
        return;
      } else if (res.status === 404) {
        alert('IDENTIFICATION ERROR: This Employee ID is not yet registered in the Web Admin Portal. Please contact your administrator.');
        setLoading(false);
        return;
      } else if (res.status === 403) {
        alert(`SECURITY REJECTION: ${res.data?.error || 'Unauthorized device connection.'}`);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.log('Connection failed, attempting offline check...');
    }

    // Only allow offline login if we couldn't reach the server at all (status 0)
    if (cachedEmployee) {
      setLoggedIn(true);
      localStorage.setItem('cached_id', cachedEmployee.employeeId);
      localStorage.setItem('cached_name', cachedEmployee.name);
      setStatus('Offline Access ✓');
    } else {
      alert('INITIAL LOGIN REQUIRED: To secure your identity, please ensure you are connected to the network for your first login. This ID was not found in the local records.');
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
        alert('LOCATION ERROR: Please enable GPS on your mobile device.');
        setLoading(false);
        return;
      }
    }

    const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
    const allowedRadius = dept.radiusMeters || 50;

    if (dist > allowedRadius) {
      setStatus('❌ Too Far');
      alert(`ACCESS DENIED!\n\nYou are ${Math.round(dist)}m away from ${dept.name}.\nYou must be within ${allowedRadius}m.`);
      setLoading(false);
      return;
    }

    const todayStr = new Date().toLocaleDateString();

    // ANTI-DUPLICATE CHECK (Local & Online Logs)
    if (type === 'IN') {
        const alreadyInLogs = personalLogs.some(l => new Date(l.timestamp).toLocaleDateString() === todayStr && l.timeIn);
        const alreadyInPending = pendingLogs.some(l => new Date(l.timestamp).toLocaleDateString() === todayStr && l.type === 'IN');

        if (alreadyInLogs || alreadyInPending) {
            setStatus('⚠️ Already Timed In');
            alert('ATTENTION: You have already recorded a TIME IN for today.');
            setLoading(false);
            return;
        }
    }

    if (type === 'OUT') {
        const alreadyOutLogs = personalLogs.some(l => new Date(l.timestamp).toLocaleDateString() === todayStr && l.timeOut);
        const alreadyOutPending = pendingLogs.some(l => new Date(l.timestamp).toLocaleDateString() === todayStr && l.type === 'OUT');

        if (alreadyOutLogs || alreadyOutPending) {
            setStatus('⚠️ Already Timed Out');
            alert('ATTENTION: You have already recorded a TIME OUT for today.');
            setLoading(false);
            return;
        }
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
        alert(`SUCCESS!\n\nYour ${type} has been recorded on the server.`);
        syncSystemData();
      } else if (response.status === 400) {
        // Server rejected as duplicate
        setStatus('⚠️ Duplicate rejected');
        alert(response.data?.error || 'Attendance already recorded.');
        syncSystemData();
      } else {
          throw new Error('Network Issue');
      }
    } catch (err) {
      // OFFLINE LOGIC: Save locally
      const currentPending = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      const updatedPending = [...currentPending, logData];
      localStorage.setItem('pending_logs', JSON.stringify(updatedPending));
      setPendingLogs(updatedPending);
      setStatus('Log Cached ✓');
      alert(`OFFLINE SUCCESS!\n\nYour ${type} is saved on your phone. It will sync automatically when the server is online.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '10px 15px 40px 15px', fontFamily: 'system-ui, -apple-system, sans-serif'}}>
      <style>{`
        body { background: #0f172a !important; }
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); padding: 30px 25px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 18px; font-weight: 800; cursor: pointer; width: 100%; transition: 0.3s; box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2); font-size: 1.1rem; letter-spacing: 0.5px; text-transform: uppercase; }
        .btn-primary:active { transform: scale(0.97); }
        .input-field { width: 100%; padding: 18px; margin-bottom: 20px; border-radius: 18px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.6); color: white; font-size: 1.1rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .input-field:focus { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
        select.input-field { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 15px center; background-size: 20px; }
        .badge { padding: 8px 16px; border-radius: 14px; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
        .badge-pending { background: #f59e0b; color: #fff; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); }
        .badge-online { background: #10b981; color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.9); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(12px); padding: 20px; }
        .modal-content { background: #1e293b; width: 100%; max-width: 400px; max-height: 80vh; border-radius: 32px; padding: 35px; border: 1px solid rgba(255,255,255,0.1); overflow-y: auto; position: relative; box-shadow: 0 30px 60px rgba(0,0,0,0.6); }
        .log-item { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 18px 0; display: flex; justify-content: space-between; align-items: center; }
        .label-visible { color: #94a3b8; font-size: 0.75rem; font-weight: 800; margin-bottom: 10px; display: block; letter-spacing: 1.5px; text-transform: uppercase; }
        .fade-in { animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* TOP COMPANY HEADER - ULTRA VISIBLE */}
      <div style={{textAlign: 'center', padding: '15px 0 25px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px'}}>
          <div style={{fontSize: '0.65rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px'}}>Official System</div>
          <h1 style={{fontSize: '1.4rem', margin: 0, fontWeight: '900', color: '#fff', letterSpacing: '0.5px'}}>
             {tenantInfo ? tenantInfo.companyName.toUpperCase() : 'TIMEKEY Hub'}
          </h1>
      </div>

      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '20px'}} onDoubleClick={handleUpdateServer}>
        <div>
          <div style={{fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '1.5px', fontWeight: '800'}}>NETWORK</div>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px'}}>
            <div style={{width: '10px', height: '10px', borderRadius: '50%', background: isServerDown ? '#ef4444' : '#10b981', boxShadow: isServerDown ? '0 0 10px #ef4444' : '0 0 10px #10b981'}}></div>
            <span style={{fontSize: '0.85rem', fontWeight: '900', color: isServerDown ? '#fca5a5' : '#34d399'}}>{isServerDown ? 'OFFLINE' : 'ONLINE'}</span>
          </div>
        </div>
        <div style={{textAlign: 'right'}}>
          <div style={{fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '1.5px', fontWeight: '800'}}>SYNC QUEUE</div>
          <div style={{marginTop: '4px'}}>
            <span className={`badge ${pendingLogs.length > 0 ? 'badge-pending' : 'badge-online'}`}>
               {pendingLogs.length} PENDING
            </span>
          </div>
        </div>
      </header>

      {!loggedIn ? (
        <div className="glass-card fade-in" style={{padding: '40px 30px'}}>
          <div style={{textAlign: 'center', marginBottom: '40px'}}>
             <div style={{fontSize: '4.5rem', marginBottom: '15px', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.3))'}}>🛡️</div>
             <h1 style={{fontSize: '1.8rem', margin: 0, fontWeight: '900', color: '#fff'}}>Security Hub</h1>
             <p style={{color: '#94a3b8', fontSize: '0.9rem', marginTop: '5px'}}>Secure Employee Access</p>
          </div>

          <div className="form-group">
            <span className="label-visible">EMPLOYEE IDENTIFICATION</span>
            <input
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="Ex: 0001"
              className="input-field"
              style={{textAlign: 'center', fontSize: '1.2rem', letterSpacing: '2px'}}
            />
          </div>

          <button onClick={login} disabled={loading} className="btn-primary" style={{marginTop: '10px'}}>
            {loading ? 'VERIFYING...' : 'SIGN IN TO PORTAL'}
          </button>
        </div>
      ) : (
        <div className="glass-card fade-in">
          <div style={{display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '30px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)'}}>
            <div style={{width: '60px', height: '60px', borderRadius: '18px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', boxShadow: '0 8px 20px rgba(37, 99, 235, 0.3)'}}>👤</div>
            <div>
              <span className="label-visible" style={{marginBottom: '2px'}}>EMPLOYEE NAME</span>
              <div style={{fontSize: '1.3rem', fontWeight: '900', color: '#fff'}}>{localStorage.getItem('cached_name')}</div>
            </div>
          </div>

          <div className="form-group" style={{marginBottom: '25px'}}>
            <span className="label-visible">SELECT WORK BRANCH</span>
            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              className="input-field"
              style={{marginBottom: 0, cursor: 'pointer'}}
            >
              <option value="" style={{color: '#000'}}>-- Choose Branch --</option>
              {departments.map(d => <option key={d.departmentId} value={d.departmentId} style={{color: '#000'}}>{d.name}</option>)}
            </select>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px'}}>
            <button
              onClick={() => recordAttendance('IN')}
              disabled={loading}
              style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: '24px', fontWeight: '900', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '25px 10px', transition: '0.3s', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'}}
            >
              <span style={{fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))'}}>📥</span>
              <span style={{letterSpacing: '1px'}}>TIME IN</span>
            </button>
            <button
              onClick={() => recordAttendance('OUT')}
              disabled={loading}
              style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', borderRadius: '24px', fontWeight: '900', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '25px 10px', transition: '0.3s', boxShadow: '0 8px 20px rgba(245, 158, 11, 0.3)'}}
            >
              <span style={{fontSize: '2rem', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))'}}>📤</span>
              <span style={{letterSpacing: '1px'}}>TIME OUT</span>
            </button>
          </div>

          {selectedDepartment && departments.find(d => d.departmentId === selectedDepartment) && (
            <div style={{fontSize: '0.8rem', color: '#3b82f6', marginBottom: '25px', textAlign: 'center', background: 'rgba(59, 130, 246, 0.08)', padding: '15px', borderRadius: '18px', border: '1px dashed rgba(59, 130, 246, 0.4)', fontWeight: '700'}}>
              📍 {departments.find(d => d.departmentId === selectedDepartment).name}
              <div style={{fontSize: '0.65rem', marginTop: '6px', color: '#94a3b8', fontWeight: '500'}}>
                GEOFENCE: {departments.find(d => d.departmentId === selectedDepartment).radiusMeters || 50}m Radius Active
              </div>
            </div>
          )}

          <button
            onClick={() => { syncSystemData(); setShowLogsModal(true); }}
            style={{width: '100%', padding: '18px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '2px solid rgba(59, 130, 246, 0.3)', borderRadius: '18px', fontWeight: '800', marginBottom: '20px', cursor:'pointer', fontSize: '0.9rem', letterSpacing: '0.5px'}}
          >
            📋 VIEW RECENT LOGS
          </button>

          <button onClick={() => {setLoggedIn(false); localStorage.removeItem('cached_id'); localStorage.removeItem('cached_name'); window.location.reload();}} style={{width: '100%', padding: '12px', background: 'transparent', color: '#475569', border: 'none', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1px'}}>LOGOUT ACCOUNT</button>
        </div>
      )}

      {/* LOGS MODAL */}
      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px'}}>
               <h2 style={{marginTop:0, fontSize: '1.4rem', color: '#60a5fa', fontWeight: '900', margin: 0}}>Activity Logs</h2>
               <button onClick={() => setShowLogsModal(false)} style={{background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold'}}>✕</button>
            </div>

            <div style={{marginBottom: '15px', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)'}}>
               <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>LOGGED IN AS</div>
               <div style={{fontWeight: '900', color: '#fff', fontSize: '1.1rem'}}>{localStorage.getItem('cached_name')}</div>
               <div style={{fontSize: '0.75rem', color: '#60a5fa', fontWeight: 'bold'}}>ID: {localStorage.getItem('cached_id')}</div>
            </div>

            <div style={{margin: '0 0 30px 0'}}>
               {personalLogs.length === 0 ? (
                 <div style={{textAlign: 'center', color: '#475569', padding: '40px 0'}}>
                    <div style={{fontSize: '3rem', marginBottom: '10px'}}>📅</div>
                    <p style={{fontWeight: '700'}}>No history found yet.</p>
                 </div>
               ) : (
                 Object.entries(
                   personalLogs.slice().reverse().reduce((acc, log) => {
                     const dateKey = new Date(log.timestamp).toLocaleDateString();
                     if (!acc[dateKey]) acc[dateKey] = [];
                     acc[dateKey].push(log);
                     return acc;
                   }, {})
                 ).slice(0, 7).map(([date, dayLogs], i) => (
                   <div key={i} style={{marginBottom: '20px'}}>
                     <div style={{fontSize: '0.7rem', color: '#3b82f6', fontWeight: '900', marginBottom: '10px', background: 'rgba(59, 130, 246, 0.05)', padding: '5px 10px', borderRadius: '8px', display: 'inline-block'}}>
                       🗓️ {date}
                     </div>
                     {dayLogs.map((l, j) => (
                       <div key={j} className="log-item" style={{marginLeft: '10px'}}>
                         <div>
                           <div style={{fontWeight:'900', fontSize:'0.9rem', color: '#fff'}}>{l.departmentName}</div>
                           <div style={{fontSize:'0.7rem', color:'#94a3b8', marginTop: '2px'}}>
                             {l.timeIn && `IN: ${new Date(l.timeIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`}
                             {l.timeIn && l.timeOut && ` • `}
                             {l.timeOut && `OUT: ${new Date(l.timeOut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`}
                           </div>
                         </div>
                         <span style={{
                           fontSize: '0.6rem',
                           fontWeight: '900',
                           padding: '4px 10px',
                           borderRadius: '10px',
                           background: l.status === 'Completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                           color: l.status === 'Completed' ? '#34d399' : '#60a5fa',
                           border: `1px solid ${l.status === 'Completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                         }}>
                           {l.status.toUpperCase()}
                         </span>
                       </div>
                     ))}
                   </div>
                 ))
               )}
            </div>
            <button className="btn-primary" onClick={() => setShowLogsModal(false)}>BACK TO DASHBOARD</button>
          </div>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 0, left: 0, right: 0, padding: '15px', textAlign: 'center', fontSize: '0.65rem', color: '#475569', background: 'linear-gradient(to top, #0f172a 60%, transparent)', zIndex: 100}}>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'}}>
           <span style={{width: '8px', height: '8px', borderRadius: '50%', background: status.includes('✓') || status.includes('Online') ? '#10b981' : '#f59e0b', boxShadow: status.includes('✓') || status.includes('Online') ? '0 0 8px #10b981' : '0 0 8px #f59e0b', display: 'inline-block'}}></span>
           <span style={{fontWeight: '800', letterSpacing: '0.5px', color: '#64748b'}}>{status.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
