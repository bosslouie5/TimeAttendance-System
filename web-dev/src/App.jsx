import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE = '/api';

function App() {
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
  const [orgUnits, setOrgUnits] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [devAccounts, setDevAccounts] = useState([]);
  const [positionTitles, setPositionTitles] = useState([]);
  const [newDevUser, setNewDevUser] = useState('');
  const [newDevPass, setNewDevPass] = useState('');
  const [newDevDisplay, setNewDevDisplay] = useState('');
  const [editingDevUser, setEditingDevUser] = useState(null);
  const [systemIp, setSystemIp] = useState('127.0.0.1');

  const AVAILABLE_PERMISSIONS = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'employees', name: 'Staff Management' },
    { id: 'org-units', name: 'Org Units' },
    { id: 'branches', name: 'Branch/Location Setup' },
    { id: 'assign-branch', name: 'Employee Assignment' },
    { id: 'reports', name: 'Attendance Reports' },
    { id: 'setup', name: 'System Setup' },
    { id: 'devices', name: 'Device Management' },
    { id: 'position-titles', name: 'Position Titles' },
    { id: 'schedules', name: 'Schedule Management' },
    { id: 'announcements', name: 'Company Announcements' },
    { id: 'leave-management', name: 'Leave Management' },
    { id: 'payroll-bridge', name: 'Payroll Bridge' },
    { id: 'subscription-info', name: 'Subscription Info' },
    { id: 'assign-schedule', name: 'Assign Schedule' }
  ];
  const [status, setStatus] = useState('System Online');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Provisioning States
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newUsername, setNewUsername] = useState('admin');
  const [newPassword, setNewPassword] = useState('12345');
  const [newAssignedGateway, setNewAssignedGateway] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newPublicIp, setNewPublicIp] = useState('');
  const [newTenantId, setNewTenantId] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState('');

  // Tenant Management States
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantSearch, setTenantSearch] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmpTenant, setSelectedEmpTenant] = useState('ALL');

  // Employee Management States
  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
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
  const [empStatus, setEmpStatus] = useState('Active');
  const [empTenantId, setEmpTenantId] = useState('');
  const [empSchedule, setEmpSchedule] = useState('');

  // Branch/Dept States
  const [deptName, setDeptName] = useState('');
  const [deptLat, setDeptLat] = useState('');
  const [deptLon, setDeptLon] = useState('');
  const [deptRad, setDeptRad] = useState('50');
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [selectedDeptTenant, setSelectedDeptTenant] = useState('ALL');
  const [newOrgName, setNewOrgName] = useState('');
  const [selectedOrgTenant, setSelectedOrgTenant] = useState('ALL');

  // Schedule States
  const [shiftName, setShiftName] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [gracePeriod, setGracePeriod] = useState('15');
  const [selectedScheduleTenant, setSelectedScheduleTenant] = useState('ALL');

  const [newPositionTitle, setNewPositionTitle] = useState('');
  const [selectedPositionTenant, setSelectedPositionTenant] = useState('ALL');

  // Report States
  const [reportTenantId, setReportTenantId] = useState('ALL');
  const [reportBy, setReportBy] = useState('Branch');
  const [reportSearch, setReportSearch] = useState('');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  // UI States
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isViewingLogs, setIsViewingLogs] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isEditingExpiry, setIsEditingExpiry] = useState(false);
  const [tempEndDate, setTempEndDate] = useState('');
  const [isEditingIp, setIsEditingIp] = useState(false);
  const [tempPublicIp, setTempPublicIp] = useState('');
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState(null);
  const [activeApiBase, setActiveApiBase] = useState(null);
  const [tunnelBase, setTunnelBase] = useState(null);
  const [saasStatus, setSaasStatus] = useState('Connecting...');
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  // Dashboard Sync & Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const [isAssignScheduleModalOpen, setIsAssignScheduleModalOpen] = useState(false);
  const [selectedEmpForSchedule, setSelectedEmpForSchedule] = useState(null);
  const [newScheduleForEmp, setNewScheduleForEmp] = useState('');

  useEffect(() => {
    const discoverSaaS = async () => {
      const host = window.location.hostname;

      let discoveredUrl = null;
      try {
        const res = await fetch(`https://raw.githubusercontent.com/bosslouie5/TimeAttendance-System/main/backend/active_link.txt?t=${Date.now()}`);
        if (res.ok) {
          const url = (await res.text()).trim();
          if (url && url.startsWith('http')) {
            discoveredUrl = `${url}/api`;
            setTunnelBase(discoveredUrl);
          }
        }
      } catch (e) { }

      if (host === 'localhost' || host === '127.0.0.1' || host.includes('trycloudflare.com') || host.includes('onrender.com')) {
         setSaasStatus(discoveredUrl ? `Hybrid Active (Laptop Online)` : `Direct Connection Active`);
         setActiveApiBase('/api');
         return;
      }

      if (discoveredUrl) {
          setActiveApiBase(discoveredUrl);
          setSaasStatus(`Connected: ${discoveredUrl}`);
      } else {
          setSaasStatus('Waiting for Backend...');
      }
    };
    discoverSaaS();
    const interval = setInterval(discoverSaaS, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (activeApiBase) loadInitialData(); }, [activeApiBase]);
  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  // Sync selected tenant when users list is refreshed
  useEffect(() => {
    if (selectedTenant && users.length > 0) {
      const updated = users.find(u => (u.tenantId || u.username) === (selectedTenant.tenantId || selectedTenant.username));
      if (updated) {
        const hasChanged = JSON.stringify(updated.permissions) !== JSON.stringify(selectedTenant.permissions) ||
                          updated.endDate !== selectedTenant.endDate ||
                          updated.companyName !== selectedTenant.companyName;
        if (hasChanged) setSelectedTenant(updated);
      }
    }
  }, [users, selectedTenant]);

  const loadInitialData = async () => {
    if (!activeApiBase) return;
    try {
      const [u, l, e, d, da, o, pt, s] = await Promise.all([
        fetch(`${activeApiBase}/master/users`).then(r => r.json()),
        fetch(`${activeApiBase}/master/logs`).then(r => r.json()),
        fetch(`${activeApiBase}/master/employees`).then(r => r.json()),
        fetch(`${activeApiBase}/master/departments`).then(r => r.json()),
        fetch(`${activeApiBase}/master/dev-accounts`).then(r => r.json()),
        fetch(`${activeApiBase}/master/org-units`).then(r => r.json()),
        fetch(`${activeApiBase}/master/position-titles`).then(r => r.json()),
        fetch(`${activeApiBase}/master/schedules`).then(r => r.json())
      ]);
      setUsers(u || []); setLogs(l || []); setEmployees(e || []); setDepartments(d || []); setDevAccounts(da || []); setOrgUnits(o || []); setPositionTitles(pt || []); setSchedules(s || []);
      setLastSyncTime(new Date());
      fetch(`${activeApiBase}/settings`).then(r => r.json()).then(data => { if (data.currentSystemIp) setSystemIp(data.currentSystemIp); });
    } catch (e) { setStatus('Sync Error'); }
  };

  const handleDevLogin = async () => {
    setStatus('Logging in...');
    try {
      const res = await fetch(`${API_BASE}/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: devUser, password: devPass }) });
      const data = await res.json();
      if (data.success) { setIsDevLoggedIn(true); setCurrentUser(data.user); sessionStorage.setItem('dev_logged_in', 'true'); sessionStorage.setItem('dev_user_data', JSON.stringify(data.user)); setStatus(`Welcome back!`); }
      else alert(data.error || 'Invalid Credentials!');
    } catch (e) { setStatus('Login Error'); }
  };

  const handleDevLogout = () => { setIsDevLoggedIn(false); setCurrentUser(null); sessionStorage.removeItem('dev_logged_in'); sessionStorage.removeItem('dev_user_data'); };

  const createDevAccount = async () => {
    if (!newDevUser || !newDevPass || !newDevDisplay) return alert('Fill all fields');
    setProcessing(true);
    setProcessingMsg(editingDevUser ? 'Updating Dev Account...' : 'Creating Dev Account...');
    try {
      const url = editingDevUser
        ? `${activeApiBase}/master/dev-accounts/${editingDevUser.username}`
        : `${activeApiBase}/master/dev-accounts`;

      const method = editingDevUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newDevUser, password: newDevPass, displayName: newDevDisplay })
      });
      if (res.ok) {
        setNewDevUser(''); setNewDevPass(''); setNewDevDisplay('');
        setEditingDevUser(null);
        loadInitialData();
        setStatus(editingDevUser ? 'Dev Account Updated ✓' : 'Dev Account Created ✓');
      } else {
        const err = await res.json();
        alert(err.error || 'Operation failed');
      }
    } catch (e) { setStatus('Error managing dev account'); }
    finally { setProcessing(false); }
  };

  const prepareEditDev = (acc) => {
    setNewDevUser(acc.username);
    setNewDevDisplay(acc.displayName);
    setNewDevPass(acc.password);
    setEditingDevUser(acc);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteDevAccount = async (username) => {
    if (!confirm(`Delete dev account ${username}?`)) return;
    try {
      const res = await fetch(`${activeApiBase}/master/dev-accounts/${username}`, { method: 'DELETE' });
      if (res.ok) { loadInitialData(); setStatus('Account Deleted ✓'); }
      else {
        const err = await res.json();
        alert(err.error || 'Delete failed');
      }
    } catch (e) { setStatus('Error deleting account'); }
  };

  const clearSystemData = async (target, tId = 'MASTER_GLOBAL') => {
    if (!confirm(`WARNING: This will permanently DELETE all ${target} for ${tId === 'MASTER_GLOBAL' ? 'ALL TENANTS' : tId}. Proceed?`)) return;
    try {
      const res = await fetch(`${activeApiBase}/master/clear-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tId, target })
      });
      if (res.ok) { loadInitialData(); setStatus(`${target.toUpperCase()} Cleared ✓`); }
    } catch (e) { setStatus('Clear operation failed'); }
  };

  const provisionPortal = async () => {
    if (!newCompanyName || !newUsername || !newPassword) return alert('Fill all fields');
    const autoIp = newAdminIp || generateHostIp();
    const tId = newTenantId || generateTenantId();
    const allPerms = AVAILABLE_PERMISSIONS.map(p => p.id);

    try {
      const res = await fetch(`${activeApiBase}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tId,
          companyName: newCompanyName,
          username: newUsername,
          password: newPassword,
          permissions: allPerms,
          adminIp: autoIp,
          publicIp: newPublicIp,
          startDate: newStartDate,
          endDate: newEndDate
        })
      });
      if (res.ok) {
        setIsProvisioning(false);
        loadInitialData();
        setStatus('Tenant Provisioned ✓');
        setNewCompanyName('');
        setNewUsername('admin');
        setNewPassword('12345');
        setNewAdminIp('');
        setNewPublicIp('');
        setNewTenantId('');
      }
    } catch (e) { setStatus('Provisioning Failed'); }
  };

  const captureCurrentIp = async () => {
    setStatus('Capturing Network IP...');
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      if (data.ip) {
        const parts = data.ip.split('.');
        const wildcardIp = parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : data.ip;
        setNewPublicIp(wildcardIp);
        setStatus(`Captured: ${data.ip}`);
      }
    } catch (e) { setStatus('IP Capture Failed'); }
  };

  const createSchedule = async () => {
    if (!shiftName || selectedScheduleTenant === 'ALL') return alert('Please provide Shift Name and select a Tenant');
    try {
      const res = await fetch(`${activeApiBase}/schedules?tenantId=${selectedScheduleTenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedScheduleTenant },
        body: JSON.stringify({ name: shiftName, startTime, endTime, gracePeriod })
      });
      if (res.ok) { setShiftName(''); loadInitialData(); setStatus('Schedule Created ✓'); }
    } catch (e) { setStatus('Failed to create schedule'); }
  };

  const deleteSchedule = async (id, tId) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      const res = await fetch(`${activeApiBase}/schedules/${id}?tenantId=${tId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tId }
      });
      if (res.ok) { loadInitialData(); setStatus('Schedule Deleted ✓'); }
    } catch (e) { setStatus('Delete failed'); }
  };

  const deleteTenant = async (id) => {
    if (!confirm('Delete this tenant and all associated data?')) return;
    try {
      const res = await fetch(`${activeApiBase}/users/${id}`, { method: 'DELETE' });
      if (res.ok) { loadInitialData(); setStatus('Tenant Removed ✓'); }
    } catch (e) { setStatus('Delete failed'); }
  };

  const getNextEmployeeId = (tenantId) => {
    if (!tenantId) return '';
    const tenantEmployees = employees.filter(e => e.tenantId === tenantId);
    if (tenantEmployees.length === 0) return '';

    let maxVal = -1;
    let padLength = 0;

    tenantEmployees.forEach(e => {
      const val = parseInt(e.employeeId);
      if (!isNaN(val)) {
        if (val > maxVal) {
          maxVal = val;
          padLength = e.employeeId.length;
        } else if (val === maxVal) {
          padLength = Math.max(padLength, e.employeeId.length);
        }
      }
    });

    if (maxVal === -1) return '';
    const nextVal = (maxVal + 1).toString();
    return nextVal.padStart(padLength, '0');
  };

  const handleEmpTenantChange = (tenantId) => {
    setEmpTenantId(tenantId);
    if (!isEditingEmp) {
      setEmpId(getNextEmployeeId(tenantId));
    }
  };

  const prepareNewEmployee = () => {
    setEmpName('');
    setEmpJobTitle('');
    setEmpDepartment('');
    setEmpDept('');
    setEmpGender('');
    setEmpNationality('');
    setEmpBirthDate('');
    setEmpEmail('');
    setEmpMobile('');
    setEmpJoiningDate(new Date().toISOString().split('T')[0]);
    setEmpTermDate('');
    setEmpTermNote('');
    setEmpStatus('Active');
    setEmpSchedule('');
    const initialTenant = selectedEmpTenant === 'ALL' ? '' : selectedEmpTenant;
    setEmpTenantId(initialTenant);
    setEmpId(getNextEmployeeId(initialTenant));
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
    setEmpSchedule(emp.schedule || '');
    setEmpTenantId(emp.tenantId);
    setIsEditingEmp(true);
    setIsAddEmpModalOpen(true);
  };

  const saveNewEmployee = async () => {
    if (!empName || !empId || !empTenantId) return alert('Tenant, ID, and Name are required');
    setProcessingMsg(isEditingEmp ? 'Updating Employee...' : 'Adding Employee...');
    setProcessing(true);
    try {
      const url = isEditingEmp
        ? `${activeApiBase}/employees/${empId}?tenantId=${empTenantId}`
        : `${activeApiBase}/employees?tenantId=${empTenantId}`;

      const method = isEditingEmp ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': empTenantId },
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
          tenantId: empTenantId
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
    } catch (e) {
      alert('Failed to save employee');
    } finally {
      setProcessing(false);
    }
  };

  const deleteEmployee = async (id, tId) => {
    if (!confirm(`Are you sure you want to delete employee ${id}? This cannot be undone.`)) return;
    setProcessingMsg('Deleting employee...');
    setProcessing(true);
    try {
      const res = await fetch(`${activeApiBase}/employees/${id}?tenantId=${tId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tId }
      });
      if (res.ok) {
        setStatus('Employee deleted ✓');
        loadInitialData();
      } else {
        alert('Failed to delete employee');
      }
    } catch (e) {
      alert('Error deleting employee');
    } finally {
      setProcessing(false);
    }
  };

  const handleBuildApk = async (tenant) => {
    const apiToUse = tunnelBase || activeApiBase;

    if (apiToUse.includes('onrender.com') || apiToUse === '/api') {
      if (!tunnelBase) {
        alert("CRITICAL: APK Building requires your LAPTOP to be ONLINE with DEV_TOOLS Option 2 or S running.\n\nPlease turn on your laptop and start the tunnel first.");
        return;
      }
    }

    setProcessingMsg(`Building Custom APK for ${tenant.companyName}... This usually takes 2-3 minutes. Please do not close this tab.`);
    setProcessing(true);
    setStatus('Building APK...');
    try {
      // Increase timeout for build process (300 seconds)
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 300000);

      const res = await fetch(`${apiToUse}/master/build-apk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          tenantId: tenant.tenantId || tenant.username,
          companyName: tenant.companyName,
          publicUrl: activeApiBase // APK will connect back to Render for data
        })
      });
      clearTimeout(id);

      if (!res.ok) throw new Error('Build Server Timeout or Error');

      const data = await res.json();
      if (data.success) {
        setStatus('Build Success ✓');
        // PRO DOWNLOAD METHOD
        window.location.href = data.downloadUrl;
        if (data.downloadUrl.includes('github.io')) {
            alert(`Success! APK is built. Once you DEPLOY (Option 1 in DEV_TOOLS), the download link will be active at GitHub.`);
        } else {
            alert(`Success! APK for ${tenant.companyName} is ready and downloading.`);
        }
      } else {
        alert('Build Failed: ' + (data.error || 'Check logs'));
      }
    } catch (e) {
      setStatus('Build Error');
      if (e.name === 'AbortError') {
         alert('Build process timed out (5 mins). Check your laptop if the build finished.');
      } else {
         alert('Build process encountered an error. Is your laptop online?');
      }
    }
    finally { setProcessing(false); }
  };

  const handleInstallLaunchApk = async (tenant) => {
    const apiToUse = tunnelBase || activeApiBase;
    if (apiToUse.includes('onrender.com') || apiToUse === '/api') {
       alert("USB Install requires direct laptop connection. Please use your Laptop for this action.");
       return;
    }

    setProcessingMsg(`Establishing USB Bridge... Installing App to Device. Please don't unplug.`);
    setProcessing(true);
    setStatus('Installing to USB Device...');
    try {
      const res = await fetch(`${apiToUse}/master/build-and-run-apk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.tenantId || tenant.username,
          companyName: tenant.companyName,
          publicUrl: activeApiBase
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatus('Installed & Launched ✓');
        alert('Success: App installed and launched on device!');
      } else {
        alert('Error: ' + (data.error || 'Is device connected via USB?'));
        setStatus('Install Failed');
      }
    } catch (e) { setStatus('USB Install Error'); }
    finally { setProcessing(false); }
  };

  const updatePermissions = async (targetTenant, perm) => {
    const tenantId = targetTenant.tenantId || targetTenant.username;
    const currentPerms = targetTenant.permissions || [];
    const newPerms = currentPerms.includes(perm) ? currentPerms.filter(p => p !== perm) : [...currentPerms, perm];

    // Immediate UI Feedback
    const updatedTenant = { ...targetTenant, permissions: newPerms };
    setSelectedTenant(updatedTenant);

    try {
      const res = await fetch(`${activeApiBase}/users/${tenantId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: newPerms })
      });
      if (res.ok) {
        await loadInitialData();
        setStatus('Permissions Updated ✓');
      } else {
        setStatus('Update failed');
        loadInitialData();
      }
    } catch (e) {
      setStatus('Update failed');
      loadInitialData();
    }
  };

  const updateTenantExpiry = async () => {
    if (!selectedTenant) return;
    const tId = selectedTenant.tenantId || selectedTenant.username;
    setProcessingMsg(`Updating Contract Period for ${selectedTenant.companyName}...`);
    setProcessing(true);
    try {
      const res = await fetch(`${activeApiBase}/users/${tId}/enddate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endDate: tempEndDate })
      });
      if (res.ok) {
        await loadInitialData();
        setIsEditingExpiry(false);
        setStatus('Expiry Date Updated ✓');
        // Update local selected tenant to reflect changes
        setSelectedTenant(prev => ({ ...prev, endDate: tempEndDate }));
      }
    } catch (e) { setStatus('Update failed'); }
    finally { setProcessing(false); }
  };

  const updateNetworkLock = async () => {
    if (!selectedTenant) return;
    const tId = selectedTenant.tenantId || selectedTenant.username;
    setProcessingMsg(`Updating Network Lock for ${selectedTenant.companyName}...`);
    setProcessing(true);
    try {
      const res = await fetch(`${activeApiBase}/users/${tId}/network-lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicIp: tempPublicIp })
      });
      if (res.ok) {
        await loadInitialData();
        setIsEditingIp(false);
        setStatus('Network Lock Updated ✓');
        setSelectedTenant(prev => ({ ...prev, publicIp: tempPublicIp }));
      }
    } catch (e) { setStatus('Update failed'); }
    finally { setProcessing(false); }
  };

  const broadcastLink = async () => {
    setIsBroadcasting(true);
    try {
      const res = await fetch(`${activeApiBase}/master/broadcast-link`, { method: 'POST' });
      if (res.ok) setStatus('Broadcast Success ✓');
    } catch (e) { setStatus('Broadcast Failed'); }
    finally { setIsBroadcasting(false); }
  };

  const handleSaveSchedule = async () => {
    if (!selectedEmpForSchedule || !newScheduleForEmp) return alert('Please select a schedule');
    setProcessingMsg('Updating Employee Schedule...');
    setProcessing(true);
    try {
      const res = await fetch(`${activeApiBase}/schedule-assign?tenantId=${selectedEmpForSchedule.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedEmpForSchedule.tenantId },
        body: JSON.stringify({
          employeeId: selectedEmpForSchedule.employeeId,
          shift: newScheduleForEmp
        })
      });
      if (res.ok) {
        setStatus('Schedule Assigned ✓');
        setIsAssignScheduleModalOpen(false);
        loadInitialData();
      } else {
        alert('Failed to assign schedule');
      }
    } catch (e) {
      alert('Error assigning schedule');
    } finally {
      setProcessing(false);
    }
  };

  const getFilteredLogs = () => {
    return logs.filter(l => {
      const isTenantMatch = reportTenantId === 'ALL' || l.tenantId === reportTenantId;
      const logDate = new Date(l.timestamp);
      const isAfterStart = !reportStartDate || logDate >= new Date(reportStartDate);
      const isBeforeEnd = !reportEndDate || logDate <= new Date(new Date(reportEndDate).setHours(23, 59, 59));

      let isMatch = true;
      if (reportSearch) {
        const s = reportSearch.toLowerCase();
        if (reportBy === 'Branch') isMatch = l.departmentName?.toLowerCase().includes(s);
        else isMatch = l.employeeId?.toLowerCase().includes(s) || l.employeeName?.toLowerCase().includes(s);
      }

      return isTenantMatch && isAfterStart && isBeforeEnd && isMatch;
    });
  };

  const exportReportExcelFile = () => {
    const data = getFilteredLogs();
    if (data.length === 0) return alert('No data to export');

    const companyName = reportTenantId === 'ALL' ? 'Global' : (users.find(u => (u.tenantId || u.username) === reportTenantId)?.companyName || 'Report');

    const exportData = data.map(l => {
      const emp = employees.find(e => e.employeeId === l.employeeId && e.tenantId === l.tenantId);
      const sched = schedules.find(s => s.tenantId === l.tenantId && (s.name === emp?.schedule || (emp?.schedule && emp.schedule.startsWith(s.name))));
      let statusText = (l.status || 'Pending').toUpperCase();
      let otText = '-';
      let schedText = sched ? `${sched.startTime} - ${sched.endTime}` : (emp?.schedule || 'No Sched');

      if (!l.timeIn && !l.timeOut) {
        statusText = 'ABSENT';
      } else if (!l.timeIn) {
        statusText = 'NO TIME IN';
      } else if (!l.timeOut) {
        statusText = 'NO TIME OUT';
      } else {
        let currentSchedStart = sched?.startTime;
        let currentSchedEnd = sched?.endTime;
        let currentGrace = parseInt(sched?.gracePeriod || 15);

        if (!sched && emp?.schedule) {
          const timeMatch = emp.schedule.match(/(\d{1,2}:\d{2})/g);
          if (timeMatch && timeMatch.length >= 2) {
            currentSchedStart = timeMatch[0];
            currentSchedEnd = timeMatch[1];
          }
        }

        if (currentSchedStart) {
          const logIn = new Date(l.timeIn);
          const logOut = new Date(l.timeOut);
          const d = new Date(l.timestamp);
          const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          const sStart = new Date(`${datePart}T${currentSchedStart.padStart(5, '0')}:00`);
          const sEnd = new Date(`${datePart}T${currentSchedEnd.padStart(5, '0')}:00`);

          const lateThreshold = new Date(sStart.getTime() + currentGrace * 60000);
          if (logIn > lateThreshold) statusText = 'LATE';
          else statusText = 'COMPLETED';

          let otMin = 0;
          if (logIn < sStart) otMin += (sStart.getTime() - logIn.getTime()) / 60000;
          if (logOut > sEnd) otMin += (logOut.getTime() - sEnd.getTime()) / 60000;

          if (otMin > 0) {
            const h = Math.floor(otMin / 60);
            const m = Math.round(otMin % 60);
            otText = h > 0 ? `${h}h ${m}m` : `${m}m`;
          }
        }
      }

      return {
        'Tenant': users.find(u => (u.tenantId || u.username) === l.tenantId)?.companyName || l.tenantId,
        'Employee ID': l.employeeId,
        'Name': l.employeeName,
        'Work Branch': l.departmentName,
        'Date': new Date(l.timestamp).toLocaleDateString(),
        'Schedule': schedText,
        'Time In': l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-',
        'Time Out': l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-',
        'Over Time': otText,
        'Status': statusText
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `${companyName}_Global_Attendance_Report.xlsx`);
  };

  const exportEmployeesExcel = () => {
    const s = empSearch.toLowerCase();
    const filtered = employees.filter(e => {
      const tenantMatch = selectedEmpTenant === 'ALL' || e.tenantId === selectedEmpTenant;
      return tenantMatch && (e.name.toLowerCase().includes(s) || (e.employeeId && e.employeeId.toLowerCase().includes(s)));
    });

    if (filtered.length === 0) return alert('No employees to export');

    const exportData = filtered.map(e => ({
      'Tenant': users.find(u => (u.tenantId || u.username) === e.tenantId)?.companyName || e.tenantId,
      'Employee ID': e.employeeId,
      'Full Name': e.name,
      'Job Title': e.jobTitle || '',
      'Department': e.department || '',
      'Assigned Branch': e.branchName || '',
      'Gender': e.gender || '',
      'Nationality': e.nationality || '',
      'Birth Date': e.birthDate || '',
      'Email Address': e.email || '',
      'Mobile Number': e.mobile || '',
      'Joining Date': e.joiningDate || '',
      'Termination Date': e.terminationDate || '',
      'Termination Note': e.terminationNote || '',
      'Status': e.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, `Global_Staff_List_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const viewReportPDF = () => {
    const data = getFilteredLogs();
    if (data.length === 0) return alert('No data to generate PDF');

    const doc = new jsPDF('l', 'mm', 'a4');
    const companyName = reportTenantId === 'ALL' ? 'Global' : (users.find(u => (u.tenantId || u.username) === reportTenantId)?.companyName || 'Timekey System');

    doc.setFontSize(18);
    doc.text(`Global Attendance Report: ${companyName}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Filtered by: ${reportBy} | Range: ${reportStartDate || 'Start'} to ${reportEndDate || 'End'}`, 14, 28);

    const tableData = data.map(l => {
      const emp = employees.find(e => e.employeeId === l.employeeId && e.tenantId === l.tenantId);
      const sched = schedules.find(s => s.tenantId === l.tenantId && (s.name === emp?.schedule || (emp?.schedule && emp.schedule.startsWith(s.name))));
      let statusText = (l.status || 'Pending').toUpperCase();
      let otText = '-';
      let schedText = sched ? `${sched.startTime} - ${sched.endTime}` : (emp?.schedule || 'No Sched');

      if (!l.timeIn && !l.timeOut) {
        statusText = 'ABSENT';
      } else if (!l.timeIn) {
        statusText = 'NO TIME IN';
      } else if (!l.timeOut) {
        statusText = 'NO TIME OUT';
      } else {
        let currentSchedStart = sched?.startTime;
        let currentSchedEnd = sched?.endTime;
        let currentGrace = parseInt(sched?.gracePeriod || 15);

        if (!sched && emp?.schedule) {
          const timeMatch = emp.schedule.match(/(\d{1,2}:\d{2})/g);
          if (timeMatch && timeMatch.length >= 2) {
            currentSchedStart = timeMatch[0];
            currentSchedEnd = timeMatch[1];
          }
        }

        if (currentSchedStart) {
          const logIn = new Date(l.timeIn);
          const logOut = new Date(l.timeOut);
          const d = new Date(l.timestamp);
          const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          const sStart = new Date(`${datePart}T${currentSchedStart.padStart(5, '0')}:00`);
          const sEnd = new Date(`${datePart}T${currentSchedEnd.padStart(5, '0')}:00`);

          const lateThreshold = new Date(sStart.getTime() + currentGrace * 60000);
          if (logIn > lateThreshold) statusText = 'LATE';
          else statusText = 'COMPLETED';

          let otMin = 0;
          if (logIn < sStart) otMin += (sStart.getTime() - logIn.getTime()) / 60000;
          if (logOut > sEnd) otMin += (logOut.getTime() - sEnd.getTime()) / 60000;

          if (otMin > 0) {
            const h = Math.floor(otMin / 60);
            const m = Math.round(otMin % 60);
            otText = h > 0 ? `${h}h ${m}m` : `${m}m`;
          }
        }
      }

      return [
        users.find(u => (u.tenantId || u.username) === l.tenantId)?.companyName || l.tenantId,
        l.employeeId,
        l.employeeName,
        l.departmentName,
        new Date(l.timestamp).toLocaleDateString(),
        schedText,
        l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-',
        l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-',
        otText,
        statusText
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Tenant', 'ID', 'Name', 'Branch', 'Date', 'Schedule', 'Time In', 'Time Out', 'Overtime', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    window.open(doc.output('bloburl'), '_blank');
  };

  const generateHostIp = () => {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
  };

  const generateTenantId = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  if (!isDevLoggedIn) {
    return (
      <div style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0f172a', fontFamily:'sans-serif'}}>
        <div style={{background:'#1e293b', padding:'40px', borderRadius:'15px', border:'1px solid #334155', width:'100%', maxWidth:'400px', textAlign:'center'}}>
          <h1 style={{color:'#3b82f6', marginBottom:'10px'}}>TIMEKEY HUB</h1>
          <p style={{color:'#64748b', marginBottom:'30px'}}>Developer Login</p>
          <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
            <input value={devUser} onChange={e => setDevUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDevLogin()} placeholder="Username" style={inputStyle} />
            <input type="password" value={devPass} onChange={e => setDevUserPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDevLogin()} placeholder="Password" style={inputStyle} />
            <button onClick={handleDevLogin} className="btn-hover" style={{...addBtn, marginTop:'10px'}}>Access System</button>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = users.filter(u => !u.endDate || new Date() <= new Date(u.endDate)).length;

  return (
    <div style={{fontFamily:'system-ui, sans-serif', background:'#0f172a', color:'white', minHeight:'100vh', padding:'20px'}}>
      <style>{`
        .fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .stat-card { background: #1e293b; padding: 25px; border-radius: 20px; border: 1px solid #334155; text-align: center; transition: 0.3s; }
        .stat-card:hover { transform: translateY(-5px); border-color: #3b82f6; background: #1e293b; }
        .module-card { background: #1e293b; padding: 30px; border-radius: 20px; border: 1px solid #334155; cursor: pointer; transition: 0.3s; text-align: center; position: relative; overflow: hidden; }
        .module-card:hover { transform: translateY(-5px); border-color: #3b82f6; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.2); }
        .module-card::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(45deg, transparent, rgba(59, 130, 246, 0.05), transparent); transform: translateX(-100%); transition: 0.5s; }
        .module-card:hover::after { transform: translateX(100%); }
        .btn-hover:hover { filter: brightness(1.2); transform: scale(1.02); }
        .btn-hover:active { transform: scale(0.98); }
        table { width: max-content; min-width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { text-align: left; padding: 12px; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; }
        td { padding: 12px; border-bottom: 1px solid #1e293b; font-size: 0.9rem; white-space: nowrap; }
        tr:hover { background: #33415533; }

        /* SIDEBAR STYLES */
        .sidebar-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
          z-index: 1000; opacity: 0; visibility: hidden; transition: 0.3s;
        }
        .sidebar-overlay.open { opacity: 1; visibility: visible; }

        .sidebar {
          position: fixed; top: 0; left: -320px; width: 320px; height: 100vh;
          background: #1e293b; border-right: 1px solid #334155;
          z-index: 1001; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex; flex-direction: column;
        }
        .sidebar.open { left: 0; box-shadow: 20px 0 50px rgba(0,0,0,0.5); }

        .menu-item {
          padding: 16px 25px; cursor: pointer; transition: 0.2s;
          display: flex; align-items: center; gap: 15px;
          border-left: 4px solid transparent; color: #94a3b8;
          font-weight: 500;
        }
        .menu-item:hover { background: #334155; color: white; border-left-color: #3b82f6; }
        .menu-item.active { background: #0f172a; color: #3b82f6; border-left-color: #3b82f6; }

        .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #10b981; display: inline-block;
          margin-right: 8px; box-shadow: 0 0 10px #10b981;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }

        .glass-card {
           background: rgba(30, 41, 59, 0.7);
           backdrop-filter: blur(12px);
           border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #3b82f6; }
      `}</style>

      {/* ACTION PROCESSING OVERLAY */}
      {processing && (
        <div style={{
          position:'fixed', top:0, left:0, width:'100%', height:'100%',
          background:'rgba(15, 23, 42, 0.9)', backdropFilter:'blur(10px)',
          zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            width:'80px', height:'80px', border:'5px solid #1e293b', borderTop:'5px solid #3b82f6',
            borderRadius:'50%', animation:'spin 1s linear infinite', marginBottom:'30px'
          }}></div>
          <h2 style={{color:'white', margin:0, letterSpacing:'1px', fontWeight:'900'}}>{processingMsg}</h2>
          <p style={{color:'#64748b', marginTop:'10px'}}>System is performing sensitive operations. Please wait...</p>
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #3b82f6; }
      `}</style>
        </div>
      )}

      {/* SIDEBAR NAVIGATION */}
      <div className={`sidebar-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)}></div>
      <div className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
        <div style={{padding:'30px 25px', borderBottom:'1px solid #334155', display:'flex', alignItems:'center', gap:'15px'}}>
          <div style={{width:'40px', height:'40px', background:'#3b82f6', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', fontSize:'1.2rem'}}>TK</div>
          <div>
            <div style={{fontWeight:'bold', color:'white'}}>TIMEKEY HUB</div>
            <div style={{fontSize:'0.7rem', color:'#64748b'}}>Dev Management</div>
          </div>
        </div>

        <div style={{flex:1, overflowY:'auto', padding:'20px 0'}}>
          <MenuItem active={activeTab === 'dashboard'} onClick={() => {setActiveTab('dashboard'); setIsMenuOpen(false);}}>
            <span>🏠</span> Dashboard
          </MenuItem>

          <div style={{padding:'20px 25px 10px', fontSize:'0.65rem', color:'#475569', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'bold'}}>System Control</div>
          <MenuItem active={activeTab === 'tenants'} onClick={() => {setActiveTab('tenants'); setIsMenuOpen(false);}}>
            <span>👥</span> Manage Tenant
          </MenuItem>
          <MenuItem active={activeTab === 'tenant-permissions'} onClick={() => {setActiveTab('tenant-permissions'); setIsMenuOpen(false);}}>
            <span>🛡️</span> Tenant Permissions
          </MenuItem>

          <div style={{padding:'20px 25px 10px', fontSize:'0.65rem', color:'#475569', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'bold'}}>Resource Management</div>
          <MenuItem active={activeTab === 'employees'} onClick={() => {setActiveTab('employees'); setIsMenuOpen(false);}}>
            <span>👥</span> Staff Management
          </MenuItem>
          <MenuItem active={activeTab === 'assign-branch'} onClick={() => {setActiveTab('assign-branch'); setIsMenuOpen(false);}}>
            <span>🔗</span> Assign Branch
          </MenuItem>
          <MenuItem active={activeTab === 'assign-schedule'} onClick={() => {setActiveTab('assign-schedule'); setIsMenuOpen(false);}}>
            <span>📅</span> Assign Schedule
          </MenuItem>
          <MenuItem active={activeTab === 'devices'} onClick={() => {setActiveTab('devices'); setIsMenuOpen(false);}}>
            <span>📱</span> Registered Devices
          </MenuItem>

          <div style={{padding:'20px 25px 10px', fontSize:'0.65rem', color:'#475569', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'bold'}}>Infrastructure</div>
          <MenuItem active={activeTab === 'branches'} onClick={() => {setActiveTab('branches'); setIsMenuOpen(false);}}>
            <span>📍</span> Branch Setup
          </MenuItem>
          <MenuItem active={activeTab === 'org-departments'} onClick={() => {setActiveTab('org-departments'); setIsMenuOpen(false);}}>
            <span>🏢</span> Dept. Management
          </MenuItem>
          <MenuItem active={activeTab === 'position-titles'} onClick={() => {setActiveTab('position-titles'); setIsMenuOpen(false);}}>
            <span>💼</span> Position Titles
          </MenuItem>
          <MenuItem active={activeTab === 'schedules'} onClick={() => {setActiveTab('schedules'); setIsMenuOpen(false);}}>
            <span>⏰</span> Schedule Management
          </MenuItem>

          <div style={{padding:'20px 25px 10px', fontSize:'0.65rem', color:'#475569', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'bold'}}>Monitoring</div>
          <MenuItem active={activeTab === 'reports'} onClick={() => {setActiveTab('reports'); setIsMenuOpen(false);}}>
            <span>📊</span> System-Wide Reports
          </MenuItem>

          <div style={{padding:'20px 25px 10px', fontSize:'0.65rem', color:'#475569', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'bold'}}>Developer Portal</div>
          <MenuItem active={activeTab === 'account-management'} onClick={() => {setActiveTab('account-management'); setIsMenuOpen(false);}}>
            <span>🔑</span> Account Management
          </MenuItem>
          <MenuItem active={activeTab === 'system-settings'} onClick={() => {setActiveTab('system-settings'); setIsMenuOpen(false);}}>
            <span>⚙️</span> System Settings
          </MenuItem>
        </div>

        <div style={{padding:'20px', borderTop:'1px solid #334155'}}>
          <button onClick={handleDevLogout} style={{width:'100%', background:'#ef444422', color:'#ef4444', border:'1px solid #ef444444', padding:'12px', borderRadius:'10px', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}>
            <span>🚪</span> Logout Session
          </button>
        </div>
      </div>

      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #1e293b', paddingBottom:'20px', marginBottom:'20px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
           <div onClick={() => setIsMenuOpen(!isMenuOpen)} style={{cursor:'pointer', padding:'8px', borderRadius:'8px', background:'#1e293b', border:'1px solid #334155'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="3"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></div>
           <div><h1 style={{margin:0, color:'#3b82f6', fontSize:'1.5rem'}}>DEV CONTROL CENTER</h1><p style={{margin:0, color:'#64748b', fontSize:'0.8rem'}}>Master Infrastructure Management</p></div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
           <button onClick={broadcastLink} className="btn-hover" style={{background:'#8b5cf6', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', transition:'0.3s'}}>{isBroadcasting ? 'Broadcasting...' : '🚀 BROADCAST SYSTEM UPDATE'}</button>
           <div style={{textAlign:'right'}}><div style={{fontSize:'0.8rem', color:'#60a5fa'}}>{currentTime.toLocaleTimeString()}</div><div style={{fontSize:'0.6rem', color:'#64748b'}}><span className="dot"></span>{saasStatus}</div></div>
        </div>
      </header>

      {activeTab === 'dashboard' && (
        <div className="fade-in">
          {/* STATS SECTION */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'20px', marginBottom:'40px'}}>
            <StatCard label="Total Clients" value={users.length} sub="Companies onboarded" />
            <StatCard label="Active Licenses" value={activeCount} sub="Generating revenue" color="#10b981" />
            <StatCard label="Expired Accounts" value={users.length - activeCount} sub="Need renewal" color="#ef4444" />
            <StatCard label="Total Logs Today" value={logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length} sub="System activity" color="#10b981" />
            <StatCard label="Total Global Staff" value={employees.length} sub="Registered across all tenants" />
            <StatCard label="Configured Shifts" value={schedules.length} sub="Work schedule templates" color="#f59e0b" />
          </div>

          <h2 style={{fontSize:'1rem', color:'#94a3b8', textTransform:'uppercase', marginBottom:'20px'}}>Available Modules</h2>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'20px'}}>
            <ModuleCard icon="👥" title="Manage Tenant" desc="Provision portals and track usage" color="#8b5cf6" onClick={() => setActiveTab('tenants')} />
            <ModuleCard icon="👥" title="Staff Management" desc="Global list of registered staff" color="#3b82f6" onClick={() => setActiveTab('employees')} />
            <ModuleCard icon="📍" title="Branch Setup" desc="Configure geofence office locations" color="#10b981" onClick={() => setActiveTab('branches')} />
            <ModuleCard icon="🏢" title="Dept. Management" desc="Organizational units for each company" color="#3b82f6" onClick={() => setActiveTab('org-departments')} />
            <ModuleCard icon="💼" title="Position Management" desc="Define custom job position titles" color="#60a5fa" onClick={() => setActiveTab('position-titles')} />
            <ModuleCard icon="🛡️" title="Tenant Permissions" desc="Manage module access per company" color="#8b5cf6" onClick={() => setActiveTab('tenant-permissions')} />
            <ModuleCard icon="📊" title="System-Wide Reports" desc="Analytics and attendance logs" color="#10b981" onClick={() => setActiveTab('reports')} />
            <ModuleCard icon="🔗" title="Assign Branch" desc="Map employees to office locations" color="#3b82f6" onClick={() => setActiveTab('assign-branch')} />
            <ModuleCard icon="📅" title="Assign Schedule" desc="Assign work shifts to employees" color="#f59e0b" onClick={() => setActiveTab('assign-schedule')} />
            <ModuleCard icon="📱" title="Registered Devices" desc="Manage secure device linking" color="#10b981" onClick={() => setActiveTab('devices')} />
            <ModuleCard icon="⏰" title="Schedule Management" desc="Set office hours and shifts" color="#f59e0b" onClick={() => setActiveTab('schedules')} />
          </div>
        </div>
      )}

      {activeTab === 'tenants' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'25px', padding:'10px'}}>
             <div className="glass-card" style={{padding:'25px', background:'#1e293b', borderRadius:'20px', maxHeight:'80vh', overflowY:'auto', border:'1px solid #334155'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px'}}>
                <h2 style={{margin:0, fontSize:'1.2rem', color:'#f1f5f9'}}>Tenants</h2>
                <button onClick={() => {
                  setIsProvisioning(true);
                  setSelectedTenant(null);
                  setNewAdminIp(generateHostIp());
                  setNewTenantId(generateTenantId());
                }} className="btn-hover" style={{...smallBtn, background:'#3b82f6', padding:'10px 18px', borderRadius:'10px'}}>+ Add New Tenant</button>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                {users.map(u => (
                  <div key={u.tenantId || u.username} onClick={() => {setSelectedTenant(u); setIsProvisioning(false);}} className="tenant-item" style={{
                    padding:'20px', borderRadius:'15px',
                    background: selectedTenant?.tenantId === (u.tenantId || u.username) ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#0f172a',
                    border: '1px solid',
                    borderColor: selectedTenant?.tenantId === (u.tenantId || u.username) ? '#60a5fa' : '#334155',
                    cursor:'pointer', transition:'0.3s',
                    boxShadow: selectedTenant?.tenantId === (u.tenantId || u.username) ? '0 10px 20px rgba(59, 130, 246, 0.3)' : 'none'
                  }}>
                     <div style={{fontWeight:'800', fontSize:'1.1rem', marginBottom:'5px'}}>{u.companyName}</div>
                     <div style={{fontSize:'0.75rem', opacity:0.7, display:'flex', justifyContent:'space-between'}}>
                        <span>ID: {u.tenantId || u.username}</span>
                        <span>{u.adminIp || 'No IP'}</span>
                     </div>
                  </div>
                ))}
              </div>
           </div>
           <div style={{background:'#1e293b', padding:'40px', borderRadius:'25px', border:'1px solid #334155', boxShadow:'0 20px 50px rgba(0,0,0,0.3)', position:'relative', overflow:'hidden'}}>
              <div style={{position:'absolute', top:0, right:0, width:'150px', height:'150px', background:'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)', zIndex:0}}></div>
              {isProvisioning ? (
                <div style={{position:'relative', zIndex:1}}>
                   <h2 style={{fontSize:'1.8rem', marginBottom:'10px', display:'flex', alignItems:'center', gap:'15px'}}>🚀 Provision Portal</h2>
                   <p style={{color:'#64748b', marginBottom:'30px'}}>Setup a new isolated infrastructure for your client.</p>

                   <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                      <div>
                        <label style={{fontSize:'0.75rem', color:'#94a3b8', marginBottom:'8px', display:'block', fontWeight:'bold'}}>COMPANY DETAILS</label>
                        <input style={inputStyle} placeholder="Company Name" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} />
                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                           <input style={{...inputStyle, flex:1}} placeholder="Tenant ID (Auto)" value={newTenantId} onChange={e => setNewTenantId(e.target.value)} />
                           <button onClick={() => setNewTenantId(generateTenantId())} style={{...smallBtn, background:'#334155', marginBottom:'15px'}}>♻️</button>
                        </div>
                      </div>
                      <div>
                        <label style={{fontSize:'0.75rem', color:'#94a3b8', marginBottom:'8px', display:'block', fontWeight:'bold'}}>ADMIN CREDENTIALS</label>
                        <input style={inputStyle} placeholder="Admin Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                        <input style={inputStyle} type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                      </div>
                   </div>

                   <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginTop:'10px'}}>
                      <div>
                        <label style={{fontSize:'0.75rem', color:'#94a3b8', marginBottom:'8px', display:'block', fontWeight:'bold'}}>SUBSCRIPTION START</label>
                        <input type="date" style={inputStyle} value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
                      </div>
                      <div>
                        <label style={{fontSize:'0.75rem', color:'#94a3b8', marginBottom:'8px', display:'block', fontWeight:'bold'}}>SUBSCRIPTION END (EXPIRY)</label>
                        <input type="date" style={inputStyle} value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
                      </div>
                   </div>

                   <div style={{marginTop:'10px', padding:'20px', background:'#0f172a', borderRadius:'15px', border:'1px solid #334155'}}>
                      <label style={{fontSize:'0.75rem', color:'#3b82f6', marginBottom:'10px', display:'block', fontWeight:'bold'}}>GATEKEEPER SECURITY (NETWORK LOCK)</label>
                      <div style={{display:'flex', alignItems:'center', gap:'15px', marginBottom:'15px'}}>
                         <div style={{flex:1}}>
                            <div style={{fontSize:'0.7rem', color:'#64748b', marginBottom:'5px'}}>Allowed Office Public IP (Wildcards allowed)</div>
                            <input style={{...inputStyle, marginBottom:0, color:'#f59e0b', fontWeight:'bold'}} placeholder="e.g. 112.198.*.*" value={newPublicIp} onChange={e => setNewPublicIp(e.target.value)} />
                         </div>
                         <button onClick={captureCurrentIp} className="btn-hover" style={{...smallBtn, background:'#3b82f6', marginTop:'20px', padding:'12px'}}>Capture My IP</button>
                      </div>

                      <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                         <div style={{flex:1}}>
                            <div style={{fontSize:'0.7rem', color:'#64748b', marginBottom:'5px'}}>Virtual Host IP (Local Testing)</div>
                            <input style={{...inputStyle, marginBottom:0, color:'#10b981', fontWeight:'bold'}} placeholder="Generated IP" value={newAdminIp} onChange={e => setNewAdminIp(e.target.value)} />
                         </div>
                         <button onClick={() => setNewAdminIp(generateHostIp())} style={{...smallBtn, background:'#334155', marginTop:'20px'}}>Regenerate</button>
                      </div>
                   </div>

                   <button onClick={provisionPortal} className="btn-hover" style={{...addBtn, width:'100%', marginTop:'30px', padding:'20px', fontSize:'1.1rem', background:'linear-gradient(to right, #3b82f6, #8b5cf6)', boxShadow:'0 10px 25px rgba(59, 130, 246, 0.4)'}}>Deploy Infrastructure</button>
                </div>
              ) : selectedTenant ? (
                <div style={{position:'relative', zIndex:1}}>
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'40px'}}>
                      <div>
                        <h1 style={{margin:0, fontSize:'2.5rem', fontWeight:'900', color:'#f8fafc'}}>{selectedTenant.companyName}</h1>
                        <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                           <span style={{padding:'5px 12px', background:'#3b82f622', color:'#3b82f6', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'bold', border:'1px solid #3b82f644'}}>ACTIVE TENANT</span>
                           <span style={{padding:'5px 12px', background:'#10b98122', color:'#10b981', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'bold', border:'1px solid #10b98144'}}>{selectedTenant.adminIp || '127.0.0.1'}</span>
                        </div>
                      </div>
                      <button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} className="btn-hover" style={{...smallBtn, background:'#334155', padding:'12px 25px'}}>Control Center</button>
                   </div>

                   {isActionMenuOpen && (
                     <div className="fade-in" style={{background:'#0f172a', padding:'25px', borderRadius:'20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px', marginBottom:'30px', border:'1px solid #334155'}}>
                        <button onClick={() => {
                          setProcessingMsg(`Launching Admin Portal for ${selectedTenant.companyName}...`);
                          setProcessing(true);
                          setTimeout(() => {
                            window.open(`${activeApiBase?.replace('/api','')}/portal/${selectedTenant.tenantId || selectedTenant.username}`, '_blank');
                            setProcessing(false);
                          }, 1500);
                        }} className="btn-hover" style={{...addBtn, background:'#3b82f6'}}>🚀 Launch Admin Portal</button>

                        <button onClick={async () => {
                          if(!confirm('TERMINATE TENANT? This action is irreversible.')) return;
                          setProcessingMsg(`Terminating Infrastructure for ${selectedTenant.companyName}... System cleanup in progress.`);
                          setProcessing(true);
                          await deleteTenant(selectedTenant.tenantId || selectedTenant.username);
                          setProcessing(false);
                        }} className="btn-hover" style={{...addBtn, background:'#ef4444'}}>🗑️ Terminate Tenant</button>

                        <button onClick={() => handleBuildApk(selectedTenant)} className="btn-hover" style={{...addBtn, background:'#10b981'}}>📦 Build APK</button>

                        <button onClick={() => handleInstallLaunchApk(selectedTenant)} className="btn-hover" style={{...addBtn, background:'#f59e0b'}}>🔌 Install & Launch Apk (USB)</button>

                        <button onClick={() => {
                          setProcessingMsg('Opening Permission Matrix...');
                          setProcessing(true);
                          setTimeout(() => {
                            setActiveTab('tenant-permissions');
                            setProcessing(false);
                          }, 800);
                        }} className="btn-hover" style={{...addBtn, background:'#8b5cf6'}}>🛡️ Manage Permissions</button>

                        <button onClick={() => {
                          setTempEndDate(selectedTenant.endDate || '');
                          setIsEditingExpiry(true);
                          setIsActionMenuOpen(false);
                        }} className="btn-hover" style={{...addBtn, background:'#06b6d4'}}>🗓️ Edit Expiry</button>

                        <button onClick={() => {
                          setTempPublicIp(selectedTenant.publicIp || '');
                          setIsEditingIp(true);
                          setIsActionMenuOpen(false);
                        }} className="btn-hover" style={{...addBtn, background:'#f59e0b'}}>🛡️ Edit Network Lock</button>

                        <button onClick={() => setIsActionMenuOpen(false)} className="btn-hover" style={{...addBtn, background:'#334155', gridColumn: 'span 2'}}>❌ Close Menu</button>
                     </div>
                   )}

                   {isEditingIp && (
                     <div className="fade-in" style={{
                       background:'#0f172a', padding:'30px', borderRadius:'20px',
                       marginBottom:'30px', border:'1px solid #f59e0b44',
                       boxShadow: '0 10px 30px rgba(245, 158, 11, 0.1)',
                       position: 'relative', zIndex: 10
                     }}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                           <h3 style={{margin:0, color:'#f59e0b', display:'flex', alignItems:'center', gap:'10px'}}>
                              <span style={{fontSize:'1.5rem'}}>🛡️</span> Update Network Lock (IP)
                           </h3>
                           <button onClick={() => setIsEditingIp(false)} className="btn-hover" style={{background:'rgba(255,255,255,0.05)', border:'none', color:'#64748b', cursor:'pointer', width:'30px', height:'30px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center'}}>✕</button>
                        </div>
                        <p style={{color:'#64748b', fontSize:'0.85rem', marginBottom:'20px'}}>Set the allowed Public IP range for <b>{selectedTenant.companyName}</b>. Use * as wildcard (e.g., 112.198.*.*).</p>
                        <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                           <input style={{...inputStyle, marginBottom:0, flex:1, border:'1px solid #334155'}} placeholder="e.g. 112.198.*.*" value={tempPublicIp} onChange={e => setTempPublicIp(e.target.value)} />
                           <button onClick={updateNetworkLock} className="btn-hover" style={{...smallBtn, background:'#10b981', padding:'15px 30px', borderRadius:'12px', whiteSpace:'nowrap'}}>Save IP Lock</button>
                           <button onClick={() => setIsEditingIp(false)} className="btn-hover" style={{...smallBtn, background:'#334155', padding:'15px 30px', borderRadius:'12px'}}>Cancel</button>
                        </div>
                     </div>
                   )}

                   {isEditingExpiry && (
                     <div className="fade-in" style={{
                       background:'#0f172a', padding:'30px', borderRadius:'20px',
                       marginBottom:'30px', border:'1px solid #06b6d444',
                       boxShadow: '0 10px 30px rgba(6, 182, 212, 0.1)',
                       position: 'relative', zIndex: 10
                     }}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                           <h3 style={{margin:0, color:'#06b6d4', display:'flex', alignItems:'center', gap:'10px'}}>
                              <span style={{fontSize:'1.5rem'}}>🗓️</span> Update Subscription Expiry
                           </h3>
                           <button onClick={() => setIsEditingExpiry(false)} className="btn-hover" style={{background:'rgba(255,255,255,0.05)', border:'none', color:'#64748b', cursor:'pointer', width:'30px', height:'30px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center'}}>✕</button>
                        </div>
                        <p style={{color:'#64748b', fontSize:'0.85rem', marginBottom:'20px'}}>Select a new contract end date for <b>{selectedTenant.companyName}</b>. The system will automatically restrict access once this date is reached.</p>
                        <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                           <input type="date" style={{...inputStyle, marginBottom:0, flex:1, border:'1px solid #334155', colorScheme:'dark'}} value={tempEndDate} onChange={e => setTempEndDate(e.target.value)} />
                           <button onClick={updateTenantExpiry} className="btn-hover" style={{...smallBtn, background:'#10b981', padding:'15px 30px', borderRadius:'12px', whiteSpace:'nowrap'}}>Apply Changes</button>
                           <button onClick={() => setIsEditingExpiry(false)} className="btn-hover" style={{...smallBtn, background:'#334155', padding:'15px 30px', borderRadius:'12px'}}>Cancel</button>
                        </div>
                     </div>
                   )}

                   <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                      <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #334155'}}>
                         <div style={{color:'#64748b', fontSize:'0.75rem', marginBottom:'5px'}}>Portal ID</div>
                         <div style={{fontWeight:'bold', color:'#cbd5e1'}}>{selectedTenant.tenantId || selectedTenant.username}</div>
                      </div>
                      <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #334155'}}>
                         <div style={{color:'#f59e0b', fontSize:'0.75rem', marginBottom:'5px'}}>Gatekeeper Network Lock</div>
                         <div style={{fontWeight:'bold', color:'#f1f5f9'}}>{selectedTenant.publicIp || 'NO RESTRICTION (OPEN)'}</div>
                      </div>
                      <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #334155'}}>
                         <div style={{color:'#64748b', fontSize:'0.75rem', marginBottom:'5px'}}>Virtual Host IP</div>
                         <div style={{fontWeight:'bold', color:'#cbd5e1'}}>{selectedTenant.adminIp || '127.0.0.1'}</div>
                      </div>
                      <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #334155', position:'relative', overflow:'hidden'}}>
                         <div style={{color:'#64748b', fontSize:'0.75rem', marginBottom:'5px'}}>Contract Period</div>
                         <div style={{fontWeight:'bold', color:'#cbd5e1'}}>{selectedTenant.endDate || 'Lifetime / Enterprise'}</div>
                         {selectedTenant.endDate && (
                            <div style={{
                              marginTop:'10px', padding:'5px 10px', background:'#3b82f622', color:'#3b82f6',
                              borderRadius:'8px', fontSize:'0.7rem', fontWeight:'900', display:'inline-block',
                              border:'1px solid #3b82f644', animation:'pulse 2s infinite'
                            }}>
                               ⏳ {(() => {
                                  const diff = new Date(selectedTenant.endDate) - new Date();
                                  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                                  return days > 0 ? `${days} DAYS REMAINING` : 'EXPIRED';
                               })()}
                            </div>
                         )}
                      </div>
                   </div>
                </div>
              ) : (
                <div style={{textAlign:'center', padding:'100px 50px', opacity:0.3}}>
                   <div style={{fontSize:'5rem', marginBottom:'20px'}}>🏢</div>
                   <h2 style={{margin:0}}>Select a tenant to view infrastructure</h2>
                   <p>Click on a company from the left panel to manage settings.</p>
                </div>
              )}
           </div>
        </div>
      </div>
      )}

      {activeTab === 'schedules' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <h2 style={{marginTop:0}}>Create Schedule</h2>
                 <p style={{color:'#64748b', fontSize:'0.8rem'}}>Assign shift timings to a specific tenant.</p>
                 <select style={inputStyle} value={selectedScheduleTenant} onChange={e => setSelectedScheduleTenant(e.target.value)}>
                    <option value="ALL">Select Tenant</option>
                    {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                 </select>
                 <input style={inputStyle} placeholder="Shift Name (e.g. Regular Shift)" value={shiftName} onChange={e => setShiftName(e.target.value)} />
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                    <div>
                       <label style={{fontSize:'0.7rem', color:'#64748b'}}>Start Time</label>
                       <input type="time" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
                    </div>
                    <div>
                       <label style={{fontSize:'0.7rem', color:'#64748b'}}>End Time</label>
                       <input type="time" style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} />
                    </div>
                 </div>
                 <label style={{fontSize:'0.7rem', color:'#64748b'}}>Grace Period (Minutes)</label>
                 <input type="number" style={inputStyle} value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} />
                 <button onClick={createSchedule} style={{...addBtn, width:'100%'}}>Save Schedule</button>
              </div>

              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <h2 style={{margin:0}}>Active Schedules</h2>
                    <select style={{...smallBtn, background:'#0f172a'}} value={selectedScheduleTenant} onChange={e => setSelectedScheduleTenant(e.target.value)}>
                       <option value="ALL">All Tenants</option>
                       {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                    </select>
                 </div>
                 <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
                    <table>
                       <thead>
                          <tr>
                             <th>Tenant</th>
                             <th>Shift Name</th>
                             <th>Time</th>
                             <th>Grace</th>
                             <th>Action</th>
                          </tr>
                       </thead>
                       <tbody>
                          {schedules.filter(s => selectedScheduleTenant === 'ALL' || s.tenantId === selectedScheduleTenant).map(s => (
                            <tr key={s.id}>
                               <td>{users.find(u => (u.tenantId || u.username) === s.tenantId)?.companyName || s.tenantId}</td>
                               <td style={{fontWeight:'bold'}}>{s.name}</td>
                               <td>{s.startTime} - {s.endTime}</td>
                               <td>{s.gracePeriod}m</td>
                               <td><button onClick={() => deleteSchedule(s.id, s.tenantId)} style={{...smallBtn, background:'#ef4444'}}>Delete</button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'tenant-permissions' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
              <div style={{background:'#1e293b', padding:'20px', borderRadius:'15px', border:'1px solid #334155', maxHeight:'80vh', overflowY:'auto'}}>
                 <h2 style={{marginTop:0}}>Select Tenant</h2>
                 {users.map(u => (
                   <div key={u.tenantId || u.username} onClick={() => setSelectedTenant(u)} style={{padding:'15px', borderRadius:'10px', background: selectedTenant?.tenantId === (u.tenantId || u.username) ? '#3b82f6' : '#0f172a', marginBottom:'10px', cursor:'pointer', border:'1px solid #334155'}}>
                      <div style={{fontWeight:'bold'}}>{u.companyName}</div>
                      <div style={{fontSize:'0.7rem', opacity:0.6}}>{u.tenantId || u.username}</div>
                   </div>
                 ))}
              </div>
              <div style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155'}}>
                 {selectedTenant ? (
                   <div>
                      <h2 style={{marginTop:0}}>Permissions for {selectedTenant.companyName}</h2>
                      <p style={{color:'#64748b', marginBottom:'30px'}}>Enable or disable modules for this tenant.</p>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                         {AVAILABLE_PERMISSIONS.map(perm => (
                           <div key={perm.id} onClick={() => updatePermissions(selectedTenant, perm.id)} style={{
                             padding:'15px', borderRadius:'12px', cursor:'pointer', border:'1px solid #334155',
                             background: (selectedTenant.permissions || []).includes(perm.id) ? '#10b98122' : '#0f172a',
                             borderColor: (selectedTenant.permissions || []).includes(perm.id) ? '#10b981' : '#334155',
                             display:'flex', justifyContent:'space-between', alignItems:'center', transition:'0.2s'
                           }}>
                              <span style={{fontWeight:'500'}}>{perm.name}</span>
                              <div style={{
                                width:'20px', height:'20px', borderRadius:'6px', border:'2px solid',
                                borderColor: (selectedTenant.permissions || []).includes(perm.id) ? '#10b981' : '#64748b',
                                background: (selectedTenant.permissions || []).includes(perm.id) ? '#10b981' : 'transparent',
                                display:'flex', alignItems:'center', justifyContent:'center'
                              }}>
                                 {(selectedTenant.permissions || []).includes(perm.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                              </div>
                           </div>
                         ))}
                      </div>
                   </div>
                 ) : <div style={{textAlign:'center', padding:'50px', opacity:0.5}}>Select a tenant to manage their permissions</div>}
              </div>
           </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', borderBottom:'1px solid #334155', paddingBottom:'20px'}}>
            <h2 style={{margin:0, color: 'white'}}>👥 Global Staff Management</h2>
            <div style={{display:'flex', gap:'10px'}}>
              <button onClick={exportEmployeesExcel} style={{...smallBtn, background:'#10b981'}}>📥 Export Excel</button>
              <button onClick={prepareNewEmployee} style={{...smallBtn, background:'#3b82f6'}}>+ Add New Employee</button>
              <select style={{...smallBtn, background:'#0f172a'}} value={selectedEmpTenant} onChange={e => setSelectedEmpTenant(e.target.value)}>
                <option value="ALL">All Tenants</option>
                {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
              </select>
              <input
                placeholder="🔍 Search name or ID..."
                style={{...inputStyle, marginBottom:0, width:'250px', padding:'10px'}}
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
              />
            </div>
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
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
                    const tenantMatch = selectedEmpTenant === 'ALL' || e.tenantId === selectedEmpTenant;
                    return tenantMatch && (e.name.toLowerCase().includes(s) || (e.employeeId && e.employeeId.toLowerCase().includes(s)));
                  })
                  .map((e, idx) => (
                  <tr key={idx}>
                    <td style={{fontSize:'0.7rem', color:'#64748b'}}>{users.find(u => (u.tenantId || u.username) === e.tenantId)?.companyName || e.tenantId}</td>
                    <td style={{fontWeight:'bold', color:'#3b82f6'}}>{e.employeeId}</td>
                    <td style={{fontWeight:'bold', color: 'white'}}>{e.name}</td>
                    <td>{e.jobTitle || '-'}</td>
                    <td>{e.department || '-'}</td>
                    <td>{e.branchName || '-'}</td>
                    <td>{e.gender || '-'}</td>
                    <td>{e.nationality || '-'}</td>
                    <td>{e.birthDate || '-'}</td>
                    <td>{e.email || '-'}</td>
                    <td>{e.mobile || '-'}</td>
                    <td>{e.joiningDate || '-'}</td>
                    <td>{e.terminationDate || '-'}</td>
                    <td>{e.terminationNote || '-'}</td>
                    <td>
                      <span style={{
                        background: (e.status === 'Terminated' || e.status === 'Inactive') ? '#ef444422' : '#10b98122',
                        color: (e.status === 'Terminated' || e.status === 'Inactive') ? '#ef4444' : '#10b981',
                        padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid currentColor'
                      }}>{e.status}</span>
                    </td>
                    <td style={{textAlign:'center', display:'flex', gap:'5px', justifyContent:'center'}}>
                      <button onClick={() => prepareEditEmployee(e)} style={{...smallBtn, background:'#3b82f6'}}>Edit</button>
                      <button onClick={() => deleteEmployee(e.employeeId, e.tenantId)} style={{...smallBtn, background:'#ef4444'}}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {isAddEmpModalOpen && (
          <div style={{
            position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
            background:'rgba(15, 23, 42, 0.9)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex:9999, backdropFilter:'blur(12px)', padding:'20px'
          }}>
            <div className="fade-in" style={{
              background:'#1e293b', width:'100%', maxWidth:'600px',
              borderRadius:'20px', border:'1px solid #334155',
              boxShadow:'0 30px 60px rgba(0,0,0,0.8)',
              overflow:'hidden', maxHeight:'85vh',
              display:'flex', flexDirection:'column',
              margin: 'auto'
            }}>
              <div style={{padding:'15px 25px', background:'linear-gradient(to right, #1e293b, #0f172a)', borderBottom:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <h2 style={{margin:0, fontSize:'1.1rem', color:'white', fontWeight:'900'}}>{isEditingEmp ? '📝 Edit Profile' : '➕ Add Employee'}</h2>
                </div>
                <button onClick={() => setIsAddEmpModalOpen(false)} style={{background:'rgba(255,255,255,0.05)', border:'none', color:'#64748b', fontSize:'0.9rem', cursor:'pointer', width:'30px', height:'30px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center'}}>✕</button>
              </div>
              <div style={{padding:'20px 25px', overflowY:'auto', flex:1}} className="custom-scroll">
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px 20px'}}>
                  <div style={{gridColumn: 'span 2'}}>
                    <label style={{fontSize:'0.55rem', color:'#3b82f6', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>TENANT *</label>
                    <select style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} value={empTenantId} onChange={e => handleEmpTenantChange(e.target.value)} disabled={isEditingEmp}>
                      <option value="">Select Tenant</option>
                      {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:'0.55rem', color:'#3b82f6', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>EMPLOYEE ID *</label>
                    <input style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} placeholder="ID Number" value={empId} onChange={e => setEmpId(e.target.value)} disabled={isEditingEmp} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.55rem', color:'#3b82f6', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>FULL NAME *</label>
                    <input style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} placeholder="Full Name" value={empName} onChange={e => setEmpName(e.target.value)} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.55rem', color:'#3b82f6', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>JOB TITLE</label>
                    <select style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} value={empJobTitle} onChange={e => setEmpJobTitle(e.target.value)}>
                      <option value="">Select Position</option>
                      {positionTitles.filter(pt => pt.tenantId === empTenantId).map(pt => (
                        <option key={pt.id} value={pt.name}>{pt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:'0.55rem', color:'#3b82f6', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>DEPARTMENT</label>
                    <select style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} value={empDepartment} onChange={e => setEmpDepartment(e.target.value)}>
                      <option value="">Select Dept</option>
                      {orgUnits.filter(o => o.tenantId === empTenantId).map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:'0.55rem', color:'#3b82f6', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>BRANCH</label>
                    <select style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} value={empDept} onChange={e => setEmpDept(e.target.value)}>
                      <option value="">Select Branch</option>
                      {departments.filter(d => d.tenantId === empTenantId).map(d => <option key={d.departmentId} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{marginTop:'15px', borderTop:'1px solid #334155', paddingTop:'15px'}}>
                   <h4 style={{marginTop:0, color:'#10b981', fontSize:'0.75rem', marginBottom:'12px', display:'flex', alignItems:'center', gap:'6px'}}>
                     👤 Personal Info & Contact
                   </h4>
                   <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 20px'}}>
                      <div>
                        <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>GENDER</label>
                        <select style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} value={empGender} onChange={e => setEmpGender(e.target.value)}>
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>BIRTH DATE</label>
                        <input type="date" style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px', colorScheme:'dark'}} value={empBirthDate} onChange={e => setEmpBirthDate(e.target.value)} />
                      </div>
                      <div>
                        <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>NATIONALITY</label>
                        <input style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} placeholder="Nationality" value={empNationality} onChange={e => setEmpNationality(e.target.value)} />
                      </div>
                      <div>
                        <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>JOINING DATE</label>
                        <input type="date" style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px', colorScheme:'dark'}} value={empJoiningDate} onChange={e => setEmpJoiningDate(e.target.value)} />
                      </div>
                      <div>
                        <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>EMAIL</label>
                        <input style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} placeholder="email@company.com" value={empEmail} onChange={e => setEmpEmail(e.target.value)} />
                      </div>
                      <div>
                        <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>MOBILE</label>
                        <input style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} placeholder="+63 9XX" value={empMobile} onChange={e => setEmpMobile(e.target.value)} />
                      </div>
                      {isEditingEmp && (
                        <>
                          <div>
                            <label style={{fontSize:'0.55rem', color:'#ef4444', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>TERMINATION DATE</label>
                            <input type="date" style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px', colorScheme:'dark'}} value={empTermDate} onChange={e => setEmpTermDate(e.target.value)} />
                          </div>
                          <div>
                            <label style={{fontSize:'0.55rem', color:'#ef4444', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>TERMINATION NOTE</label>
                            <input style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} placeholder="Reason for termination" value={empTermNote} onChange={e => setEmpTermNote(e.target.value)} />
                          </div>
                          <div style={{gridColumn: 'span 2'}}>
                            <label style={{fontSize:'0.55rem', color:'#64748b', display:'block', marginBottom:'4px', fontWeight:'900', letterSpacing:'0.5px'}}>EMPLOYEE STATUS</label>
                            <select style={{...inputStyle, padding:'8px 12px', marginBottom:0, fontSize:'0.8rem', height:'38px'}} value={empStatus} onChange={e => setEmpStatus(e.target.value)}>
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                              <option value="Terminated">Terminated</option>
                            </select>
                          </div>
                        </>
                      )}
                   </div>
                </div>
              </div>
              <div style={{padding:'15px 25px', background:'#0f172a', borderTop:'1px solid #334155', display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                <button onClick={() => setIsAddEmpModalOpen(false)} style={{...smallBtn, background:'#334155', padding:'8px 15px'}}>Cancel</button>
                <button onClick={saveNewEmployee} className="btn-hover" style={{...addBtn, padding:'8px 25px', borderRadius:'8px', background:'linear-gradient(135deg, #3b82f6, #2563eb)', fontSize:'0.85rem'}}>Save Employee</button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {activeTab === 'branches' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <h2 style={{marginTop:0}}>📍 Global Branch Setup</h2>
                 <p style={{color:'#64748b', fontSize:'0.8rem'}}>Configure geofence for any tenant.</p>
                 <select style={inputStyle} value={selectedDeptTenant} onChange={e => setSelectedDeptTenant(e.target.value)}>
                    <option value="ALL">Select Tenant</option>
                    {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                 </select>
                 <input style={inputStyle} placeholder="Branch Name" value={deptName} onChange={e => setDeptName(e.target.value)} />
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                    <input style={inputStyle} placeholder="Latitude" value={deptLat} onChange={e => setDeptLat(e.target.value)} />
                    <input style={inputStyle} placeholder="Longitude" value={deptLon} onChange={e => setDeptLon(e.target.value)} />
                 </div>
                 <input style={inputStyle} placeholder="Radius (Meters)" type="number" value={deptRad} onChange={e => setDeptRad(e.target.value)} />
                 <button onClick={async () => {
                    if(!deptName || selectedDeptTenant === 'ALL') return alert('Fill all fields');
                    const res = await fetch(`${activeApiBase}/departments?tenantId=${selectedDeptTenant}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedDeptTenant },
                      body: JSON.stringify({ name: deptName, pinLatitude: parseFloat(deptLat), pinLongitude: parseFloat(deptLon), radiusMeters: parseInt(deptRad) })
                    });
                    if(res.ok) { setDeptName(''); setDeptLat(''); setDeptLon(''); loadInitialData(); setStatus('Branch Saved ✓'); }
                 }} style={{...addBtn, width:'100%'}}>Save Location</button>
              </div>

              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <h2 style={{margin:0}}>Active Branches</h2>
                    <select style={{...smallBtn, background:'#0f172a'}} value={selectedDeptTenant} onChange={e => setSelectedDeptTenant(e.target.value)}>
                       <option value="ALL">All Tenants</option>
                       {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                    </select>
                 </div>
                 <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
                    <table>
                       <thead>
                          <tr>
                             <th>Tenant</th>
                             <th>Branch</th>
                             <th>Coordinates</th>
                             <th>Radius</th>
                             <th>Action</th>
                          </tr>
                       </thead>
                       <tbody>
                          {departments.filter(d => selectedDeptTenant === 'ALL' || d.tenantId === selectedDeptTenant).map(d => (
                            <tr key={d.departmentId}>
                               <td>{users.find(u => (u.tenantId || u.username) === d.tenantId)?.companyName || d.tenantId}</td>
                               <td style={{fontWeight:'bold'}}>{d.name}</td>
                               <td style={{fontSize:'0.7rem', color:'#64748b'}}>{d.pinLatitude}, {d.pinLongitude}</td>
                               <td>{d.radiusMeters}m</td>
                               <td><button onClick={async () => {
                                  if(!confirm('Delete?')) return;
                                  await fetch(`${activeApiBase}/departments/${d.departmentId}?tenantId=${d.tenantId}`, { method: 'DELETE', headers: { 'x-tenant-id': d.tenantId } });
                                  loadInitialData();
                               }} style={{...smallBtn, background:'#ef4444'}}>Del</button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'org-departments' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <h2 style={{marginTop:0}}>🏢 Dept. Management</h2>
                 <p style={{color:'#64748b', fontSize:'0.8rem'}}>Create organizational units.</p>
                 <select style={inputStyle} value={selectedOrgTenant} onChange={e => setSelectedOrgTenant(e.target.value)}>
                    <option value="ALL">Select Tenant</option>
                    {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                 </select>
                 <input style={inputStyle} placeholder="Department Name (e.g. IT Dept)" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} />
                 <button onClick={async () => {
                    if(!newOrgName || selectedOrgTenant === 'ALL') return alert('Fill all fields');
                    const res = await fetch(`${activeApiBase}/org-units?tenantId=${selectedOrgTenant}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedOrgTenant },
                      body: JSON.stringify({ name: newOrgName })
                    });
                    if(res.ok) { setNewOrgName(''); loadInitialData(); setStatus('Dept. Created ✓'); }
                 }} style={{...addBtn, width:'100%'}}>Create Dept</button>
              </div>

              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <h2 style={{margin:0}}>Registered Departments</h2>
                    <select style={{...smallBtn, background:'#0f172a'}} value={selectedOrgTenant} onChange={e => setSelectedOrgTenant(e.target.value)}>
                       <option value="ALL">All Tenants</option>
                       {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                    </select>
                 </div>
                 <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
                    <table>
                       <thead>
                          <tr><th>Tenant</th><th>Department Name</th><th>Action</th></tr>
                       </thead>
                       <tbody>
                          {orgUnits.filter(o => selectedOrgTenant === 'ALL' || o.tenantId === selectedOrgTenant).map(o => (
                            <tr key={o.id}>
                               <td>{users.find(u => (u.tenantId || u.username) === o.tenantId)?.companyName || o.tenantId}</td>
                               <td style={{fontWeight:'bold'}}>{o.name}</td>
                               <td><button onClick={async () => {
                                  if(!confirm('Delete?')) return;
                                  await fetch(`${activeApiBase}/org-units/${o.id}?tenantId=${o.tenantId}`, { method: 'DELETE', headers: { 'x-tenant-id': o.tenantId } });
                                  loadInitialData();
                               }} style={{...smallBtn, background:'#ef4444'}}>Del</button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'position-titles' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <h2 style={{marginTop:0}}>💼 Position Management</h2>
                 <p style={{color:'#64748b', fontSize:'0.8rem'}}>Define job titles for staff.</p>
                 <select style={inputStyle} value={selectedPositionTenant} onChange={e => setSelectedPositionTenant(e.target.value)}>
                    <option value="ALL">Select Tenant</option>
                    {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                 </select>
                 <input style={inputStyle} placeholder="Position Title (e.g. Manager)" value={newPositionTitle} onChange={e => setNewPositionTitle(e.target.value)} />
                 <button onClick={async () => {
                    if(!newPositionTitle || selectedPositionTenant === 'ALL') return alert('Fill all fields');
                    const res = await fetch(`${activeApiBase}/position-titles?tenantId=${selectedPositionTenant}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedPositionTenant },
                      body: JSON.stringify({ name: newPositionTitle })
                    });
                    if(res.ok) { setNewPositionTitle(''); loadInitialData(); setStatus('Position Saved ✓'); }
                 }} style={{...addBtn, width:'100%'}}>Save Position</button>
              </div>

              <div style={{background:'#1e293b', padding:'25px', borderRadius:'15px', border:'1px solid #334155'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <h2 style={{margin:0}}>Job Position Titles</h2>
                    <select style={{...smallBtn, background:'#0f172a'}} value={selectedPositionTenant} onChange={e => setSelectedPositionTenant(e.target.value)}>
                       <option value="ALL">All Tenants</option>
                       {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                    </select>
                 </div>
                 <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto'}}>
                    <table>
                       <thead>
                          <tr><th>Tenant</th><th>Position Title</th><th>Action</th></tr>
                       </thead>
                       <tbody>
                          {positionTitles.filter(p => selectedPositionTenant === 'ALL' || p.tenantId === selectedPositionTenant).map(p => (
                            <tr key={p.id}>
                               <td>{users.find(u => (u.tenantId || u.username) === p.tenantId)?.companyName || p.tenantId}</td>
                               <td style={{fontWeight:'bold'}}>{p.name}</td>
                               <td><button onClick={async () => {
                                  if(!confirm('Delete?')) return;
                                  await fetch(`${activeApiBase}/position-titles/${p.id}?tenantId=${p.tenantId}`, { method: 'DELETE', headers: { 'x-tenant-id': p.tenantId } });
                                  loadInitialData();
                               }} style={{...smallBtn, background:'#ef4444'}}>Del</button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px'}}>
              <h2 style={{margin:0, color: 'white'}}>📊 Global Attendance Logs</h2>
              <div style={{display:'flex', gap:'12px'}}>
                <button onClick={viewReportPDF} style={{...smallBtn, background:'#ef4444', padding:'12px 25px', fontWeight:'900', fontSize:'0.75rem', letterSpacing: '1px'}}>VIEW PDF</button>
                <button onClick={exportReportExcelFile} style={{...smallBtn, background:'#10b981', padding:'12px 25px', fontWeight:'900', fontSize:'0.75rem', letterSpacing: '1px'}}>EXPORT EXCEL</button>
              </div>
            </div>

            <div style={{background:'rgba(255,255,255,0.03)', padding:'25px', borderRadius:'16px', marginBottom:'25px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'20px', border:'1px solid #334155'}}>
              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                <label style={{color:'#94a3b8', fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>Select Tenant</label>
                <select style={{...inputStyle, marginBottom:0}} value={reportTenantId} onChange={e => {setReportTenantId(e.target.value); setReportSearch('');}}>
                  <option value="ALL">All Tenants</option>
                  {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                </select>
              </div>

              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                <label style={{color:'#94a3b8', fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>Report View</label>
                <select style={{...inputStyle, marginBottom:0}} value={reportBy} onChange={e => {setReportBy(e.target.value); setReportSearch('');}}>
                  <option value="Branch">By Branch Name</option>
                  <option value="Employee">By Employee Identity</option>
                </select>
              </div>

              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                <label style={{color:'#94a3b8', fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>{reportBy === 'Branch' ? 'Select Branch' : `Search ${reportBy}`}</label>
                {reportBy === 'Branch' ? (
                  <select style={{...inputStyle, marginBottom:0}} value={reportSearch} onChange={e => setReportSearch(e.target.value)}>
                    <option value="">-- All Branches --</option>
                    {departments
                      .filter(d => reportTenantId === 'ALL' || d.tenantId === reportTenantId)
                      .map(d => (
                      <option key={d.id || d.departmentId} value={d.name}>{d.name} {reportTenantId === 'ALL' ? `(${users.find(u => (u.tenantId || u.username) === d.tenantId)?.companyName || d.tenantId})` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input placeholder={`Enter ${reportBy}...`} style={{...inputStyle, marginBottom:0}} value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
                )}
              </div>

              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                <label style={{color:'#94a3b8', fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>Start Date</label>
                <input type="date" style={{...inputStyle, marginBottom:0}} value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
              </div>

              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                <label style={{color:'#94a3b8', fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>End Date</label>
                <input type="date" style={{...inputStyle, marginBottom:0}} value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
              </div>
            </div>

            <div style={{maxHeight:'55vh', overflowY:'auto', border:'1px solid #334155', borderRadius:'12px', background: '#0f172a'}}>
              <table>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>ID</th>
                    <th>Full Name</th>
                    <th>Branch</th>
                    <th>Date</th>
                    <th>Schedule</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Over Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredLogs().length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{textAlign:'center', padding:'60px', color:'#64748b', fontWeight: 'bold'}}>
                        <div style={{fontSize: '3rem', marginBottom: '15px'}}>📈</div>
                        No attendance records found for the current criteria.
                      </td>
                    </tr>
                  ) : (
                    getFilteredLogs().slice().reverse().map((l, idx) => {
                      const emp = employees.find(e => e.employeeId === l.employeeId && e.tenantId === l.tenantId);
                      const sched = schedules.find(s => s.tenantId === l.tenantId && (s.name === emp?.schedule || (emp?.schedule && emp.schedule.startsWith(s.name))));
                      let statusText = (l.status || 'Pending').toUpperCase();
                      let otText = '-';
                      let schedText = sched ? `${sched.startTime} - ${sched.endTime}` : (emp?.schedule || 'No Sched');

                    if (!l.timeIn && !l.timeOut) {
                      statusText = 'ABSENT';
                    } else if (!l.timeIn) {
                      statusText = 'NO TIME IN';
                    } else if (!l.timeOut) {
                      statusText = 'NO TIME OUT';
                    } else {
                      let currentSchedStart = sched?.startTime;
                      let currentSchedEnd = sched?.endTime;
                      let currentGrace = parseInt(sched?.gracePeriod || 15);

                      if (!currentSchedStart && emp?.schedule) {
                        const timeMatch = emp.schedule.match(/(\d{1,2}:\d{2})/g);
                        if (timeMatch && timeMatch.length >= 2) {
                          currentSchedStart = timeMatch[0];
                          currentSchedEnd = timeMatch[1];
                        }
                      }

                      if (currentSchedStart) {
                        const d = new Date(l.timestamp);
                        const datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                        const logInOrig = new Date(l.timeIn);
                        const logIn = new Date(`${datePart}T${String(logInOrig.getHours()).padStart(2,'0')}:${String(logInOrig.getMinutes()).padStart(2,'0')}:00`);

                        const logOutOrig = l.timeOut ? new Date(l.timeOut) : null;
                        const logOut = logOutOrig ? new Date(`${datePart}T${String(logOutOrig.getHours()).padStart(2,'0')}:${String(logOutOrig.getMinutes()).padStart(2,'0')}:00`) : null;

                        const sStart = new Date(`${datePart}T${currentSchedStart.padStart(5, '0')}:00`);
                        const sEnd = new Date(`${datePart}T${currentSchedEnd.padStart(5, '0')}:00`);

                        const lateThreshold = new Date(sStart.getTime() + currentGrace * 60000);
                        if (logIn > lateThreshold) statusText = 'LATE';
                        else statusText = 'COMPLETED';

                        let otMin = 0;
                        if (logIn < sStart) otMin += (sStart.getTime() - logIn.getTime()) / 60000;
                        if (logOut && logOut > sEnd) otMin += (logOut.getTime() - sEnd.getTime()) / 60000;

                        if (otMin > 0) {
                          const h = Math.floor(otMin / 60);
                          const m = Math.round(otMin % 60);
                          otText = h > 0 ? `${h}h ${m}m` : `${m}m`;
                        }
                      }
                    }

                      return (
                        <tr key={idx}>
                          <td style={{fontSize:'0.75rem'}}>{users.find(u => (u.tenantId || u.username) === l.tenantId)?.companyName || l.tenantId}</td>
                          <td style={{color:'#3b82f6', fontWeight:'900'}}>{l.employeeId}</td>
                          <td style={{fontWeight: '700', color: 'white'}}>{l.employeeName}</td>
                          <td>{l.departmentName}</td>
                          <td>{new Date(l.timestamp).toLocaleDateString()}</td>
                          <td style={{fontSize:'0.8rem', color:'#94a3b8'}}>{schedText}</td>
                          <td style={{fontWeight: '800', color: '#10b981'}}>{l.timeIn ? new Date(l.timeIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                          <td style={{fontWeight: '800', color: '#f59e0b'}}>{l.timeOut ? new Date(l.timeOut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                          <td style={{fontWeight: '800', color: '#8b5cf6'}}>{otText}</td>
                          <td>
                            <span style={{
                              padding:'5px 12px', borderRadius:'12px', fontSize:'0.7rem',
                              background: statusText === 'COMPLETED' ? 'rgba(16, 185, 129, 0.15)' :
                                          statusText === 'LATE' ? 'rgba(245, 158, 11, 0.15)' :
                                          statusText === 'ABSENT' ? 'rgba(239, 68, 68, 0.15)' :
                                          'rgba(59, 130, 246, 0.15)',
                              color: statusText === 'COMPLETED' ? '#34d399' :
                                     statusText === 'LATE' ? '#fbbf24' :
                                     statusText === 'ABSENT' ? '#f87171' :
                                     '#60a5fa',
                              border: `1px solid currentColor`,
                              fontWeight: '900'
                            }}>
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
            <h2 style={{marginBottom:'20px', borderBottom:'1px solid #334155', paddingBottom:'20px'}}>📱 Global Device Management</h2>
          <div style={{maxHeight:'65vh', overflowY:'auto'}}>
            <table>
              <thead>
                <tr><th>Tenant</th><th>Employee</th><th>Device Info</th><th>Linked Date</th><th>Action</th></tr>
              </thead>
              <tbody>
                {employees.filter(e => e.registeredDeviceId).map((e, idx) => (
                  <tr key={idx}>
                    <td>{users.find(u => (u.tenantId || u.username) === e.tenantId)?.companyName || e.tenantId}</td>
                    <td style={{fontWeight:'bold'}}>{e.name}</td>
                    <td>
                      <div style={{fontWeight:'bold', color:'#10b981'}}>{e.registeredDeviceName || 'Mobile Device'}</div>
                      <div style={{fontSize:'0.6rem', color:'#64748b'}}>{e.registeredDeviceId}</div>
                    </td>
                    <td style={{fontSize:'0.8rem'}}>{e.registrationDate ? new Date(e.registrationDate).toLocaleString() : 'N/A'}</td>
                    <td>
                      <button onClick={async () => {
                        if(!confirm('Unlink device?')) return;
                        await fetch(`${activeApiBase}/device/reset?tenantId=${e.tenantId}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'x-tenant-id': e.tenantId },
                          body: JSON.stringify({ employeeId: e.employeeId })
                        });
                        loadInitialData();
                      }} style={{...smallBtn, background:'#ef4444'}}>Unlink</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'assign-branch' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div className="card">
             <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', borderBottom:'1px solid #334155', paddingBottom:'20px'}}>
              <h2 style={{margin:0, color: 'white'}}>🔗 Global Branch Assignment</h2>
              <div style={{display:'flex', gap:'10px'}}>
                <select style={{...smallBtn, background:'#0f172a'}} value={selectedEmpTenant} onChange={e => setSelectedEmpTenant(e.target.value)}>
                  <option value="ALL">All Tenants</option>
                  {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                </select>
                <input
                  placeholder="🔍 Search name or ID..."
                  style={{...inputStyle, marginBottom:0, width:'250px', padding:'10px'}}
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                />
              </div>
           </div>
           <div style={{maxHeight:'65vh', overflowY:'auto'}}>
              <table>
                 <thead>
                    <tr><th>Tenant</th><th>ID</th><th>Employee</th><th>Current Branch</th><th style={{textAlign:'center'}}>Action</th></tr>
                 </thead>
                 <tbody>
                    {employees.filter(e => {
                      const s = empSearch.toLowerCase();
                      const tenantMatch = selectedEmpTenant === 'ALL' || e.tenantId === selectedEmpTenant;
                      return tenantMatch && (e.name.toLowerCase().includes(s) || (e.employeeId && e.employeeId.toLowerCase().includes(s)));
                    }).map((e, idx) => (
                      <tr key={idx}>
                         <td style={{fontSize:'0.7rem', color:'#64748b'}}>{users.find(u => (u.tenantId || u.username) === e.tenantId)?.companyName || e.tenantId}</td>
                         <td style={{fontWeight:'bold', color:'#3b82f6'}}>{e.employeeId}</td>
                         <td style={{fontWeight:'bold', color:'white'}}>{e.name}</td>
                         <td>
                            {e.branchName ? (
                              <span style={{background:'rgba(59, 130, 246, 0.1)', color:'#60a5fa', padding:'5px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'900', border: '1px solid rgba(59, 130, 246, 0.3)'}}>📍 {e.branchName}</span>
                            ) : (
                              <span style={{opacity:0.5, fontStyle:'italic', fontSize:'0.8rem'}}>No Branch Assigned</span>
                            )}
                         </td>
                         <td style={{textAlign:'center'}}>
                            <select style={{...smallBtn, background:'#0f172a', padding:'8px 12px'}} onChange={async (event) => {
                               const bId = event.target.value;
                               if(!bId) return;
                               await fetch(`${activeApiBase}/assignments?tenantId=${e.tenantId}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', 'x-tenant-id': e.tenantId },
                                  body: JSON.stringify({ employeeId: e.employeeId, departmentId: bId })
                               });
                               loadInitialData();
                            }}>
                               <option value="">Update Assignment...</option>
                               {departments.filter(d => d.tenantId === e.tenantId).map(d => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
                            </select>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
      )}

      {activeTab === 'assign-schedule' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', borderBottom:'1px solid #334155', paddingBottom:'20px'}}>
              <h2 style={{margin:0, color: 'white'}}>📅 Global Schedule Assignment</h2>
              <div style={{display:'flex', gap:'10px'}}>
                <select style={{...smallBtn, background:'#0f172a'}} value={selectedEmpTenant} onChange={e => setSelectedEmpTenant(e.target.value)}>
                  <option value="ALL">All Tenants</option>
                  {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                </select>
                <input
                  placeholder="🔍 Search name or ID..."
                  style={{...inputStyle, marginBottom:0, width:'250px', padding:'10px'}}
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                />
              </div>
            </div>
            <div style={{maxHeight:'65vh', overflowY:'auto'}}>
              <table>
                <thead>
                  <tr><th>Tenant</th><th>ID</th><th>Employee</th><th>Assigned Schedule</th><th style={{textAlign:'center'}}>Action</th></tr>
                </thead>
                <tbody>
                  {employees.filter(e => {
                    const s = empSearch.toLowerCase();
                    const tenantMatch = selectedEmpTenant === 'ALL' || e.tenantId === selectedEmpTenant;
                    return tenantMatch && (e.name.toLowerCase().includes(s) || (e.employeeId && e.employeeId.toLowerCase().includes(s)));
                  }).map((e, idx) => (
                    <tr key={idx}>
                      <td style={{fontSize:'0.7rem', color:'#64748b'}}>{users.find(u => (u.tenantId || u.username) === e.tenantId)?.companyName || e.tenantId}</td>
                      <td style={{fontWeight:'bold', color:'#3b82f6'}}>{e.employeeId}</td>
                      <td style={{fontWeight:'bold', color:'white'}}>{e.name}</td>
                      <td>
                        {e.schedule ? (
                          <span style={{background:'rgba(245, 158, 11, 0.1)', color:'#f59e0b', padding:'5px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'900', border: '1px solid rgba(245, 158, 11, 0.3)'}}>⏰ {e.schedule}</span>
                        ) : (
                          <span style={{opacity:0.5, fontStyle:'italic', fontSize:'0.8rem'}}>No Schedule Assigned</span>
                        )}
                      </td>
                      <td style={{textAlign:'center'}}>
                        <button onClick={() => {
                          setSelectedEmpForSchedule(e);
                          setNewScheduleForEmp(e.schedule || '');
                          setIsAssignScheduleModalOpen(true);
                        }} style={{...smallBtn, background:'#3b82f6'}}>Change Schedule</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isAssignScheduleModalOpen && selectedEmpForSchedule && (
            <div style={{
              position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
              background:'rgba(15, 23, 42, 0.9)',
              display:'flex', alignItems:'center', justifyContent:'center',
              zIndex:9999, backdropFilter:'blur(12px)', padding:'20px'
            }}>
              <div className="fade-in" style={{
                background:'#1e293b', width:'100%', maxWidth:'400px',
                borderRadius:'20px', border:'1px solid #334155',
                boxShadow:'0 30px 60px rgba(0,0,0,0.8)',
                overflow:'hidden', display:'flex', flexDirection:'column'
              }}>
                <div style={{padding:'20px 25px', background:'linear-gradient(to right, #1e293b, #0f172a)', borderBottom:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <h2 style={{margin:0, fontSize:'1.1rem', color:'white', fontWeight:'900'}}>⏰ Assign Shift</h2>
                  <button onClick={() => setIsAssignScheduleModalOpen(false)} style={{background:'transparent', border:'none', color:'#64748b', fontSize:'1.2rem', cursor:'pointer'}}>✕</button>
                </div>
                <div style={{padding:'30px 25px'}}>
                  <p style={{marginTop:0, color:'#94a3b8', fontSize:'0.85rem'}}>Select work shift for <b>{selectedEmpForSchedule.name}</b></p>
                  <label style={{fontSize:'0.65rem', color:'#3b82f6', display:'block', marginBottom:'8px', fontWeight:'900', letterSpacing:'0.5px'}}>AVAILABLE SCHEDULES</label>
                  <select style={{...inputStyle, marginBottom:'25px'}} value={newScheduleForEmp} onChange={e => setNewScheduleForEmp(e.target.value)}>
                    <option value="">-- No Schedule --</option>
                    {schedules.filter(s => s.tenantId === selectedEmpForSchedule.tenantId).map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.startTime} - {s.endTime})</option>
                    ))}
                  </select>
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => setIsAssignScheduleModalOpen(false)} style={{...smallBtn, flex:1, background:'#334155', padding:'12px'}}>Cancel</button>
                    <button onClick={handleSaveSchedule} className="btn-hover" style={{...addBtn, flex:2, padding:'12px'}}>Apply Schedule</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'account-management' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}}>
             <div className="glass-card" style={{padding:'25px', borderRadius:'20px', border:'1px solid #334155', position:'sticky', top:'20px', height:'fit-content'}}>
                <h2 style={{marginTop:0, display:'flex', alignItems:'center', gap:'12px'}}>
                  {editingDevUser ? '📝 Edit Dev Account' : '🔑 New Dev Account'}
                </h2>
                <p style={{color:'#64748b', fontSize:'0.8rem', marginBottom:'20px'}}>
                  {editingDevUser ? `Updating credentials for ${editingDevUser.username}` : 'Create credentials for Dev Portal access.'}
                </p>

                <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                  <div>
                    <label style={{fontSize:'0.65rem', color:'#3b82f6', fontWeight:'bold', marginBottom:'5px', display:'block'}}>DISPLAY NAME</label>
                    <input style={{...inputStyle, marginBottom:0}} placeholder="e.g. Admin Juan" value={newDevDisplay} onChange={e => setNewDevDisplay(e.target.value)} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.65rem', color:'#3b82f6', fontWeight:'bold', marginBottom:'5px', display:'block'}}>USERNAME</label>
                    <input style={{...inputStyle, marginBottom:0}} placeholder="Username" value={newDevUser} onChange={e => setNewDevUser(e.target.value)} disabled={!!editingDevUser} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.65rem', color:'#3b82f6', fontWeight:'bold', marginBottom:'5px', display:'block'}}>PASSWORD</label>
                    <input style={{...inputStyle, marginBottom:0}} type="password" placeholder="Password" value={newDevPass} onChange={e => setNewDevPass(e.target.value)} />
                  </div>

                  <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                    {editingDevUser && (
                      <button onClick={() => {
                        setEditingDevUser(null);
                        setNewDevUser(''); setNewDevPass(''); setNewDevDisplay('');
                      }} style={{...smallBtn, background:'#334155', flex:1, padding:'15px'}}>Cancel</button>
                    )}
                    <button onClick={createDevAccount} className="btn-hover" style={{...addBtn, flex:2, background: editingDevUser ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'}}>
                      {editingDevUser ? 'Update Account ✓' : 'Create Account'}
                    </button>
                  </div>
                </div>
             </div>

             <div className="glass-card" style={{padding:'30px', borderRadius:'20px', border:'1px solid #334155'}}>
                <h2 style={{marginTop:0, marginBottom:'25px'}}>Active Dev Accounts</h2>
                <div style={{maxHeight:'70vh', overflowY:'auto'}} className="custom-scroll">
                   <table style={{width:'100%', minWidth:'100%'}}>
                      <thead>
                         <tr>
                           <th style={{width:'40%'}}>Display Name</th>
                           <th style={{width:'30%'}}>Username</th>
                           <th style={{width:'30%', textAlign:'center'}}>Action</th>
                         </tr>
                      </thead>
                      <tbody>
                         {devAccounts.map((acc, idx) => (
                           <tr key={idx} style={{background: editingDevUser?.username === acc.username ? 'rgba(59, 130, 246, 0.1)' : 'transparent'}}>
                              <td style={{fontWeight:'bold', padding:'20px 12px'}}>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                  <div style={{width:'35px', height:'35px', background:'#334155', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem'}}>
                                    {acc.displayName.charAt(0).toUpperCase()}
                                  </div>
                                  {acc.displayName}
                                </div>
                              </td>
                              <td><code style={{background:'#0f172a', padding:'4px 8px', borderRadius:'5px', color:'#3b82f6'}}>{acc.username}</code></td>
                              <td style={{textAlign:'center'}}>
                                 <div style={{display:'flex', gap:'8px', justifyContent:'center'}}>
                                   <button onClick={() => prepareEditDev(acc)} className="btn-hover" style={{...smallBtn, background:'#3b82f6', padding:'8px 15px'}}>Edit</button>
                                   <button onClick={() => deleteDevAccount(acc.username)} className="btn-hover" style={{...smallBtn, background:'#ef444422', color:'#ef4444', border:'1px solid #ef444444', padding:'8px 15px'}}>Remove</button>
                                 </div>
                              </td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'system-settings' && (
        <div className="fade-in">
           <BackToDashboard onClick={() => setActiveTab('dashboard')} />
           <div style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155', maxWidth:'800px', margin:'0 auto'}}>
              <h2 style={{marginTop:0}}>⚙️ System Maintenance & Settings</h2>
              <p style={{color:'#64748b', marginBottom:'30px'}}>Master control for data clearing and global system overrides.</p>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                 <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #334155'}}>
                    <h3 style={{marginTop:0, fontSize:'1rem', color:'#f59e0b'}}>☢️ Global Data Wipe</h3>
                    <p style={{fontSize:'0.75rem', color:'#64748b'}}>Clear data across ALL tenants. Use with caution.</p>
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                       <button onClick={() => clearSystemData('logs')} style={dangerBtn}>Clear All Logs</button>
                       <button onClick={() => clearSystemData('employees')} style={dangerBtn}>Clear All Employees</button>
                       <button onClick={() => clearSystemData('all')} style={{...dangerBtn, background:'#ef4444'}}>FULL SYSTEM WIPE</button>
                    </div>
                 </div>

                 <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #334155'}}>
                    <h3 style={{marginTop:0, fontSize:'1rem', color:'#3b82f6'}}>🏢 Specific Tenant Wipe</h3>
                    <p style={{fontSize:'0.75rem', color:'#64748b'}}>Clear data for a specific company.</p>
                    <select id="wipe-tenant" style={inputStyle}>
                       <option value="">Select Tenant...</option>
                       {users.map(u => <option key={u.tenantId || u.username} value={u.tenantId || u.username}>{u.companyName}</option>)}
                    </select>
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                       <button onClick={() => {
                         const tid = document.getElementById('wipe-tenant').value;
                         if(tid) clearSystemData('logs', tid);
                         else alert('Select tenant first');
                       }} style={smallBtn}>Clear Tenant Logs</button>
                       <button onClick={() => {
                         const tid = document.getElementById('wipe-tenant').value;
                         if(tid) clearSystemData('all', tid);
                         else alert('Select tenant first');
                       }} style={{...smallBtn, background:'#ef4444'}}>Wipe Tenant Data</button>
                    </div>
                 </div>
              </div>

              <div style={{marginTop:'30px', padding:'20px', background:'#3b82f611', borderRadius:'15px', border:'1px solid #3b82f644'}}>
                 <h3 style={{marginTop:0, fontSize:'1rem', color:'#60a5fa'}}>🌐 Infrastructure Info</h3>
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', fontSize:'0.9rem'}}>
                    <div><strong>Server IP:</strong> {systemIp}</div>
                    <div><strong>Node Version:</strong> v20.11.1 (Portable)</div>
                    <div><strong>Database:</strong> {activeApiBase?.includes('4002') ? 'data-test.json' : 'data.json'}</div>
                    <div><strong>SaaS Mode:</strong> {saasStatus}</div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* FOOTER */}
      <footer style={{position:'fixed', bottom:20, right:20, fontSize:'0.7rem', color:'#475569'}} onDoubleClick={() => setActiveTab('dashboard')}>
        Port 4002 - Restoration Build V6.1
      </footer>
    </div>
  );
}

const StatCard = ({ label, value, sub, color = "#3b82f6" }) => (
  <div className="stat-card">
    <div style={{fontSize:'0.7rem', color:'#64748b', textTransform:'uppercase', fontWeight:'bold'}}>{label}</div>
    <div style={{fontSize:'2.5rem', fontWeight:'bold', margin:'10px 0', color}}>{value}</div>
    <div style={{fontSize:'0.7rem', color:'#64748b'}}>{sub}</div>
  </div>
);

const ModuleCard = ({ icon, title, desc, color, onClick }) => (
  <div onClick={onClick} className="module-card">
    <div style={{fontSize:'3rem', marginBottom:'15px'}}>{icon}</div>
    <h3 style={{margin:'0 0 10px 0', fontSize:'1.1rem'}}>{title}</h3>
    <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'20px'}}>{desc}</p>
    <button style={{background:color, color:'white', border:'none', width:'100%', padding:'12px', borderRadius:'10px', fontWeight:'bold', cursor:'pointer'}}>OPEN</button>
  </div>
);

const MenuItem = ({ children, onClick, active, style }) => (
  <div onClick={onClick} className={`menu-item ${active ? 'active' : ''}`} style={style}>
    {children}
  </div>
);
const inputStyle = { display:'block', width:'100%', padding:'15px', borderRadius:'10px', border:'1px solid #334155', background:'#0f172a', color:'white', marginBottom:'15px', outline:'none', boxSizing:'border-box' };
const smallBtn = { padding:'8px 15px', border:'none', borderRadius:'8px', background:'#334155', color:'white', fontSize:'0.8rem', cursor:'pointer', fontWeight:'bold' };
const addBtn = { background:'#3b82f6', color:'white', border:'none', padding:'15px', borderRadius:'10px', fontWeight:'bold', cursor:'pointer' };
const dangerBtn = { background:'#ef444422', color:'#ef4444', border:'1px solid #ef444444', padding:'10px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', fontSize:'0.8rem' };

const BackToDashboard = ({ onClick }) => (
  <button onClick={onClick} className="btn-hover" style={{
    ...smallBtn,
    background:'rgba(59, 130, 246, 0.15)',
    border:'1px solid rgba(59, 130, 246, 0.4)',
    color: '#60a5fa',
    marginBottom:'25px',
    display:'flex',
    alignItems:'center',
    gap:'10px',
    padding:'12px 24px',
    borderRadius:'15px',
    backdropFilter:'blur(10px)',
    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
    fontWeight: '900',
    fontSize: '0.8rem'
  }} onMouseOver={e => {
    e.currentTarget.style.transform = 'translateX(-5px)';
    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
  }} onMouseOut={e => {
    e.currentTarget.style.transform = 'translateX(0)';
    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
  }}>
    <span style={{fontSize:'1.4rem'}}>⬅️</span>
    <span style={{letterSpacing:'1px'}}>RETURN TO CONTROL CENTER</span>
  </button>
);

export default App;
