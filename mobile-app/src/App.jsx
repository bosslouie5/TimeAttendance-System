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
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [whatsNewData, setWhatsNewData] = useState(null);

  const [departments, setDepartments] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('all_departments')) || initialData.departments;
    } catch (e) { return initialData.departments; }
  });

  // Auto-select branch if only one is available (Pro UX)
  useEffect(() => {
    if (departments && departments.length === 1 && departments[0].departmentId !== selectedDepartment) {
      setSelectedDepartment(departments[0].departmentId);
    }
  }, [departments, selectedDepartment]);

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

  const [noticeModal, setNoticeModal] = useState({ visible: false, title: '', message: '', type: 'info' });

  const showNotice = (title, message, type = 'info') => {
    setNoticeModal({ visible: true, title, message, type });
  };

  const hideNotice = () => {
    setNoticeModal(prev => ({ ...prev, visible: false }));
  };

  const groupedLogs = useMemo(() => {
    const groups = {};
    // Merge Synced (personal) and Unsynced (pending) logs for full history
    const combined = [
      ...personalLogs.map(l => ({ ...l, isSynced: true })),
      ...pendingLogs.map(l => ({ ...l, isSynced: false }))
    ];

    combined.forEach(log => {
      const d = new Date(log.timestamp);
      const dateKey = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const branchKey = log.departmentName || 'Unknown Branch';
      const key = `${dateKey}_${branchKey}`;

      if (!groups[key]) {
        groups[key] = {
          date: dateKey,
          branch: branchKey,
          in: null,
          out: null,
          rawTimestamp: d.getTime()
        };
      }

      if (log.isSynced) {
        // Handle Server structure (timeIn/timeOut in one object)
        if (log.timeIn && (!groups[key].in || new Date(log.timeIn) < new Date(groups[key].in.timestamp))) {
           groups[key].in = { ...log, timestamp: log.timeIn };
        }
        if (log.timeOut && (!groups[key].out || new Date(log.timeOut) > new Date(groups[key].out.timestamp))) {
           groups[key].out = { ...log, timestamp: log.timeOut };
        }
        const latestTs = new Date(log.timeOut || log.timeIn || log.timestamp).getTime();
        if (latestTs > groups[key].rawTimestamp) groups[key].rawTimestamp = latestTs;
      } else {
        // Handle Pending structure (action type per log)
        if (log.type === 'IN') {
          if (!groups[key].in || new Date(log.timestamp) < new Date(groups[key].in.timestamp)) {
             groups[key].in = log;
          }
        } else if (log.type === 'OUT') {
          if (!groups[key].out || new Date(log.timestamp) > new Date(groups[key].out.timestamp)) {
             groups[key].out = log;
          }
        }
      }
    });
    return Object.values(groups).sort((a, b) => b.rawTimestamp - a.rawTimestamp);
  }, [personalLogs, pendingLogs]);

  const [cachedEmployee, setCachedEmployee] = useState(() => {
    try {
        const all = JSON.parse(localStorage.getItem('all_employees') || '[]');
        const id = localStorage.getItem('cached_id');
        return all.find(e => (e.employeeId || "").toString() === (id || "").toString()) || { name: localStorage.getItem('cached_name') || 'Employee' };
    } catch (e) { return { name: 'Employee' }; }
  });

  const [leaveRequests, setLeaveRequests] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('leave_requests') || '[]');
    } catch (e) { return []; }
  });

  const [hrNotifications, setHrNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hr_notifications') || '[]');
    } catch (e) { return []; }
  });

  const [leaveForm, setLeaveForm] = useState({ type: 'Sick Leave', startDate: '', endDate: '', reason: '', reportsTo: '' });
  const [leavesForApproval, setLeavesForApproval] = useState([]);
  const [isManagerView, setIsManagerView] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState(null);

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
      const [empRes, deptRes, logRes, leaveRes] = await Promise.all([
        getJson(`${apiUrl}/employees`, headers),
        getJson(`${apiUrl}/departments?employeeId=${targetEmpId}`, headers),
        getJson(`${apiUrl}/logs`, headers),
        getJson(`${apiUrl.replace(/\/api$/, '')}/api/hr/leaves?tenant=${encodeURIComponent(targetTenantId)}`, headers)
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
        // Auto-select a branch if only one assigned branch or if cachedEmployee branchName matches
        try {
          const current = JSON.parse(localStorage.getItem('all_employees') || '[]').find(e => (e.employeeId || "").toString() === (targetEmpId || "").toString());
          if (deptRes.data && deptRes.data.length === 1) {
            setSelectedDepartment(deptRes.data[0].departmentId);
          } else if (current && current.branchName) {
            const match = deptRes.data.find(d => d.name === current.branchName);
            if (match) setSelectedDepartment(match.departmentId);
          }
        } catch (e) {}
      }
      if (logRes.status === 200) {
        const myLogs = (logRes.data || []).filter(l =>
          (l.employeeId || "").toString().trim().toLowerCase() === (targetEmpId || "").toString().trim().toLowerCase()
        );
        localStorage.setItem('personal_logs', JSON.stringify(myLogs));
        setPersonalLogs(myLogs);
      }
      if (leaveRes.status === 200) {
        const remoteLeaves = Array.isArray(leaveRes.data) ? leaveRes.data : [];
        const localLeaves = JSON.parse(localStorage.getItem('leave_requests') || '[]');
        const mergedLeaves = [
          ...remoteLeaves,
          ...localLeaves.filter(local => !remoteLeaves.some(remote => remote.id === local.id))
        ];
        localStorage.setItem('leave_requests', JSON.stringify(mergedLeaves));
        setLeaveRequests(mergedLeaves);
      }
      
      // Fetch leaves for approval if user is a manager
      await fetchLeavesForApproval();
      
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
    const leaveRefreshInterval = setInterval(() => {
      if (loggedIn && !isServerDown) {
        syncSystemData();
      }
    }, 20000);

    if (tenantId) {
        fetchTenantInfo();
        if (loggedIn) syncSystemData();
    }
    return () => {
      clearInterval(connInterval);
      clearInterval(syncInterval);
      clearInterval(leaveRefreshInterval);
    };
  }, [tenantId, loggedIn, checkConnection, attemptSync, fetchTenantInfo, isServerDown]);

  // OTA Update Logic & Session Preservation
  useEffect(() => {
    // Clean up update flag if it exists (No more clearing of data)
    if (localStorage.getItem('pending_update_purge') === 'true') {
        localStorage.removeItem('pending_update_purge');
    }

    // WHAT'S NEW LOGIC (One-time prompt after update)
    const checkWhatsNew = async () => {
      const lastSeen = localStorage.getItem('last_seen_version');
      const current = appConfig.version;

      if (lastSeen && lastSeen !== current) {
         try {
           const res = await getJson(`${apiUrl}/app-version`);
           if (res.ok && res.data) {
             setWhatsNewData(res.data);
             setShowWhatsNew(true);
           }
         } catch (e) {}
      }
      localStorage.setItem('last_seen_version', current);
    };

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

    checkWhatsNew();
    checkUpdate();

    // Auto-polling for updates every 45 seconds (PRO REAL-TIME)
    const updateTimer = setInterval(checkUpdate, 45000);
    return () => clearInterval(updateTimer);
  }, [apiUrl, isServerDown]);

  const handleSetupTenant = async () => {
    if (!setupId.trim()) {
      showNotice('Company ID Required', 'Please enter a valid Company ID to continue.', 'warning');
      return;
    }
    setIsSettingUp(true);
    setStatus('Establishing secure connection...');
    try {
      const res = await getJson(`${apiUrl}/tenant-info/${setupId.trim()}`);
      if (res.ok && res.data) {
        const tid = res.data.tenantId || setupId.trim();
        localStorage.setItem('tenant_id', tid);
        localStorage.setItem('tenant_info', JSON.stringify(res.data));
        setTenantId(tid);
        setTenantInfo(res.data);
        setStatus('Company linked successfully.');
        showNotice('Success', `Linked to ${res.data.companyName}. Your terminal is ready.`, 'success');
      } else {
        showNotice('Invalid Company', 'Company ID not recognized. Please verify and try again.', 'warning');
      }
    } catch (e) {
      showNotice('Connection Error', 'Unable to reach the server. Please verify your network or server settings.', 'error');
    } finally {
      setIsSettingUp(false);
      setStatus('System Ready');
    }
  };

  const login = async () => {
    if (!employeeId.trim()) {
      showNotice('Employee ID Required', 'Please enter your Employee ID to continue.', 'warning');
      return;
    }
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
        showNotice('Employee Not Found', 'The Employee ID is not registered. Please verify and try again.', 'warning');
        setLoading(false);
        return;
      } else if (res.status === 403) {
        showNotice('Access Denied', res.data?.error || 'Device mismatch detected. Please use an authorized device.', 'error');
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
      showNotice('Offline Login', 'You are logged in using cached credentials. Connectivity will be restored when available.', 'info');
    } else {
      showNotice(
        'Connection Required',
        `${isServerDown ? 'The server is currently offline.' : 'Unable to connect to the system, and no cached credentials are available.'} Please check your network or server settings.`,
        'error'
      );
    }
    setLoading(false);
  };

  const recordAttendance = async (type) => {
    if (!selectedDepartment) {
      showNotice('Branch Required', 'Please select a work branch before recording attendance.', 'warning');
      return;
    }
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
      showNotice('Attendance Already Recorded', `You already have a recorded ${type} for today.`, 'info');
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
        showNotice('Location Required', 'Please enable GPS/location services in your settings and try again.', 'warning');
        setLoading(false);
        return;
      }
    }

    const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, dept.pinLatitude, dept.pinLongitude);
    const allowedRadius = dept.radiusMeters || 50;

    if (dist > allowedRadius) {
      setStatus('❌ Too Far');
      showNotice('Access Denied', `You are ${Math.round(dist)}m away. Allowed radius is ${allowedRadius}m.`, 'warning');
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
        showNotice('Attendance Recorded', 'Your attendance has been successfully recorded.', 'success');
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
      showNotice('Offline Saved', 'Attendance was recorded locally and will sync once the connection is restored.', 'info');
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
      showNotice('Update Unavailable', 'No download link is available for this release at the moment.', 'warning');
      return;
    }

    console.log(`[UPDATE] Opening download URL: ${downloadUrl}`);

    // Flag that an update was initiated, but we don't clear data anymore
    localStorage.setItem('pending_update_purge', 'true');
    setStatus('📥 DOWNLOADING UPDATE...');

    try {
      if (Capacitor.getPlatform() === 'web') {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        await Browser.open({ url: downloadUrl });
      }

      setUpdateAvailable(null);
      showNotice('Download Started', 'The update download has begun. Please check your notification center and reopen the app after installation.', 'success');
    } catch (e) {
      console.warn('[UPDATE] Browser open failed, trying fallback.', e);
      if (typeof window !== 'undefined' && window.open) {
        window.open(downloadUrl, '_system');
      }
    }
  };

  const getGroupStatus = (group) => {
      const log = group.in || group.out;
      if (!log) return 'PENDING';

      if (log.status && log.status !== 'Pending') return log.status.toUpperCase();

      const emp = cachedEmployee;
      if (!emp || !emp.schedule) return 'RECORDED';

      if (!group.in) return 'NO IN';

      const d = new Date(group.in.timestamp);
      const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const logIn = new Date(group.in.timestamp);

      let sStart = null;
      const timeMatch = emp.schedule.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
          sStart = new Date(`${datePart}T${timeMatch[1].padStart(5, '0')}:00`);
      }

      if (sStart) {
          const grace = 15;
          const lateThreshold = new Date(sStart.getTime() + grace * 60000);
          if (logIn > lateThreshold) return 'LATE';
          return group.out ? 'COMPLETED' : 'DUTY';
      }

      return 'RECORDED';
  };

  const attendanceInsights = useMemo(() => {
    const lateCount = groupedLogs.filter(group => getGroupStatus(group) === 'LATE').length;
    const missedPunchCount = groupedLogs.filter(group => !group.in || !group.out).length;
    const earlyExitCount = groupedLogs.filter(group => {
      if (!group.in || !group.out) return false;
      const outTime = new Date(group.out.timestamp);
      return outTime.getHours() < 17 || (outTime.getHours() === 17 && outTime.getMinutes() < 30);
    }).length;

    return { lateCount, missedPunchCount, earlyExitCount };
  }, [groupedLogs, getGroupStatus]);

  const upcomingSchedule = useMemo(() => {
    const baseSchedule = cachedEmployee?.schedule || '08:00 - 17:00';
    return Array.from({ length: 3 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index + 1);
      return {
        label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
        time: baseSchedule
      };
    });
  }, [cachedEmployee?.schedule]);

  const submitLeaveRequest = async (event) => {
    event.preventDefault();
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim()) {
      showNotice('Incomplete Form', 'Please complete the leave details before submitting.', 'warning');
      return;
    }

    const newRequest = {
      id: Date.now().toString(),
      employeeId: localStorage.getItem('cached_id') || 'N/A',
      employeeName: localStorage.getItem('cached_name') || 'Employee',
      type: leaveForm.type,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      reason: leaveForm.reason.trim(),
      reportsTo: leaveForm.reportsTo?.trim() || '',
      status: 'Pending',
      tenantId: tenantId || localStorage.getItem('tenant_id') || 'unknown'
    };

    let saved = null;
    try {
      if (apiUrl && apiUrl.startsWith('http') && (tenantId || localStorage.getItem('tenant_id'))) {
        const headers = { 'x-tenant-id': tenantId || localStorage.getItem('tenant_id') };
        const res = await postJson(`${apiUrl.replace(/\/api$/, '')}/api/hr/leaves`, newRequest, headers);
        if (res && res.ok && res.data) saved = res.data;
      }
    } catch (e) { /* fall through to local save */ }

    const toStore = saved || newRequest;
    const updatedRequests = [toStore, ...leaveRequests];
    setLeaveRequests(updatedRequests);
    localStorage.setItem('leave_requests', JSON.stringify(updatedRequests));

    const newNotification = {
      id: `leave-${Date.now()}`,
      title: 'Leave Request Submitted',
      message: `${leaveForm.type} request saved for ${leaveForm.startDate} to ${leaveForm.endDate}.`,
      type: 'info',
      createdAt: new Date().toISOString()
    };
    const updatedNotifications = [newNotification, ...hrNotifications].slice(0, 8);
    setHrNotifications(updatedNotifications);
    localStorage.setItem('hr_notifications', JSON.stringify(updatedNotifications));

    setLeaveForm({ type: 'Sick Leave', startDate: '', endDate: '', reason: '', reportsTo: '' });
    showNotice('Leave Request Saved', 'Your leave request is now pending approval.', 'success');
  };

  const fetchLeavesForApproval = async () => {
    const empId = localStorage.getItem('cached_id');
    const tid = tenantId || localStorage.getItem('tenant_id');
    if (!empId || !tid || !apiUrl?.startsWith('http')) return;
    
    try {
      const headers = { 'x-tenant-id': tid };
      const res = await getJson(`${apiUrl.replace(/\/api$/, '')}/api/hr/leaves/for-approval/${empId}`, headers);
      if (res.ok && Array.isArray(res.data)) {
        setLeavesForApproval(res.data);
        setIsManagerView(res.data.length > 0);
      }
    } catch (e) { console.log('Leave approval fetch error:', e); }
  };

  const approveLeaveRequest = async (leaveId, status) => {
    const empId = localStorage.getItem('cached_id');
    const empName = localStorage.getItem('cached_name');
    const tid = tenantId || localStorage.getItem('tenant_id');
    if (!leaveId || !tid || !apiUrl?.startsWith('http')) return;
    
    try {
      const headers = { 'x-tenant-id': tid };
      const body = { status, managerId: empId, managerName: empName };
      const res = await fetch(`${apiUrl.replace(/\/api$/, '')}/api/hr/leaves/${leaveId}/manager-approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        setLeavesForApproval(prev => prev.map(l => l.id === leaveId ? data : l));
        showNotice('Leave Updated', `Leave request has been ${status.toLowerCase()}.`, 'success');
        fetchLeavesForApproval();
      }
    } catch (e) { showNotice('Error', 'Failed to update leave request.', 'error'); }
  };

  useEffect(() => {
    if (!loggedIn) return;
    const existing = JSON.parse(localStorage.getItem('hr_notifications') || '[]');
    if (existing.length === 0) {
      const seeded = [{
        id: 'welcome-hr',
        title: 'HR Hub Ready',
        message: `Hello ${localStorage.getItem('cached_name') || 'there'} — your employee profile, attendance insights, leave requests, schedule view, and notifications are now available.`,
        type: 'info',
        createdAt: new Date().toISOString()
      }];
      setHrNotifications(seeded);
      localStorage.setItem('hr_notifications', JSON.stringify(seeded));
    }
  }, [loggedIn]);

  // --- RENDER ---

  return (
    <div className="mobile-container">
      <style>{`
        body { background: #0f172a !important; margin: 0; width: 100%; overflow-x: hidden; min-height: 100dvh; }
        .mobile-container { max-width: 500px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; width: 100%; position: relative; background: #0f172a; color: white; font-family: 'Inter', system-ui, -apple-system, sans-serif; box-sizing: border-box; }
        .content-area { flex: 1; padding: 20px 15px calc(env(safe-area-inset-bottom, 0px) + 100px) 15px; width: 100%; box-sizing: border-box; }
        .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(15px); padding: 25px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); width: 100%; box-sizing: border-box; }
        .setup-card { background: linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.98)); border: 1px solid rgba(96, 165, 250, 0.16); box-shadow: 0 35px 80px -30px rgba(15, 23, 42, 0.75); position: relative; overflow: hidden; }
        .setup-card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at top right, rgba(59,130,246,0.18), transparent 42%), radial-gradient(circle at bottom left, rgba(16,185,129,0.12), transparent 30%); pointer-events: none; }
        .setup-hero { margin-bottom: 30px; position: relative; z-index: 1; }
        .setup-badge { display: inline-flex; padding: 8px 16px; border-radius: 999px; background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.18em; margin-bottom: 18px; }
        .setup-title { font-size: 2.1rem; letter-spacing: 0.02em; margin: 0 0 12px; }
        .setup-text { color: #cbd5e1; line-height: 1.8; margin-bottom: 24px; max-width: 520px; margin-left: auto; margin-right: auto; }
        .setup-note { color: #e2e8f0; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(96, 165, 250, 0.18); border-radius: 24px; padding: 20px 20px; margin-bottom: 24px; font-size: 0.95rem; line-height: 1.7; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
        .setup-status-pill { margin-top: 18px; padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(59, 130, 246, 0.18); background: rgba(59, 130, 246, 0.08); color: #dbeafe; font-size: 0.92rem; text-align: center; }
        .btn-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; border: none; padding: 18px; border-radius: 20px; font-weight: 800; cursor: pointer; width: 100%; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2); font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; position: relative; overflow: hidden; }
        .btn-primary.loading { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); }
        .btn-primary:active { transform: scale(0.96); opacity: 0.9; }
        .input-field { width: 100%; padding: 18px; margin-bottom: 20px; border-radius: 22px; border: 2px solid #334155; background: rgba(15, 23, 42, 0.72); color: white; font-size: 1rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .input-field::placeholder { color: rgba(241, 245, 249, 0.5); font-weight: 700; letter-spacing: 0.08em; }
        .input-field:focus { border-color: #3b82f6; background: rgba(15, 23, 42, 0.88); box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.08); }
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
        .nav-bar { position: fixed; bottom: 0; left: 0; right: 0; width: 100%; max-width: 500px; margin: 0 auto; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(25px); border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-around; padding: 12px 0 calc(env(safe-area-inset-bottom, 0px) + 15px) 0; z-index: 1000; box-shadow: 0 -10px 40px rgba(0,0,0,0.6); box-sizing: border-box; user-select: none; }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #64748b; text-decoration: none; font-size: 0.65rem; font-weight: 800; padding: 10px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); flex: 1; cursor: pointer; border-radius: 20px; }
        .nav-item:active { transform: scale(0.92); background: rgba(255,255,255,0.05); }
        .nav-item.active { color: #3b82f6; }
        .nav-item.active span:first-child { transform: translateY(-2px) scale(1.15); filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.5)); }
        .notification-card { background: rgba(15,23,42,0.95); border: 1px solid rgba(59,130,246,0.22); padding: 18px 20px; border-radius: 24px; margin-bottom: 20px; text-align: left; box-shadow: 0 18px 32px rgba(0,0,0,0.22); }
        .notification-card strong { display: block; margin-bottom: 8px; font-size: 1rem; letter-spacing: 0.04em; }
        .notification-card p { margin: 0; color: #cbd5e1; line-height: 1.7; }
        .log-card { background: rgba(255,255,255,0.03); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 15px; }
        .log-table { width: 100%; border-collapse: separate; border-spacing: 0 12px; margin-top: 10px; }
        .log-table th { text-align: center; padding: 0 5px 10px 5px; color: #64748b; font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
        .log-table th:first-child { text-align: left; padding-left: 10px; }
        .log-table td { padding: 15px 5px; background: rgba(30, 41, 59, 0.4); border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; text-align: center; }
        .log-table td:first-child { text-align: left; padding-left: 12px; border-left: 1px solid rgba(255,255,255,0.05); border-top-left-radius: 20px; border-bottom-left-radius: 20px; }
        .log-table td:last-child { border-right: 1px solid rgba(255,255,255,0.05); border-top-right-radius: 20px; border-bottom-right-radius: 20px; }
        .time-label { font-size: 0.55rem; color: #64748b; font-weight: 800; display: block; margin-bottom: 2px; letter-spacing: 0.5px; }
        .time-value { font-size: 0.75rem; font-weight: 700; color: #f8fafc; font-family: 'JetBrains Mono', monospace; }
        .branch-name { font-weight: 800; font-size: 0.85rem; color: #fff; display: block; margin-bottom: 4px; }
        .log-date { font-size: 0.65rem; color: #3b82f6; font-weight: 900; }
        .badge-duty { color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
        .update-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(2, 6, 23, 0.98); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); padding: 25px; }
        .update-card { background: linear-gradient(145deg, #1e293b, #0f172a); width: 100%; max-width: 350px; border-radius: 40px; padding: 40px 30px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .message-overlay { position: fixed; inset: 0; background: rgba(10, 14, 29, 0.9); backdrop-filter: blur(18px); display: flex; align-items: center; justify-content: center; z-index: 10010; padding: 24px; }
        .message-card { width: min(100%, 420px); background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.92)); border: 1px solid rgba(96, 165, 250, 0.2); border-radius: 28px; box-shadow: 0 24px 80px rgba(0,0,0,0.35); padding: 28px 24px; animation: slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1); text-align: center; }
        .message-card h3 { margin: 0 0 14px; font-size: 1.3rem; letter-spacing: 0.03em; color: #f8fafc; }
        .message-card p { margin: 0 0 22px; color: #cbd5e1; line-height: 1.75; font-size: 0.95rem; }
        .message-card .message-icon { display: inline-flex; width: 60px; height: 60px; border-radius: 18px; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 16px; background: rgba(59, 130, 246, 0.12); }
        .message-card button { width: 100%; padding: 16px 0; border-radius: 20px; border: none; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.08em; cursor: pointer; transition: transform 180ms ease, filter 180ms ease; }
        .message-card button:hover { transform: translateY(-1px); }
        .message-card button.message-primary { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #fff; }
        .message-card.message-success .message-icon { background: rgba(16, 185, 129, 0.16); }
        .message-card.message-warning .message-icon { background: rgba(245, 158, 11, 0.16); }
        .message-card.message-error .message-icon { background: rgba(239, 68, 68, 0.16); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>

      {!tenantId ? (
        <div className="content-area" style={{padding: '40px 10px', textAlign: 'center'}}>
           <div className="glass-card setup-card fade-in">
              <div className="setup-hero">
                <div className="setup-badge">TERMINAL ACTIVATION</div>
                <div style={{fontSize: '5.5rem', marginBottom: '20px'}} className="pulse">🌐</div>
                <h1 className="setup-title">Time Attendance</h1>
                <p className="setup-text">Enter your Company ID to secure the terminal and initialize the local environment. This protects your device and streamlines onboarding.</p>
              </div>
              <div className="setup-note">Tap ACTIVATE TERMINAL to verify your company and establish a secure local lab connection.</div>
              <input
                name={`tenant_setup_${Math.random().toString(36).substring(7)}`}
                value={setupId}
                onChange={e => setSetupId(e.target.value)}
                placeholder="Enter your Company ID"
                className="input-field"
                style={{textAlign: 'center', fontSize: '1.2rem', fontWeight: '700'}}
                autoComplete="new-password"
                autoCorrect="off"
                spellCheck="false"
                data-lpignore="true"
              />
              <button type="button" onClick={handleSetupTenant} disabled={isSettingUp} className={`btn-primary ${isSettingUp ? 'loading' : ''}`}>{isSettingUp ? 'CONNECTING TO COMPANY...' : 'ACTIVATE TERMINAL'}</button>
              {isSettingUp && <div className="setup-status-pill">Establishing a secure connection with your company...</div>}
           </div>
        </div>
      ) : (
        <div className="content-area fade-in">
          {updateAvailable && (
            <div className="update-overlay fade-in">
               <div className="update-card">
                  <span style={{fontSize: '5rem', marginBottom: '20px', display: 'block'}}>🚀</span>
                  <h2 style={{fontSize: '1.8rem', fontWeight: '900', color: '#fff', marginBottom: '10px'}}>Upgrade Available</h2>
                  <div style={{color: '#3b82f6', fontWeight: '900', marginBottom: '20px'}}>V{updateAvailable.version}</div>
                  <div style={{color: '#94a3b8', fontSize: '0.9rem', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '15px', textAlign: 'left', maxHeight: '200px', overflowY: 'auto'}}>
                     <strong style={{color: '#fff', display: 'block', marginBottom: '8px'}}>What's New:</strong>
                     {updateAvailable.changelog || 'Stability updates and performance improvements.'}
                  </div>
                  <button className="btn-primary" onClick={handleDownloadUpdate}>INSTALL UPDATE</button>
               </div>
            </div>
          )}

          {showWhatsNew && (
            <div className="update-overlay fade-in" style={{zIndex: 2000}}>
               <div className="update-card" style={{border: '1px solid #10b981'}}>
                  <span style={{fontSize: '5rem', marginBottom: '20px', display: 'block'}}>✨</span>
                  <h2 style={{fontSize: '1.8rem', fontWeight: '900', color: '#fff', marginBottom: '10px'}}>Update Successful!</h2>
                  <div style={{color: '#10b981', fontWeight: '900', marginBottom: '20px'}}>System is now at V{appConfig.version}</div>
                  <div style={{color: '#94a3b8', fontSize: '0.9rem', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '15px', textAlign: 'left'}}>
                     <strong style={{color: '#fff', display: 'block', marginBottom: '8px'}}>Release Notes:</strong>
                     {whatsNewData?.changelog || 'We have improved the system stability and fixed some bugs to give you a better experience.'}
                  </div>
                  <button className="btn-primary" style={{background: '#10b981'}} onClick={() => setShowWhatsNew(false)}>COOL, GOT IT!</button>
               </div>
            </div>
          )}

          {noticeModal.visible && (
            <div className="message-overlay fade-in" onClick={hideNotice}>
              <div className={`message-card message-${noticeModal.type}`} onClick={e => e.stopPropagation()}>
                <div className="message-icon">
                  {noticeModal.type === 'success' ? '✅' : noticeModal.type === 'warning' ? '⚠️' : noticeModal.type === '❗'}
                </div>
                <h3>{noticeModal.title}</h3>
                <p>{noticeModal.message}</p>
                <button type="button" className="message-primary" onClick={hideNotice}>OK</button>
              </div>
            </div>
          )}

          <div style={{textAlign: 'center', padding: '20px 0', marginBottom: '15px'}} onDoubleClick={handleUpdateServer}>
              <div style={{fontSize: '0.6rem', color: '#3b82f6', fontWeight: '900', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '10px'}}>Time Attendance Hub</div>
              <h1 style={{fontSize: '1.6rem', margin: 0, fontWeight: '900', color: '#fff'}}>{tenantInfo?.companyName?.toUpperCase() || 'OFFICIAL HUB'}</h1>
              <div style={{fontSize: '0.7rem', color: '#64748b', fontWeight: '700', marginTop: '5px'}}>System V{appConfig.version}</div>
          </div>

          {!loggedIn ? (
            <div className="auth-shell fade-in">
              <div className="auth-card">
                <div className="auth-hero">
                  <div className="auth-icon pulse">🛡️</div>
                  <div className="auth-badge">SECURE ACCESS</div>
                  <h2>Identity Hub</h2>
                  <p>Use your registered employee ID to continue with a smooth, secure sign in.</p>
                </div>

                <div className="auth-field">
                  <span className="label-visible">EMPLOYEE ID</span>
                  <input
                    name={`emp_id_${Math.random().toString(36).substring(7)}`}
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    placeholder="--- ENTER ID ---"
                    className="input-field auth-input"
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                  />
                </div>

                <button onClick={login} disabled={loading} className={`btn-primary ${loading ? 'is-loading' : ''}`}>
                  {loading ? 'VERIFYING...' : 'SIGN IN'}
                </button>

                <div className={`auth-status-pill ${loading ? 'is-active' : ''}`}>
                  {loading ? 'Authenticating your access...' : (status || 'System ready for sign in')}
                </div>
              </div>
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
                    <button type="button" className="branch-select-button" onClick={() => setShowBranchPicker(true)}>
                      <span>{departments.find(d => d.departmentId === selectedDepartment)?.name || '-- Select Office/Branch --'}</span>
                      <span className="branch-select-arrow">▾</span>
                    </button>

                    {showBranchPicker && (
                      <div className="picker-modal fade-in" onClick={() => setShowBranchPicker(false)}>
                        <div className="picker-panel" onClick={e => e.stopPropagation()}>
                          <div className="picker-header">
                            <div>
                              <div className="picker-title">Choose Branch</div>
                              <div className="picker-subtitle">Tap a branch to continue</div>
                            </div>
                            <button type="button" className="picker-close" onClick={() => setShowBranchPicker(false)}>✕</button>
                          </div>
                          <div className="picker-list">
                            {departments.map(d => (
                              <button
                                key={d.departmentId}
                                type="button"
                                className={`picker-item ${selectedDepartment === d.departmentId ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectedDepartment(d.departmentId);
                                  setShowBranchPicker(false);
                                }}
                              >
                                <span>{d.name}</span>
                                {selectedDepartment === d.departmentId && <span className="picker-item-check">✓</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

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
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '15px 20px', borderRadius: '20px'}}>
                     <h2 style={{margin: 0, fontSize: '1.2rem'}}>Attendance Logs</h2>
                     <button onClick={syncSystemData} style={{background: 'rgba(59, 130, 246, 0.1)', border: 'none', color: '#3b82f6', padding: '10px 18px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', cursor: 'pointer'}}>REFRESH</button>
                  </div>

                  {groupedLogs.length === 0 ? (
                    <div style={{textAlign: 'center', padding: '60px 20px', color: '#64748b'}}>
                        <div style={{fontSize: '5rem', marginBottom: '20px'}}>📋</div>
                        <p style={{fontWeight: '700'}}>Walang activity history na nahanap.</p>
                    </div>
                  ) : (
                    <div style={{overflowX: 'auto'}}>
                      <table className="log-table">
                        <thead>
                          <tr>
                            <th>Branch</th>
                            <th>Schedule</th>
                            <th>Time In</th>
                            <th>Time Out</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedLogs.map((group, i) => {
                            const status = getGroupStatus(group);
                            const scheduleText = cachedEmployee?.schedule || 'Regular Shift';
                            return (
                              <tr key={i} className="fade-in" style={{animationDelay: `${i * 0.05}s`}}>
                                <td>
                                  <span className="branch-name" style={{fontSize: '0.75rem', display: 'block'}}>{group.branch}</span>
                                  <span className="log-date" style={{fontSize: '0.6rem', color: '#64748b'}}>{group.date}</span>
                                </td>
                                <td>
                                   <span className="time-value" style={{color: '#94a3b8'}}>{scheduleText}</span>
                                </td>
                                <td>
                                   <span className="time-value" style={{color: group.in ? '#10b981' : '#334155'}}>
                                      {group.in ? new Date(group.in.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                                   </span>
                                </td>
                                <td>
                                   <span className="time-value" style={{color: group.out ? '#f59e0b' : '#334155'}}>
                                      {group.out ? new Date(group.out.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                                   </span>
                                </td>
                                <td>
                                  <span className={`badge ${
                                    status === 'COMPLETED' ? 'badge-success' :
                                    status === 'LATE' ? 'badge-late' :
                                    status === 'DUTY' ? 'badge-duty' :
                                    status === 'PRESENT' ? 'badge-success' :
                                    'badge-pending'
                                  }`} style={{fontSize: '0.55rem', padding: '5px 10px'}}>
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="fade-in">
                   <div className="glass-card" style={{marginBottom: '20px'}}>
                      <div style={{textAlign: 'center', marginBottom: '30px'}}>
                         <div style={{width: '100px', height: '100px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', margin: '0 auto 20px auto'}}>👤</div>
                         <h2 style={{margin: 0}}>{cachedEmployee?.name || localStorage.getItem('cached_name')}</h2>
                         <p style={{color: '#94a3b8', margin: '5px 0 0 0'}}>{cachedEmployee?.jobTitle || 'Staff'}</p>
                      </div>

                      <div style={{background: 'rgba(255,255,255,0.03)', borderRadius: '20px', padding: '20px', marginBottom: '20px'}}>
                         <div style={{marginBottom: '15px'}}>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>EMPLOYEE ID</div>
                            <div style={{fontWeight: '700'}}>{localStorage.getItem('cached_id')}</div>
                         </div>
                         <div style={{marginBottom: '15px'}}>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>DEPARTMENT</div>
                            <div style={{fontWeight: '700'}}>{cachedEmployee?.department || cachedEmployee?.branchName || '-'}</div>
                         </div>
                         <div style={{marginBottom: '15px'}}>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>BRANCH</div>
                            <div style={{fontWeight: '700'}}>{departments.find(d => d.departmentId === selectedDepartment)?.name || '-'}</div>
                         </div>
                         <div>
                            <div style={{fontSize: '0.65rem', color: '#64748b', fontWeight: '900', marginBottom: '5px'}}>WORK SCHEDULE</div>
                            <div style={{fontWeight: '700', color: '#f59e0b'}}>{cachedEmployee?.schedule || 'Regular Shift'}</div>
                         </div>
                      </div>

                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px'}}>
                        <div style={{background: 'rgba(16, 185, 129, 0.12)', borderRadius: '16px', padding: '12px', textAlign: 'center'}}>
                          <div style={{fontSize: '0.6rem', color: '#86efac', fontWeight: '900', marginBottom: '4px'}}>LATE</div>
                          <div style={{fontSize: '1rem', fontWeight: '900'}}>{attendanceInsights.lateCount}</div>
                        </div>
                        <div style={{background: 'rgba(245, 158, 11, 0.12)', borderRadius: '16px', padding: '12px', textAlign: 'center'}}>
                          <div style={{fontSize: '0.6rem', color: '#fcd34d', fontWeight: '900', marginBottom: '4px'}}>MISS</div>
                          <div style={{fontSize: '1rem', fontWeight: '900'}}>{attendanceInsights.missedPunchCount}</div>
                        </div>
                        <div style={{background: 'rgba(59, 130, 246, 0.12)', borderRadius: '16px', padding: '12px', textAlign: 'center'}}>
                          <div style={{fontSize: '0.6rem', color: '#93c5fd', fontWeight: '900', marginBottom: '4px'}}>EARLY</div>
                          <div style={{fontSize: '1rem', fontWeight: '900'}}>{attendanceInsights.earlyExitCount}</div>
                        </div>
                      </div>

                      <button onClick={() => {if(confirm('Sigurado ka bang mag-logout?')){localStorage.clear(); window.location.reload();}}} className="btn-primary" style={{background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '2px solid rgba(239, 68, 68, 0.2)', boxShadow: 'none'}}>LOGOUT ACCOUNT</button>
                   </div>

                   <div className="glass-card" style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <h3 style={{margin: 0}}>Leave Requests</h3>
                        <span style={{fontSize: '0.7rem', color: '#64748b'}}>NEW</span>
                      </div>
                      <form onSubmit={submitLeaveRequest}>
                        <label className="label-visible">LEAVE TYPE</label>
                        <select value={leaveForm.type} onChange={e => setLeaveForm({...leaveForm, type: e.target.value})} className="input-field" style={{marginBottom: '12px'}}>
                          <option>Sick Leave</option>
                          <option>Vacation Leave</option>
                          <option>Emergency Leave</option>
                          <option>Personal Leave</option>
                        </select>
                        <label className="label-visible">START DATE</label>
                        <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm({...leaveForm, startDate: e.target.value})} className="input-field" style={{marginBottom: '12px'}} />
                        <label className="label-visible">END DATE</label>
                        <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm({...leaveForm, endDate: e.target.value})} className="input-field" style={{marginBottom: '12px'}} />
                        <label className="label-visible">REASON</label>
                        <textarea value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} className="input-field" rows="3" style={{marginBottom: '12px', resize: 'vertical'}} />
                        <label className="label-visible">REPORTS TO</label>
                        <input value={leaveForm.reportsTo} onChange={e => setLeaveForm({...leaveForm, reportsTo: e.target.value})} className="input-field" placeholder="Manager Name" style={{marginBottom: '12px'}} />
                        <button type="submit" className="btn-primary" style={{padding: '16px'}}>SUBMIT LEAVE</button>
                      </form>
                      {leaveRequests.length > 0 && (
                        <div style={{marginTop: '16px'}}>
                          {leaveRequests.slice(0, 3).map(item => (
                            <div key={item.id} style={{background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '12px', marginBottom: '8px'}}>
                              <div style={{fontWeight: '800'}}>{item.type}</div>
                              <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px'}}>{item.startDate} → {item.endDate}</div>
                              {item.reportsTo && <div style={{fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px'}}>Reports To: {item.reportsTo}</div>}
                              <div style={{fontSize: '0.72rem', color: '#f59e0b', marginTop: '6px'}}>{item.status}</div>
                              {item.approvedBy && item.status !== 'Pending' && <div style={{fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px'}}>Approved by: {item.approvedBy}</div>}
                              {item.updatedAt && item.status !== 'Pending' && <div style={{fontSize: '0.72rem', color: '#64748b', marginTop: '4px'}}>Updated: {new Date(item.updatedAt).toLocaleString()}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                   </div>

                   <div className="glass-card" style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <h3 style={{margin: 0}}>Schedule Overview</h3>
                        <span style={{fontSize: '0.7rem', color: '#64748b'}}>UPCOMING</span>
                      </div>
                      {upcomingSchedule.map((item, idx) => (
                        <div key={idx} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '12px', marginBottom: '8px'}}>
                          <div style={{fontWeight: '800'}}>{item.label}</div>
                          <div style={{color: '#f59e0b', fontWeight: '700'}}>{item.time}</div>
                        </div>
                      ))}
                   </div>

                   <div className="glass-card">
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <h3 style={{margin: 0}}>Notifications</h3>
                        <span style={{fontSize: '0.7rem', color: '#64748b'}}>{hrNotifications.length}</span>
                      </div>
                      {hrNotifications.map(item => (
                        <div key={item.id} style={{background: 'rgba(255,255,255,0.04)', borderRadius: '14px', padding: '12px', marginBottom: '8px'}}>
                          <div style={{fontWeight: '800'}}>{item.title}</div>
                          <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px'}}>{item.message}</div>
                        </div>
                      ))}
                   </div>

                   <div style={{textAlign: 'center', marginTop: '30px', color: '#64748b', fontSize: '0.7rem', fontWeight: '900'}}>
                      {status.toUpperCase()} | V{appConfig.version} | {(apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost:4002')) ? 'LAB MODE' : 'CLOUD LIVE'}
                   </div>
                </div>
              )}

              {isManagerView && activeTab === 'leave-approvals' && (
                <div style={{padding: '20px', paddingBottom: '120px'}}>
                  <h2 style={{margin: '0 0 20px 0', color: '#f8fafc', fontSize: '1.3rem', fontWeight: '900'}}>✅ Leave Approvals</h2>
                  <p style={{color: '#94a3b8', marginBottom: '20px', fontSize: '0.85rem'}}>Review and approve leave requests from your team.</p>
                  
                  {leavesForApproval.length === 0 ? (
                    <div style={{textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed #334155'}}>
                      <div style={{fontSize: '2.5rem', marginBottom: '10px'}}>✓</div>
                      <p style={{color: '#94a3b8', margin: 0}}>No pending leave requests.</p>
                    </div>
                  ) : (
                    <div style={{display: 'grid', gap: '12px'}}>
                      {leavesForApproval.map(leave => (
                        <div key={leave.id} style={{background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', borderRadius: '14px', padding: '16px'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px'}}>
                            <div>
                              <div style={{fontWeight: '800', color: '#f8fafc', marginBottom: '4px'}}>{leave.employeeName} ({leave.employeeId})</div>
                              <div style={{fontSize: '0.8rem', color: '#94a3b8'}}>{leave.leaveType || leave.type}</div>
                            </div>
                            <span style={{padding: '4px 10px', borderRadius: '999px', fontSize: '0.7rem', background: '#f59e0b22', color: '#f59e0b', fontWeight: '700'}}>Pending</span>
                          </div>
                          <div style={{fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '8px'}}>
                            📅 {leave.startDate} → {leave.endDate}
                          </div>
                          <div style={{fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '12px'}}>
                            💬 {leave.reason}
                          </div>
                          <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => approveLeaveRequest(leave.id, 'Approved')} style={{flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem'}}>
                              ✓ Approve
                            </button>
                            <button onClick={() => approveLeaveRequest(leave.id, 'Rejected')} style={{flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem'}}>
                              ✗ Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="nav-bar">
                <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
                   <span style={{fontSize: '1.6rem', transition: '0.3s'}}>🏠</span>
                   <span>HOME</span>
                </div>
                <div className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                   <span style={{fontSize: '1.6rem', transition: '0.3s'}}>📋</span>
                   <span>LOGS</span>
                </div>
                {isManagerView && (
                  <div className={`nav-item ${activeTab === 'leave-approvals' ? 'active' : ''}`} onClick={() => {setActiveTab('leave-approvals'); fetchLeavesForApproval();}}>
                     <span style={{fontSize: '1.6rem', transition: '0.3s'}}>✅</span>
                     <span>APPROVALS</span>
                  </div>
                )}
                <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                   <span style={{fontSize: '1.6rem', transition: '0.3s'}}>👤</span>
                   <span>HR HUB</span>
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
