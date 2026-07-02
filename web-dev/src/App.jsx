import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE = '/api';

function App() {
  const [activeApiBase, setActiveApiBase] = useState('/api');
  const [saasStatus, setSaasStatus] = useState('Checking SaaS Hub...');

  const [isDevLoggedIn, setIsDevLoggedIn] = useState(sessionStorage.getItem('dev_logged_in') === 'true');
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('dev_user_data');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });

  const [devUser, setDevUser] = useState('');
  const [devPass, setDevUserPass] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [devAccounts, setDevAccounts] = useState([]);
  const [systemIp, setSystemIp] = useState('127.0.0.1');
  const [status, setStatus] = useState('System Online');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Provisioning States
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newUsername, setNewUsername] = useState('admin');
  const [newPassword, setNewPassword] = useState('12345');
  const [newAssignedGateway, setNewAssignedGateway] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newTenantId, setNewTenantId] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState('');

  // Dev Account Management States
  const [newDevUser, setNewDevUser] = useState('');
  const [newDevPass, setNewDevPass] = useState('');
  const [newDevDisplay, setNewDevDisplay] = useState('');

  // My Account Update States
  const [updateUser, setUpdateUser] = useState('');
  const [updatePass, setUpdatePass] = useState('');
  const [updateDisplay, setUpdateDisplay] = useState('');

  // Tenant Management States
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [filterTenantId, setFilterTenantId] = useState('ALL');
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [empGender, setEmpGender] = useState('Male');
  const [empBirthDate, setEmpBirthDate] = useState('');
  const [empNationality, setEmpNationality] = useState('');
  const [empJoiningDate, setEmpJoiningDate] = useState('');
  const [empSchedule, setEmpSchedule] = useState('Regular');

  const [deptName, setDeptName] = useState('');
  const [deptLat, setDeptLat] = useState('');
  const [deptLon, setDeptLon] = useState('');
  const [deptRad, setDeptRad] = useState('50');
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [selectedDeptTenant, setSelectedDeptTenant] = useState('ALL');
  // License edit states
  const [editingTenantId, setEditingTenantId] = useState(null);
  const [editingEndDateValue, setEditingEndDateValue] = useState('');
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isViewingLogs, setIsViewingLogs] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmpTenant, setSelectedEmpTenant] = useState('ALL');

  // Report States
  const [reportTenantId, setReportTenantId] = useState('ALL');
  const [reportBy, setReportBy] = useState('Branch');
  const [reportSearch, setReportSearch] = useState('');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  // New Employee Modal States
  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [empStatus, setEmpStatus] = useState('Active');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('');
  const [empDept, setEmpDept] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empMobile, setEmpMobile] = useState('');
  const [empTermDate, setEmpTermDate] = useState('');
  const [empTermNote, setEmpTermNote] = useState('');

  // Dashboard Sync & Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastSyncTime, setLastSyncTime] = useState(null);

  useEffect(() => {
    const discoverSaaS = async () => {
      try {
        const res = await fetch('https://ntfy.sh/attendance_hub_60003078_active_link/raw');
        if (res.ok) {
          const url = (await res.text()).trim();
          if (url && url.startsWith('http')) {
            const finalApi = `${url}/api`;
            setActiveApiBase(finalApi);
            setSaasStatus(`Connected to Global SaaS: ${url}`);
            console.log(`[NINJA HUB] Global Discovery Successful: ${finalApi}`);
          }
        }
      } catch (e) {
        setSaasStatus('Global Hub Discovery Pending...');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
           setActiveApiBase('/api');
        }
      }
    };
    discoverSaaS();
    // Re-check every 2 minutes for auto-healing
    const interval = setInterval(discoverSaaS, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { loadInitialData(); }, [activeApiBase]);

  // Live Clock Effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentUser) {
      setUpdateUser(currentUser.username);
      setUpdateDisplay(currentUser.displayName);
    }
  }, [currentUser]);

  // --- AUTO LOGOUT LOGIC (10 Minutes Inactivity) ---
  useEffect(() => {
    if (!isDevLoggedIn) return;

    let logoutTimer;
    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 Minutes

    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        sessionStorage.removeItem('dev_logged_in');
        sessionStorage.removeItem('dev_user_data');
        window.location.reload();
      }, INACTIVITY_LIMIT);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => document.addEventListener(name, resetTimer));

    resetTimer();

    return () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      events.forEach(name => document.removeEventListener(name, resetTimer));
    };
  }, [isDevLoggedIn]);

  const generateTenantId = () => {
    const num = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
    setNewTenantId(num.toString());
  };

  const generateAdminIp = () => {
    const p1 = 10;
    const p2 = Math.floor(Math.random() * 254) + 1;
    const p3 = Math.floor(Math.random() * 254) + 1;
    const p4 = Math.floor(Math.random() * 254) + 1;
    setNewAdminIp(`${p1}.${p2}.${p3}.${p4}`);
  };

  const prepareNewEmployee = () => {
    if (selectedEmpTenant === 'ALL') return alert('Pumili muna ng Company bago mag-add ng Employee.');

    // Auto-fill ID: Find max ID for this tenant
    const tenantEmps = employees.filter(e => e.tenantId === selectedEmpTenant);
    let nextId = 1;
    if (tenantEmps.length > 0) {
      const ids = tenantEmps.map(e => parseInt(e.employeeId)).filter(id => !isNaN(id));
      if (ids.length > 0) nextId = Math.max(...ids) + 1;
    }

    setEmpId(nextId.toString().padStart(4, '0'));
    setEmpName('');
    setEmpJobTitle('');
    setEmpDept('');
    setEmpGender('');
    setEmpNationality('');
    setEmpBirthDate('');
    setEmpEmail('');
    setEmpMobile('');
    setEmpJoiningDate('');
    setEmpTermDate('');
    setEmpTermNote('');
    setIsEditingEmp(false);
    setIsAddEmpModalOpen(true);
  };

  const prepareEditEmployee = (emp) => {
    setSelectedEmpTenant(emp.tenantId);
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
        ? `${API_BASE}/employees/${empId}?tenantId=${selectedEmpTenant}`
        : `${API_BASE}/employees?tenantId=${selectedEmpTenant}`;

      const method = isEditingEmp ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedEmpTenant },
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
          tenantId: selectedEmpTenant
        })
      });
      if (res.ok) {
        setStatus(isEditingEmp ? 'Employee Updated! ✓' : 'Employee Added! ✓');
        setIsAddEmpModalOpen(false);
        loadInitialData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save employee');
      }
    } catch (e) { setStatus('Error saving employee'); }
  };

  const deleteEmployee = async (tenantId, id) => {
    if (!confirm(`Are you sure you want to delete employee ${id} from ${tenantId}? This cannot be undone.`)) return;
    setStatus('Deleting employee...');
    try {
      const res = await fetch(`${API_BASE}/employees/${id}?tenantId=${tenantId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId }
      });
      if (res.ok) {
        setStatus('Employee deleted ✓');
        loadInitialData();
      } else {
        alert('Failed to delete employee');
      }
    } catch (e) { setStatus('Error deleting employee'); }
  };

  const exportEmployeesExcel = () => {
    if (selectedEmpTenant === 'ALL') return alert('Pumili muna ng Company para ma-export ang employee list.');

    const tenantEmps = employees.filter(e => e.tenantId === selectedEmpTenant);
    if (tenantEmps.length === 0) return alert('Walang employee data para sa company na ito.');

    const companyName = users.find(u => (u.tenantId || u.username) === selectedEmpTenant)?.companyName || 'Tenant';

    const exportData = tenantEmps.map(e => ({
      'Employee ID': e.employeeId,
      'Full Name': e.name,
      'Job Title': e.jobTitle || '-',
      'Department': e.department || '-',
      'Work Branch': e.branchName || '-',
      'Gender': e.gender || '-',
      'Nationality': e.nationality || '-',
      'Birth Date': e.birthDate || '-',
      'Email Address': e.email || e.emailAddress || '-',
      'Mobile Number': e.mobile || e.mobileNumber || '-',
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

  const saveBranch = async () => {
    if (selectedDeptTenant === 'ALL' || !deptName || !deptLat || !deptLon) {
      return alert('Pumili muna ng Company at punan ang lahat ng fields.');
    }

    setStatus(editingDeptId ? 'Updating Branch...' : 'Creating Branch...');
    try {
      const payload = {
        name: deptName,
        pinLatitude: parseFloat(deptLat),
        pinLongitude: parseFloat(deptLon),
        radiusMeters: parseInt(deptRad) || 50,
        tenantId: selectedDeptTenant
      };

      let res;
      if (editingDeptId) {
        res = await fetch(`${API_BASE}/departments/${editingDeptId}?tenantId=${selectedDeptTenant}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedDeptTenant },
          body: JSON.stringify(payload)
        });
      } else {
        payload.departmentId = deptName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
        res = await fetch(`${API_BASE}/departments?tenantId=${selectedDeptTenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedDeptTenant },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setStatus(editingDeptId ? 'Branch Updated! ✓' : 'Branch Created! ✓');
        setDeptName(''); setDeptLat(''); setDeptLon(''); setDeptRad('50'); setEditingDeptId(null);
        loadInitialData();
      } else {
        alert('Failed to save branch');
      }
    } catch (e) { setStatus('Error saving branch'); }
  };

  const deleteBranch = async (tenantId, id) => {
    if (!confirm('Delete this branch? Attendance logs for this location will remain but new check-ins will stop.')) return;
    try {
      const res = await fetch(`${API_BASE}/departments/${id}?tenantId=${tenantId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId }
      });
      if (res.ok) {
        setStatus('Branch Deleted ✓');
        loadInitialData();
      }
    } catch (e) { setStatus('Error deleting branch'); }
  };

  const editBranch = (dept) => {
    setSelectedDeptTenant(dept.tenantId);
    setEditingDeptId(dept.departmentId);
    setDeptName(dept.name);
    setDeptLat(dept.pinLatitude.toString());
    setDeptLon(dept.pinLongitude.toString());
    setDeptRad(dept.radiusMeters.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadInitialData = async () => {
    try {
      const [u, l, e, d, da] = await Promise.all([
        fetch(`${activeApiBase}/master/users`).then(r => r.json()),
        fetch(`${activeApiBase}/master/logs`).then(r => r.json()),
        fetch(`${activeApiBase}/master/employees`).then(r => r.json()),
        fetch(`${activeApiBase}/master/departments`).then(r => r.json()),
        fetch(`${activeApiBase}/master/dev-accounts`).then(r => r.json())
      ]);
      setUsers(u || []);
      setLogs(l || []);
      setEmployees(e || []);
      setDepartments(d || []);
      setDevAccounts(da || []);

      if (u && l && e && d && da) {
        setLastSyncTime(new Date());
      }

      // Get the real system IP for link generation
      fetch(`${API_BASE}/settings`)
        .then(r => r.json())
        .then(data => {
          if (data.currentSystemIp) setSystemIp(data.currentSystemIp);
        });
    } catch (e) { setStatus('Error loading data'); }
  };

  const provisionPortal = async () => {
    if (!newCompanyName || !newUsername || !newPassword) return setStatus('Fill all required fields');
    try {
      const res = await fetch(`${activeApiBase}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: newTenantId,
          companyName: newCompanyName,
          username: newUsername,
          password: newPassword,
          permissions: ['reports', 'setup'],
          assignedGateway: newAssignedGateway,
          adminIp: newAdminIp,
          startDate: newStartDate,
          endDate: newEndDate
        })
      });
      const data = await res.json();
      setUsers([...users, data]);
      setNewCompanyName(''); setNewUsername('admin'); setNewPassword('12345'); setNewAssignedGateway(''); setNewAdminIp(''); setNewEndDate(''); setNewTenantId('');
      setStatus(`Portal for ${data.companyName} deployed!`);
      setIsProvisioning(false);
      setSelectedTenant(data);
    } catch (e) { setStatus('Deployment failed'); }
  };

  const updatePermissions = async (username, currentPerms, perm) => {
    const newPerms = currentPerms.includes(perm)
      ? currentPerms.filter(p => p !== perm)
      : [...currentPerms, perm];

    try {
      await fetch(`${activeApiBase}/users/${username}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: newPerms })
      });
      setUsers(users.map(u => u.username === username ? { ...u, permissions: newPerms } : u));
      setStatus(`Permissions updated for ${username}`);
    } catch (e) { setStatus('Update failed'); }
  };

  const updateLicenseEndDate = (tenantId) => {
    const existing = users.find(u => (u.tenantId || u.username) === tenantId);
    const currentValue = existing?.endDate || '';
    setEditingTenantId(tenantId);
    setEditingEndDateValue(currentValue || new Date().toISOString().split('T')[0]);
  };

  const saveLicenseEndDate = async (tenantId) => {
    try {
      const res = await fetch(`${activeApiBase}/users/${tenantId}/enddate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endDate: editingEndDateValue })
      });
      if (!res.ok) throw new Error('Update failed');

      setUsers(users.map(u => ((u.tenantId || u.username) === tenantId) ? { ...u, endDate: editingEndDateValue } : u));
      setStatus(`License expiry updated for ${tenantId}`);
      setEditingTenantId(null);
      setEditingEndDateValue('');
    } catch (e) {
      setStatus('License update failed');
    }
  };

  const cancelEditLicense = () => {
    setEditingTenantId(null);
    setEditingEndDateValue('');
  };

  const deleteTenant = async (id) => {
    if (!confirm('Delete this tenant and all access?')) return;
    setStatus(`🗑️ Deleting tenant...`);
    try {
      const res = await fetch(`${activeApiBase}/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Instant UI Update: Refresh all data from server
        await loadInitialData();
        setStatus('Tenant Terminated successfully ✓');
      } else {
        setStatus('❌ Delete failed');
      }
    } catch (e) {
      setStatus('❌ Connection error');
    }
  };

  const buildApk = async (tenantId, companyName, publicUrl) => {
    // If publicUrl not provided, ask the user
    const defaultUrl = window.location.origin + '/api';
    let apiUrl = publicUrl || prompt("Enter API URL (Siguraduhin na may /api sa dulo):", defaultUrl);

    if (!apiUrl) return; // Cancelled

    // Auto-fix: Add /api if missing from tunnel URLs
    if (apiUrl.includes('loca.lt') || apiUrl.includes('pinggy.link') || apiUrl.includes('trycloudflare.com')) {
      if (!apiUrl.endsWith('/api')) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/api';
      }
    }

    setStatus(`🔨 Building APK for ${companyName}...`);
    try {
      const res = await fetch(`${API_BASE}/master/build-apk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, companyName, publicUrl: apiUrl })
      });
      const data = await res.json();
      if (data.downloadUrl) { setStatus('APK Ready!'); window.location.href = data.downloadUrl; }
      else setStatus('Build failed');
    } catch (e) { setStatus('Error'); }
  };

  const installAndRunApk = async (tenantId, companyName) => {
    setStatus(`📲 Building, installing and launching ${companyName}...`);
    try {
      const res = await fetch(`${API_BASE}/master/build-and-run-apk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, companyName, publicUrl: 'http://127.0.0.1:4002/api' })
      });
      const data = await res.json();
      if (data.success) setStatus('✅ Installed and opened on device');
      else setStatus('❌ ' + (data.error || 'Failed'));
    } catch (e) { setStatus('❌ Build & Install failed'); }
  };

  const clearTenantData = async (tenantId, target) => {
    const confirmMsg = `Sigurado ka bang buburahin ang lahat ng ${target.toUpperCase()} para sa tenant na ito? Hindi na ito mababawi.`;
    if (!confirm(confirmMsg)) return;

    setStatus(`🧹 Clearing ${target}...`);
    try {
      const res = await fetch(`${API_BASE}/master/clear-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, target })
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`✅ ${target.toUpperCase()} cleared!`);
        loadInitialData(); // Refresh logs/stats
      }
    } catch (e) { setStatus('❌ Clear failed'); }
  };

  const handleDevLogin = async () => {
    setStatus('Logging in...');
    try {
      const res = await fetch(`${activeApiBase}/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: devUser, password: devPass })
      });
      const data = await res.json();
      if (data.success) {
        setIsDevLoggedIn(true);
        setCurrentUser(data.user);
        sessionStorage.setItem('dev_logged_in', 'true');
        sessionStorage.setItem('dev_user_data', JSON.stringify(data.user));
        setStatus(`Welcome back, ${data.user.displayName}!`);
      } else {
        alert(data.error || 'Invalid Dev Credentials!');
      }
    } catch (e) { setStatus('Login Error'); }
  };

  const handleDevLogout = () => {
    setIsDevLoggedIn(false);
    setCurrentUser(null);
    sessionStorage.removeItem('dev_logged_in');
    sessionStorage.removeItem('dev_user_data');
  };

  const addDevAccount = async () => {
    if (!newDevUser || !newDevPass || !newDevDisplay) return setStatus('Fill all fields');
    try {
      const res = await fetch(`${activeApiBase}/master/dev-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newDevUser, password: newDevPass, displayName: newDevDisplay })
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`Account for ${newDevDisplay} created!`);
        setNewDevUser(''); setNewDevPass(''); setNewDevDisplay('');
        loadInitialData();
      } else {
        setStatus(data.error || 'Failed');
      }
    } catch (e) { setStatus('Error'); }
  };

  const updateMyAccount = async () => {
    if (!updatePass) return setStatus('Please provide a new password');
    try {
      const res = await fetch(`${activeApiBase}/master/dev-accounts/${currentUser.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: updateDisplay, password: updatePass })
      });
      if (res.ok) {
        setStatus('Account Updated! Please log in again.');
        handleDevLogout();
      } else {
        setStatus('Update failed');
      }
    } catch (e) { setStatus('Error'); }
  };

  const deleteDevAccount = async (username) => {
    if (!confirm(`Delete developer account: ${username}?`)) return;
    try {
      const res = await fetch(`${activeApiBase}/master/dev-accounts/${username}`, { method: 'DELETE' });
      if (res.ok) {
        setStatus('Account Deleted.');
        loadInitialData();
      } else {
        const data = await res.json();
        alert(data.error || 'Delete failed');
      }
    } catch (e) { setStatus('Error'); }
  };

  const broadcastLink = async () => {
    setIsBroadcasting(true);
    setStatus('📡 Broadcasting new link to all devices...');
    try {
      const res = await fetch(`${activeApiBase}/master/broadcast-link`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setStatus('✅ Broadcast Successful! All apps will update shortly.');
      else throw new Error('Failed');
    } catch (e) {
      setStatus('❌ Broadcast Failed. Try again.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const getFilteredLogs = () => {
    if (reportTenantId === 'ALL') return [];

    return logs.filter(l => {
      const isTenant = l.tenantId === reportTenantId;
      const logDate = new Date(l.timestamp);
      const isAfterStart = !reportStartDate || logDate >= new Date(reportStartDate);
      const isBeforeEnd = !reportEndDate || logDate <= new Date(new Date(reportEndDate).setHours(23, 59, 59));

      let isMatch = true;
      if (reportSearch) {
        const s = reportSearch.toLowerCase();
        if (reportBy === 'Branch') isMatch = l.departmentName?.toLowerCase().includes(s);
        else isMatch = l.employeeId?.toLowerCase().includes(s) || l.employeeName?.toLowerCase().includes(s);
      }

      return isTenant && isAfterStart && isBeforeEnd && isMatch;
    });
  };

  const exportReportExcel = () => {
    const data = getFilteredLogs();
    if (data.length === 0) return alert('No data to export');

    const companyName = users.find(u => (u.tenantId || u.username) === reportTenantId)?.companyName || 'Report';

    const exportData = data.map(l => ({
      'Employee ID': l.employeeId,
      'Name': l.employeeName,
      'Work Branch': l.departmentName,
      'Date': new Date(l.timestamp).toLocaleDateString(),
      'Time In': l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-',
      'Time Out': l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-',
      'Status': l.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `${companyName}_Report_${reportBy}.xlsx`);
  };

  const viewReportPDF = () => {
    const data = getFilteredLogs();
    if (data.length === 0) return alert('No data to generate PDF');

    const doc = new jsPDF('l', 'mm', 'a4');
    const companyName = users.find(u => (u.tenantId || u.username) === reportTenantId)?.companyName || 'Timekey System';

    doc.setFontSize(18);
    doc.text(`Attendance Report: ${companyName}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Filtered by: ${reportBy} | Range: ${reportStartDate || 'Start'} to ${reportEndDate || 'End'}`, 14, 28);

    const tableData = data.map(l => [
      l.employeeId,
      l.employeeName,
      l.departmentName,
      new Date(l.timestamp).toLocaleDateString(),
      l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-',
      l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-',
      l.status
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['ID', 'Name', 'Branch Name', 'Date', 'Time In', 'Time Out', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    window.open(doc.output('bloburl'), '_blank');
  };

  if (!isDevLoggedIn) {
    return (
      <div style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0f172a', fontFamily:'sans-serif'}}>
        <div style={{background:'#1e293b', padding:'40px', borderRadius:'15px', border:'1px solid #334155', width:'100%', maxWidth:'400px', textAlign:'center'}}>
          <h1 style={{color:'#3b82f6', marginBottom:'10px'}}>DEV CONTROL</h1>
          <p style={{color:'#64748b', marginBottom:'30px'}}>Master Developer Login</p>
          <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
            <input
              value={devUser}
              onChange={e => setDevUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDevLogin()}
              placeholder="Username"
              style={inputStyle}
            />
            <input
              type="password"
              value={devPass}
              onChange={e => setDevUserPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDevLogin()}
              placeholder="Password"
              style={inputStyle}
            />
            <button onClick={handleDevLogin} className="btn-hover" style={{...addBtn, marginTop:'10px'}}>Access System</button>
          </div>
        </div>
      </div>
    );
  }

  const activeTenantsCount = users.filter(u => !u.endDate || new Date() <= new Date(u.endDate)).length;
  const expiredTenantsCount = users.length - activeTenantsCount;

  return (
    <div style={{fontFamily:'"Segoe UI", sans-serif', background:'#0f172a', color:'white', minHeight:'100vh', padding:'20px'}}>
      <style>{`
        .fade-in { animation: fadeIn 0.5s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .stat-card { transition: 0.3s; cursor: default; }
        .stat-card:hover { transform: translateY(-5px); border-color: #3b82f6 !important; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.1); }
        .tenant-item { transition: 0.2s; }
        .tenant-item:hover { border-color: #3b82f6 !important; background: #1e293b !important; }
        .btn-hover { transition: 0.2s; cursor: pointer; }
        .btn-hover:hover { filter: brightness(1.2); transform: translateY(-1px); }
        .btn-hover:active { transform: scale(0.95); }
        .btn-hover:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
        .modal-content { background: #1e293b; padding: 30px; borderRadius: 15px; width: 100%; maxWidth: 700px; border: 1px solid #334155; position: relative; max-height: 90vh; overflow-y: auto; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; padding: 12px; background: #0f172a; color: #64748b; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 12px; border-bottom: 1px solid #1e293b; font-size: 0.9rem; }
        tr:hover td { background: #1e293b; }
      `}</style>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #1e293b', paddingBottom:'20px', marginBottom:'20px', position:'relative'}}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
           <div
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{cursor:'pointer', padding:'8px', borderRadius:'8px', background: isMenuOpen ? '#3b82f6' : '#1e293b', transition:'0.3s', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #334155'}}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </div>
          <div>
            <h1 style={{margin:0, color:'#3b82f6'}}>DEV CONTROL CENTER</h1>
            <p style={{margin:0, color:'#64748b', fontSize:'0.9rem'}}>Master Infrastructure Management</p>
          </div>
        </div>

        {/* --- TOGGLE DOWN MENU --- */}
        {isMenuOpen && (
          <div style={{
            position:'absolute', top:'70px', left:'0', background:'#1e293b', border:'1px solid #334155',
            borderRadius:'8px', width:'250px', zIndex:1000, boxShadow:'0 10px 25px rgba(0,0,0,0.5)', overflow:'hidden'
          }}>
            <MenuItem onClick={() => { setActiveTab('dashboard'); setIsMenuOpen(false); }}>📊 Dashboard</MenuItem>
            <MenuItem onClick={() => { setActiveTab('tenants'); setIsMenuOpen(false); }}>👥 Manage Tenant</MenuItem>
            <MenuItem onClick={() => { setActiveTab('departments'); setIsMenuOpen(false); }}>📍 Branch Management</MenuItem>
            <MenuItem onClick={() => { setActiveTab('employees'); setIsMenuOpen(false); }}>📇 Employee Data</MenuItem>
            <MenuItem onClick={() => { setActiveTab('reports'); setIsMenuOpen(false); }}>📊 View Reports</MenuItem>
            <MenuItem onClick={() => { setActiveTab('settings'); setIsMenuOpen(false); }}>🛠️ System Settings</MenuItem>
            <MenuItem onClick={handleDevLogout} style={{color:'#ef4444', borderTop:'1px solid #334155'}}>🏃 Logout Session</MenuItem>
          </div>
        )}

        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <button
            onClick={broadcastLink}
            disabled={isBroadcasting}
            className="btn-hover"
            style={{
              background: isBroadcasting ? '#475569' : '#8b5cf6',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)'
            }}
          >
            {isBroadcasting ? '⌛ Broadcasting...' : '🚀 BROADCAST SYSTEM UPDATE'}
          </button>

          <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'5px'}}>
            <div style={{background:'#1e293b', padding:'5px 15px', borderRadius:'8px', fontSize:'0.85rem', border:'1px solid #334155', color:'#60a5fa', fontWeight:'bold', fontFamily:'monospace'}}>
              📅 {currentTime.toLocaleDateString()} | 🕒 {currentTime.toLocaleTimeString()}
            </div>
            {lastSyncTime && (
              <div style={{fontSize:'0.65rem', color:'#10b981', display:'flex', alignItems:'center', gap:'5px'}}>
                <span style={{width:'6px', height:'6px', background:'#10b981', borderRadius:'50%', display:'inline-block'}}></span>
                All Tenant Data Synced: {lastSyncTime.toLocaleTimeString()}
              </div>
            )}
          </div>

          <div style={{background:'#1e293b', padding:'10px 20px', borderRadius:'8px', fontSize:'0.9rem', border:'1px solid #334155'}}>
            Welcome, <span style={{color:'#60a5fa'}}>{currentUser?.displayName}</span> | Status: <span style={{color:'#10b981', fontWeight:'bold'}}>{status}</span>
            <div style={{fontSize:'0.6rem', color:'#64748b', marginTop:'4px'}}>{saasStatus}</div>
          </div>
        </div>
      </header>

      {/* PAGE HEADER LABEL */}
      <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px', background:'#1e293b', padding:'10px 20px', borderRadius:'8px', border:'1px solid #334155'}}>
        <span style={{color:'#64748b', fontSize:'0.9rem'}}>Current Page:</span>
        <span style={{fontWeight:'bold', color:'#3b82f6', textTransform:'uppercase', letterSpacing:'1px'}}>
          {activeTab === 'dashboard' && '📊 Dashboard Overview'}
          {activeTab === 'tenants' && '👥 Tenant Management'}
          {activeTab === 'departments' && '📍 Branch & Geofence Setup'}
          {activeTab === 'employees' && '📇 Employee Master List'}
          {activeTab === 'reports' && '📊 Attendance Analytics & Reports'}
          {activeTab === 'settings' && '🛠️ System Settings'}
        </span>
        {activeTab !== 'dashboard' && (
          <button
            onClick={() => setActiveTab('dashboard')}
            className="btn-hover"
            style={{marginLeft:'auto', background:'#334155', border:'none', color:'#fff', padding:'5px 15px', borderRadius:'6px', fontSize:'0.75rem'}}
          >
            ← Back to Dashboard
          </button>
        )}
      </div>

      {/* Main Content View */}
      {activeTab === 'dashboard' && (
        <>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:'20px'}} className="fade-in">
          <div style={statCard} className="stat-card">
            <h3 style={{color:'#64748b', margin:0}}>Total Clients</h3>
            <div style={{fontSize:'3rem', fontWeight:'bold'}}>{users.length}</div>
            <div style={{color:'#3b82f6'}}>Companies onboarded</div>
          </div>
          <div style={statCard} className="stat-card">
            <h3 style={{color:'#64748b', margin:0}}>Active Licenses</h3>
            <div style={{fontSize:'3rem', fontWeight:'bold', color:'#10b981'}}>{activeTenantsCount}</div>
            <div style={{color:'#10b981'}}>Currently generating revenue</div>
          </div>
          <div style={statCard} className="stat-card">
            <h3 style={{color:'#64748b', margin:0}}>Expired Accounts</h3>
            <div style={{fontSize:'3rem', fontWeight:'bold', color:'#ef4444'}}>{expiredTenantsCount}</div>
            <div style={{color:'#ef4444'}}>Need renewal</div>
          </div>
          <div style={statCard} className="stat-card">
            <h3 style={{color:'#64748b', margin:0}}>Total Logs Today</h3>
            <div style={{fontSize:'2.5rem', fontWeight:'bold', color: '#10b981'}}>{logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length}</div>
            <div style={{color:'#3b82f6'}}>System activity</div>
          </div>
          <div style={statCard} className="stat-card">
            <h3 style={{color:'#64748b', margin:0}}>Total Global Staff</h3>
            <div style={{fontSize:'2.5rem', fontWeight:'bold', color: '#8b5cf6'}}>{employees.length}</div>
            <div style={{color:'#3b82f6'}}>Registered across all tenants</div>
          </div>
        </div>

        <h2 style={{marginTop:'40px', marginBottom:'20px'}}>🚀 Available Modules</h2>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(350px, 1fr))', gap:'20px'}}>
          <div
            onClick={() => setActiveTab('tenants')}
            style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155', cursor:'pointer', transition:'0.3s'}}
            onMouseOver={e => e.currentTarget.style.borderColor='#8b5cf6'}
            onMouseOut={e => e.currentTarget.style.borderColor='#334155'}
          >
            <div style={{fontSize:'3rem', marginBottom:'15px'}}>👥</div>
            <h3 style={{margin:'0 0 10px 0'}}>Manage Tenant</h3>
            <p style={{fontSize:'0.9rem', color:'#64748b', margin:0}}>View tenant details, manage permissions, and track system usage.</p>
            <button style={{marginTop:'20px', width:'100%', background:'#8b5cf6', color:'white', border:'none', padding:'12px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}>Open Module</button>
          </div>

          <div
            onClick={() => setActiveTab('employees')}
            style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155', cursor:'pointer', transition:'0.3s'}}
            onMouseOver={e => e.currentTarget.style.borderColor='#3b82f6'}
            onMouseOut={e => e.currentTarget.style.borderColor='#334155'}
          >
            <div style={{fontSize:'3rem', marginBottom:'15px'}}>📇</div>
            <h3 style={{margin:'0 0 10px 0'}}>Employee Master List</h3>
            <p style={{fontSize:'0.9rem', color:'#64748b', margin:0}}>Global list of registered staff across all tenant companies.</p>
            <button style={{marginTop:'20px', width:'100%', background:'#3b82f6', color:'white', border:'none', padding:'12px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}>Open Module</button>
          </div>

          <div
            onClick={() => setActiveTab('departments')}
            style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155', cursor:'pointer', transition:'0.3s'}}
            onMouseOver={e => e.currentTarget.style.borderColor='#10b981'}
            onMouseOut={e => e.currentTarget.style.borderColor='#334155'}
          >
            <div style={{fontSize:'3rem', marginBottom:'15px'}}>📍</div>
            <h3 style={{margin:'0 0 10px 0'}}>Branch Management</h3>
            <p style={{fontSize:'0.9rem', color:'#64748b', margin:0}}>Create geofenced branches and office locations for each tenant.</p>
            <button style={{marginTop:'20px', width:'100%', background:'#10b981', color:'white', border:'none', padding:'12px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}>Open Module</button>
          </div>

          <div
            onClick={() => setActiveTab('reports')}
            style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155', cursor:'pointer', transition:'0.3s'}}
            onMouseOver={e => e.currentTarget.style.borderColor='#10b981'}
            onMouseOut={e => e.currentTarget.style.borderColor='#334155'}
          >
            <div style={{fontSize:'3rem', marginBottom:'15px'}}>📊</div>
            <h3 style={{margin:'0 0 10px 0'}}>System-Wide Reports</h3>
            <p style={{fontSize:'0.9rem', color:'#64748b', margin:0}}>Generate and export detailed attendance reports for any company.</p>
            <button style={{marginTop:'20px', width:'100%', background:'#10b981', color:'white', border:'none', padding:'12px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}>Open Module</button>
          </div>
        </div>
      </>
      )}

      {activeTab === 'tenants' && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}} className="fade-in">
          {/* Tenant List */}
          <div style={{background:'#1e293b', padding:'20px', borderRadius:'12px', border:'1px solid #334155', maxHeight:'80vh', overflowY:'auto'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
              <h2 style={{marginTop:0, fontSize:'1.2rem', margin:0}}>🏢 Tenant List</h2>
              <button
                onClick={() => { setIsProvisioning(true); setSelectedTenant(null); setIsViewingLogs(false); }}
                className="btn-hover"
                style={{padding:'8px 15px', background:'#10b981', color:'white', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', fontSize:'0.8rem'}}
              >
                + Add Tenant
              </button>
            </div>
            <input
              placeholder="🔍 Search company or ID..."
              style={{...inputStyle, marginBottom:'15px', fontSize:'0.85rem', padding:'8px 12px'}}
              value={tenantSearch}
              onChange={e => setTenantSearch(e.target.value)}
            />
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              {users.filter(u =>
                u.companyName?.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                (u.tenantId || u.username)?.toLowerCase().includes(tenantSearch.toLowerCase())
              ).map(u => (
                <div
                  key={u.tenantId || u.username}
                  onClick={() => { setSelectedTenant(u); setIsProvisioning(false); setIsViewingLogs(false); }}
                  className="tenant-item"
                  style={{
                    padding:'15px',
                    background: (selectedTenant?.tenantId === (u.tenantId || u.username) && !isProvisioning) ? '#3b82f6' : '#0f172a',
                    borderRadius:'8px',
                    cursor:'pointer',
                    border:'1px solid #334155'
                  }}
                >
                  <div style={{fontWeight:'bold', color: (selectedTenant?.tenantId === (u.tenantId || u.username) && !isProvisioning) ? 'white' : '#60a5fa'}}>{u.companyName}</div>
                  <div style={{fontSize:'0.75rem', color: (selectedTenant?.tenantId === (u.tenantId || u.username) && !isProvisioning) ? 'rgba(255,255,255,0.7)' : '#64748b'}}>ID: {u.tenantId || u.username}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tenant Information / Provisioning Form */}
          <div style={{background:'#1e293b', padding:'30px', borderRadius:'12px', border:'1px solid #334155', position:'relative'}}>
            {isProvisioning ? (
              <div className="fade-in">
                <h2 style={{marginTop:0, fontSize:'1.5rem', marginBottom:'20px'}}>🚀 Provision New Tenant</h2>
                <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                  <div style={{display:'grid', gridTemplateColumns:'1.5fr 0.5fr', gap:'15px'}}>
                    <label>Company Name <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} style={inputStyle} /></label>
                    <label>Tenant ID <div style={{display:'flex', gap:'5px'}}><input value={newTenantId} onChange={e => setNewTenantId(e.target.value)} style={inputStyle} placeholder="123456" /><button onClick={generateTenantId} style={{...smallBtn, marginTop:'5px', background:'#3b82f6'}}>Gen</button></div></label>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <label>Admin Username <input value={newUsername} onChange={e => setNewUsername(e.target.value)} style={inputStyle} /></label>
                    <label>Password <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} /></label>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <label>License Start <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} style={inputStyle} /></label>
                    <label>License End (Expiry) <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={inputStyle} /></label>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <label>Office Gateway <input value={newAssignedGateway} onChange={e => setNewAssignedGateway(e.target.value)} placeholder="e.g. 192.168.1.1" style={inputStyle} /></label>
                    <label>Admin Virtual IP (Unique) <div style={{display:'flex', gap:'5px'}}><input value={newAdminIp} onChange={e => setNewAdminIp(e.target.value)} placeholder="10.x.x.x" style={inputStyle} /><button onClick={generateAdminIp} style={{...smallBtn, marginTop:'5px', background:'#8b5cf6'}}>Gen</button></div></label>
                  </div>
                  <button onClick={provisionPortal} style={{marginTop:'10px', padding:'15px', background:'#10b981', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', fontSize:'1rem'}}>Deploy Tenant Infrastructure</button>
                  <button onClick={() => setIsProvisioning(false)} style={{padding:'10px', background:'transparent', color:'#64748b', border:'none', cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            ) : selectedTenant ? (
              <div className="fade-in">
                {isViewingLogs ? (
                  <div className="fade-in">
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                      <h2 style={{margin:0}}>📊 Logs for {selectedTenant.companyName}</h2>
                      <button
                        onClick={() => setIsViewingLogs(false)}
                        style={{padding:'8px 15px', background:'#475569', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}
                      >
                        ⬅ Back to Info
                      </button>
                    </div>

                    <div style={{maxHeight:'60vh', overflowY:'auto'}}>
                      <table style={{width:'100%', borderCollapse:'collapse'}}>
                        <thead style={{position:'sticky', top:0, background:'#1e293b'}}>
                          <tr style={{textAlign:'left', color:'#64748b', fontSize:'0.75rem', borderBottom:'1px solid #334155'}}>
                            <th style={{padding:'10px'}}>Employee</th>
                            <th>Location</th>
                            <th>Time In</th>
                            <th>Time Out</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.filter(l => l.tenantId === (selectedTenant.tenantId || selectedTenant.username)).reverse().map((l, i) => (
                            <tr key={i} style={{borderBottom:'1px solid #1e293b', fontSize:'0.85rem'}}>
                              <td style={{padding:'10px'}}>
                                <div style={{fontWeight:'bold'}}>{l.employeeName}</div>
                                <div style={{fontSize:'0.7rem', color:'#64748b'}}>ID: {l.employeeId}</div>
                              </td>
                              <td>{l.departmentName}</td>
                              <td>{l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-'}</td>
                              <td>{l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-'}</td>
                              <td>
                                <span style={{
                                  color: l.timeOut ? '#f59e0b' : '#10b981',
                                  fontSize: '0.7rem',
                                  background: 'rgba(255,255,255,0.05)',
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}>
                                  {l.timeOut ? 'Completed' : 'Present'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {logs.filter(l => l.tenantId === (selectedTenant.tenantId || selectedTenant.username)).length === 0 && (
                        <div style={{textAlign:'center', padding:'40px', color:'#64748b'}}>Walang attendance logs para sa tenant na ito.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'30px'}}>
                      <div>
                        <h1 style={{margin:0, fontSize:'1.8rem'}}>{selectedTenant.companyName}</h1>
                        <p style={{color:'#64748b', margin:0}}>System ID: {selectedTenant.tenantId || selectedTenant.username}</p>
                      </div>
                      <div style={{display:'flex', flexDirection:'column', gap:'5px', alignItems:'flex-end'}}>
                        <div style={{background: (selectedTenant.endDate && new Date() > new Date(selectedTenant.endDate)) ? '#ef4444' : '#10b981', padding:'5px 15px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'bold'}}>
                          {(selectedTenant.endDate && new Date() > new Date(selectedTenant.endDate)) ? 'EXPIRED' : 'ACTIVE'}
                        </div>
                        <div style={{fontSize:'0.75rem', color:'#64748b'}}>
                          Expires: {selectedTenant.endDate ? new Date(selectedTenant.endDate).toLocaleDateString() : 'Lifetime'}
                        </div>
                        <button
                          onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                          style={{background:'#334155', border:'1px solid #475569', color:'white', padding:'8px 12px', borderRadius:'8px', cursor:'pointer', marginTop:'5px'}}
                        >
                          {isActionMenuOpen ? '✖ Close Tools' : '⚙️ Tenant Tools'}
                        </button>
                      </div>
                    </div>

                    {/* ... rest of existing tenant info UI ... */}
                    {/* INLINE EXPIRY EDITOR */}
                    {editingTenantId === (selectedTenant.tenantId || selectedTenant.username) && (
                      <div className="fade-in" style={{background:'rgba(16, 185, 129, 0.1)', padding:'20px', borderRadius:'12px', border:'1px solid #10b981', marginBottom:'25px', display:'flex', gap:'15px', alignItems:'center'}}>
                        <span style={{fontWeight:'bold', color:'#10b981'}}>📅 License Renewal:</span>
                        <input type="date" value={editingEndDateValue} onChange={e => setEditingEndDateValue(e.target.value)} style={{padding:'10px', borderRadius:'8px', border:'1px solid #334155', background:'#0f172a', color:'white', flex:1}} />
                        <button onClick={() => saveLicenseEndDate(selectedTenant.tenantId || selectedTenant.username)} style={{...smallBtn, background:'#10b981', padding:'10px 20px'}}>Update License</button>
                        <button onClick={cancelEditLicense} style={{...smallBtn, background:'#6b7280', padding:'10px 20px'}}>Cancel</button>
                      </div>
                    )}

                    {/* ACTION TOGGLE MENU */}
                    {isActionMenuOpen && (
                      <div className="fade-in" style={{background:'#0f172a', padding:'20px', borderRadius:'10px', border:'1px solid #3b82f6', marginBottom:'20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                        <button onClick={() => {
                            const port = window.location.port ? `:${window.location.port}` : '';
                            const host = systemIp || window.location.hostname;
                            window.open(`http://${host}${port}/portal/${selectedTenant.tenantId || selectedTenant.username}`, '_blank');
                        }} style={{...smallBtn, background:'#8b5cf6', padding:'10px'}}>🚀 Manage</button>

                        <button onClick={() => updateLicenseEndDate(selectedTenant.tenantId || selectedTenant.username)} style={{...smallBtn, background:'#22c55e', padding:'10px'}}>✏️ Edit Expiry</button>

                        <button onClick={() => buildApk(selectedTenant.tenantId || selectedTenant.username, selectedTenant.companyName)} style={{...smallBtn, background:'#3b82f6', padding:'10px', gridColumn:'span 2'}}>Build APK</button>

                        <button onClick={() => installAndRunApk(selectedTenant.tenantId || selectedTenant.username, selectedTenant.companyName)} style={{...smallBtn, background:'#0ea5a4', padding:'10px', gridColumn:'span 2'}}>📲 Install & Open on Device</button>

                        <div style={{gridColumn:'span 2', height:'1px', background:'#334155', margin:'5px 0'}}></div>

                        <button onClick={() => clearTenantData(selectedTenant.tenantId || selectedTenant.username, 'logs')} style={{...smallBtn, background:'#f59e0b', padding:'10px'}}>🧹 Clear Logs (L)</button>

                        <button onClick={() => clearTenantData(selectedTenant.tenantId || selectedTenant.username, 'all')} style={{...smallBtn, background:'#ef4444', padding:'10px', fontWeight:'bold'}}>☢️ Wipe Data (W)</button>

                        <button onClick={() => deleteTenant(selectedTenant.tenantId || selectedTenant.username)} style={{...smallBtn, background:'#b91c1c', padding:'10px', gridColumn:'span 2'}}>🗑️ Delete Tenant (Del)</button>
                      </div>
                    )}

                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'30px'}}>
                      <div style={{background:'#0f172a', padding:'20px', borderRadius:'10px', border:'1px solid #334155'}}>
                        <h3 style={{margin:'0 0 10px 0', fontSize:'0.9rem', color:'#64748b'}}>Admin Credentials</h3>
                        <div style={{fontSize:'0.9rem'}}>User: <span style={{color:'white'}}>{selectedTenant.username}</span></div>
                        <div style={{fontSize:'0.9rem'}}>Pass: <span style={{color:'white'}}>••••••••</span></div>
                      </div>
                      <div style={{background:'#0f172a', padding:'20px', borderRadius:'10px', border:'1px solid #334155'}}>
                        <h3 style={{margin:'0 0 10px 0', fontSize:'0.9rem', color:'#64748b'}}>Network Access</h3>
                        <div style={{fontSize:'0.9rem'}}>Virtual IP: <span style={{color:'#10b981'}}>{selectedTenant.adminIp || 'Not Set'}</span></div>
                        <div style={{fontSize:'0.9rem'}}>Gateway: <span style={{color:'white'}}>{selectedTenant.assignedGateway || 'Not Set'}</span></div>
                      </div>
                    </div>

                    <div style={{marginBottom:'30px'}}>
                      <h3 style={{marginBottom:'15px', fontSize:'1.1rem'}}>🛡️ Module Permissions</h3>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                        <div style={{
                          padding:'15px',
                          borderRadius:'10px',
                          background: selectedTenant.permissions.includes('setup') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${selectedTenant.permissions.includes('setup') ? '#10b981' : '#ef4444'}`
                        }}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span style={{fontWeight:'bold'}}>👥 Employee & Setup</span>
                            <span>{selectedTenant.permissions.includes('setup') ? '✅ Active' : '❌ Locked'}</span>
                          </div>
                        </div>

                        <div style={{
                          padding:'15px',
                          borderRadius:'10px',
                          background: selectedTenant.permissions.includes('reports') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${selectedTenant.permissions.includes('reports') ? '#10b981' : '#ef4444'}`
                        }}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span style={{fontWeight:'bold'}}>📊 Attendance Reports</span>
                            <span>{selectedTenant.permissions.includes('reports') ? '✅ Active' : '❌ Locked'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{display:'flex', gap:'10px'}}>
                      <button
                        onClick={() => {
                          const port = window.location.port ? `:${window.location.port}` : '';
                          const host = systemIp || window.location.hostname;
                          window.open(`http://${host}${port}/portal/${selectedTenant.tenantId || selectedTenant.username}`, '_blank');
                        }}
                        style={{flex:1, padding:'12px', background:'#3b82f6', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}
                      >
                        🚀 Launch Tenant Portal
                      </button>
                      <button
                        onClick={() => setIsViewingLogs(true)}
                        style={{flex:1, padding:'12px', background:'#1e293b', color:'white', border:'1px solid #334155', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}
                      >
                        📂 View Tenant Logs
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{height:'100%', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', color:'#64748b'}}>
                <div style={{fontSize:'4rem', marginBottom:'20px'}}>🏢</div>
                <h3>Pili ka ng Tenant sa kaliwa</h3>
                <p>Para makita ang detalye at permissions.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="fade-in" style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
          <div style={{background:'#1e293b', padding:'30px', borderRadius:'12px', border:'1px solid #334155'}}>
            <h2 style={{marginTop:0, color:'#10b981'}}>{editingDeptId ? '✏️ Edit Branch' : '📍 Create Branch'}</h2>
            <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Select Tenant Company
                <select style={inputStyle} value={selectedDeptTenant} onChange={e => setSelectedDeptTenant(e.target.value)}>
                  <option value="ALL">-- Select Company --</option>
                  {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                </select>
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Branch Name
                <input style={inputStyle} placeholder="e.g. Riyadh Main Office" value={deptName} onChange={e => setDeptName(e.target.value)} />
              </label>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                <label style={{color:'#64748b', fontSize:'0.8rem'}}>Latitude
                  <input style={inputStyle} placeholder="24.7136" value={deptLat} onChange={e => setDeptLat(e.target.value)} />
                </label>
                <label style={{color:'#64748b', fontSize:'0.8rem'}}>Longitude
                  <input style={inputStyle} placeholder="46.6753" value={deptLon} onChange={e => setDeptLon(e.target.value)} />
                </label>
              </div>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Radius (Meters)
                <input type="number" style={inputStyle} value={deptRad} onChange={e => setDeptRad(e.target.value)} />
              </label>
              <button onClick={saveBranch} style={{...addBtn, background:'#10b981', marginTop:'10px'}}>
                {editingDeptId ? 'Update Branch' : 'Save Branch'}
              </button>
              {editingDeptId && (
                <button onClick={() => { setEditingDeptId(null); setDeptName(''); setDeptLat(''); setDeptLon(''); setDeptRad('50'); }} style={{...addBtn, background:'#475569'}}>Cancel Edit</button>
              )}
            </div>
          </div>

          <div style={{background:'#1e293b', padding:'30px', borderRadius:'12px', border:'1px solid #334155'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
              <h2 style={{margin:0}}>📍 Registered Branches</h2>
              <select style={{...inputStyle, width:'250px', marginTop:0}} value={selectedDeptTenant} onChange={e => setSelectedDeptTenant(e.target.value)}>
                <option value="ALL">All Companies</option>
                {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
              </select>
            </div>

            <div style={{maxHeight:'60vh', overflowY:'auto', border:'1px solid #334155', borderRadius:'8px', background:'#0f172a'}}>
              <table>
                <thead>
                  <tr>
                    <th>Branch Name</th>
                    <th>Location (Lat/Lon)</th>
                    <th>Radius</th>
                    <th>Company</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedDeptTenant === 'ALL' ? departments : departments.filter(d => d.tenantId === selectedDeptTenant)).map((d, i) => {
                    const companyName = users.find(u => (u.tenantId || u.username) === d.tenantId)?.companyName || 'Unknown';
                    return (
                      <tr key={i}>
                        <td style={{fontWeight:'bold', color:'#10b981'}}>{d.name}</td>
                        <td style={{fontSize:'0.8rem', color:'#64748b'}}>{d.pinLatitude}, {d.pinLongitude}</td>
                        <td>{d.radiusMeters}m</td>
                        <td><span style={{background:'#0f172a', padding:'4px 8px', borderRadius:'4px', fontSize:'0.75rem', border:'1px solid #334155'}}>🏢 {companyName}</span></td>
                        <td>
                          <div style={{display:'flex', gap:'5px'}}>
                            <button onClick={() => editBranch(d)} style={{...smallBtn, background:'#3b82f6'}}>Edit</button>
                            <button onClick={() => deleteBranch(d.tenantId, d.departmentId)} style={{...smallBtn, background:'#ef4444'}}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {departments.length === 0 && (
                    <tr><td colSpan="5" style={{textAlign:'center', padding:'40px', color:'#64748b'}}>No branches registered yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div className="fade-in" style={{background:'#1e293b', padding:'30px', borderRadius:'12px', border:'1px solid #334155'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
            <h2 style={{margin:0}}>📇 Employee Master List</h2>
            <div style={{display:'flex', gap:'10px', width:'850px'}}>
               <button
                  onClick={exportEmployeesExcel}
                  className="btn-hover"
                  style={{...addBtn, background:'#27ae60', padding:'10px 20px', fontSize:'0.85rem', whiteSpace:'nowrap'}}
               >
                  📊 Export Excel
               </button>
               <button
                  onClick={prepareNewEmployee}
                  className="btn-hover"
                  style={{...addBtn, background:'#10b981', padding:'10px 20px', fontSize:'0.85rem', whiteSpace:'nowrap'}}
               >
                  + Add New Emp.
               </button>
               <select
                  style={{...inputStyle, marginTop:0, width:'250px'}}
                  value={selectedEmpTenant}
                  onChange={e => setSelectedEmpTenant(e.target.value)}
               >
                  <option value="ALL">-- Select Company --</option>
                  {users.map(u => (
                    <option key={u.tenantId || u.username} value={u.tenantId || u.username}>
                      {u.companyName}
                    </option>
                  ))}
               </select>
               <input
                  placeholder="🔍 Search name or ID..."
                  style={{...inputStyle, marginTop:0}}
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
               />
            </div>
          </div>

          <div style={{maxHeight:'70vh', overflowY:'auto', border:'1px solid #334155', borderRadius:'8px', background:'#0f172a'}}>
            <table style={{minWidth:'2000px'}}>
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
                  <th>Company (Tenant)</th>
                  <th>Status</th>
                  <th style={{textAlign:'center'}}>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedEmpTenant === 'ALL' ? (
                  <tr>
                    <td colSpan="16" style={{textAlign:'center', padding:'50px', color:'#64748b'}}>
                      <div style={{fontSize:'3rem', marginBottom:'10px'}}>🏢</div>
                      Pumili ka muna ng <b>Company Name</b> sa dropdown para makita ang mga employees.
                    </td>
                  </tr>
                ) : (
                  employees
                    .filter(e => e.tenantId === selectedEmpTenant)
                    .filter(e => {
                       const s = empSearch.toLowerCase();
                       return e.name.toLowerCase().includes(s) || e.employeeId.toLowerCase().includes(s);
                    })
                    .map((e, idx) => {
                      const companyName = users.find(u => (u.tenantId || u.username) === e.tenantId)?.companyName || 'Unknown';
                      return (
                        <tr key={idx}>
                          <td style={{fontWeight:'bold', color:'#3b82f6'}}>{e.employeeId}</td>
                          <td style={{fontWeight:'600'}}>{e.name}</td>
                          <td>{e.jobTitle || '-'}</td>
                          <td>{e.department || '-'}</td>
                          <td>
                            {e.branchName ? (
                               <span style={{background:'#e0f2fe', color:'#0369a1', padding:'2px 8px', borderRadius:'4px', fontSize:'0.75rem', fontWeight:'bold'}}>
                                 📍 {e.branchName}
                               </span>
                            ) : '-'}
                          </td>
                          <td>{e.gender || '-'}</td>
                          <td>{e.nationality || '-'}</td>
                          <td>{e.birthDate || '-'}</td>
                          <td>{e.email || e.emailAddress || '-'}</td>
                          <td>{e.mobile || e.mobileNumber || '-'}</td>
                          <td>{e.joiningDate || '-'}</td>
                          <td>{e.terminationDate || '-'}</td>
                          <td title={e.terminationNote} style={{maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                            {e.terminationNote || '-'}
                          </td>
                          <td>
                            <span style={{background:'#0f172a', padding:'4px 8px', borderRadius:'4px', fontSize:'0.75rem', border:'1px solid #334155', whiteSpace:'nowrap'}}>
                              🏢 {companyName}
                            </span>
                          </td>
                          <td>
                            <span className="badge" style={{
                              background: (e.status === 'Terminated' || e.status === 'Inactive') ? '#fee2e2' : '#def7ec',
                              color: (e.status === 'Terminated' || e.status === 'Inactive') ? '#991b1b' : '#065f46',
                              padding: '4px 10px',
                              borderRadius: '20px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap'
                            }}>
                              {e.status || 'Active'}
                            </span>
                          </td>
                          <td>
                            <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                              <button
                                onClick={() => prepareEditEmployee(e)}
                                className="btn-hover"
                                style={{...smallBtn, background:'#3b82f6', padding:'5px 12px'}}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteEmployee(e.tenantId, e.employeeId)}
                                className="btn-hover"
                                style={{...smallBtn, background:'#ef4444', padding:'5px 12px'}}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
                {selectedEmpTenant !== 'ALL' && employees.filter(e => e.tenantId === selectedEmpTenant).length === 0 && (
                   <tr>
                    <td colSpan="15" style={{textAlign:'center', padding:'50px', color:'#64748b'}}>
                      Walang registered employee sa company na ito.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="fade-in" style={{background:'#1e293b', padding:'30px', borderRadius:'12px', border:'1px solid #334155'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px'}}>
            <h2 style={{margin:0}}>📊 Attendance Analytics & Reports</h2>
            <div style={{display:'flex', gap:'10px'}}>
              <button onClick={viewReportPDF} className="btn-hover" style={{...smallBtn, background:'#ef4444', padding:'10px 20px', fontWeight:'bold'}}>📄 View PDF</button>
              <button onClick={exportReportExcel} className="btn-hover" style={{...smallBtn, background:'#10b981', padding:'10px 20px', fontWeight:'bold'}}>📊 Export Excel</button>
            </div>
          </div>

          <div style={{background:'#0f172a', padding:'20px', borderRadius:'10px', marginBottom:'25px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'15px', border:'1px solid #334155'}}>
            <label style={{color:'#64748b', fontSize:'0.8rem'}}>Tenant Company
              <select style={inputStyle} value={reportTenantId} onChange={e => setReportTenantId(e.target.value)}>
                <option value="ALL">-- Select Company --</option>
                {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
              </select>
            </label>

            <label style={{color:'#64748b', fontSize:'0.8rem'}}>View Report By:
              <select style={inputStyle} value={reportBy} onChange={e => setReportBy(e.target.value)}>
                <option value="Branch">Branch Name</option>
                <option value="Employee">Employee ID / Name</option>
              </select>
            </label>

            <label style={{color:'#64748b', fontSize:'0.8rem'}}>Search {reportBy}:
              <input style={inputStyle} placeholder={`Search ${reportBy}...`} value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
            </label>

            <label style={{color:'#64748b', fontSize:'0.8rem'}}>Start From:
              <input type="date" style={inputStyle} value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
            </label>

            <label style={{color:'#64748b', fontSize:'0.8rem'}}>End To:
              <input type="date" style={inputStyle} value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
            </label>
          </div>

          <div style={{maxHeight:'55vh', overflowY:'auto', border:'1px solid #334155', borderRadius:'8px'}}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Branch</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reportTenantId === 'ALL' ? (
                  <tr>
                    <td colSpan="7" style={{textAlign:'center', padding:'50px', color:'#64748b'}}>
                      <div style={{fontSize:'3rem', marginBottom:'10px'}}>📈</div>
                      Pumili ng <b>Company</b> at <b>Date Range</b> para makita ang analytics.
                    </td>
                  </tr>
                ) : getFilteredLogs().length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{textAlign:'center', padding:'50px', color:'#64748b'}}>
                      Walang records na nahanap para sa iyong search criteria.
                    </td>
                  </tr>
                ) : (
                  getFilteredLogs().slice().reverse().map((l, idx) => (
                    <tr key={idx}>
                      <td style={{color:'#3b82f6', fontWeight:'bold'}}>{l.employeeId}</td>
                      <td>{l.employeeName}</td>
                      <td>{l.departmentName}</td>
                      <td>{new Date(l.timestamp).toLocaleDateString()}</td>
                      <td>{l.timeIn ? new Date(l.timeIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                      <td>{l.timeOut ? new Date(l.timeOut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                      <td>
                        <span style={{
                          padding:'3px 8px', borderRadius:'12px', fontSize:'0.75rem',
                          background: l.status === 'Completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                          color: l.status === 'Completed' ? '#10b981' : '#3b82f6',
                          border: `1px solid ${l.status === 'Completed' ? '#10b981' : '#3b82f6'}`
                        }}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}} className="fade-in">
          {/* My Account Section */}
          <div style={{background:'#1e293b', padding:'20px', borderRadius:'12px', border:'1px solid #334155'}}>
            <h2 style={{marginTop:0, fontSize:'1.2rem', color:'#3b82f6'}}>👤 My Account</h2>
            <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
              <label>Username (Fixed) <input value={updateUser} disabled style={{...inputStyle, opacity:0.6}} /></label>
              <label>Display Name <input value={updateDisplay} onChange={e => setUpdateDisplay(e.target.value)} style={inputStyle} /></label>
              <label>New Password <input type="password" value={updatePass} onChange={e => setUpdatePass(e.target.value)} style={inputStyle} placeholder="Leave blank to keep current" /></label>
              <button onClick={updateMyAccount} style={{...addBtn, background:'#10b981'}}>Update My Credentials</button>
            </div>
          </div>

          {/* Manage Dev Accounts Section */}
          <div style={{background:'#1e293b', padding:'20px', borderRadius:'12px', border:'1px solid #334155'}}>
            <h2 style={{marginTop:0, fontSize:'1.2rem', color:'#8b5cf6'}}>🛠️ Add Developer User</h2>
            <div style={{display:'flex', flexDirection:'column', gap:'10px', marginBottom:'20px'}}>
              <input value={newDevDisplay} onChange={e => setNewDevDisplay(e.target.value)} placeholder="Display Name (e.g. John)" style={inputStyle} />
              <input value={newDevUser} onChange={e => setNewDevUser(e.target.value)} placeholder="Username" style={inputStyle} />
              <input type="password" value={newDevPass} onChange={e => setNewDevPass(e.target.value)} placeholder="Password" style={inputStyle} />
              <button onClick={addDevAccount} style={{...addBtn, background:'#8b5cf6'}}>Create Developer Account</button>
            </div>

            <h3 style={{fontSize:'1rem', borderTop:'1px solid #334155', paddingTop:'15px'}}>System Admins</h3>
            <div style={{maxHeight:'200px', overflowY:'auto'}}>
              {devAccounts.map((acc, i) => (
                <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', borderBottom:'1px solid #1e293b'}}>
                  <div>
                    <div style={{fontWeight:'bold'}}>{acc.displayName}</div>
                    <div style={{fontSize:'0.75rem', color:'#64748b'}}>@{acc.username}</div>
                  </div>
                  {acc.username !== currentUser.username && (
                    <button onClick={() => deleteDevAccount(acc.username)} style={{...smallBtn, background:'#ef4444'}}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW EMPLOYEE MODAL */}
      {isAddEmpModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h2 style={{marginTop:0, marginBottom:'25px', display:'flex', alignItems:'center', gap:'10px', color:'#10b981'}}>
              👤 {isEditingEmp ? 'Edit Employee Info' : `Add New Employee to ${users.find(u => (u.tenantId || u.username) === selectedEmpTenant)?.companyName}`}
            </h2>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Employee ID (Autofill)
                <input style={{...inputStyle, background:'#334155'}} value={empId} disabled />
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Full Name
                <input style={inputStyle} placeholder="e.g. Juan Dela Cruz" value={empName} onChange={e => setEmpName(e.target.value)} />
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Job Title
                <select style={inputStyle} value={empJobTitle} onChange={e => setEmpJobTitle(e.target.value)}>
                  <option value="">-- Select Job Title --</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Staff">Staff</option>
                  <option value="Consultant">Consultant</option>
                  <option value="Admin">Admin</option>
                  <option value="Developer">Developer</option>
                </select>
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Department (Org/Team)
                <input style={inputStyle} placeholder="e.g. IT, HR, Finance" value={empDepartment} onChange={e => setEmpDepartment(e.target.value)} />
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Work Branch (Geofence)
                <select style={inputStyle} value={empDept} onChange={e => setEmpDept(e.target.value)}>
                  <option value="">-- Select Branch --</option>
                  {departments.filter(d => d.tenantId === selectedEmpTenant).map(d => (
                    <option key={d.departmentId} value={d.name}>{d.name}</option>
                  ))}
                  {departments.filter(d => d.tenantId === selectedEmpTenant).length === 0 && (
                    <option disabled>No branches found for this tenant</option>
                  )}
                </select>
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Gender
                <select style={inputStyle} value={empGender} onChange={e => setEmpGender(e.target.value)}>
                  <option value="">-- Select Gender --</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Nationality
                <select style={inputStyle} value={empNationality} onChange={e => setEmpNationality(e.target.value)}>
                  <option value="">-- Select Nationality --</option>
                  <option value="Filipino">Filipino</option>
                  <option value="Saudi">Saudi</option>
                  <option value="Indian">Indian</option>
                  <option value="Pakistani">Pakistani</option>
                  <option value="Egyptian">Egyptian</option>
                  <option value="American">American</option>
                  <option value="British">British</option>
                </select>
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Birth Date
                <input type="date" style={inputStyle} value={empBirthDate} onChange={e => setEmpBirthDate(e.target.value)} />
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Email Address
                <input type="email" style={inputStyle} placeholder="juan@example.com" value={empEmail} onChange={e => setEmpEmail(e.target.value)} />
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Mobile Number
                <input style={inputStyle} placeholder="09123456789" value={empMobile} onChange={e => setEmpMobile(e.target.value)} />
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Joining Date
                <input type="date" style={inputStyle} value={empJoiningDate} onChange={e => setEmpJoiningDate(e.target.value)} />
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Employment Status
                <select style={inputStyle} value={empStatus} onChange={e => setEmpStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Terminated">Terminated</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>

              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Termination Date (Optional)
                <input type="date" style={inputStyle} value={empTermDate} onChange={e => setEmpTermDate(e.target.value)} />
              </label>
              <label style={{color:'#64748b', fontSize:'0.8rem'}}>Termination Note
                <input style={inputStyle} placeholder="Reason for exit" value={empTermNote} onChange={e => setEmpTermNote(e.target.value)} />
              </label>
            </div>

            <div style={{display:'flex', gap:'15px', marginTop:'30px'}}>
              <button
                onClick={saveNewEmployee}
                className="btn-hover"
                style={{flex:1, padding:'15px', background:'#10b981', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold'}}
              >
                💾 {isEditingEmp ? 'Update Employee Data' : 'Save Employee Data'}
              </button>
              <button
                onClick={() => setIsAddEmpModalOpen(false)}
                className="btn-hover"
                style={{padding:'15px 30px', background:'#475569', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold'}}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { display:'block', width:'100%', padding:'12px', marginTop:'5px', borderRadius:'8px', border:'1px solid #334155', background:'#0f172a', color:'white', boxSizing:'border-box', outline:'none', transition:'0.2s' };
const smallBtn = { padding:'6px 12px', border:'none', borderRadius:'6px', color:'white', background:'#475569', fontSize:'0.75rem', cursor:'pointer', transition:'0.2s' };
const addBtn = { padding:'12px', background:'#3b82f6', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', transition:'0.2s' };
const checkLabel = { fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer' };
const statCard = { background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155', textAlign:'center' };
const menuItemStyle = { padding:'15px 20px', cursor:'pointer', transition:'0.2s', fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid #1e293b' };

// Hover effect (inline solution)
const MenuItem = ({ children, onClick, style }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...menuItemStyle,
        background: hover ? '#334155' : 'transparent',
        ...style
      }}
    >
      {children}
    </div>
  );
};

export default App;
