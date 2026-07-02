import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import initialData from './initial_data.json';
import appConfig from './app_config.json';

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

    // Priority: If app was JUST installed via "Install & Open on Device",
    // and it's a local testing URL, we should prioritize it over a stale SaaS link.
    const isLocalBuild = appConfig.defaultApiUrl && (appConfig.defaultApiUrl.includes('127.0.0.1') || appConfig.defaultApiUrl.includes('localhost'));

    if (isLocalBuild && isNative) {
       // Check if we should override saved SaaS link
       if (saved && saved.includes('trycloudflare.com')) {
          console.log("Local Build detected. Overriding SaaS link for testing.");
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
  const [status, setStatus] = useState('Ready');
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingLogs, setPendingLogs] = useState(JSON.parse(localStorage.getItem('pending_logs')) || []);
  const [isServerDown, setIsServerDown] = useState(false);

  useEffect(() => {
    checkConnection();
    const connInterval = setInterval(checkConnection, 20000); // Check every 20s

    if (!localStorage.getItem('all_employees')) {
      localStorage.setItem('all_employees', JSON.stringify(initialData.employees));
      localStorage.setItem('all_departments', JSON.stringify(initialData.departments));
    }

    return () => clearInterval(connInterval);
  }, []);

  useEffect(() => {
    const syncTimer = setInterval(() => {
      attemptSync();
    }, 10000);
    return () => clearInterval(syncTimer);
  }, [apiUrl, tenantId, isSyncing]);

  const attemptSync = async (forcedLogs = null) => {
    if (isSyncing) return;
    const currentLogs = forcedLogs || JSON.parse(localStorage.getItem('pending_logs') || '[]');
    if (currentLogs.length === 0) return;

    setIsSyncing(true);
    const logsToSync = [...currentLogs];
    let successCount = 0;

    for (const log of logsToSync) {
      try {
        const response = await postJson(
          `${apiUrl}/timein`,
          { ...log, tenantId },
          { 'x-tenant-id': tenantId }
        );
        if (response.status === 200) successCount++;
        else break;
      } catch (e) { break; }
    }

    if (successCount > 0) {
      const latestFromStorage = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      const remaining = latestFromStorage.slice(successCount);
      setPendingLogs(remaining);
      localStorage.setItem('pending_logs', JSON.stringify(remaining));
      setStatus(forcedLogs ? `Synced immediately! ✓` : `Auto-synced ${successCount} records!`);
    }
    setIsSyncing(false);
  };

  const checkConnection = async () => {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/settings`, { timeout: 3000 });
      if (res.ok) setIsServerDown(false);
      else throw new Error('Unreachable');
    } catch (e) {
      console.log('Connection lost, attempting Auto-Healing...');
      setIsServerDown(true);
      discoverNewLink();
    }
  };

  const discoverNewLink = async () => {
    // We add ?poll=1&last=1 to get the most recent broadcasted message
    const REGISTRY_URL = 'https://ntfy.sh/attendance_hub_60003078_active_link/raw?poll=1&last=1';

    setStatus('🔍 Checking for system updates...');
    try {
      const res = await fetch(REGISTRY_URL);
      if (res.ok) {
        const text = await res.text();
        // ntfy can return multiple lines, get the last non-empty one
        const lines = text.trim().split('\n');
        const newUrl = lines[lines.length - 1];

        if (newUrl && newUrl.includes('trycloudflare.com')) {
          const formatted = newUrl.endsWith('/api') ? newUrl : `${newUrl}/api`;

          if (formatted !== apiUrl) {
            console.log(`[HEAL] New system link found: ${formatted}`);
            setApiUrl(formatted);
            localStorage.setItem('server_url', formatted);
            setIsServerDown(false);
            setStatus('System Updated! ✓');
            alert('SYSTEM UPDATE: Nahanap na ang bagong server link. Pwede ka na ulit mag-sign in.');
          } else {
            setStatus('Server is still starting up...');
          }
        }
      }
    } catch (err) {
      console.log('[HEAL] Update check failed.');
    }
  };

  const handleUpdateServer = () => {
    const newUrl = prompt('I-paste ang bagong Server Link mula sa iyong Admin:', apiUrl);
    if (newUrl) {
      const formatted = newUrl.endsWith('/api') ? newUrl : `${newUrl}/api`;
      setApiUrl(formatted);
      localStorage.setItem('server_url', formatted);
      window.location.reload();
    }
  };

  const switchToLocal = () => {
    const localUrl = 'http://127.0.0.1:4002/api';
    setApiUrl(localUrl);
    localStorage.setItem('server_url', localUrl);
    window.location.reload();
  };

  if (isServerDown && !loggedIn) {
    return (
      <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '40px 20px', textAlign: 'center'}}>
        <div style={{fontSize: '4rem', marginBottom: '20px'}}>📡</div>
        <h1 style={{fontSize: '1.5rem', marginBottom: '10px'}}>Offline / Server Unreachable</h1>
        <p style={{color: '#64748b', marginBottom: '30px'}}>
          Hindi ma-reach ang server. <br/>
          Siguraduhing naka-ON ang system sa laptop at tama ang Server Link.
        </p>

        <div className="card" style={{background: '#1e293b', padding: '20px', borderRadius: '15px', border: '1px solid #334155'}}>
          <div style={{marginBottom: '20px', textAlign: 'left', fontSize: '0.8rem'}}>
            <p style={{color: '#94a3b8', margin: '0 0 5px 0'}}>Current API Link:</p>
            <code style={{display: 'block', background: '#0f172a', padding: '10px', borderRadius: '6px', color: '#10b981', wordBreak: 'break-all'}}>
              {apiUrl}
            </code>
          </div>

          <button onClick={handleUpdateServer} style={{width: '100%', padding: '15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginBottom: '10px'}}>
            Update Connection Link
          </button>

          <button onClick={() => window.open(apiUrl.replace('/api', ''), '_blank')} style={{width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid #334155', borderRadius: '10px', fontSize: '0.8rem', marginBottom: '10px'}}>
            Open Link in Browser (Bypass Tunnel Warning)
          </button>

          <button onClick={discoverNewLink} style={{width: '100%', padding: '15px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '10px', fontWeight:'bold', marginBottom: '10px'}}>
            ✨ Check for System Update
          </button>

          {(!apiUrl.includes('127.0.0.1') && !apiUrl.includes('localhost')) && (
            <button onClick={switchToLocal} style={{width: '100%', padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight:'bold', marginBottom: '10px'}}>
              🔌 Use Local Dev (USB Mode)
            </button>
          )}

          <button onClick={() => window.location.reload()} style={{width: '100%', padding: '10px', background: 'transparent', color: '#64748b', border: 'none'}}>
            🔄 Try Again
          </button>
        </div>

        <div style={{marginTop: '30px', fontSize: '0.7rem', color: '#475569', textAlign: 'left'}}>
          <strong>TIPS:</strong>
          <ul style={{paddingLeft: '15px', marginTop: '5px'}}>
            <li>Kung <strong>Localtunnel</strong> gamit mo, i-click ang "Open Link in Browser" at i-click ang <strong>Click to Continue</strong> button doon.</li>
            <li>Siguraduhin na parehong may internet ang laptop at phone.</li>
            <li>Kung naka-USB cable, siguraduhing ni-run mo ang <strong>DEV_TOOLS.bat</strong> Option 1.</li>
          </ul>
        </div>
      </div>
    );
  }

  const syncSystemData = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setStatus('Syncing...');
    try {
      const headers = { 'x-tenant-id': tenantId };
      const currentEmpId = employeeId || localStorage.getItem('cached_id');

      const [empRes, deptRes] = await Promise.all([
        getJson(`${apiUrl}/employees`, headers),
        getJson(`${apiUrl}/departments?employeeId=${currentEmpId}`, headers)
      ]);

      if (empRes.status === 200 && deptRes.status === 200) {
        localStorage.setItem('all_employees', JSON.stringify(empRes.data));
        localStorage.setItem('all_departments', JSON.stringify(deptRes.data));
        setStatus('Updated! ✓');
        setDepartments(deptRes.data);
      }
    } catch (e) { setStatus('Offline Mode'); }
    setIsSyncing(false);
  };

  const login = async () => {
    if (!employeeId.trim()) return setStatus('Enter Employee ID');
    setLoading(true);
    setStatus('Checking Identity...');

    const cleanId = employeeId.trim();

    // Check local cache first (Offline-First)
    const allEmployees = JSON.parse(localStorage.getItem('all_employees') || '[]');
    const cachedEmployee = allEmployees.find(e => e.employeeId === cleanId);

    try {
      const idInfo = await Device.getId();
      const devInfo = await Device.getInfo();

      // Try to register/verify with server (Online sync)
      const res = await postJson(
        `${apiUrl}/device/register`,
        { employeeId: cleanId, deviceId: idInfo.identifier, deviceName: `${devInfo.model}` },
        { 'x-tenant-id': tenantId }
      );

      if (res.status === 200) {
        const empData = res.data.employee;
        const actualTenantId = res.data.tenantId || tenantId;

        setLoggedIn(true);
        setTenantId(actualTenantId); // Update state to correct tenant

        localStorage.setItem('cached_id', empData.employeeId);
        localStorage.setItem('cached_name', empData.name);
        localStorage.setItem('tenant_id', actualTenantId); // Save actual tenantId

        setStatus('Ready!');
        setLoading(false);
        syncSystemData();
        return;
      }
    } catch (e) {
      console.log('Server unreachable, switching to local auth...');
    }

    // Fallback to local cache if server is down
    if (cachedEmployee) {
      setLoggedIn(true);
      localStorage.setItem('cached_id', cachedEmployee.employeeId);
      localStorage.setItem('cached_name', cachedEmployee.name);
      setStatus('Welcome (Offline Mode)');
    } else {
      alert('Kailangan mag-online sa unang login para ma-download ang Employee list.');
    }
    setLoading(false);
  };

  const recordAttendance = async (type) => {
    if (!selectedDepartment) return setStatus('Select Dept');
    const dept = departments.find(d => d.departmentId === selectedDepartment);
    if (!dept) return setStatus('Dept not found');

    setLoading(true);
    setStatus('📡 Finding your location...');

    let pos;
    try {
      // 1. GET GPS COORDINATES (Try High Accuracy first)
      pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    } catch (gpsError) {
      console.log('High accuracy failed, trying fallback...');
      try {
        // Fallback to network-based location
        pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000
        });
      } catch (err2) {
        setStatus('❌ GPS Error');
        alert('ERROR: Hindi makuha ang location. Siguraduhing naka-ON ang Location/GPS ng iyong phone.');
        setLoading(false);
        return;
      }
    }

    try {
      const userLat = pos.coords.latitude;
      const userLon = pos.coords.longitude;

      // 2. CALCULATE DISTANCE
      const dist = calculateDistance(userLat, userLon, dept.pinLatitude, dept.pinLongitude);
      const allowedRadius = dept.radiusMeters || 50;

      // 3. RADIUS CHECK (With Debug Info for the User)
      if (dist > allowedRadius) {
        setStatus('❌ Too Far');
        alert(`ACCESS DENIED!\n\nNasa ${Math.round(dist)}m ka mula sa ${dept.name}.\nDapat ay nasa loob ka ng ${allowedRadius}m.\n\nYour Pos: ${userLat.toFixed(4)}, ${userLon.toFixed(4)}\nDept Pos: ${dept.pinLatitude.toFixed(4)}, ${dept.pinLongitude.toFixed(4)}`);
        setLoading(false);
        return;
      }

      setStatus('🛰️ Sending to Server...');

      // 4. SEND TO SERVER
      const response = await postJson(
        `${apiUrl}/timein`,
        {
          employeeId,
          employeeName: localStorage.getItem('cached_name'),
          departmentId: selectedDepartment,
          departmentName: dept.name,
          type,
          timestamp: new Date().toISOString(),
          distanceMeters: Math.round(dist),
          tenantId
        },
        { 'x-tenant-id': tenantId }
      );

      if (response.status === 200) {
        setStatus(`Approved: ${type} ✓`);
        alert(`SUCCESS!\n\nAng iyong ${type} sa ${dept.name} ay matagumpay na na-record.`);
      } else {
        setStatus('❌ Server Rejected');
        alert('SERVER ERROR: ' + (response.data?.error || 'Unknown Error'));
      }
    } catch (connError) {
      console.error(connError);
      setStatus('❌ Connection Error');
      alert(`HINDI MAKA-CONNECT!\n\nURL: ${apiUrl}\n\nSiguraduhing naka-ON ang system sa laptop at tama ang Server Link.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container" style={{background: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px'}}>
      <header style={{textAlign: 'center', marginBottom: '30px'}} onDoubleClick={() => {
        const url = prompt('Server API:', apiUrl);
        if(url) { setApiUrl(url); localStorage.setItem('server_url', url); location.reload(); }
      }}>
        <div style={{fontSize: '0.7rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '5px'}}>WORKER PORTAL</div>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <p>{pendingLogs.length} unsynced</p>
          <button
            onClick={syncSystemData}
            disabled={isSyncing}
            style={{padding:'4px 8px', fontSize:'0.7rem', background:'rgba(59, 130, 246, 0.2)', border:'1px solid #3b82f6', color:'white', borderRadius:'6px'}}
          >
            {isSyncing ? '...' : 'Refresh'}
          </button>
        </div>
      </header>

      {!loggedIn ? (
        <div className="card" style={{background: '#1e293b', padding: '20px', borderRadius: '15px'}}>
          <h2 style={{fontSize: '1.2rem', marginBottom: '20px'}}>Employee Sign In</h2>
          <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="Employee ID" style={{width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: 'white'}} />
          <button onClick={login} disabled={loading} style={{width: '100%', padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold'}}>
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </div>
      ) : (
        <div className="card" style={{background: '#1e293b', padding: '20px', borderRadius: '15px'}}>
          <div style={{marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '10px'}}>
            <div style={{fontSize: '0.8rem', color: '#64748b'}}>Welcome,</div>
            <div style={{fontSize: '1.1rem', fontWeight: 'bold'}}>{localStorage.getItem('cached_name')}</div>
          </div>

          <select value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)} style={{width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px', background: '#0f172a', color: 'white', border: '1px solid #334155'}}>
            <option value="">Choose Department</option>
            {departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
          </select>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px'}}>
            <button onClick={() => recordAttendance('IN')} disabled={loading} style={{padding: '20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.2rem'}}>TIME IN</button>
            <button onClick={() => recordAttendance('OUT')} disabled={loading} style={{padding: '20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '1.2rem'}}>TIME OUT</button>
          </div>

          {selectedDepartment && departments.find(d => d.departmentId === selectedDepartment) && (
            <div style={{fontSize: '0.7rem', color: '#64748b', marginBottom: '15px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px'}}>
              📍 Dept Pos: {departments.find(d => d.departmentId === selectedDepartment).pinLatitude.toFixed(4)}, {departments.find(d => d.departmentId === selectedDepartment).pinLongitude.toFixed(4)}
              <br/>
              📏 Target Radius: {departments.find(d => d.departmentId === selectedDepartment).radiusMeters || 50}m
            </div>
          )}

          <button onClick={() => {setLoggedIn(false); localStorage.clear(); location.reload();}} style={{width: '100%', padding: '10px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: '8px'}}>Switch Account</button>
        </div>
      )}

      <footer style={{position: 'fixed', bottom: 0, left: 0, right: 0, padding: '10px', textAlign: 'center', fontSize: '0.7rem', color: '#475569'}}>
        Status: {status}
      </footer>
    </div>
  );
}

export default App;
