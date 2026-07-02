import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE = '/api'; // Backend handles this

function App() {
  const [activeApiBase, setActiveApiBase] = useState('/api');
  const [saasStatus, setSaasStatus] = useState('Checking SaaS Hub...');

  const currentPath = window.location.pathname;
  const pathParts = currentPath.split('/');
  const portalIndex = pathParts.indexOf('portal');
  const detectedTenantId = portalIndex !== -1 ? pathParts[portalIndex + 1] : '';

  const sessionKey = `admin_user_${detectedTenantId || 'default'}`;

  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem(sessionKey);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [logs, setLogs] = useState([]);

  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [gender, setGender] = useState('Male');
  const [birthDate, setBirthDate] = useState('');
  const [nationality, setNationality] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [schedule, setSchedule] = useState('Regular');
  const [terminationDate, setTerminationDate] = useState('');
  const [terminationNote, setTerminationNote] = useState('');
  const [employeeDepartment, setEmployeeDepartment] = useState('');
  const [employeeStatus, setEmployeeStatus] = useState('Active');
  const [departmentName, setDepartmentName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pinLatitude, setPinLatitude] = useState('');
  const [pinLongitude, setPinLongitude] = useState('');
  const [radiusMeters, setRadiusMeters] = useState('10');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [saasLink, setSaasLink] = useState('Syncing with SaaS Hub...');
  const [tenantDetails, setTenantDetails] = useState(null);

  // Editing State
  const [editingDeptId, setEditingDeptId] = useState(null);

  useEffect(() => {
    const discoverSaaS = async () => {
      try {
        const res = await fetch('https://ntfy.sh/attendance_hub_60003078_active_link/raw');
        if (res.ok) {
          const url = (await res.text()).trim();
          if (url && url.startsWith('http')) {
            const finalApi = `${url}/api`;
            setActiveApiBase(finalApi);
            setSaasStatus(`Connected to SaaS: ${url}`);
            console.log(`[NINJA] Rewired Admin Portal to: ${finalApi}`);
          }
        }
      } catch (e) {
        setSaasStatus('SaaS Hub Offline. Using Local API.');
        setActiveApiBase('/api');
      }
    };
    discoverSaaS();
    // Re-check every 2 minutes for auto-healing
    const interval = setInterval(discoverSaaS, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (detectedTenantId) {
      fetch(`${activeApiBase}/tenant-info/${detectedTenantId}`)
        .then(r => r.json())
        .then(data => setTenantDetails(data))
        .catch(() => {});
    }
  }, [detectedTenantId, activeApiBase]);

  useEffect(() => {
    const syncSaaS = async () => {
      try {
        const res = await fetch('https://ntfy.sh/attendance_hub_60003078_active_link/raw');
        if (res.ok) {
          const url = (await res.text()).trim();
          if (url && url.startsWith('http')) {
            setSaasLink(url);
            // If the current URL is different from the hub URL (and not localhost),
            // it means we are on a stale tunnel.
            if (!window.location.hostname.includes('localhost') && !window.location.origin.includes(url)) {
               console.warn("⚠️ Stale Tunnel Detected. Redirecting to active SaaS link...");
               const newPath = window.location.pathname + window.location.search;
               window.location.href = url + newPath;
            }
          }
        }
      } catch (e) { setSaasLink('Local / Private Network'); }
    };
    syncSaaS();
    const interval = setInterval(syncSaaS, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) {
      loadInitialData();
      // Auto-refresh every 30 seconds for "Automatic" feel
      const interval = setInterval(loadInitialData, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // --- AUTO LOGOUT LOGIC (10 Minutes Inactivity) ---
  useEffect(() => {
    if (!user) return;

    let logoutTimer;
    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 Minutes

    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        sessionStorage.removeItem(sessionKey);
        window.location.reload();
      }, INACTIVITY_LIMIT);
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => document.addEventListener(name, resetTimer));

    resetTimer(); // Initialize timer

    return () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      events.forEach(name => document.removeEventListener(name, resetTimer));
    };
  }, [user]);

  const requestJson = async (path, options = {}) => {
    try {
      const currentUser = JSON.parse(sessionStorage.getItem(sessionKey));
      const headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'x-tenant-id': currentUser?.tenantId || detectedTenantId || ''
      };

      const response = await fetch(`${activeApiBase}${path}`, { ...options, headers });
// ... rest of requestJson ...
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        throw new Error(isJson ? (data?.error || 'Error') : 'Server error');
      }
      return data;
    } catch (error) {
      throw error;
    }
  };

  const handleLogin = async () => {
    setStatus('Logging in...');
    try {
      const res = await requestJson('/auth/web-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: detectedTenantId, username, password })
      });

      if (res.success) {
        sessionStorage.setItem(sessionKey, JSON.stringify(res.user));
        setUser(res.user);
        setActiveTab('dashboard');
      }
    } catch (e) {
      setStatus('Invalid Username or Password');
    }
  };

  const loadInitialData = async () => {
    try {
      const emps = await requestJson('/employees');
      setEmployees(Array.isArray(emps) ? emps : []);
      const depts = await requestJson('/departments');
      setDepartments(Array.isArray(depts) ? depts : []);
      const attendanceLogs = await requestJson('/logs');
      setLogs(Array.isArray(attendanceLogs) ? attendanceLogs : []);
    } catch (error) { console.error(error); }
  };

  const hasPerm = (perm) => user?.permissions?.includes(perm);

  if (!user) {
    // ... login screen code ...
    return (
      <div className="container login-box">
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          fontSize: '0.65rem',
          background: '#1e293b',
          padding: '4px 8px',
          borderRadius: '20px',
          color: saasLink.startsWith('http') ? '#10b981' : '#64748b',
          border: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          animation: 'pulse 2s infinite'
        }}>
          <div style={{width:'6px', height:'6px', borderRadius:'50%', background: saasLink.startsWith('http') ? '#10b981' : '#64748b'}}></div>
          {saasLink.startsWith('http') ? 'SaaS Hub Active' : 'Local Mode'}
        </div>

        <style>{`
          @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
          }
        `}</style>

        <h1>Admin Login</h1>
        {tenantDetails ? (
           <div style={{textAlign: 'center', marginBottom: '15px'}}>
             <div style={{fontSize: '1.1rem', fontWeight: 'bold', color: '#fff'}}>{tenantDetails.companyName}</div>
             {tenantDetails.adminIp && (
               <div style={{fontSize: '0.75rem', color: '#3b82f6', marginTop: '5px'}}>
                 🌐 Virtual Host IP: <span style={{letterSpacing:'1px'}}>{tenantDetails.adminIp}</span>
               </div>
             )}
           </div>
        ) : detectedTenantId ? (
          <p style={{fontSize: '0.8rem', color: '#64748b', marginBottom: '5px'}}>Portal: <span style={{color: '#3b82f6', fontWeight: 'bold'}}>{detectedTenantId}</span></p>
        ) : (
          <p style={{fontSize: '0.8rem', color: '#f59e0b'}}>⚠️ Standard Mode (Root Access)</p>
        )}

        {saasLink.startsWith('http') && (
           <div style={{fontSize: '0.6rem', color: '#475569', marginBottom: '15px', wordBreak: 'break-all'}}>
             🔗 {saasLink}
           </div>
        )}

        <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px'}}>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Username"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Password"
          />
          <button onClick={handleLogin}>Sign In</button>
        </div>
        <p style={{marginTop: '15px', color: '#e53e3e'}}>{status}</p>
        {!detectedTenantId && (
          <div style={{marginTop: '20px', fontSize: '0.7rem', color: '#94a3b8', borderTop: '1px solid #eee', paddingTop: '10px'}}>
            TIPS: Gamitin ang specific link ng company mo (e.g. /portal/123456) <br/>
            para ma-access ang tamang dashboard.
          </div>
        )}
      </div>
    );
  }

  // --- REST OF THE FUNCTIONS (RESTORED) ---
  const createEmployee = async () => {
    if (!employeeId || !employeeName) return setStatus('Fill all fields');
    try {
      const data = await requestJson('/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          name: employeeName,
          jobTitle,
          department: employeeDepartment,
          gender,
          birthDate,
          nationality,
          emailAddress,
          mobileNumber,
          joiningDate,
          schedule,
          terminationDate,
          terminationNote,
          status: employeeStatus
        })
      });
      setEmployees(prev => [...prev, data]);
      setEmployeeId(''); setEmployeeName(''); setJobTitle(''); setEmployeeDepartment(''); setBirthDate(''); setNationality('');
      setEmailAddress(''); setMobileNumber(''); setJoiningDate(''); setTerminationDate('');
      setTerminationNote(''); setEmployeeStatus('Active');
      setStatus('Employee Registered ✓');
    } catch (e) { setStatus('Error adding employee'); }
  };

  const deleteEmployee = async (id) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return;
    try {
      await requestJson(`/employees/${id}`, { method: 'DELETE' });
      setEmployees(prev => prev.filter(e => e.employeeId !== id));
      setStatus('Employee deleted successfully.');
    } catch (e) { setStatus('Failed to delete employee.'); }
  };

  const createDepartment = async () => {
    if (!departmentName || !pinLatitude || !pinLongitude) {
      setStatus('Please fill in Dept Name and Location.');
      return;
    }

    try {
      const payload = {
        name: departmentName,
        pinLatitude: parseFloat(pinLatitude),
        pinLongitude: parseFloat(pinLongitude),
        radiusMeters: parseInt(radiusMeters) || 10
      };

      if (editingDeptId) {
        await requestJson(`/departments/${editingDeptId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setStatus('Department updated successfully! ✓');
        setEditingDeptId(null);
      } else {
        payload.departmentId = departmentName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
        const data = await requestJson('/departments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (data) setDepartments(prev => [...prev, data]);
        setStatus('Department added successfully! ✓');
      }

      setDepartmentName(''); setPinLatitude(''); setPinLongitude(''); setRadiusMeters('10');
      loadInitialData();
    } catch (e) {
      console.error(e);
      setStatus('Error saving department.');
    }
  };

  const editDepartment = (dept) => {
    setEditingDeptId(dept.departmentId);
    setDepartmentName(dept.name);
    setPinLatitude(dept.pinLatitude.toString());
    setPinLongitude(dept.pinLongitude.toString());
    setRadiusMeters(dept.radiusMeters.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteDepartment = async (id) => {
    if (!confirm('Delete this department?')) return;
    try {
      await requestJson(`/departments/${id}`, { method: 'DELETE' });
      setDepartments(prev => prev.filter(d => d.departmentId !== id));
      setStatus('Department deleted.');
    } catch (e) { setStatus('Delete failed.'); }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      return setStatus('❌ Browser Error: Geolocation not supported.');
    }

    setStatus('📡 Requesting GPS Access...');

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    const successCallback = (pos) => {
      setPinLatitude(pos.coords.latitude.toFixed(6));
      setPinLongitude(pos.coords.longitude.toFixed(6));
      setStatus('📍 Location captured! ✓');
    };

    const errorCallback = (err) => {
      console.error('Geolocation Error Details:', {
        code: err.code,
        message: err.message,
        protocol: window.location.protocol,
        hostname: window.location.hostname
      });

      if (err.code === 3 && options.enableHighAccuracy) {
        setStatus('📡 Signal weak, retrying with lower accuracy...');
        navigator.geolocation.getCurrentPosition(successCallback, finalErrorCallback, {
          ...options,
          enableHighAccuracy: false
        });
      } else {
        finalErrorCallback(err);
      }
    };

    const finalErrorCallback = (err) => {
      const currentPort = window.location.port ? `:${window.location.port}` : '';
      const localhostUrl = `http://localhost${currentPort}${window.location.pathname}`;

      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.')) {
        setStatus(
          <span style={{color: '#ef4444'}}>
            ❌ Browser blocked GPS on IP address.
            <a href={localhostUrl} style={{color: '#3b82f6', marginLeft: '10px', fontWeight: 'bold', textDecoration: 'underline'}}>
              Switch to Localhost to fix this
            </a>
          </span>
        );
        alert(`SECURITY TIP: Bina-block ng Chrome/Edge ang GPS kapag IP Address ang gamit mo sa browser. \n\nSOLUSYON:\n1. I-click ang "Switch to Localhost" link sa screen.\n2. O kaya i-type sa browser: http://localhost${currentPort}\n3. O kaya gamitin ang HTTPS URL mula sa GO_PUBLIC.bat.`);
      } else if (err.code === 1) {
        setStatus('❌ Permission Denied. Please allow location access in your browser settings.');
      } else if (err.code === 3) {
        setStatus('❌ Timeout: GPS signal is too weak. Try moving near a window or check if location is enabled on your device.');
      } else {
        setStatus(`❌ GPS Error (${err.code}): ${err.message}`);
      }
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
  };

  const assignDepartment = async () => {
    if (!selectedEmployee || !selectedDepartment) {
      setStatus('Please select both Employee and Department.');
      return;
    }

    setStatus('Assigning...');
    try {
      const data = await requestJson('/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          departmentId: selectedDepartment
        })
      });
      if (data && data.success) {
        setStatus('Assignment saved successfully! ✓');
      }
    } catch (e) {
      console.error(e);
      setStatus('Error assigning. Check connection.');
    }
  };

  const exportToExcel = () => {
    const dataToExport = logs.map(log => ({
      'ID': log.employeeId, 'Name': log.employeeName, 'Dept': log.departmentName, 'Type': log.type, 'Time': new Date(log.timestamp).toLocaleString()
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, "Report.xlsx");
  };

  return (
    <div className="container fade-in">
      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
        <div>
          <h1 style={{margin: 0}}>
            🛡️ {user.companyName} Admin
            {user.isConsultant && <span style={{fontSize:'0.6rem', background:'#8b5cf6', color:'white', padding:'2px 8px', borderRadius:'10px', verticalAlign:'middle', marginLeft:'10px'}}>CONSULTANT MODE</span>}
          </h1>
          <div style={{fontSize:'0.8rem', color:'#64748b'}}>
            Portal ID: {detectedTenantId} | {activeApiBase.startsWith('http') ? '🌐 Cloud Sync Active' : '🔌 Local Mode'}
            {activeApiBase.startsWith('http') && <div style={{fontSize:'0.6rem', opacity:0.6}}>{activeApiBase}</div>}
          </div>
        </div>
        <button onClick={() => { sessionStorage.removeItem(sessionKey); window.location.reload(); }} style={{background: '#e53e3e', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer'}}>Sign Out</button>
      </header>

      <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
        <button onClick={() => setActiveTab('dashboard')} style={{padding: '10px 20px', background: activeTab==='dashboard'?'#3182ce':'#edf2f7', color: activeTab==='dashboard'?'white':'#2d3748', borderRadius: '4px', cursor: 'pointer', border: 'none'}}>Dashboard</button>
        {hasPerm('reports') && <button onClick={() => setActiveTab('reports')} style={{padding: '10px 20px', background: activeTab==='reports'?'#3182ce':'#edf2f7', color: activeTab==='reports'?'white':'#2d3748', borderRadius: '4px', cursor: 'pointer', border: 'none'}}>Reports</button>}
        {hasPerm('setup') && <button onClick={() => setActiveTab('setup')} style={{padding: '10px 20px', background: activeTab==='setup'?'#3182ce':'#edf2f7', color: activeTab==='setup'?'white':'#2d3748', borderRadius: '4px', cursor: 'pointer', border: 'none'}}>Setup</button>}
      </div>

      {activeTab === 'dashboard' && (
        <div className="fade-in">
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'20px', marginBottom:'30px'}}>
             <div className="card" style={{textAlign:'center', padding:'20px', background: '#1e293b', border: '1px solid #334155'}}>
                <div style={{fontSize:'0.8rem', color:'#64748b'}}>TOTAL STAFF</div>
                <div style={{fontSize:'2.5rem', fontWeight:'bold', color:'#3b82f6'}}>{employees.length}</div>
             </div>
             <div className="card" style={{textAlign:'center', padding:'20px', background: '#1e293b', border: '1px solid #334155'}}>
                <div style={{fontSize:'0.8rem', color:'#64748b'}}>TOTAL LOGS</div>
                <div style={{fontSize:'2.5rem', fontWeight:'bold', color:'#10b981'}}>{logs.length}</div>
             </div>
          </div>

          <h2 style={{marginBottom:'20px'}}>Available Modules</h2>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'20px'}}>
            {hasPerm('setup') && (
              <div className="card" onClick={() => setActiveTab('setup')} style={{cursor:'pointer', border:'1px solid #334155', background: '#1e293b', padding: '30px', transition: '0.3s'}}>
                <div style={{fontSize:'3rem', marginBottom:'15px'}}>👥</div>
                <h3 style={{margin:'0 0 10px 0'}}>Manage Employee Data</h3>
                <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Register new staff, manage IDs, and update work schedules.</p>
                <button style={{marginTop:'20px', width:'100%', background:'#3b82f6', color:'white', border:'none', padding:'10px', borderRadius:'6px', fontWeight:'bold'}}>Open Module</button>
              </div>
            )}

            {hasPerm('reports') && (
              <div className="card" onClick={() => setActiveTab('reports')} style={{cursor:'pointer', border:'1px solid #334155', background: '#1e293b', padding: '30px', transition: '0.3s'}}>
                <div style={{fontSize:'3rem', marginBottom:'15px'}}>📊</div>
                <h3 style={{margin:'0 0 10px 0'}}>View Attendance Reports</h3>
                <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Analyze logs, export Excel/PDF, and monitor real-time check-ins.</p>
                <button style={{marginTop:'20px', width:'100%', background:'#10b981', color:'white', border:'none', padding:'10px', borderRadius:'6px', fontWeight:'bold'}}>Open Module</button>
              </div>
            )}

            {!hasPerm('setup') && !hasPerm('reports') && (
               <div className="card" style={{gridColumn:'1 / -1', textAlign:'center', padding:'50px', background: '#1e293b', border: '1px solid #334155'}}>
                  <div style={{fontSize:'3rem', marginBottom:'15px'}}>🔒</div>
                  <h3>Waiting for Activation</h3>
                  <p style={{color:'#64748b'}}>Ang mga modules ay hindi pa naka-activate para sa account na ito.</p>
               </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && hasPerm('reports') && (
        <section className="card fade-in">
          <h2>Attendance Logs</h2>
          <div className="export-buttons">
            <button className="btn-excel" onClick={exportToExcel}>📊 Export Excel</button>
            <button onClick={loadInitialData} style={{backgroundColor: '#627d98'}}>🔄 Refresh</button>
          </div>
          <div className="table-container">
            <table style={{minWidth: '1800px'}}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Gender</th>
                  <th>Birth Date</th>
                  <th>Nationality</th>
                  <th>Location (Dept)</th>
                  <th>Joining Date</th>
                  <th>Termination Date</th>
                  <th>Termination Note</th>
                  <th>Schedule</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Location (Distance)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice().reverse().map((l, i) => {
                  const emp = employees.find(e => e.employeeId === l.employeeId);
                  const logDate = new Date(l.timestamp).toLocaleDateString();
                  const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

                  // Backward compatibility logic
                  const displayTimeIn = l.timeIn || (l.type === 'IN' ? l.timestamp : null);
                  const displayTimeOut = l.timeOut || (l.type === 'OUT' ? l.timestamp : null);

                  return (
                    <tr key={i}>
                      <td>{l.employeeId}</td>
                      <td>{l.employeeName}</td>
                      <td>{emp?.gender || '-'}</td>
                      <td>{emp?.birthDate || '-'}</td>
                      <td>{emp?.nationality || '-'}</td>
                      <td>{l.departmentName}</td>
                      <td>{emp?.joiningDate || '-'}</td>
                      <td>{emp?.terminationDate || '-'}</td>
                      <td>{emp?.terminationNote || '-'}</td>
                      <td>{emp?.schedule || 'Regular'}</td>
                      <td>{logDate}</td>
                      <td>{formatTime(displayTimeIn)}</td>
                      <td>{formatTime(displayTimeOut)}</td>
                      <td>
                        {l.distanceMeters !== undefined ? (
                          <span style={{fontSize: '0.8rem', color: l.distanceMeters > 50 ? '#ef4444' : '#64748b'}}>
                            📍 {l.distanceMeters}m from center
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={`badge ${displayTimeOut ? 'badge-out' : 'badge-in'}`}>
                          {displayTimeOut ? 'Completed' : 'Present'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 style={{marginTop:'40px'}}>Employee Device Status</h2>
          <div className="table-container">
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Device Info</th><th>Action</th></tr></thead>
              <tbody>
                {employees.map((emp, i) => (
                  <tr key={i}>
                    <td>{emp.employeeId}</td>
                    <td>{emp.name}</td>
                    <td>
                      {emp.registeredDeviceId ?
                        <span style={{color:'#10b981', fontWeight:'bold'}}>🔒 LOCKED</span> :
                        <span style={{color:'#94a3b8'}}>🔓 OPEN</span>
                      }
                    </td>
                    <td>
                      {emp.registeredDeviceId ? (
                        <div style={{fontSize:'0.8rem'}}>
                          <div>ID: {emp.registeredDeviceId.substring(0,8)}...</div>
                          <div style={{color:'#64748b'}}>{emp.registeredDeviceName || 'Mobile App'}</div>
                          {emp.registrationDate && <div style={{fontSize:'0.7rem', color:'#94a3b8'}}>{new Date(emp.registrationDate).toLocaleDateString()}</div>}
                        </div>
                      ) : '-'}
                    </td>
                    <td>
                      {emp.registeredDeviceId && (
                        <button
                          onClick={async () => {
                            if(confirm(`Reset device lock for ${emp.name}?`)) {
                              await requestJson('/device/reset', { method: 'POST', body: JSON.stringify({ employeeId: emp.employeeId }) });
                              loadInitialData();
                            }
                          }}
                          style={{backgroundColor:'#ef4444', padding:'4px 8px', fontSize:'0.75rem', marginTop:0}}
                        >Reset Device</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'setup' && hasPerm('setup') && (
        <div className="fade-in">
          <section className="card">
            <h2 style={{color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '10px'}}>
              <span style={{fontSize: '1.5rem'}}>👤</span> Register New Employee
            </h2>
            <div className="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px'}}>
              <label>Employee ID <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="e.g. EMP-001" /></label>
              <label>Full Name <input value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder="Juan Dela Cruz" /></label>
              <label>Job Title <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Software Engineer" /></label>
              <label>Department <input value={employeeDepartment} onChange={e => setEmployeeDepartment(e.target.value)} placeholder="e.g. IT, HR, Marketing" /></label>

              <label>Gender
                <select value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>

              <label>Nationality <input value={nationality} onChange={e => setNationality(e.target.value)} placeholder="Filipino" /></label>
              <label>Birth Date <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} /></label>

              <label>Email Address <input type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} placeholder="juan@company.com" /></label>
              <label>Mobile Number <input value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="09123456789" /></label>

              <label>Joining Date <input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} /></label>

              <label>Work Schedule
                <select value={schedule} onChange={e => setSchedule(e.target.value)}>
                  <option value="Regular">Regular Schedule</option>
                  <option value="Night Shift">Night Shift</option>
                  <option value="Flexi">Flexi Time</option>
                </select>
              </label>

              <label>Status
                <select value={employeeStatus} onChange={e => setEmployeeStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Terminated">Terminated</option>
                </select>
              </label>

              {employeeStatus === 'Terminated' && (
                <>
                  <label>Termination Date <input type="date" value={terminationDate} onChange={e => setTerminationDate(e.target.value)} /></label>
                  <label style={{gridColumn: '1 / -1'}}>Termination Note <input value={terminationNote} onChange={e => setTerminationNote(e.target.value)} placeholder="Reason for termination" /></label>
                </>
              )}
            </div>
            <button onClick={createEmployee} style={{marginTop: '25px', width: '100%', padding: '15px', fontSize: '1rem', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'}}>
              🚀 Register Employee
            </button>
          </section>

          <section className="card" style={{overflow: 'hidden'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h2 style={{color: '#10b981', display: 'flex', alignItems: 'center', gap: '10px', margin: 0}}>
                <span style={{fontSize: '1.5rem'}}>📋</span> Master Employee List
              </h2>
              <div style={{display: 'flex', gap: '10px'}}>
                <input
                  type="text"
                  placeholder="🔍 Search employee..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{padding: '8px 15px', borderRadius: '10px', border: '1px solid #d9e2ec', width: '250px', fontSize: '0.9rem'}}
                />
                <button onClick={loadInitialData} style={{margin: 0, padding: '8px 15px', background: '#64748b', fontSize: '0.8rem'}}>🔄 Refresh</button>
              </div>
            </div>

            <div className="table-container" style={{borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff'}}>
              <table style={{minWidth: '1600px', fontSize: '0.85rem'}}>
                <thead style={{background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10}}>
                  <tr>
                    <th>Employee ID</th>
                    <th>Full Name</th>
                    <th>Job Title</th>
                    <th>Department</th>
                    <th>Work Branch</th>
                    <th>Gender</th>
                    <th>Nationality</th>
                    <th>Birth Date</th>
                    <th>Email Address</th>
                    <th>Mobile Number</th>
                    <th>Joining Date</th>
                    <th>Termination Date</th>
                    <th>Termination Note</th>
                    <th>Status</th>
                    <th style={{textAlign: 'center'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.filter(emp =>
                    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (emp.jobTitle && emp.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()))
                  ).length === 0 ? (
                    <tr><td colSpan="15" style={{textAlign: 'center', padding: '40px', color: '#64748b'}}>
                      {searchQuery ? 'No results found for your search.' : 'No employees found. Register one above!'}
                    </td></tr>
                  ) : (
                    employees
                      .filter(emp =>
                        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (emp.jobTitle && emp.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .map((emp, i) => (
                        <tr key={i} style={{animation: `fadeIn 0.3s ease forwards ${i * 0.03}s`, opacity: 0}}>
                          <td style={{fontWeight: 'bold', color: '#3b82f6'}}>{emp.employeeId}</td>
                          <td style={{fontWeight: '600'}}>{emp.name}</td>
                          <td>{emp.jobTitle || '-'}</td>
                          <td>{emp.department || '-'}</td>
                          <td>
                            {emp.departmentName ? (
                              <span style={{background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold'}}>
                                📍 {emp.departmentName}
                              </span>
                            ) : '-'}
                          </td>
                          <td>{emp.gender}</td>
                          <td>{emp.nationality}</td>
                          <td>{emp.birthDate}</td>
                          <td>{emp.emailAddress || '-'}</td>
                          <td>{emp.mobileNumber || '-'}</td>
                          <td>{emp.joiningDate}</td>
                          <td>{emp.terminationDate || '-'}</td>
                          <td title={emp.terminationNote} style={{maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            {emp.terminationNote || '-'}
                          </td>
                          <td>
                            <span className="badge" style={{
                              background: emp.status === 'Active' ? '#def7ec' : emp.status === 'Terminated' ? '#fde2e2' : '#fef3c7',
                              color: emp.status === 'Active' ? '#03543f' : emp.status === 'Terminated' ? '#9b1c1c' : '#92400e',
                              padding: '4px 10px',
                              display: 'inline-block',
                              minWidth: '80px',
                              textAlign: 'center'
                            }}>
                              {emp.status || 'Active'}
                            </span>
                          </td>
                          <td style={{textAlign: 'center'}}>
                            <button
                              onClick={() => deleteEmployee(emp.employeeId)}
                              style={{
                                margin: 0,
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                background: '#fee2e2',
                                color: '#ef4444',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: '0.2s'
                              }}
                              onMouseEnter={(e) => { e.target.style.background = '#ef4444'; e.target.style.color = 'white'; }}
                              onMouseLeave={(e) => { e.target.style.background = '#fee2e2'; e.target.style.color = '#ef4444'; }}
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>{editingDeptId ? 'Edit Department' : 'Create Department (Geofenced)'}</h2>
            <div className="grid">
              <label>Dept Name <input value={departmentName} onChange={e => setDepartmentName(e.target.value)} placeholder="Main Office" /></label>
              <label>Latitude <input value={pinLatitude} onChange={e => setPinLatitude(e.target.value)} placeholder="14.1234" /></label>
              <label>Longitude <input value={pinLongitude} onChange={e => setPinLongitude(e.target.value)} placeholder="121.1234" /></label>
              <label>Radius (Meters) <input type="number" value={radiusMeters} onChange={e => setRadiusMeters(e.target.value)} placeholder="50" /></label>
            </div>
            <div style={{display:'flex', gap:'10px'}}>
              <button onClick={createDepartment} style={{flex:1}}>{editingDeptId ? 'Update Dept' : 'Create Dept'}</button>
              {editingDeptId && <button onClick={() => { setEditingDeptId(null); setDepartmentName(''); setPinLatitude(''); setPinLongitude(''); setRadiusMeters('10'); }} style={{flex:1, backgroundColor:'#718096'}}>Cancel</button>}
              <button onClick={useCurrentLocation} style={{flex:1, backgroundColor:'#4a5568'}}>📍 Use Current Location</button>
            </div>
            {(window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.')) && (
              <div style={{marginTop:'15px', padding:'10px', background:'rgba(245, 158, 11, 0.1)', border:'1px solid #f59e0b', borderRadius:'8px', fontSize:'0.75rem', color:'#f59e0b'}}>
                <b>💡 NINJA TIP:</b> Naka-IP address ka. Bina-block ng browser ang GPS sa mode na 'to.
                <a href={`http://localhost:${window.location.port}${window.location.pathname}`} style={{color:'#3b82f6', marginLeft:'5px', fontWeight:'bold', textDecoration:'underline'}}>
                  I-click ito para lumipat sa Localhost
                </a> para gumana ang 📍 button.
              </div>
            )}

            <div style={{marginTop:'20px'}}>
              <h3>Manage Existing Departments</h3>
              <table style={{width:'100%', fontSize:'0.8rem'}}>
                <thead><tr><th>Name</th><th>Radius</th><th>Action</th></tr></thead>
                <tbody>
                  {departments.map(d => (
                    <tr key={d.departmentId}>
                      <td>{d.name}</td>
                      <td>{d.radiusMeters}m</td>
                      <td style={{display:'flex', gap:'5px'}}>
                        <button onClick={() => editDepartment(d)} style={{padding:'2px 8px', fontSize:'0.7rem', background:'#3182ce'}}>Edit</button>
                        <button onClick={() => deleteDepartment(d.departmentId)} style={{padding:'2px 8px', fontSize:'0.7rem', background:'#e53e3e'}}>Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Assign Employee to Dept</h2>
            <div className="grid">
              <label>Employee
                <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                  <option value="">Select Employee</option>
                  {employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.name} ({e.employeeId})</option>)}
                </select>
              </label>
              <label>Target Department
                <select value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)}>
                  <option value="">Select Dept</option>
                  {departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <button onClick={assignDepartment}>Confirm Assignment</button>
          </section>
        </div>
      )}

      <section className="status-card"><p>{status}</p></section>
    </div>
  );
}

export default App;
