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
       fetch(`${apiUrl}/departments`, { headers: { 'x-tenant-id': tenantId } }).then(r => r.json()).then(d => {
         if (Array.isArray(d)) setDepartments(d);
       }).catch(e=>{});
    }
  }, [tenantId]);

  const handleSetup = async () => {
    if (!setupId.trim()) return alert('Enter Company ID');
    setLoading(true);
    const res = await fetchJson(`${apiUrl}/tenant-info/${setupId.trim()}`);
    if (res.ok) {
      localStorage.setItem('tenant_id', setupId.trim());
      setTenantId(setupId.trim());
      window.location.reload();
    } else { alert('Invalid ID or Offline'); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!employeeId.trim()) return alert('Enter ID');
    setLoading(true);
    try {
      const idInfo = await Device.getId();
      const res = await postJson(`${apiUrl}/device/register`, { employeeId, deviceId: idInfo.identifier }, { 'x-tenant-id': tenantId });
      if (res.status === 200) {
        localStorage.setItem('cached_id', employeeId);
        localStorage.setItem('cached_name', res.data.employee.name);
        setLoggedIn(true);
      } else { alert(res.data?.error || 'Login Failed'); }
    } catch (e) { alert('Offline access limited'); }
    setLoading(false);
  };

  const postJson = async (url, body, headers = {}) => {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  };

  return (
    <div style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif'}}>
      <div style={{textAlign: 'center', marginBottom: '30px'}}>
        <h1 style={{fontSize: '1.8rem', color: '#3b82f6', margin: 0}}>TIMEKEY</h1>
        <p style={{fontSize: '0.7rem', color: '#64748b', letterSpacing: '2px'}}>{tenantInfo?.companyName?.toUpperCase() || 'SaaS TERMINAL'}</p>
      </div>

      {!tenantId ? (
        <div style={{background: 'rgba(30, 41, 59, 0.8)', padding: '30px', borderRadius: '20px', textAlign: 'center', border: '1px solid #334155'}}>
          <div style={{fontSize: '4rem', marginBottom: '15px'}}>🌐</div>
          <h2>Activate Terminal</h2>
          <input value={setupId} onChange={e => setSetupId(e.target.value)} placeholder="Company ID" style={{width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #3b82f6', background: '#0f172a', color: 'white', textAlign: 'center', marginBottom: '20px', fontSize: '1.2rem'}} />
          <button onClick={handleSetup} style={{width: '100%', padding: '18px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold'}}>{loading ? 'WAIT...' : 'ACTIVATE'}</button>
        </div>
      ) : !loggedIn ? (
        <div style={{background: 'rgba(30, 41, 59, 0.8)', padding: '30px', borderRadius: '20px', border: '1px solid #334155'}}>
          <h2 style={{textAlign: 'center'}}>Login</h2>
          <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="Employee ID" style={{width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #334155', background: '#0f172a', color: 'white', textAlign: 'center', marginBottom: '20px'}} />
          <button onClick={handleLogin} style={{width: '100%', padding: '18px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold'}}>SIGN IN</button>
          <button onClick={()=>{localStorage.clear(); window.location.reload();}} style={{width: '100%', marginTop: '20px', background: 'transparent', color: '#64748b', border: 'none', fontSize: '0.7rem'}}>Reset Device</button>
        </div>
      ) : (
        <div style={{background: 'rgba(30, 41, 59, 0.8)', padding: '30px', borderRadius: '20px', border: '1px solid #334155'}}>
          <p>Welcome, <b>{localStorage.getItem('cached_name')}</b></p>
          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} style={{width: '100%', padding: '15px', borderRadius: '12px', background: '#0f172a', color: 'white', marginBottom: '20px'}}>
             <option value="">-- SELECT BRANCH --</option>
             {Array.isArray(departments) && departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
          </select>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
             <button onClick={() => alert('IN logic ready')} style={{padding: '25px', background: '#10b981', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 'bold'}}>IN</button>
             <button onClick={() => alert('OUT logic ready')} style={{padding: '25px', background: '#f59e0b', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 'bold'}}>OUT</button>
          </div>
          <button onClick={()=>{localStorage.clear(); window.location.reload();}} style={{width: '100%', marginTop: '50px', background: 'transparent', color: '#ef4444', border: 'none', fontSize: '0.8rem'}}>LOGOUT</button>
        </div>
      )}

      <div style={{position: 'fixed', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: '0.6rem', color: '#475569'}}>
        V{appConfig.version} | SaaS CLOUD SECURE
      </div>
    </div>
  );
}
export default App;
