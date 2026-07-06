import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import { Browser } from '@capacitor/browser';
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

function resolveUpdateDownloadUrl(updatePayload, apiUrl) {
  const rawUrl = updatePayload?.downloadUrl || updatePayload?.apkUrl || updatePayload?.url;
  if (!rawUrl) return null;

  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith('/')) {
    const base = apiUrl.replace(/\/api$/i, '');
    return `${base}${rawUrl}`;
  }

  return rawUrl;
}

function App() {
  // --- STATE MANAGEMENT ---

  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('server_url');
    const isNative = Capacitor.getPlatform() !== 'web';

    // Default fallback from config
    let base = appConfig.defaultApiUrl || 'https://timeattendance-system.onrender.com/api';

    if (saved) {
       // If saved is local but we want to ensure it works
       if (isNative && saved.startsWith('http://localhost')) return saved.replace('localhost', '127.0.0.1');
       return saved;
    }

    return isNative ? base.replace('localhost', '127.0.0.1') : (base.startsWith('http') ? base : `${window.location.origin}${base}`);
  });

  const [tenantId, setTenantId] = useState(() => {
    const saved = localStorage.getItem('tenant_id');
    if (saved) return saved;
    // Removed auto-prefill from appConfig to keep it empty for privacy as requested
    return null;
  });

  const [activeTab, setActiveTab] = useState('home');
  const [setupId, setSetupId] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('cached_id'));
  const [employeeId, setEmployeeId] = useState(''); // Initialized as empty
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('System Online');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isServerDown, setIsServerDown] = useState(false);
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

  const [cachedEmployee, setCachedEmployee] = useState(() => {
    try {
        const all = JSON.parse(localStorage.getItem('all_employees') || '[]');
        const id = localStorage.getItem('cached_id');
        return all.find(e => (e.employeeId || "").toString() === (id || "").toString()) || { name: localStorage.getItem('cached_name') || 'Employee' };
    } catch (e) { return { name: 'Employee' }; }
  });

  // --- LOGIC FUNCTIONS ---

  const checkConnection = useCallback(async () => {
    if (!apiUrl.startsWith('http')) return;
    try {
      // PRO CONNECTIVITY: Check current API
      const res = await fetchWithTimeout(`${apiUrl}/settings`, { timeout: 4000 });
      if (res.ok) {
        setIsServerDown(false);
        if (status === 'Offline Mode') setStatus('System Online');
        return;
      }
      throw new Error('Timeout');
    } catch (e) {
      // IF FAILED, attempt to check the Default Production URL as fallback
      const prodUrl = 'https://timeattendance-system.onrender.com/api';
      if (apiUrl !== prodUrl) {
         try {
            const resProd = await fetchWithTimeout(`${prodUrl}/settings`, { timeout: 3000 });
            if (resProd.ok) {
               console.log("[CONNECTIVITY] Fallback to Production successful.");
               setApiUrl(prodUrl);
               localStorage.setItem('server_url', prodUrl);
               setIsServerDown(false);
               return;
            }
         } catch (err) {}
      }

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
            setStatus('Server Recovered ✓');
            if (tenantId) syncSystemData(tenantId, localStorage.getItem('cached_id'));
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
        const current = empRes.data.find(e =>
          (e.employeeId || "").toString().trim().toLowerCase() === (targetEmpId || "").toString().trim().toLowerCase()
        );
        if (current) setCachedEmployee(current);
      }
      if (deptRes.status === 200) {
        localStorage.setItem('all_departments', JSON.stringify(deptRes.data));
        setDepartments(deptRes.data);
      }
      if (logRes.status === 200) {
        const myLogs = (logRes.data || []).filter(l =>
          (l.employeeId || "").toString().trim().toLowerCase() === (targetEmpId || "").toString().trim().toLowerCase()
        );
        localStorage.setItem('personal_logs', JSON.stringify(myLogs));
        setPersonalLogs(myLogs);
      }
      setStatus('Data Synced ✓');
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
        const response = await postJson(`${apiUrl}/mobile/attendance`, { ...log, tenantId }, { 'x-tenant-id': tenantId });
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
      syncSystemData();
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
    const connInterval = setInterval(checkConnection, 12000);
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

  // OTA Update Logic & Fresh Start Check
  useEffect(() => {
    // FRESH START CHECK (Tropa Rule: Clear data after update request)
    const needsPurge = localStorage.getItem('pending_update_purge');
    if (needsPurge === 'true') {
        console.log('[SYSTEM] Executing post-update data purge...');
        localStorage.clear();
        // Keep the server URL so we don't have to setup again, or clear all?
        // Master said "makapag log in ulit ng fresh", so we clear all.
        window.location.reload();
        return;
    }

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
      } catch (err) { }
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
        alert(`SUCCESS!\n\nLinked to: ${res.data.companyName}\nSystem is ngayon handa na.`);
      } else {
        alert('INVALID COMPANY ID');
      }
    } catch (e) {
      alert('CONNECTION ERROR: Pakicheck ang iyong internet o ang server link.');
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

    try {
      const idInfo = await Device.getId();
      const devInfo = await Device.getInfo();

      // DIAGNOSTIC LOG
      console.log(`[AUTH] Attempting login at: ${apiUrl}`);

      const res = await postJson(`${apiUrl}/device/register`, {
        employeeId: cleanId,
        deviceId: idInfo.identifier,
        deviceName: `${devInfo.model}`,
        tenantId: tenantId
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
        alert('ID Not Found sa system. Pakicheck ang iyong ID.');
        setLoading(false);
        return;
      } else if (res.status === 403) {
        alert(res.data?.error || 'Access Denied: Device mismatch.');
        setLoading(false);
        return;
      } else {
          throw new Error(`Server Error: ${res.status}`);
      }
    } catch (e) {
        console.warn('Online login failed:', e.message);
    }

    // --- CACHE FALLBACK ---
    const allEmployees = JSON.parse(localStorage.getItem('all_employees') || '[]');
    const cachedEmp = allEmployees.find(e =>
      (e.employeeId || "").toString().trim().toLowerCase() === cleanId.toLowerCase()
    );

    if (cachedEmp) {
      setLoggedIn(true);
      localStorage.setItem('cached_id', cachedEmp.employeeId);
      localStorage.setItem('cached_name', cachedEmp.name);
      setStatus('Offline Access ✓');
      alert('OFFLINE MODE: Nakapasok gamit ang cached credentials.');
    } else {
      alert(`CONNECTION REQUIRED!\n\n${isServerDown ? 'Server is currently OFFLINE.' : 'Hindi makakonekta sa system at wala kang cached data.'}\n\nURL: ${apiUrl}`);
    }
    setLoading(false);
  };

  const recordAttendance = async (type) => {
    if (!selectedDepartment) return alert('Pumili muna ng work branch!');
    const dept = departments.find(d => d.departmentId === selectedDepartment);
    if (!dept) return;

    // --- ATTENDANCE LOCK LOGIC (Tropa Security Fix) ---
    const today = new Date().toLocaleDateString();

    // 1. Check Synced Logs (personalLogs)
    const hasSyncedLog = personalLogs.some(l => {
      const logDate = new Date(l.timestamp).toLocaleDateString();
      if (logDate !== today) return false;
      // In personalLogs (from server), we check timeIn/timeOut fields
      if (type === 'IN') return !!l.timeIn;
      if (type === 'OUT') return !!l.timeOut;
      return false;
    });

    // 2. Check Pending Logs (pendingLogs)
    const hasPendingLog = pendingLogs.some(l => {
      const logDate = new Date(l.timestamp).toLocaleDateString();
      return logDate === today && l.type === type;
    });

    if (hasSyncedLog || hasPendingLog) {
      alert(`NOTICE: Mayroon ka nang recorded ${type} para sa araw na ito.`);
      return;
    }

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
        alert('LOCATION ERROR: Pakibuhay ang GPS sa iyong settings.');
        setLoading(false);
        return;
      }
    }

    const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
    const allowedRadius = dept.radiusMeters || 50;

    if (dist > allowedRadius) {
      setStatus('❌ Too Far');
      alert(`ACCESS DENIED!\n\nNasa ${Math.round(dist)}m ka palayo.\nAllowed Radius: ${allowedRadius}m.`);
      setLoading(false);
      return;
    }

    const logData = {
      employeeId: localStorage.getItem('cached_id'),
      employeeName: localStorage.getItem('cached_name'),
      departmentId: selectedDepartment,
      departmentName: dept.name,
      type,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: new Date().toISOString(),
      distanceMeters: Math.round(dist),
      tenantId
    };

    setStatus('💾 Saving log...');
    try {
      const response = await postJson(`${apiUrl}/mobile/attendance`, logData, { 'x-tenant-id': tenantId });
      if (response.status === 200) {
        setStatus(`${type} Success ✓`);
        alert(`SUCCESS: Attendance recorded!`);
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
      alert(`OFFLINE SUCCESS! Na-save muna sa phone.`);
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

  const handleDownloadUpdate = async () => {
    if (!updateAvailable) return;

    const downloadUrl = resolveUpdateDownloadUrl(updateAvailable, apiUrl);
    if (!downloadUrl) {
      alert('No update download link is available right now.');
      return;
    }

    console.log(`[UPDATE] Opening download URL: ${downloadUrl}`);

    localStorage.setItem('pending_update_purge', 'true');
    setStatus('📥 DOWNLOADING UPDATE...');

    try {
      if (Capacitor.getPlatform() === 'web') {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        await Browser.open({ url: downloadUrl });
      }

      setUpdateAvailable(null);
      alert('DOWNLOAD STARTED: Pakicheck ang notification bar mo. Pagkatapos ma-install, buksan ulit ang app para sa fresh update.');
    } catch (e) {
      console.warn('[UPDATE] Browser open failed, trying fallback.', e);
      if (typeof window !== 'undefined' && window.open) {
        window.open(downloadUrl, '_system');
      }
    }
  };

  const getLogStatus = (l) => {
      if (l.status && l.status !== 'Pending') return l.status.toUpperCase();

      const emp = cachedEmployee;
      if (!emp || !emp.schedule) return 'RECORDED';

      const timeInStr = l.timeIn || (l.type === 'IN' ? l.timestamp : null);
      if (!timeInStr) return 'PENDING';

      const d = new Date(l.timestamp);
      const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const logInTime = new Date(timeInStr);
      const logIn = new Date(`${datePart}T${String(logInTime.getHours()).padStart(2,'0')}:${String(logInTime.getMinutes()).padStart(2,'0')}:00`);

      let sStart = null;
      const timeMatch = emp.schedule.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
          sStart = new Date(`${datePart}T${timeMatch[1].padStart(5, '0')}:00`);
      }

      if (sStart) {
          const grace = 15;
          const lateThreshold = new Date(sStart.getTime() + grace * 60000);
          if (logIn > lateThreshold) return 'LATE';
          return 'COMPLETED';
      }

      return 'RECORDED';
  };

  // --- RENDER ---

  return (
    <div className="mobile-container" style={{
      background: '#0f172a',
      minHeight: '100dvh',
      color: 'white',
      padding: 'env(safe-area-inset-top, 20px) 15px calc(env(safe-area-inset-bottom, 0px) + 75px) 15px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflowX: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      width: '100%'
    }}>
      <style>{`
        body { background: #0f172a !important; margin: 0; width: 100%; overflow-x: hidden; height: 100dvh; }
        .mobile-container { max-width: 500px; margin: 0 auto; flex: 1; position: relative; }
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(15px); padding: 25px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); width: 100%; box-sizing: border-box; }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 20px; font-weight: 800; cursor: pointer; width: 100%; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2); font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
        .btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .input-field { width: 100%; padding: 16px; margin-bottom: 20px; border-radius: 20px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.6); color: white; font-size: 1rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .input-field:focus { border-color: #3b82f6; background: rgba(15, 23, 42, 0.8); }
        .label-visible { color: #94a3b8; font-size: 0.75rem; font-weight: 800; margin-bottom: 12px; display: block; letter-spacing: 1.5px; text-transform: uppercase; }
        .fade-in { animation: fadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .pulse { animation: pulseAnim 2s infinite; }
        @keyframes pulseAnim { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
        .badge { padding: 8px 16px; border-radius: 12px; font-size: 0.65rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border: 1px solid currentColor; }
        .badge-pending { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
        .badge-success { color: #10b981; background: rgba(16, 185, 129, 0.1); }
        .badge-late { color: #f87171; background: rgba(239, 68, 68, 0.1); }
        .nav-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111827; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-around; padding: 8px 0 calc(env(safe-area-inset-bottom, 0px) + 5px) 0; z-index: 1000; box-shadow: 0 -8px 30px rgba(0,0,0,0.6); box-sizing: border-box; }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 2px; color: #4b5563; text-decoration: none; font-size: 0.6rem; font-weight: 800; padding: 10px 5px; transition: 0.2s; flex: 1; }
        .nav-item.active { color: #3b82f6; }
        .log-card { background: rgba(255,255,255,0.03); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 15px; }
        .update-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.98); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); padding: 25px; }
        .update-card { background: linear-gradient(145deg, #1e293b, #0f172a); width: 100%; max-width: 350px; border-radius: 40px; padding: 40px 30px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; }
      `}</style>

      {!tenantId ? (
        <div style={{padding: '40px 10px', textAlign: 'center'}}>
           <div className="glass-card fade-in">
              <div style={{fontSize: '6rem', marginBottom: '20px'}} className="pulse">🌐</div>
              <h1 style={{fontSize: '2rem', fontWeight: '900', marginBottom: '10px'}}>Time Attendance</h1>
              <p style={{color: '#94a3b8', marginBottom: '40px'}}>Enter Company ID para simulan ang terminal.</p>
              <input
                name={`tenant_setup_${Math.random().toString(36).substring(7)}`}
                value={setupId}
                onChange={e => setSetupId(e.target.value)}
                placeholder="--- ENTER ID ---"
                className="input-field"
                style={{textAlign: 'center', fontSize: '1.5rem', fontWeight: '900'}}
                autoComplete="new-password"
                autoCorrect="off"
                spellCheck="false"
                data-lpignore="true"
              />
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

          <div style={{textAlign: 'center', padding: '20px 0', marginBottom: '15px'}} onDoubleClick={handleUpdateServer}>
              <div style={{fontSize: '0.6rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '10px'}}>Time Attendance Hub</div>
              <h1 style={{fontSize: '1.6rem', margin: 0, fontWeight: '900', color: '#fff'}}>{tenantInfo?.companyName?.toUpperCase() || 'OFFICIAL HUB'}</h1>
          </div>

          {!loggedIn ? (
            <div className="glass-card fade-in">
              <div style={{textAlign: 'center', marginBottom: '40px'}}>
                 <div style={{fontSize: '5rem', marginBottom: '15px'}} className="pulse">🛡️</div>
                 <h2>Identity Hub</h2>
                 <p style={{color: '#94a3b8'}}>Verification Required</p>
              </div>
              <span className="label-visible">EMPLOYEE ID</span>
              <input
                name={`emp_id_${Math.random().toString(36).substring(7)}`}
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="--- ENTER ID ---"
                className="input-field"
                style={{textAlign: 'center', fontSize: '1.4rem'}}
                autoComplete="new-password"
                autoCorrect="off"
                spellCheck="false"
                data-lpignore="true"
              />
              <button onClick={login} disabled={loading} className="btn-primary">{loading ? 'VERIFYING...' : 'SIGN IN'}</button>
            </div>
          ) : (
            <>
              {activeTab === 'home' && (
                <div className="fade-in">
                  <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.05)'}}>
                    <div>
                      <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>SYSTEM STATUS</div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px'}}>
                        <div style={{width: '10px', height: '10px', borderRadius: '50%', background: isServerDown ? '#ef4444' : '#10b981'}}></div>
                        <span style={{fontSize: '0.9rem', fontWeight: '900', color: isServerDown ? '#ef4444' : '#10b981'}}>{isServerDown ? 'OFFLINE' : 'ONLINE'}</span>
                      </div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800'}}>QUEUE</div>
                      <div style={{marginTop: '6px'}}><span className={`badge ${pendingLogs.length > 0 ? 'badge-pending' : 'badge-success'}`}>{pendingLogs.length} Records</span></div>
                    </div>
                  </header>

                  <div className="glass-card">
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

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '10px'}}>
                      <button onClick={() => recordAttendance('IN')} className="btn-primary" style={{background: '#10b981', padding: '30px 10px'}}>
                        <span style={{fontSize: '2rem', display: 'block'}}>📥</span>
                        <span>TIME IN</span>
                      </button>
                      <button onClick={() => recordAttendance('OUT')} className="btn-primary" style={{background: '#f59e0b', padding: '30px 10px'}}>
                        <span style={{fontSize: '2rem', display: 'block'}}>📤</span>
                        <span>TIME OUT</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="fade-in">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                     <h2 style={{margin: 0}}>Personal Logs</h2>
                     <button onClick={syncSystemData} style={{background: 'rgba(59, 130, 246, 0.1)', border: 'none', color: '#3b82f6', padding: '8px 15px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '900'}}>REFRESH</button>
                  </div>

                  {personalLogs.length === 0 ? (
                    <div style={{textAlign: 'center', padding: '50px 20px', color: '#64748b'}}>
                        <div style={{fontSize: '4rem', marginBottom: '20px'}}>📋</div>
                        <p>Walang activity history na nahanap.</p>
                    </div>
                  ) : (
                    personalLogs.slice().reverse().map((l, i) => {
                        const status = getLogStatus(l);
                        return (
                            <div key={i} className="log-card fade-in">
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                    <div>
                                        <div style={{fontWeight: '900', fontSize: '1.1rem', marginBottom: '4px'}}>{l.departmentName}</div>
                                        <div style={{fontSize: '0.8rem', color: '#94a3b8'}}>{new Date(l.timestamp).toLocaleString()}</div>
                                    </div>
                                    <span className={`badge ${status === 'COMPLETED' ? 'badge-success' : status === 'LATE' ? 'badge-late' : 'badge-pending'}`}>
                                        {status}
                                    </span>
                                </div>
                                <div style={{marginTop: '15px', display: 'flex', gap: '15px', fontSize: '0.75rem', fontWeight: '800'}}>
                                    <span style={{color: l.type === 'IN' ? '#10b981' : '#f59e0b'}}>{l.type} RECORDED</span>
                                    <span style={{color: '#64748b'}}>•</span>
                                    <span style={{color: '#64748b'}}>{l.distanceMeters}M AWAY</span>
                                </div>
                            </div>
                        );
                    })
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="fade-in">
                   <div className="glass-card">
                      <div style={{textAlign: 'center', marginBottom: '30px'}}>
                         <div style={{width: '100px', height: '100px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', margin: '0 auto 20px auto'}}>👤</div>
                         <h2 style={{margin: 0}}>{cachedEmployee?.name}</h2>
                         <p style={{color: '#94a3b8', margin: '5px 0 0 0'}}>{cachedEmployee?.jobTitle || 'Staff'}</p>
                      </div>

                      <div style={{background: 'rgba(255,255,255,0.03)', borderRadius: '20px', padding: '20px', marginBottom: '30px'}}>
                         <div style={{marginBottom: '15px'}}>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>EMPLOYEE ID</div>
                            <div style={{fontWeight: '700'}}>{localStorage.getItem('cached_id')}</div>
                         </div>
                         <div style={{marginBottom: '15px'}}>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>DEPARTMENT</div>
                            <div style={{fontWeight: '700'}}>{cachedEmployee?.department || '-'}</div>
                         </div>
                         <div>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>WORK SCHEDULE</div>
                            <div style={{fontWeight: '700', color: '#f59e0b'}}>{cachedEmployee?.schedule || 'Regular Shift'}</div>
                         </div>
                      </div>

                      <button onClick={() => {if(confirm('Sigurado ka bang mag-logout?')){localStorage.clear(); window.location.reload();}}} className="btn-primary" style={{background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '2px solid rgba(239, 68, 68, 0.2)', boxShadow: 'none'}}>LOGOUT ACCOUNT</button>
                   </div>

                   <div style={{textAlign: 'center', marginTop: '30px', color: '#64748b', fontSize: '0.7rem', fontWeight: '900'}}>
                      {status.toUpperCase()} | V{appConfig.version} | {apiUrl.includes('127.0.0.1') ? 'LAB MODE' : 'CLOUD LIVE'}
                   </div>
                </div>
              )}

              <div className="nav-bar">
                <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
                   <span style={{fontSize: '1.5rem'}}>🏠</span>
                   <span>HOME</span>
                </div>
                <div className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                   <span style={{fontSize: '1.5rem'}}>📋</span>
                   <span>LOGS</span>
                </div>
                <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                   <span style={{fontSize: '1.5rem'}}>👤</span>
                   <span>PROFILE</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
