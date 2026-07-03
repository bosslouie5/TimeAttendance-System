import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE = '/api';

function App() {
  const [activeApiBase, setActiveApiBase] = useState('/api');
  const [saasStatus, setSaasStatus] = useState('Syncing...');

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tenantDetails, setTenantDetails] = useState(null);
  const [status, setStatus] = useState('');

  // Form States
  const [newOrgName, setNewOrgName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchLat, setBranchLat] = useState('');
  const [branchLon, setBranchLon] = useState('');
  const [branchRad, setBranchRad] = useState('50');
  const [editingBranchId, setEditingBranchId] = useState(null);

  // New Employee Modal States
  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empStatus, setEmpStatus] = useState('Active');
  const [empJobTitle, setEmpJobTitle] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empDept, setEmpDept] = useState('');
  const [empGender, setEmpGender] = useState('');
  const [empNationality, setEmpNationality] = useState('');
  const [empBirthDate, setEmpBirthDate] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empMobile, setEmpMobile] = useState('');
  const [empJoiningDate, setEmpJoiningDate] = useState('');
  const [empTermDate, setEmpTermDate] = useState('');
  const [empTermNote, setEmpTermNote] = useState('');
  const [empSchedule, setEmpSchedule] = useState('Regular');
  const [empSearch, setEmpSearch] = useState('');

  useEffect(() => {
    const checkConnection = async () => {
      if (window.location.hostname.includes('trycloudflare.com') || window.location.hostname === 'localhost') {
        setActiveApiBase('/api');
      } else {
        try {
          const res = await fetch(`https://raw.githubusercontent.com/bosslouie5/TimeAttendance-System/main/backend/active_link.txt?t=${Date.now()}`);
          if (res.ok) {
            const url = (await res.text()).trim();
            if (url && url.startsWith('http')) setActiveApiBase(`${url}/api`);
          }
        } catch (e) { setActiveApiBase('/api'); }
      }
    };
    checkConnection();
  }, []);

  useEffect(() => {
    if (detectedTenantId) {
      fetch(`${activeApiBase}/tenant-info/${detectedTenantId}`)
        .then(r => r.json())
        .then(data => {
          setTenantDetails(data);
          if (user && !user.isConsultant && data.permissions) {
            const updated = { ...user, permissions: data.permissions };
            setUser(updated);
            sessionStorage.setItem(sessionKey, JSON.stringify(updated));
          }
        })
        .catch(() => {});
    }
  }, [detectedTenantId, activeApiBase]);

  useEffect(() => {
    if (user) {
      loadInitialData();
      const interval = setInterval(loadInitialData, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const requestJson = async (path, options = {}) => {
    const headers = { ...options.headers, 'Content-Type': 'application/json', 'x-tenant-id': detectedTenantId };
    const res = await fetch(`${activeApiBase}${path}`, { ...options, headers });
    if (!res.ok) throw new Error('Request Failed');
    return res.json();
  };

  const loadInitialData = async () => {
    try {
      const [e, b, o, l] = await Promise.all([
        requestJson('/employees'),
        requestJson('/departments'),
        requestJson('/org-units'),
        requestJson('/logs')
      ]);
      setEmployees(e || []);
      setDepartments(b || []);
      setOrgUnits(o || []);
      setLogs(l || []);
    } catch (err) { console.error('Load failed', err); }
  };

  const handleLogin = async () => {
    setStatus('Logging in...');
    try {
      const res = await fetch(`${activeApiBase}/auth/web-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: detectedTenantId, username, password })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem(sessionKey, JSON.stringify(data.user));
        setUser(data.user);
        setActiveTab('dashboard');
      } else {
        alert(data.error || 'Invalid Credentials');
        setStatus('');
      }
    } catch (e) { alert('Login connection failed'); setStatus(''); }
  };

  const prepareNewEmployee = () => {
    let nextId = 1;
    if (employees.length > 0) {
      const ids = employees.map(e => parseInt(e.employeeId)).filter(id => !isNaN(id));
      if (ids.length > 0) nextId = Math.max(...ids) + 1;
    }

    setEmpId(nextId.toString().padStart(4, '0'));
    setEmpName('');
    setEmpJobTitle('');
    setEmpDepartment('');
    setEmpDept('');
    setEmpGender('');
    setEmpNationality('');
    setEmpBirthDate('');
    setEmpEmail('');
    setEmpMobile('');
    setEmpJoiningDate('');
    setEmpTermDate('');
    setEmpTermNote('');
    setEmpStatus('Active');
    setIsEditingEmp(false);
    setIsAddEmpModalOpen(true);
  };

  const prepareEditEmployee = (emp) => {
    setEmpId(emp.employeeId);
    setEmpName(emp.name || '');
    setEmpJobTitle(emp.jobTitle || '');
    setEmpDepartment(emp.department || '');
    setEmpDept(emp.branchName || '');
    setEmpGender(emp.gender || '');
    setEmpNationality(emp.nationality || '');
    setEmpBirthDate(emp.birthDate || '');
    setEmpEmail(emp.email || '');
    setEmpMobile(emp.mobile || '');
    setEmpJoiningDate(emp.joiningDate || '');
    setEmpTermDate(emp.terminationDate || '');
    setEmpTermNote(emp.terminationNote || '');
    setEmpStatus(emp.status || 'Active');
    setIsEditingEmp(true);
    setIsAddEmpModalOpen(true);
  };

  const saveNewEmployee = async () => {
    if (!empName) return alert('Name is required');
    setStatus(isEditingEmp ? 'Updating Employee...' : 'Adding Employee...');
    try {
      const url = isEditingEmp
        ? `/employees/${empId}`
        : `/employees`;

      const method = isEditingEmp ? 'PUT' : 'POST';

      const data = await requestJson(url, {
        method: method,
        body: JSON.stringify({
          employeeId: empId,
          name: empName,
          jobTitle: empJobTitle,
          department: empDepartment,
          branchName: empDept,
          gender: empGender,
          nationality: empNationality,
          birthDate: empBirthDate,
          email: empEmail,
          mobile: empMobile,
          joiningDate: empJoiningDate,
          terminationDate: empTermDate,
          terminationNote: empTermNote,
          schedule: empSchedule,
          status: empStatus,
          tenantId: detectedTenantId
        })
      });

      setStatus(isEditingEmp ? 'Employee Updated! ✓' : 'Employee Added! ✓');
      setIsAddEmpModalOpen(false);
      loadInitialData();
    } catch (e) {
      alert('Failed to save employee');
      setStatus('Error saving employee');
    }
  };

  const deleteEmployee = async (id) => {
    if (!confirm(`Are you sure you want to delete employee ${id}? This cannot be undone.`)) return;
    setStatus('Deleting employee...');
    try {
      await requestJson(`/employees/${id}`, {
        method: 'DELETE'
      });
      setStatus('Employee deleted ✓');
      loadInitialData();
    } catch (e) {
      alert('Failed to delete employee');
      setStatus('Error deleting employee');
    }
  };

  const addOrgUnit = async () => {
    if (!newOrgName) return alert('Enter Department Name');
    setStatus('Adding Department...');
    try {
      await requestJson('/org-units', {
        method: 'POST',
        body: JSON.stringify({ name: newOrgName, tenantId: detectedTenantId })
      });
      setStatus('Department Created! ✓');
      setNewOrgName('');
      loadInitialData();
    } catch (e) {
      alert('Failed to add department');
      setStatus('Error adding department');
    }
  };

  const deleteOrgUnit = async (id) => {
    if (!confirm('Sigurado ka bang buburahin ang department na ito?')) return;
    setStatus('Deleting department...');
    try {
      await requestJson(`/org-units/${id}`, {
        method: 'DELETE'
      });
      setStatus('Department Removed ✓');
      loadInitialData();
    } catch (e) {
      alert('Failed to delete department');
      setStatus('Error deleting department');
    }
  };

  const saveBranch = async () => {
    if (!branchName || !branchLat || !branchLon) return alert('Punan ang lahat ng fields.');
    setStatus(editingBranchId ? 'Updating Branch...' : 'Creating Branch...');
    try {
      const payload = {
        name: branchName,
        pinLatitude: parseFloat(branchLat),
        pinLongitude: parseFloat(branchLon),
        radiusMeters: parseInt(branchRad) || 50,
        tenantId: detectedTenantId
      };

      if (editingBranchId) {
        await requestJson(`/departments/${editingBranchId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        payload.departmentId = branchName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
        await requestJson('/departments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setStatus(editingBranchId ? 'Branch Updated! ✓' : 'Branch Created! ✓');
      setBranchName(''); setBranchLat(''); setBranchLon(''); setBranchRad('50'); setEditingBranchId(null);
      loadInitialData();
    } catch (e) {
      alert('Failed to save branch');
      setStatus('Error saving branch');
    }
  };

  const deleteBranch = async (id) => {
    if (!confirm('Sigurado ka bang buburahin ang branch na ito?')) return;
    setStatus('Deleting branch...');
    try {
      await requestJson(`/departments/${id}`, {
        method: 'DELETE'
      });
      setStatus('Branch Deleted ✓');
      loadInitialData();
    } catch (e) {
      alert('Failed to delete branch');
      setStatus('Error deleting branch');
    }
  };

  const editBranch = (b) => {
    setEditingBranchId(b.departmentId);
    setBranchName(b.name);
    setBranchLat(b.pinLatitude.toString());
    setBranchLon(b.pinLongitude.toString());
    setBranchRad(b.radiusMeters.toString());
  };

  const exportEmployeesExcel = () => {
    if (employees.length === 0) return alert('Walang data na pwedeng i-export.');

    const companyName = user?.companyName || 'Company';

    const exportData = employees.map(e => ({
      'Employee ID': e.employeeId,
      'Full Name': e.name,
      'Job Title': e.jobTitle || '-',
      'Department': e.department || '-',
      'Assigned Branch': e.branchName || '-',
      'Gender': e.gender || '-',
      'Nationality': e.nationality || '-',
      'Birth Date': e.birthDate || '-',
      'Email Address': e.email || '-',
      'Mobile Number': e.mobile || '-',
      'Joining Date': e.joiningDate || '-',
      'Termination Date': e.terminationDate || '-',
      'Termination Note': e.terminationNote || '-',
      'Status': e.status || 'Active'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Autofit Logic: Calculate column widths based on content
    const colWidths = Object.keys(exportData[0] || {}).map(key => {
      let maxLen = key.length;
      exportData.forEach(row => {
        const cellValue = String(row[key] || '');
        if (cellValue.length > maxLen) maxLen = cellValue.length;
      });
      return { wch: maxLen + 5 }; // Adding padding for safety
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, `${companyName}_Employee_List.xlsx`);
  };

  const hasPerm = (perm) => user?.permissions?.includes(perm);

  if (!user) {
    return (
      <div className="login-screen">
        <style>{`
          .login-screen { background: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif; }
          .login-box { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; maxWidth: 400px; text-align: center; }
          input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; outline: none; }
          button { width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
          button:hover { background: #2563eb; }
        `}</style>
        <div className="login-box">
          <h1>Admin Login</h1>
          {tenantDetails && <h2 style={{color:'#64748b', fontSize:'1.2rem', marginBottom:'25px'}}>{tenantDetails.companyName}</h2>}
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
          <button onClick={handleLogin}>{status || 'Sign In'}</button>
          <p style={{marginTop:'15px', fontSize:'0.8rem', color:'#94a3b8'}}>Portal ID: {detectedTenantId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <style>{`
        body { background: #f1f5f9; color: #1e293b; font-family: sans-serif; margin: 0; padding: 20px; }
        .app-container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 20px; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .menu-item { padding: 12px 20px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: 0.2s; font-weight: bold; color: #475569; }
        .menu-item:hover { background: #f8fafc; color: #3b82f6; }
        .module-card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); cursor: pointer; transition: 0.3s; text-align: center; border: 1px solid #e2e8f0; }
        .module-card:hover { transform: translateY(-5px); border-color: #3b82f6; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.1); }
        .page-label { background: white; padding: 10px 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 12px; border-bottom: 2px solid #f1f5f9; color: #64748b; font-size: 0.8rem; text-transform: uppercase; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
        .btn-blue { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        .btn-green { background: #10b981 !important; color: white !important; border: none !important; padding: 10px 20px !important; border-radius: 6px !important; font-weight: bold !important; cursor: pointer !important; }
        .btn-red { background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.75rem; }
        .btn-edit { background: #3b82f6; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.75rem; }
        .btn-excel { background: #1e8449 !important; color: white !important; border: none !important; padding: 10px 20px !important; border-radius: 6px !important; font-weight: bold !important; cursor: pointer !important; transition: 0.3s; }
        .btn-excel:hover { background: #156d39 !important; transform: translateY(-1px); }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-content { background: white; padding: 30px; border-radius: 15px; width: 100%; maxWidth: 700px; position: relative; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { display: flex; flexDirection: column; gap: 5px; }
        .form-group label { color: #64748b; fontSize: 0.8rem; font-weight: bold; }
        .form-group input, .form-group select { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; outline: none; }
        .form-group input:focus { border-color: #3b82f6; }
      `}</style>

      <header style={{position:'relative'}}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <div
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{cursor:'pointer', padding:'10px', borderRadius:'8px', background: isMenuOpen ? '#3b82f6' : 'white', color: isMenuOpen ? 'white' : '#1e293b', boxShadow:'0 2px 4px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', justifyContent:'center'}}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </div>
          <div>
            <h1 style={{margin: 0}}>🛡️ {user.companyName} Admin PORTAL</h1>
            <p style={{margin: 0, color: '#64748b', fontSize: '0.8rem'}}>Official Management Portal | ID: {detectedTenantId}</p>
          </div>
        </div>

        {isMenuOpen && (
          <div style={{position:'absolute', top:'65px', left:'0', background:'white', borderRadius:'12px', width:'220px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)', zIndex:1000, overflow:'hidden', border:'1px solid #e2e8f0'}}>
            <div className="menu-item" onClick={() => { setActiveTab('dashboard'); setIsMenuOpen(false); }}>📊 Dashboard</div>
            {hasPerm('employees') && <div className="menu-item" onClick={() => { setActiveTab('employees'); setIsMenuOpen(false); }}>👥 Staff List</div>}
            {hasPerm('org-units') && <div className="menu-item" onClick={() => { setActiveTab('org-units'); setIsMenuOpen(false); }}>🏢 Departments</div>}
            {hasPerm('branches') && <div className="menu-item" onClick={() => { setActiveTab('branches'); setIsMenuOpen(false); }}>📍 Branches</div>}
            {hasPerm('reports') && <div className="menu-item" onClick={() => { setActiveTab('reports'); setIsMenuOpen(false); }}>📈 Analytics Logs</div>}
            <div className="menu-item" style={{color:'#ef4444', borderTop:'2px solid #f1f5f9'}} onClick={() => { sessionStorage.removeItem(sessionKey); window.location.reload(); }}>🏃 Sign Out</div>
          </div>
        )}

        <button onClick={() => { sessionStorage.removeItem(sessionKey); window.location.reload(); }} style={{background: '#ef4444', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer'}}>Sign Out</button>
      </header>

      {/* PAGE LABEL INDICATOR */}
      <div className="page-label">
        <span style={{color:'#64748b'}}>Current Page:</span>
        <span style={{fontWeight:'bold', color:'#3b82f6', textTransform:'uppercase'}}>
          {activeTab === 'dashboard' && '📊 Dashboard Overview'}
          {activeTab === 'employees' && '👥 Employee Management'}
          {activeTab === 'org-units' && '🏢 Organizational Units'}
          {activeTab === 'branches' && '📍 Branch Locations'}
          {activeTab === 'reports' && '📈 Attendance Reports'}
        </span>
        {activeTab !== 'dashboard' && (
           <button onClick={() => setActiveTab('dashboard')} style={{marginLeft:'auto', background:'none', border:'none', color:'#3b82f6', cursor:'pointer', fontWeight:'bold'}}>← Back to Hub</button>
        )}
      </div>

      {/* Main Content */}
      {activeTab === 'dashboard' && (
        <div className="fade-in">
          {/* Quick Stats */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:'20px', marginBottom:'40px'}}>
             <div style={{textAlign:'center', padding:'30px', background:'white', borderRadius:'15px', border:'1px solid #e2e8f0', boxShadow:'0 4px 6px rgba(0,0,0,0.02)'}}>
                <div style={{color:'#64748b', fontSize:'0.9rem', marginBottom:'10px'}}>TOTAL REGISTERED STAFF</div>
                <div style={{fontSize:'3.5rem', fontWeight:'bold', color:'#3b82f6'}}>{employees.length}</div>
             </div>
             <div style={{textAlign:'center', padding:'30px', background:'white', borderRadius:'15px', border:'1px solid #e2e8f0', boxShadow:'0 4px 6px rgba(0,0,0,0.02)'}}>
                <div style={{color:'#64748b', fontSize:'0.9rem', marginBottom:'10px'}}>TOTAL SYSTEM LOGS</div>
                <div style={{fontSize:'3.5rem', fontWeight:'bold', color:'#10b981'}}>{logs.length}</div>
             </div>
          </div>

          <h2 style={{marginBottom:'20px', color:'#475569'}}>Available Modules</h2>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'20px'}}>
             {hasPerm('employees') && (
               <div className="module-card" onClick={() => setActiveTab('employees')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>👥</div>
                 <h3 style={{margin:'0 0 10px 0'}}>Manage Staff</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Register employees and update their work schedules.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>Open Module</button>
               </div>
             )}
             {hasPerm('org-units') && (
               <div className="module-card" onClick={() => setActiveTab('org-units')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>🏢</div>
                 <h3 style={{margin:'0 0 10px 0'}}>Departments</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Manage organizational units like IT, HR, or Sales.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>Open Module</button>
               </div>
             )}
             {hasPerm('branches') && (
               <div className="module-card" onClick={() => setActiveTab('branches')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📍</div>
                 <h3 style={{margin:'0 0 10px 0'}}>Branch Setup</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Configure GPS coordinates for your office locations.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>Open Module</button>
               </div>
             )}
             {hasPerm('reports') && (
               <div className="module-card" onClick={() => setActiveTab('reports')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📊</div>
                 <h3 style={{margin:'0 0 10px 0'}}>View Reports</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Monitor real-time check-ins and export attendance logs.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>Open Module</button>
               </div>
             )}
             {(!user?.permissions || user.permissions.length === 0) && (
               <div style={{gridColumn:'1 / -1', padding:'100px', textAlign:'center', background:'white', borderRadius:'15px', border:'1px dashed #cbd5e1'}}>
                 <div style={{fontSize:'4rem', marginBottom:'20px'}}>🔒</div>
                 <h3>No Modules Authorized</h3>
                 <p style={{color:'#64748b'}}>Please contact the system administrator to activate your access modules.</p>
               </div>
             )}
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div className="card fade-in">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', borderBottom:'1px solid #f1f5f9', paddingBottom:'15px'}}>
            <h2 style={{margin:0}}>👥 Employee Master List</h2>
            <div style={{display:'flex', gap:'10px'}}>
              <input
                placeholder="🔍 Search name or ID..."
                style={{padding:'10px', borderRadius:'8px', border:'1px solid #e2e8f0', width:'250px'}}
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
              />
              <button onClick={exportEmployeesExcel} className="btn-excel">📊 Export Excel</button>
              <button onClick={prepareNewEmployee} className="btn-green" style={{background:'#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>+ Add New Employee</button>
            </div>
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
            <table style={{minWidth:'1800px'}}>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Full Name</th>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Assigned Branch</th>
                  <th>Gender</th>
                  <th>Nationality</th>
                  <th>Birth Date</th>
                  <th>Email Address</th>
                  <th>Mobile Number</th>
                  <th>Joining Date</th>
                  <th>Termination Date</th>
                  <th>Termination Note</th>
                  <th>Status</th>
                  <th style={{textAlign:'center'}}>Action</th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter(e => {
                    const s = empSearch.toLowerCase();
                    return e.name.toLowerCase().includes(s) || e.employeeId.toLowerCase().includes(s);
                  })
                  .map((e, idx) => (
                  <tr key={idx}>
                    <td style={{fontWeight:'bold', color:'#3b82f6'}}>{e.employeeId}</td>
                    <td style={{fontWeight:'600'}}>{e.name}</td>
                    <td>{e.jobTitle || '-'}</td>
                    <td>{e.department || '-'}</td>
                    <td>
                      {e.branchName ? (
                         <span style={{background:'#e0f2fe', color:'#0369a1', padding:'2px 8px', borderRadius:'4px', fontSize:'0.75rem', fontWeight:'bold'}}>📍 {e.branchName}</span>
                      ) : '-'}
                    </td>
                    <td>{e.gender || '-'}</td>
                    <td>{e.nationality || '-'}</td>
                    <td>{e.birthDate || '-'}</td>
                    <td>{e.email || '-'}</td>
                    <td>{e.mobile || '-'}</td>
                    <td>{e.joiningDate || '-'}</td>
                    <td>{e.terminationDate || '-'}</td>
                    <td title={e.terminationNote} style={{maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {e.terminationNote || '-'}
                    </td>
                    <td>
                      <span style={{
                        background: (e.status === 'Terminated' || e.status === 'Inactive') ? '#fee2e2' : '#dcfce7',
                        color: (e.status === 'Terminated' || e.status === 'Inactive') ? '#991b1b' : '#166534',
                        padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold'
                      }}>{e.status}</span>
                    </td>
                    <td style={{textAlign:'center'}}>
                      <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                        <button onClick={() => prepareEditEmployee(e)} className="btn-edit">Edit</button>
                        <button onClick={() => deleteEmployee(e.employeeId)} className="btn-red">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 && <div style={{textAlign:'center', padding:'20px', color:'#64748b'}}>No employees found.</div>}
          </div>
        </div>
      )}

      {activeTab === 'org-units' && (
        <div className="card fade-in">
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'30px'}}>
            {/* CREATE FORM */}
            <div style={{background:'#f8fafc', padding:'20px', borderRadius:'12px', border:'1px solid #e2e8f0'}}>
              <h3 style={{marginTop:0, color:'#3b82f6'}}>🏢 Create Department</h3>
              <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'20px'}}>Add a new department for your company (e.g. IT, HR, Sales).</p>
              <div className="form-group">
                <label>Department Name</label>
                <input
                  placeholder="Enter name..."
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addOrgUnit()}
                />
              </div>
              <button onClick={addOrgUnit} className="btn-blue" style={{marginTop:'20px', width:'100%'}}>Save Department</button>
            </div>

            {/* LIST TABLE */}
            <div>
              <h2 style={{marginTop:0}}>📋 Registered Departments</h2>
              <div style={{maxHeight:'60vh', overflowY:'auto', border:'1px solid #f1f5f9', borderRadius:'8px'}}>
                <table>
                  <thead>
                    <tr>
                      <th>Department Name</th>
                      <th style={{textAlign:'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgUnits.map((o, i) => (
                      <tr key={i}>
                        <td style={{fontWeight:'bold', color:'#3b82f6'}}>{o.name}</td>
                        <td style={{textAlign:'right'}}>
                          <button onClick={() => deleteOrgUnit(o.id)} className="btn-red">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {orgUnits.length === 0 && (
                      <tr><td colSpan="2" style={{textAlign:'center', padding:'30px', color:'#64748b'}}>No departments registered yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'branches' && (
        <div className="card fade-in">
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'30px'}}>
            {/* CREATE/EDIT FORM */}
            <div style={{background:'#f8fafc', padding:'20px', borderRadius:'12px', border:'1px solid #e2e8f0'}}>
              <h3 style={{marginTop:0, color:'#10b981'}}>{editingBranchId ? '✏️ Edit Branch' : '📍 Setup New Branch'}</h3>
              <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'20px'}}>Configure geofence coordinates for your office location.</p>

              <div className="form-group" style={{marginBottom:'15px'}}>
                <label>Branch Name</label>
                <input placeholder="e.g. Main Office" value={branchName} onChange={e => setBranchName(e.target.value)} />
              </div>

              <div className="form-grid" style={{marginBottom:'15px'}}>
                <div className="form-group">
                  <label>Latitude</label>
                  <input placeholder="24.7136" value={branchLat} onChange={e => setBranchLat(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <input placeholder="46.6753" value={branchLon} onChange={e => setBranchLon(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Geofence Radius (Meters)</label>
                <input type="number" value={branchRad} onChange={e => setBranchRad(e.target.value)} />
              </div>

              <button onClick={saveBranch} className="btn-green" style={{marginTop:'20px', width:'100%'}}>
                {editingBranchId ? 'Update Branch Info' : 'Save Branch Location'}
              </button>

              {editingBranchId && (
                <button onClick={() => {setEditingBranchId(null); setBranchName(''); setBranchLat(''); setBranchLon(''); setBranchRad('50');}} style={{marginTop:'10px', width:'100%', background:'#64748b', color:'white', border:'none', padding:'10px', borderRadius:'6px', cursor:'pointer'}}>Cancel Edit</button>
              )}
            </div>

            {/* LIST TABLE */}
            <div>
              <h2 style={{marginTop:0}}>📍 Registered Branch Locations</h2>
              <div style={{maxHeight:'60vh', overflowY:'auto', border:'1px solid #f1f5f9', borderRadius:'8px'}}>
                <table>
                  <thead>
                    <tr>
                      <th>Branch Name</th>
                      <th>Coordinates</th>
                      <th>Radius</th>
                      <th style={{textAlign:'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((b, i) => (
                      <tr key={i}>
                        <td style={{fontWeight:'bold', color:'#10b981'}}>{b.name}</td>
                        <td style={{fontSize:'0.8rem', color:'#64748b'}}>{b.pinLatitude}, {b.pinLongitude}</td>
                        <td>{b.radiusMeters}m</td>
                        <td style={{textAlign:'right'}}>
                          <div style={{display:'flex', gap:'5px', justifyContent:'flex-end'}}>
                            <button onClick={() => editBranch(b)} className="btn-edit">Edit</button>
                            <button onClick={() => deleteBranch(b.departmentId)} className="btn-red">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {departments.length === 0 && (
                      <tr><td colSpan="4" style={{textAlign:'center', padding:'30px', color:'#64748b'}}>No branches registered yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="card fade-in">
          <h2 style={{marginTop:0}}>📈 Attendance Logs</h2>
          <div style={{maxHeight:'60vh', overflowY:'auto'}}>
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Branch</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
              <tbody>
                {logs.slice().reverse().map((l, i) => (
                  <tr key={i}>
                    <td>{l.employeeId}</td>
                    <td>{l.employeeName}</td>
                    <td>{l.departmentName}</td>
                    <td>{l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-'}</td>
                    <td>{l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-'}</td>
                    <td>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NEW EMPLOYEE MODAL */}
      {isAddEmpModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h2 style={{marginTop:0, marginBottom:'25px', color:'#10b981'}}>
               {isEditingEmp ? '👤 Edit Employee Info' : '👤 Add New Employee'}
            </h2>

            <div className="form-grid">
              <div className="form-group">
                <label>Employee ID (Autofill)</label>
                <input style={{background:'#f3f4f6'}} value={empId} disabled />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input placeholder="e.g. Juan Dela Cruz" value={empName} onChange={e => setEmpName(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Job Title</label>
                <select value={empJobTitle} onChange={e => setEmpJobTitle(e.target.value)}>
                  <option value="">-- Select Job Title --</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Staff">Staff</option>
                  <option value="Consultant">Consultant</option>
                  <option value="Admin">Admin</option>
                  <option value="Developer">Developer</option>
                </select>
              </div>
              <div className="form-group">
                <label>Department (Org/Team)</label>
                <select value={empDepartment} onChange={e => setEmpDepartment(e.target.value)}>
                  <option value="">-- Select Department --</option>
                  {orgUnits.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Work Branch (Geofence)</label>
                <select value={empDept} onChange={e => setEmpDept(e.target.value)}>
                  <option value="">-- Select Branch --</option>
                  {departments.map(d => (
                    <option key={d.departmentId} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Gender</label>
                <select value={empGender} onChange={e => setEmpGender(e.target.value)}>
                  <option value="">-- Select Gender --</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="form-group">
                <label>Nationality</label>
                <select value={empNationality} onChange={e => setEmpNationality(e.target.value)}>
                  <option value="">-- Select Nationality --</option>
                  <option value="Filipino">Filipino</option>
                  <option value="Saudi">Saudi</option>
                  <option value="Indian">Indian</option>
                  <option value="Pakistani">Pakistani</option>
                  <option value="Egyptian">Egyptian</option>
                  <option value="American">American</option>
                  <option value="British">British</option>
                </select>
              </div>

              <div className="form-group">
                <label>Birth Date</label>
                <input type="date" value={empBirthDate} onChange={e => setEmpBirthDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" placeholder="juan@example.com" value={empEmail} onChange={e => setEmpEmail(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Mobile Number</label>
                <input placeholder="09123456789" value={empMobile} onChange={e => setEmpMobile(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Joining Date</label>
                <input type="date" value={empJoiningDate} onChange={e => setEmpJoiningDate(e.target.value)} />
              </div>

              {isEditingEmp && (
                <div className="form-group">
                  <label>Employment Status</label>
                  <select value={empStatus} onChange={e => setEmpStatus(e.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Terminated">Terminated</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              )}

              {isEditingEmp && (
                <>
                  <div className="form-group">
                    <label>Termination Date (Optional)</label>
                    <input type="date" value={empTermDate} onChange={e => setEmpTermDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Termination Note</label>
                    <input placeholder="Reason for exit" value={empTermNote} onChange={e => setEmpTermNote(e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <div style={{display:'flex', gap:'15px', marginTop:'30px'}}>
              <button onClick={saveNewEmployee} className="btn-green" style={{flex:1, padding:'15px'}}>
                {isEditingEmp ? 'Update Employee' : 'Save Employee'}
              </button>
              <button onClick={() => setIsAddEmpModalOpen(false)} style={{padding:'15px 30px', background:'#64748b', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', cursor:'pointer'}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
