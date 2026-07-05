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

    // Resolve relative API URLs to full URLs for native builds
    let base = appConfig.defaultApiUrl || 'http://127.0.0.1:4002/api';
    if (isNative && base.startsWith('/')) {
       // Fallback to a common local IP if it's just a path
       base = `http://127.0.0.1:4002${base}`;
    }

    if (saved) {
      if (isNative) {
        if (saved.startsWith('http://localhost')) return saved.replace('localhost', '127.0.0.1');
        return saved;
      }
      return saved;
    }

    if (isNative) {
      return base.replace('localhost', '127.0.0.1');
    }
    return base.startsWith('http') ? base : `${window.location.origin}${base}`;
  });

  const [tenantId, setTenantId] = useState(localStorage.getItem('tenant_id') || appConfig.defaultTenantId);
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
    }

    if (loggedIn) {
        syncSystemData();
    }

    return () => clearInterval(connInterval);
  }, []);

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
    const logsToSync = [...currentLogs];
    let processedCount = 0;

    for (const log of logsToSync) {
      try {
        const response = await postJson(
          `${apiUrl}/timein`,
          { ...log, tenantId },
          { 'x-tenant-id': tenantId }
        );

        if (response.status === 200 || response.status === 400) {
           processedCount++;
        } else {
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

  const login = async () => {
    if (!employeeId.trim()) return alert('Please enter your Employee ID');
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
        alert('IDENTIFICATION ERROR: ID not registered in Web Portal.');
        setLoading(false);
        return;
      } else if (res.status === 403) {
        alert(`SECURITY REJECTION: ${res.data?.error || 'Unauthorized device.'}`);
        setLoading(false);
        return;
      }
    } catch (e) {}

    if (cachedEmployee) {
      setLoggedIn(true);
      localStorage.setItem('cached_id', cachedEmployee.employeeId);
      localStorage.setItem('cached_name', cachedEmployee.name);
      setStatus('Offline Access ✓');
    } else {
      alert('CONNECTION REQUIRED: First-time login must be performed while online.');
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
        alert('LOCATION ERROR: Please enable GPS/Location services.');
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
        alert(`SUCCESS recorded on server.`);
        syncSystemData();
      } else if (response.status === 400) {
        setStatus('⚠️ Duplicate rejected');
        alert(response.data?.error || 'Attendance already recorded.');
        syncSystemData();
      } else {
          throw new Error('Network Issue');
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

  useEffect(() => {
    const checkUpdate = async () => {
      // Don't check update if we are just debugging or no version is set
      if (!appConfig.version) return;

      try {
        const isTest = apiUrl.includes('4002');
        const versionFile = isTest ? 'latest-version-test.json' : 'latest-version.json';
        const res = await fetch(`${apiUrl.replace('/api', '')}/apks/${versionFile}`);
        if (res.ok) {
          const latest = await res.json();
          // Version comparison
          if (latest.version !== appConfig.version) {
            setUpdateAvailable(latest);
          }
        }
      } catch (err) {
        console.log('Update check skipped (Server unreachable)');
      }
    };

    checkUpdate();
  }, [apiUrl]);

  return (
    <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '10px 15px 60px 15px', fontFamily: 'system-ui, sans-serif'}}>
      <style>{`
        body { background: #0f172a !important; margin: 0; }
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(15px); padding: 30px 25px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 20px; font-weight: 800; cursor: pointer; width: 100%; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; }
        .btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .input-field { width: 100%; padding: 18px; margin-bottom: 20px; border-radius: 20px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.6); color: white; font-size: 1.1rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .input-field:focus { border-color: #3b82f6; background: rgba(15, 23, 42, 0.8); }
        select.input-field { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 20px center; background-size: 20px; }
        .badge { padding: 8px 16px; border-radius: 14px; font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
        .badge-pending { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); }
        .badge-online { background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.95); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(15px); padding: 20px; }
        .modal-content { background: #1e293b; width: 100%; max-width: 400px; max-height: 85vh; border-radius: 35px; padding: 35px; border: 1px solid rgba(255,255,255,0.1); overflow-y: auto; position: relative; box-shadow: 0 30px 60px rgba(0,0,0,0.6); }
        .log-item { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 20px 0; display: flex; justify-content: space-between; align-items: center; }
        .label-visible { color: #94a3b8; font-size: 0.75rem; font-weight: 800; margin-bottom: 12px; display: block; letter-spacing: 1.5px; text-transform: uppercase; }
        .fade-in { animation: fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pulse { animation: pulseAnim 2s infinite; }
        @keyframes pulseAnim { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }

        /* Pro Update Modal Styles */
        .update-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.98); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); padding: 25px; }
        .update-card { background: linear-gradient(145deg, #1e293b, #0f172a); width: 100%; max-width: 350px; border-radius: 40px; padding: 40px 30px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; box-shadow: 0 40px 100px rgba(0,0,0,0.8); }
        .update-icon { fontSize: 5rem; marginBottom: 25px; display: block; filter: drop-shadow(0 0 20px #3b82f6); }
        .version-text { color: #3b82f6; font-weight: 900; fontSize: 0.8rem; letterSpacing: 2px; background: rgba(59, 130, 246, 0.1); padding: 8px 15px; border-radius: 12px; display: inline-block; marginBottom: 20px; }
        .update-notes { color: #94a3b8; fontSize: 0.9rem; lineHeight: 1.6; marginBottom: 35px; background: rgba(255,255,255,0.03); padding: 20px; border-radius: 20px; text-align: left; }
        .update-btn { background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; border: none; padding: 22px; border-radius: 25px; font-weight: 900; width: 100%; fontSize: 1.1rem; letterSpacing: 1px; cursor: pointer; box-shadow: 0 15px 35px rgba(59, 130, 246, 0.4); transition: 0.3s; }
        .update-btn:active { transform: scale(0.95); }
      `}</style>

      {/* TOP HEADER */}
      {updateAvailable && (
        <div className="update-overlay fade-in">
           <div className="update-card slide-up">
              <span className="update-icon">🚀</span>
              <h2 style={{fontSize: '1.8rem', fontWeight: '900', color: '#fff', marginBottom: '10px'}}>Upgrade Available</h2>
              <div className="version-text">V{updateAvailable.version}</div>
              <div className="update-notes">
                 <div style={{fontWeight:'800', color:'#fff', marginBottom:'5px'}}>What's New:</div>
                 {updateAvailable.notes || 'Performance enhancements and critical stability updates for your enterprise attendance system.'}
              </div>
              <button
                className="update-btn"
                onClick={() => window.open(updateAvailable.downloadUrl, '_blank')}
              >
                INSTALL UPDATE
              </button>
           </div>
        </div>
      )}
      <div style={{textAlign: 'center', padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '25px'}}>
          <div style={{fontSize: '0.65rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '10px'}}>Official Attendance Hub</div>
          <h1 style={{fontSize: '1.6rem', margin: 0, fontWeight: '900', color: '#fff', letterSpacing: '1px'}}>
             {tenantInfo && tenantInfo.companyName ? tenantInfo.companyName.toUpperCase() : 'TIMEKEY HUB'}
          </h1>
      </div>

      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '25px'}} onDoubleClick={handleUpdateServer}>
        <div>
          <div style={{fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '1.5px', fontWeight: '800'}}>SYSTEM STATUS</div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px'}}>
            <div style={{width: '12px', height: '12px', borderRadius: '50%', background: isServerDown ? '#ef4444' : '#10b981', boxShadow: isServerDown ? '0 0 12px #ef4444' : '0 0 12px #10b981'}}></div>
            <span style={{fontSize: '0.9rem', fontWeight: '900', color: isServerDown ? '#fca5a5' : '#34d399', letterSpacing: '0.5px'}}>{isServerDown ? 'OFFLINE' : 'ONLINE'}</span>
          </div>
        </div>
        <div style={{textAlign: 'right'}}>
          <div style={{fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '1.5px', fontWeight: '800'}}>QUEUE</div>
          <div style={{marginTop: '6px'}}>
            <span className={`badge ${pendingLogs.length > 0 ? 'badge-pending' : 'badge-online'}`}>
               {pendingLogs.length} Records
            </span>
          </div>
        </div>
      </header>

      {!loggedIn ? (
        <div className="glass-card fade-in" style={{padding: '50px 30px'}}>
          <div style={{textAlign: 'center', marginBottom: '45px'}}>
             <div style={{fontSize: '5.5rem', marginBottom: '20px', filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.4))'}} className="pulse">🛡️</div>
             <h1 style={{fontSize: '2rem', margin: 0, fontWeight: '900', color: '#fff', letterSpacing: '0.5px'}}>Security Hub</h1>
             <p style={{color: '#94a3b8', fontSize: '1rem', marginTop: '8px', fontWeight: '500'}}>Identity Verification Required</p>
          </div>

          <div className="form-group">
            <span className="label-visible">EMPLOYEE IDENTIFICATION</span>
            <input
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="Enter ID (e.g. 0001)"
              className="input-field"
              style={{textAlign: 'center', fontSize: '1.4rem', letterSpacing: '3px', fontWeight: '900'}}
            />
          </div>

          <button onClick={login} disabled={loading} className="btn-primary" style={{marginTop: '15px', padding: '22px'}}>
            {loading ? 'VERIFYING IDENTITY...' : 'SIGN IN TO SYSTEM'}
          </button>
        </div>
      ) : (
        <div className="glass-card fade-in">
          <div style={{display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '35px', background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.05)'}}>
            <div style={{width: '70px', height: '70px', borderRadius: '22px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', boxShadow: '0 10px 25px rgba(37, 99, 235, 0.4)'}}>👤</div>
            <div>
              <span className="label-visible" style={{marginBottom: '4px'}}>WELCOME BACK</span>
              <div style={{fontSize: '1.5rem', fontWeight: '900', color: '#fff', letterSpacing: '0.5px'}}>{localStorage.getItem('cached_name')}</div>
            </div>
          </div>

          <div className="form-group" style={{marginBottom: '30px'}}>
            <span className="label-visible">SELECT WORK LOCATION</span>
            <select
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
              className="input-field"
              style={{marginBottom: 0, cursor: 'pointer', fontWeight: '700'}}
            >
              <option value="" style={{color: '#000'}}>-- Select Office/Branch --</option>
              {departments.map(d => <option key={d.departmentId} value={d.departmentId} style={{color: '#000'}}>{d.name}</option>)}
            </select>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px'}}>
            <button
              onClick={() => recordAttendance('IN')}
              disabled={loading}
              style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: '28px', fontWeight: '900', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '30px 10px', transition: '0.3s', boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)'}}
              className="btn-hover"
            >
              <span style={{fontSize: '2.5rem', filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.3))'}}>📥</span>
              <span style={{letterSpacing: '1.5px', fontSize: '1rem'}}>TIME IN</span>
            </button>
            <button
              onClick={() => recordAttendance('OUT')}
              disabled={loading}
              style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', borderRadius: '28px', fontWeight: '900', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '30px 10px', transition: '0.3s', boxShadow: '0 10px 25px rgba(245, 158, 11, 0.3)'}}
              className="btn-hover"
            >
              <span style={{fontSize: '2.5rem', filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.3))'}}>📤</span>
              <span style={{letterSpacing: '1.5px', fontSize: '1rem'}}>TIME OUT</span>
            </button>
          </div>

          {selectedDepartment && departments.find(d => d.departmentId === selectedDepartment) && (
            <div className="fade-in" style={{fontSize: '0.9rem', color: '#60a5fa', marginBottom: '30px', textAlign: 'center', background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '22px', border: '2px dashed rgba(59, 130, 246, 0.4)', fontWeight: '800'}}>
              <div style={{marginBottom: '5px'}}>📍 {departments.find(d => d.departmentId === selectedDepartment).name}</div>
              <div style={{fontSize: '0.7rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px'}}>
                Geofence Active: {departments.find(d => d.departmentId === selectedDepartment).radiusMeters || 50}m Radius
              </div>
            </div>
          )}

          <button
            onClick={() => { syncSystemData(); setShowLogsModal(true); }}
            style={{width: '100%', padding: '22px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '2px solid rgba(59, 130, 246, 0.3)', borderRadius: '22px', fontWeight: '900', marginBottom: '25px', cursor:'pointer', fontSize: '1rem', letterSpacing: '1px', transition: '0.3s'}}
          >
            📋 VIEW ACTIVITY HISTORY
          </button>

          <button onClick={() => {if(confirm('Logout of this account?')){setLoggedIn(false); localStorage.removeItem('cached_id'); localStorage.removeItem('cached_name'); window.location.reload();}}} style={{width: '100%', padding: '15px', background: 'transparent', color: '#64748b', border: 'none', borderRadius: '15px', fontSize: '0.8rem', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase'}}>Logout Account</button>
        </div>
      )}

      {/* LOGS MODAL */}
      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px'}}>
               <h2 style={{marginTop:0, fontSize: '1.6rem', color: '#60a5fa', fontWeight: '900', margin: 0}}>Personal Logs</h2>
               <button onClick={() => setShowLogsModal(false)} style={{background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', width: '40px', height: '40px', borderRadius: '50%', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer'}}>✕</button>
            </div>

            <div style={{marginBottom: '20px', padding: '15px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '18px', border: '1px solid rgba(59, 130, 246, 0.2)'}}>
               <div style={{fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px'}}>Logged in as</div>
               <div style={{fontWeight: '900', color: '#fff', fontSize: '1.3rem', marginTop: '2px'}}>{localStorage.getItem('cached_name')}</div>
               <div style={{fontSize: '0.8rem', color: '#60a5fa', fontWeight: '900', marginTop: '4px'}}>ID: {localStorage.getItem('cached_id')}</div>
            </div>

            <div style={{margin: '0 0 35px 0'}}>
               {personalLogs.length === 0 ? (
                 <div style={{textAlign: 'center', color: '#475569', padding: '50px 0'}}>
                    <div style={{fontSize: '4rem', marginBottom: '15px'}}>📅</div>
                    <p style={{fontWeight: '800', fontSize: '1.1rem'}}>No history recorded yet.</p>
                 </div>
               ) : (
                 Object.entries(
                   personalLogs.slice().reverse().reduce((acc, log) => {
                     const dateKey = new Date(log.timestamp).toLocaleDateString();
                     if (!acc[dateKey]) acc[dateKey] = [];
                     acc[dateKey].push(log);
                     return acc;
                   }, {})
                 ).slice(0, 10).map(([date, dayLogs], i) => (
                   <div key={i} style={{marginBottom: '25px'}}>
                     <div style={{fontSize: '0.75rem', color: '#3b82f6', fontWeight: '900', marginBottom: '12px', background: 'rgba(59, 130, 246, 0.08)', padding: '8px 15px', borderRadius: '12px', display: 'inline-block', letterSpacing: '0.5px'}}>
                       🗓️ {date}
                     </div>
                     {dayLogs.map((l, j) => (
                       <div key={j} className="log-item" style={{marginLeft: '15px'}}>
                         <div>
                           <div style={{fontWeight:'900', fontSize:'1rem', color: '#fff'}}>{l.departmentName}</div>
                           <div style={{fontSize:'0.75rem', color:'#94a3b8', marginTop: '4px', fontWeight: '600'}}>
                             {l.timeIn && `IN: ${new Date(l.timeIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`}
                             {l.timeIn && l.timeOut && `  •  `}
                             {l.timeOut && `OUT: ${new Date(l.timeOut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`}
                           </div>
                         </div>
                         <span style={{
                           fontSize: '0.65rem',
                           fontWeight: '900',
                           padding: '6px 12px',
                           borderRadius: '12px',
                           background: l.status === 'Completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                           color: l.status === 'Completed' ? '#34d399' : '#60a5fa',
                           border: `1px solid ${l.status === 'Completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                           textTransform: 'uppercase'
                         }}>
                           {l.status}
                         </span>
                       </div>
                     ))}
                   </div>
                 ))
               )}
            </div>
            <button className="btn-primary" onClick={() => setShowLogsModal(false)} style={{padding: '20px'}}>CLOSE HISTORY</button>
          </div>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 0, left: 0, right: 0, padding: '20px', textAlign: 'center', fontSize: '0.7rem', color: '#475569', background: 'linear-gradient(to top, #0f172a 80%, transparent)', zIndex: 100}}>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
           <span style={{width: '10px', height: '10px', borderRadius: '50%', background: status.includes('✓') || status.includes('Online') ? '#10b981' : '#f59e0b', boxShadow: status.includes('✓') || status.includes('Online') ? '0 0 10px #10b981' : '0 0 10px #f59e0b', display: 'inline-block'}}></span>
           <span style={{fontWeight: '900', letterSpacing: '1px', color: '#64748b'}}>{status.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
