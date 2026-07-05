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
  const [apiUrl] = useState(() => appConfig.defaultApiUrl || 'https://timeattendance-system.onrender.com/api');
  const [tenantId, setTenantId] = useState(localStorage.getItem('tenant_id') || null);
  const [setupId, setSetupId] = useState('');
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('cached_id') || '');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState(initialData.departments || []);
  const [selectedDept, setSelectedDept] = useState('');
  const [tenantInfo, setTenantInfo] = useState(null);

  useEffect(() => {
    if (tenantId) {
       fetch(`${apiUrl}/tenant-info/${tenantId}`).then(r => r.json()).then(d => setTenantInfo(d)).catch(e=>{});
       fetch(`${apiUrl}/departments`, { headers: { 'x-tenant-id': tenantId } }).then(r => r.json()).then(d => setDepartments(d)).catch(e=>{});
    }
  }, [tenantId]);

  const handleSetup = async () => {
    if (!setupId.trim()) return alert('Enter Company ID');
    setLoading(true);
    const res = await fetchJson(`${apiUrl}/tenant-info/${setupId.trim()}`);
    if (res.ok) {
      localStorage.setItem('tenant_id', setupId.trim());
      setTenantId(setupId.trim());
    } else { alert('Invalid ID or Server Offline'); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!employeeId.trim()) return alert('Enter ID');
    setLoading(true);
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
    setLoading(false);
  };

  const doTime = async (type) => {
    if (!selectedDept) return alert('Select Branch');
    const dept = departments.find(d => d.departmentId === selectedDept);
    setLoading(true);
    try {
      const pos = await Geolocation.getCurrentPosition();
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
      if (dist > (dept.radiusMeters || 100)) return alert(`Too far! ${Math.round(dist)}m away.`);
      const res = await fetchJson(`${apiUrl}/timein`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify({ employeeId, employeeName: localStorage.getItem('cached_name'), departmentId: selectedDept, departmentName: dept.name, type, timestamp: new Date().toISOString(), tenantId })
      });
      if (res.ok) alert('SUCCESS ✓'); else alert('FAILED to save');
    } catch (e) { alert('GPS Error or Connection issue'); }
    setLoading(false);
  };

  return (
    <div style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'system-ui, sans-serif'}}>
      <style>{`
        .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); padding: 30px; border-radius: 25px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
        .btn { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 15px; font-weight: 800; cursor: pointer; width: 100%; margin-top: 15px; text-transform: uppercase; letter-spacing: 1px; }
        .inp { width: 100%; padding: 15px; border-radius: 15px; border: 1px solid #334155; background: #0f172a; color: white; text-align: center; font-size: 1.2rem; box-sizing: border-box; }
      `}</style>

      <div style={{textAlign: 'center', marginBottom: '30px'}}>
        <div style={{fontSize: '0.6rem', color: '#3b82f6', letterSpacing: '4px'}}>ATTENDANCE HUB</div>
        <h1 style={{fontSize: '1.5rem', margin: '5px 0'}}>{tenantInfo?.companyName?.toUpperCase() || 'TIMEKEY'}</h1>
      </div>

      {!tenantId ? (
        <div className="glass" style={{marginTop: '50px', textAlign: 'center'}}>
          <div style={{fontSize: '4rem', marginBottom: '15px'}}>🌐</div>
          <h2>System Setup</h2>
          <input value={setupId} onChange={e => setSetupId(e.target.value)} placeholder="ENTER COMPANY ID" className="inp" />
          <button onClick={handleSetup} className="btn">{loading ? 'LINKING...' : 'ACTIVATE'}</button>
        </div>
      ) : !loggedIn ? (
        <div className="glass" style={{marginTop: '50px', textAlign: 'center'}}>
          <div style={{fontSize: '4rem', marginBottom: '15px'}}>🛡️</div>
          <h2>Security Login</h2>
          <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="EMPLOYEE ID" className="inp" />
          <button onClick={handleLogin} className="btn">{loading ? 'VERIFYING...' : 'SIGN IN'}</button>
          <div style={{marginTop: '20px', color: '#64748b', fontSize: '0.8rem'}}>Company ID: {tenantId}</div>
        </div>
      ) : (
        <div className="glass" style={{marginTop: '30px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px'}}>
            <div style={{fontSize: '2rem'}}>👤</div>
            <div><div style={{fontSize: '0.7rem', color: '#94a3b8'}}>WELCOME BACK</div><div style={{fontWeight: '900', fontSize: '1.1rem'}}>{localStorage.getItem('cached_name')}</div></div>
          </div>

          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="inp" style={{fontSize: '1rem', marginBottom: '20px'}}>
            <option value="">-- SELECT BRANCH --</option>
            {departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
          </select>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
            <button onClick={() => doTime('IN')} className="btn" style={{background: '#10b981', padding: '25px 0'}}>IN</button>
            <button onClick={() => doTime('OUT')} className="btn" style={{background: '#f59e0b', padding: '25px 0'}}>OUT</button>
          </div>

          <button onClick={() => {localStorage.clear(); window.location.reload();}} style={{marginTop: '50px', width: '100%', background: 'transparent', color: '#64748b', border: 'none', fontSize: '0.8rem', fontWeight: 'bold'}}>LOGOUT ACCOUNT</button>
        </div>
      )}

      <div style={{position: 'fixed', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: '0.6rem', color: '#475569'}}>
        BUILD: V{appConfig.version} | STABLE SaaS CLOUD ACTIVE
      </div>
    </div>
  );
}
export default App;
