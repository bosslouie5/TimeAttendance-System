import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import initialData from './initial_data.json';
import appConfig from './app_config.json';
import './styles.css';

async function fetchJson(url, options = {}) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    return { status: response.status, ok: response.ok, data };
  } catch (err) { return { status: 0, ok: false, data: err.message }; }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * (Math.PI / 180);
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function App() {
  const [apiUrl] = useState(() => {
    const saved = localStorage.getItem('server_url');
    if (saved) return saved;
    return appConfig.defaultApiUrl || 'https://timeattendance-system.onrender.com/api';
  });

  const [tenantId, setTenantId] = useState(() => {
    const saved = localStorage.getItem('tenant_id');
    if (saved) return saved;
    const cfgId = appConfig.defaultTenantId;
    if (cfgId && !["/", "master", "MASTER_UNIVERSAL"].includes(cfgId)) return cfgId;
    return null;
  });

  const [setupId, setSetupId] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('cached_id') || '');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('all_departments')) || initialData.departments; } catch (e) { return initialData.departments; }
  });
  const [selectedDept, setSelectedDept] = useState('');
  const [pendingLogs, setPendingLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pending_logs')) || []; } catch (e) { return []; }
  });
  const [tenantInfo, setTenantInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tenant_info')) || null; } catch (e) { return null; }
  });
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [status, setStatus] = useState('System Online');

  useEffect(() => {
    if (tenantId) {
      fetchTenantData();
      const interval = setInterval(syncPending, 15000);
      return () => clearInterval(interval);
    }
  }, [tenantId]);

  const fetchTenantData = async () => {
    const res = await fetchJson(`${apiUrl}/tenant-info/${tenantId}`);
    if (res.ok) {
      setTenantInfo(res.data);
      localStorage.setItem('tenant_info', JSON.stringify(res.data));
    }
    const dRes = await fetchJson(`${apiUrl}/departments`, { headers: { 'x-tenant-id': tenantId } });
    if (dRes.ok) {
      setDepartments(dRes.data);
      localStorage.setItem('all_departments', JSON.stringify(dRes.data));
    }
  };

  const syncPending = async () => {
    const logs = JSON.parse(localStorage.getItem('pending_logs') || '[]');
    if (logs.length === 0) return;
    for (const log of logs) {
      const res = await fetchJson(`${apiUrl}/timein`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify(log)
      });
      if (res.ok) {
        const remaining = logs.filter(l => l.timestamp !== log.timestamp);
        localStorage.setItem('pending_logs', JSON.stringify(remaining));
        setPendingLogs(remaining);
      }
    }
  };

  const handleSetup = async () => {
    if (!setupId.trim()) return alert('Enter Company ID');
    setIsSettingUp(true);
    const res = await fetchJson(`${apiUrl}/tenant-info/${setupId.trim()}`);
    if (res.ok && res.data) {
      localStorage.setItem('tenant_id', setupId.trim());
      setTenantId(setupId.trim());
      setTenantInfo(res.data);
    } else { alert('Invalid ID'); }
    setIsSettingUp(false);
  };

  const handleLogin = async () => {
    if (!employeeId.trim()) return alert('Enter ID');
    setLoading(true);
    try {
      const idInfo = await Device.getId();
      const res = await fetchJson(`${apiUrl}/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify({ employeeId, deviceId: idInfo.identifier })
      });
      if (res.status === 200) {
        localStorage.setItem('cached_id', employeeId);
        localStorage.setItem('cached_name', res.data.employee.name);
        setLoggedIn(true);
      } else { alert(res.data?.error || 'Login Failed'); }
    } catch (e) { alert('Offline Login Failed'); }
    setLoading(false);
  };

  const recordAttendance = async (type) => {
    if (!selectedDept) return alert('Select Branch');
    const dept = departments.find(d => d.departmentId === selectedDept);
    setLoading(true);
    try {
      const pos = await Geolocation.getCurrentPosition();
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
      if (dist > (dept.radiusMeters || 50)) return alert(`Too far! ${Math.round(dist)}m`);
      const log = { employeeId, employeeName: localStorage.getItem('cached_name'), departmentId: selectedDept, departmentName: dept.name, type, timestamp: new Date().toISOString(), tenantId };
      const res = await fetchJson(`${apiUrl}/timein`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify(log) });
      if (res.ok) { alert('Success!'); } else { throw new Error(); }
    } catch (e) {
      const logs = [...pendingLogs, { employeeId, type, timestamp: new Date().toISOString() }];
      localStorage.setItem('pending_logs', JSON.stringify(logs));
      setPendingLogs(logs);
      alert('Offline Log Saved');
    }
    setLoading(false);
  };

  return (
    <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '10px 15px', fontFamily: 'system-ui, sans-serif'}}>
      <style>{`
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(15px); padding: 30px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 20px; font-weight: 800; width: 100%; cursor: pointer; }
        .input-field { width: 100%; padding: 18px; margin-bottom: 20px; border-radius: 20px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.6); color: white; font-size: 1.1rem; box-sizing: border-box; }
        .fade-in { animation: fadeIn 0.6s forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{textAlign: 'center', padding: '20px 0'}}>
        <div style={{fontSize: '0.6rem', color: '#3b82f6', letterSpacing: '3px', fontWeight: '900'}}>OFFICIAL ATTENDANCE HUB</div>
        <h1 style={{fontSize: '1.8rem', margin: '5px 0'}}>{tenantInfo?.companyName?.toUpperCase() || 'TIMEKEY HUB'}</h1>
      </div>

      {!tenantId ? (
        <div className="glass-card fade-in" style={{marginTop: '40px', textAlign: 'center'}}>
           <div style={{fontSize: '5rem', marginBottom: '20px'}}>🌐</div>
           <h2>System Setup</h2>
           <p style={{color: '#94a3b8', marginBottom: '30px'}}>Enter Company ID to activate terminal.</p>
           <input value={setupId} onChange={e => setSetupId(e.target.value)} placeholder="e.g. 571044" className="input-field" style={{textAlign: 'center', fontSize: '1.5rem'}} />
           <button onClick={handleSetup} disabled={isSettingUp} className="btn-primary">ACTIVATE TERMINAL</button>
        </div>
      ) : !loggedIn ? (
        <div className="glass-card fade-in" style={{marginTop: '20px'}}>
           <div style={{textAlign: 'center', marginBottom: '30px'}}><div style={{fontSize: '4rem'}}>🛡️</div><h3>Security Login</h3></div>
           <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="Employee ID" className="input-field" style={{textAlign: 'center'}} />
           <button onClick={handleLogin} disabled={loading} className="btn-primary">SIGN IN</button>
        </div>
      ) : (
        <div className="glass-card fade-in" style={{marginTop: '10px'}}>
           <div style={{background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '20px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '15px'}}>
              <div style={{fontSize: '2rem'}}>👤</div>
              <div><div style={{fontSize: '0.7rem', color: '#94a3b8'}}>WELCOME BACK</div><div style={{fontWeight: '900'}}>{localStorage.getItem('cached_name')}</div></div>
           </div>
           <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="input-field">
              <option value="">-- Select Office Branch --</option>
              {departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
           </select>
           <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
              <button onClick={() => recordAttendance('IN')} className="btn-primary" style={{background: '#10b981', padding: '30px 10px'}}>IN</button>
              <button onClick={() => recordAttendance('OUT')} className="btn-primary" style={{background: '#f59e0b', padding: '30px 10px'}}>OUT</button>
           </div>
           <button onClick={() => {localStorage.clear(); window.location.reload();}} style={{marginTop: '40px', width: '100%', background: 'transparent', color: '#64748b', border: 'none', fontSize: '0.7rem'}}>LOGOUT ACCOUNT</button>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 15, left: 0, right: 0, textAlign: 'center', fontSize: '0.6rem', color: '#475569'}}>
        STATUS: {status} | V{appConfig.version} | {pendingLogs.length} QUEUED
      </footer>
    </div>
  );
}
export default App;
