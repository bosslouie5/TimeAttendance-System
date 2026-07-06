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

  const searchParams = new URLSearchParams(window.location.search);
  const isDevMode = searchParams.get('devMode') === 'true';

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
  const [positionTitles, setPositionTitles] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [tenantDetails, setTenantDetails] = useState(null);
  const [appVersionInfo, setAppVersionInfo] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Form States
  const [newOrgName, setNewOrgName] = useState('');
  const [newPositionTitle, setNewPositionTitle] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchLat, setBranchLat] = useState('');
  const [branchLon, setBranchLon] = useState('');
  const [branchRad, setBranchRad] = useState('50');
  const [editingBranchId, setEditingBranchId] = useState(null);

  // New Employee Modal States
  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [isEditingEmp, setIsEditingEmp] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedAssignEmp, setSelectedAssignEmp] = useState(null);
  const [selectedAssignBranch, setSelectedAssignBranch] = useState('');
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
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

  // Report States
  const [reportBy, setReportBy] = useState('Branch');
  const [reportSearch, setReportSearch] = useState('');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  const [shiftName, setShiftName] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [gracePeriod, setGracePeriod] = useState('15');

  const [selectedScheduleEmp, setSelectedScheduleEmp] = useState(null);
  const [newShiftValue, setNewShiftValue] = useState('');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setStatus(`${label} Copied ✓`);
    setTimeout(() => setStatus(''), 2000);
  };

  useEffect(() => {
    const checkConnection = () => {
      setActiveApiBase('/api');
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

      // Fetch App Version
      fetch(`${activeApiBase}/app-version`)
        .then(r => r.json())
        .then(data => setAppVersionInfo(data))
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
      const [e, b, o, l, pt, sc] = await Promise.all([
        requestJson('/employees'),
        requestJson('/departments'),
        requestJson('/org-units'),
        requestJson('/logs'),
        requestJson('/position-titles'),
        requestJson('/schedules')
      ]);
      setEmployees(e || []);
      setDepartments(b || []);
      setOrgUnits(o || []);
      setLogs(l || []);
      setPositionTitles(pt || []);
      setSchedules(sc || []);
    } catch (err) { console.error('Load failed', err); }
  };

  const handleLogin = async () => {
    setStatus('Logging in...');
    try {
      const res = await fetch(`${activeApiBase}/auth/web-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: detectedTenantId, username, password, devMode: isDevMode })
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

  const savePositionTitle = async () => {
    if (!newPositionTitle) return alert('Enter Position Title');
    setStatus('Adding Position...');
    try {
      await requestJson('/position-titles', {
        method: 'POST',
        body: JSON.stringify({ name: newPositionTitle, tenantId: detectedTenantId })
      });
      setStatus('Position Created! ✓');
      setNewPositionTitle('');
      loadInitialData();
    } catch (e) {
      alert('Failed to add position');
      setStatus('Error adding position');
    }
  };

  const deletePositionTitle = async (id) => {
    if (!confirm('Sigurado ka bang buburahin ang position na ito?')) return;
    setStatus('Deleting position...');
    try {
      await requestJson(`/position-titles/${id}`, {
        method: 'DELETE'
      });
      setStatus('Position Removed ✓');
      loadInitialData();
    } catch (e) {
      alert('Failed to delete position');
      setStatus('Error deleting position');
    }
  };

  const saveShift = async () => {
    if (!shiftName) return alert('Enter Shift Name');
    setStatus('Saving Shift...');
    try {
      await requestJson('/schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: shiftName,
          startTime,
          endTime,
          gracePeriod,
          tenantId: detectedTenantId
        })
      });
      setStatus('Shift Saved! ✓');
      setShiftName('');
      loadInitialData();
    } catch (e) {
      alert('Failed to save shift');
      setStatus('Error saving shift');
    }
  };

  const deleteShift = async (id) => {
    if (!confirm('Sigurado ka bang buburahin ang shift na ito?')) return;
    setStatus('Deleting shift...');
    try {
      await requestJson(`/schedules/${id}`, {
        method: 'DELETE'
      });
      setStatus('Shift Deleted ✓');
      loadInitialData();
    } catch (e) {
      alert('Failed to delete shift');
      setStatus('Error deleting shift');
    }
  };

  const saveShiftAssignment = async () => {
    if (!newShiftValue) return alert('Pumili o mag-type ng schedule.');
    setStatus('Updating Schedule...');
    try {
      await requestJson('/schedule-assign', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: selectedScheduleEmp.employeeId,
          shift: newShiftValue
        })
      });
      setStatus('Schedule Updated! ✓');
      setIsScheduleModalOpen(false);
      loadInitialData();
    } catch (e) {
      alert('Failed to save schedule');
      setStatus('Error saving schedule');
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

  const saveAssignment = async () => {
    if (!selectedAssignBranch) return alert('Select a branch first');
    setStatus('Assigning branch...');
    try {
      await requestJson('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: selectedAssignEmp.employeeId,
          departmentId: selectedAssignBranch,
          tenantId: detectedTenantId
        })
      });
      setStatus('Branch Assigned! ✓');
      setIsAssignModalOpen(false);
      loadInitialData();
    } catch (e) {
      alert('Failed to assign branch');
      setStatus('Error assigning branch');
    }
  };

  const resetEmployeeDevice = async (employeeId, employeeName) => {
    if (!confirm(`Are you sure you want to UNLINK the device for ${employeeName || employeeId}?`)) return;
    setStatus('Resetting device...');
    try {
      await requestJson('/device/reset', {
        method: 'POST',
        body: JSON.stringify({ employeeId })
      });
      setStatus('Device Unlinked ✓');
      loadInitialData();
    } catch (e) {
      alert('Failed to reset device');
      setStatus('Error resetting device');
    }
  };

  const getFilteredLogs = () => {
    return logs.filter(l => {
      const logDate = new Date(l.timestamp);
      const isAfterStart = !reportStartDate || logDate >= new Date(reportStartDate);
      const isBeforeEnd = !reportEndDate || logDate <= new Date(new Date(reportEndDate).setHours(23, 59, 59));

      let isMatch = true;
      if (reportSearch) {
        const s = reportSearch.toLowerCase();
        if (reportBy === 'Branch') isMatch = l.departmentName?.toLowerCase().includes(s);
        else isMatch = l.employeeId?.toLowerCase().includes(s) || l.employeeName?.toLowerCase().includes(s);
      }

      return isAfterStart && isBeforeEnd && isMatch;
    });
  };

  const exportReportExcelFile = () => {
    const data = getFilteredLogs();
    if (data.length === 0) return alert('No data to export');

    const companyName = user?.companyName || 'Report';

    const exportData = data.map(l => {
      const emp = employees.find(e => e.employeeId === l.employeeId);
      const sched = schedules.find(s => (s.name === emp?.schedule || (emp?.schedule && emp.schedule.startsWith(s.name))));
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

      return {
        'Employee ID': l.employeeId,
        'Name': l.employeeName,
        'Work Branch': l.departmentName,
        'Date': new Date(l.timestamp).toLocaleDateString(),
        'Schedule': schedText,
        'Time In': l.timeIn ? new Date(l.timeIn).toLocaleTimeString() : '-',
        'Time Out': l.timeOut ? new Date(l.timeOut).toLocaleTimeString() : '-',
        'Overtime': otText,
        'Status': statusText
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `${companyName}_Attendance_Report.xlsx`);
  };

  const viewReportPDF = () => {
    const data = getFilteredLogs();
    if (data.length === 0) return alert('No data to generate PDF');

    const doc = new jsPDF('l', 'mm', 'a4');
    const companyName = user?.companyName || 'Timekey System';

    doc.setFontSize(18);
    doc.text(`Attendance Report: ${companyName}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Filtered by: ${reportBy} | Range: ${reportStartDate || 'Start'} to ${reportEndDate || 'End'}`, 14, 28);

    const tableData = data.map(l => {
      const emp = employees.find(e => e.employeeId === l.employeeId);
      const sched = schedules.find(s => (s.name === emp?.schedule || (emp?.schedule && emp.schedule.startsWith(s.name))));
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

      return [
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
      head: [['ID', 'Name', 'Branch Name', 'Date', 'Schedule', 'Time In', 'Time Out', 'Overtime', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    window.open(doc.output('bloburl'), '_blank');
  };

  const editBranch = (b) => {
    setEditingBranchId(b.departmentId);
    setBranchName(b.name);
    setBranchLat(b.pinLatitude.toString());
    setBranchLon(b.pinLongitude.toString());
    setBranchRad(b.radiusMeters.toString());
  };

  const useCurrentLocation = () => {
    setStatus('Detecting Location...');
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      setStatus('Location Failed');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBranchLat(position.coords.latitude.toFixed(6));
        setBranchLon(position.coords.longitude.toFixed(6));
        setStatus('Location Detected ✓');
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert(`Error detecting location: ${error.message}`);
        setStatus('Location Error');
      },
      { enableHighAccuracy: true }
    );
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

  const hasPerm = (perm) => user?.isConsultant || user?.permissions?.includes(perm);

  if (!user) {
    return (
      <div style={{display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0f172a', fontFamily:'sans-serif'}}>
        <div style={{background:'#1e293b', padding:'40px', borderRadius:'15px', border:'1px solid #334155', width:'100%', maxWidth:'400px', textAlign:'center'}}>
          <h1 style={{color:'#3b82f6', marginBottom:'10px', fontWeight: '900'}}>TIMEKEY SYSTEM</h1>
          <p style={{color:'#64748b', marginBottom:'30px', fontWeight: 'bold', letterSpacing: '1px'}}>ADMIN MANAGEMENT PORTAL</p>
          {tenantDetails && <h2 style={{color:'#60a5fa', fontSize:'1.2rem', marginBottom:'25px'}}>{tenantDetails.companyName}</h2>}
          <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Username"
              style={inputStyle}
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Password"
              style={inputStyle}
            />
            <button onClick={handleLogin} className="btn-hover" style={{...addBtn, marginTop:'10px'}}>{status || 'Access Portal'}</button>
          </div>
          <p style={{marginTop:'25px', fontSize:'0.8rem', color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}>
            Portal ID: <span style={{color:'#3b82f6', fontWeight:'bold'}}>{detectedTenantId}</span>
            <button onClick={() => copyToClipboard(detectedTenantId, 'Portal ID')} style={{background:'transparent', border:'none', color:'#3b82f6', cursor:'pointer', padding:0, fontSize:'0.9rem'}}>📋</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <style>{`
        body { background: #0f172a; color: #f8fafc; font-family: sans-serif; margin: 0; padding: 0; }
        .app-container { width: 100%; max-width: 100%; padding: 20px; box-sizing: border-box; margin: 0; }
        .card { background: #1e293b; padding: 25px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #334155; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: #1e293b; padding: 20px; border-radius: 16px; border: 1px solid #334155; }
        .menu-item { padding: 16px 20px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); font-weight: bold; color: #94a3b8; display: flex; align-items: center; gap: 12px; }
        .menu-item:hover { background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding-left: 28px; }
        .menu-item.active { background: rgba(59, 130, 246, 0.15); color: #3b82f6; border-left: 4px solid #3b82f6; }
        .module-card { background: #1e293b; padding: 30px; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); text-align: center; border: 1px solid #334155; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; }
        .module-card:hover { transform: translateY(-10px) scale(1.03); border-color: #3b82f6; background: linear-gradient(145deg, #1e293b, #24344d); box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 25px rgba(59, 130, 246, 0.4); }
        .module-card div:first-child { transition: transform 0.4s ease; }
        .module-card:hover div:first-child { transform: scale(1.2) rotate(5deg); }
        .btn-hover:hover { filter: brightness(1.2); transform: scale(1.05); box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
        .btn-hover:active { transform: scale(0.95); }
        .page-label { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); padding: 12px 20px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #334155; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; }
        table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0 8px; }
        th { text-align: left; padding: 15px; border-bottom: none; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; }
        td { padding: 15px; border-top: 1px solid #334155; border-bottom: 1px solid #334155; color: #cbd5e1; white-space: nowrap; background: rgba(30, 41, 59, 0.3); }
        td:first-child { border-left: 1px solid #334155; border-radius: 12px 0 0 12px; }
        td:last-child { border-right: 1px solid #334155; border-radius: 0 12px 12px 0; }
        tr:hover td { background: rgba(59, 130, 246, 0.1); }
        input, select { padding: 12px; border: 1px solid #334155; border-radius: 8px; outline: none; background: #0f172a; color: white; }
        input:focus, select:focus { border-color: #3b82f6; }
        .btn-blue { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .btn-green { background: #10b981 !important; color: white !important; border: none !important; padding: 10px 20px !important; border-radius: 8px !important; font-weight: bold !important; cursor: pointer !important; }
        .btn-red { background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .btn-edit { background: #3b82f6; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.75rem; }
        .btn-excel { background: #1e8449 !important; color: white !important; border: none !important; padding: 10px 20px !important; border-radius: 8px !important; font-weight: bold !important; cursor: pointer !important; transition: 0.3s; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(2, 6, 23, 0.85); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px); }
        .modal-content { background: #1e293b; padding: 35px; border-radius: 24px; width: 100%; maxWidth: 750px; position: relative; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid #334155; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { display: flex; flexDirection: column; gap: 8px; }
        .form-group label { color: #94a3b8; fontSize: 0.8rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <header style={{position:'relative'}}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <div
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{cursor:'pointer', padding:'12px', borderRadius:'10px', background: isMenuOpen ? '#3b82f6' : '#0f172a', color: isMenuOpen ? 'white' : '#3b82f6', border: '1px solid #334155', display:'flex', alignItems:'center', justifyContent:'center'}}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </div>
          <div>
            <h1 style={{margin: 0, color: '#3b82f6', fontSize: '1.5rem', fontWeight: '900'}}>🛡️ {user.companyName} ADMIN PORTAL</h1>
            <div style={{display:'flex', alignItems:'center', gap:'10px', marginTop:'5px'}}>
               <p style={{margin: 0, color: '#64748b', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px'}}>MANAGEMENT CONSOLE | ID:</p>
               <span style={{color:'#f8fafc', fontWeight:'900', fontSize:'0.8rem', background:'#0f172a', padding:'2px 8px', borderRadius:'6px', border:'1px solid #334155', display:'flex', alignItems:'center', gap:'5px'}}>
                  {detectedTenantId}
                  <button onClick={() => copyToClipboard(detectedTenantId, 'Tenant ID')} style={{background:'transparent', border:'none', color:'#3b82f6', cursor:'pointer', padding:0, fontSize:'0.8rem'}}>📋</button>
               </span>
            </div>
            {status && <div className="fade-in" style={{position:'absolute', bottom:'-25px', color:'#10b981', fontSize:'0.7rem', fontWeight:'900'}}>{status}</div>}
          </div>
        </div>

        {isMenuOpen && (
          <div style={{position:'absolute', top:'75px', left:'0', background:'#1e293b', borderRadius:'12px', width:'240px', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.3)', zIndex:1000, overflow:'hidden', border:'1px solid #334155'}}>
            <div className="menu-item" onClick={() => { setActiveTab('dashboard'); setIsMenuOpen(false); }}>📊 Dashboard Overview</div>
            {hasPerm('employees') && <div className="menu-item" onClick={() => { setActiveTab('employees'); setIsMenuOpen(false); }}>👥 Staff Management</div>}
            {hasPerm('org-units') && <div className="menu-item" onClick={() => { setActiveTab('org-units'); setIsMenuOpen(false); }}>🏢 Dept. Management</div>}
            {hasPerm('position-titles') && <div className="menu-item" onClick={() => { setActiveTab('position-titles'); setIsMenuOpen(false); }}>💼 Position titles</div>}
            {hasPerm('schedules') && <div className="menu-item" onClick={() => { setActiveTab('schedules'); setIsMenuOpen(false); }}>⏰ Schedule Management</div>}
            {hasPerm('assign-schedule') && <div className="menu-item" onClick={() => { setActiveTab('assign-schedule'); setIsMenuOpen(false); }}>📅 Assign Schedule</div>}
            {hasPerm('branches') && <div className="menu-item" onClick={() => { setActiveTab('branches'); setIsMenuOpen(false); }}>📍 Branch Setup</div>}
            {hasPerm('assign-branch') && <div className="menu-item" onClick={() => { setActiveTab('assign-branch'); setIsMenuOpen(false); }}>🔗 Branch Assignment</div>}
            {hasPerm('devices') && <div className="menu-item" onClick={() => { setActiveTab('devices'); setIsMenuOpen(false); }}>📱 Registered Devices</div>}
            {hasPerm('reports') && <div className="menu-item" onClick={() => { setActiveTab('reports'); setIsMenuOpen(false); }}>📈 Attendance Logs</div>}
            {hasPerm('announcements') && <div className="menu-item" onClick={() => { setActiveTab('announcements'); setIsMenuOpen(false); }}>📢 Announcements</div>}
            {hasPerm('leave-management') && <div className="menu-item" onClick={() => { setActiveTab('leave-management'); setIsMenuOpen(false); }}>⛱️ Leave System</div>}
            {hasPerm('payroll-bridge') && <div className="menu-item" onClick={() => { setActiveTab('payroll-bridge'); setIsMenuOpen(false); }}>💰 Payroll Bridge</div>}
            <div className="menu-item" style={{color:'#ef4444', borderTop:'1px solid #334155'}} onClick={() => { sessionStorage.removeItem(sessionKey); window.location.reload(); }}>🏃 Session Logout</div>
          </div>
        )}

        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'8px'}}>
          <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
            <button
              onClick={() => {
                const masterApkUrl = "https://bosslouie5.github.io/TimeAttendance-System/apks/TimeKey_Master.apk";
                alert(`📥 REDIRECTING TO CLOUD STORAGE\n\nDOWNLOAD INSTRUCTIONS:\n1. Install the APK on your Android device.\n2. Open the app and enter your COMPANY ID: ${detectedTenantId}\n3. Login with your employee credentials.\n\nYour system is ready for use!`);
                window.open(masterApkUrl, '_blank');
              }}
              className="btn-hover"
              style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '900', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'}}
            >
              🚀 BUILD APK
            </button>
            <button
              onClick={() => { sessionStorage.removeItem(sessionKey); window.location.reload(); }}
              style={{background: '#ef4444', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '900', fontSize: '0.8rem'}}
            >
              LOGOUT
            </button>
          </div>
          {appVersionInfo && (
            <div style={{fontSize: '0.65rem', color: '#94a3b8', fontWeight: '800', display:'flex', alignItems:'center', gap:'5px', background:'rgba(255,255,255,0.05)', padding:'4px 10px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.05)'}}>
              <span style={{width:'6px', height:'6px', background:'#10b981', borderRadius:'50%', display:'inline-block'}}></span>
              APP VERSION: <span style={{color: '#10b981'}}>{appVersionInfo?.version || 'V1.0.1'}</span>
              <span style={{color: '#64748b', marginLeft:'5px'}}>(PRO EDITION)</span>
            </div>
          )}
        </div>
      </header>

      {/* PAGE LABEL INDICATOR */}
      <div className="page-label">
        <span style={{color:'#64748b', fontWeight: '800'}}>CONSOLE /</span>
        <span style={{fontWeight:'900', color:'#3b82f6', textTransform:'uppercase', letterSpacing: '1px'}}>
          {activeTab === 'dashboard' && '📊 Dashboard Overview'}
          {activeTab === 'employees' && '👥 Employee Management'}
          {activeTab === 'org-units' && '🏢 Organizational Units'}
          {activeTab === 'position-titles' && '💼 Job Position Titles'}
          {activeTab === 'schedules' && '⏰ Schedule Management'}
          {activeTab === 'assign-schedule' && '📅 Assign Schedule'}
          {activeTab === 'branches' && '📍 Branch Locations'}
          {activeTab === 'assign-branch' && '🔗 Branch Assignment'}
          {activeTab === 'devices' && '📱 Registered Devices'}
          {activeTab === 'reports' && '📈 Attendance Reports'}
          {activeTab === 'announcements' && '📢 Company Announcements'}
          {activeTab === 'leave-management' && '⛱️ Leave Management'}
          {activeTab === 'payroll-bridge' && '💰 Payroll Bridge'}
        </span>
        {activeTab !== 'dashboard' && (
           <button onClick={() => setActiveTab('dashboard')} style={{marginLeft:'auto', background:'rgba(59, 130, 246, 0.1)', border:'1px solid #3b82f6', color:'#3b82f6', padding: '5px 15px', borderRadius: '8px', cursor:'pointer', fontWeight:'900', fontSize: '0.75rem'}}>← BACK TO HUB</button>
        )}
      </div>

      {/* Main Content */}
      {activeTab === 'dashboard' && (
        <div className="fade-in">
          {/* Quick Stats */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(450px, 1fr))', gap:'25px', marginBottom:'40px'}}>
             <div style={{padding:'30px', background:'#1e293b', borderRadius:'20px', border:'1px solid #334155', display: 'flex', alignItems: 'center', gap: '20px'}}>
                <div style={{fontSize: '3rem', background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '15px'}}>👥</div>
                <div>
                   <div style={{color:'#64748b', fontSize:'0.75rem', fontWeight:'900', letterSpacing: '1px'}}>TOTAL STAFF</div>
                   <div style={{fontSize:'2.5rem', fontWeight:'900', color:'#fff'}}>{employees.length}</div>
                </div>
             </div>
             <div style={{padding:'30px', background:'#1e293b', borderRadius:'20px', border:'1px solid #334155', display: 'flex', alignItems: 'center', gap: '20px'}}>
                <div style={{fontSize: '3rem', background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '15px'}}>📊</div>
                <div>
                   <div style={{color:'#64748b', fontSize:'0.75rem', fontWeight:'900', letterSpacing: '1px'}}>SYSTEM LOGS</div>
                   <div style={{fontSize:'2.5rem', fontWeight:'900', color:'#10b981'}}>{logs.length}</div>
                </div>
             </div>
          </div>

          <h2 style={{marginBottom:'25px', color:'#94a3b8', fontSize: '1rem', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase'}}>Management Modules</h2>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:'25px'}}>
             {hasPerm('employees') && (
               <div className="module-card" onClick={() => setActiveTab('employees')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>👥</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Manage Staff</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Register employees and update their work schedules.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('org-units') && (
               <div className="module-card" onClick={() => setActiveTab('org-units')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>🏢</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Departments</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Manage organizational units like IT, HR, or Sales.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('position-titles') && (
               <div className="module-card" onClick={() => setActiveTab('position-titles')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>💼</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Job Titles</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Define custom job positions for your employees.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('schedules') && (
               <div className="module-card" onClick={() => setActiveTab('schedules')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>⏰</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Schedule Setup</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Create and manage work shift templates.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('assign-schedule') && (
               <div className="module-card" onClick={() => setActiveTab('assign-schedule')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📅</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Assign Schedule</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Map work shifts to specific employees.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('branches') && (
               <div className="module-card" onClick={() => setActiveTab('branches')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📍</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Branch Setup</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Configure GPS coordinates for your office locations.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('assign-branch') && (
               <div className="module-card" onClick={() => setActiveTab('assign-branch')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>🔗</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Assign Branch</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Map employees to specific geofenced office locations.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('devices') && (
               <div className="module-card" onClick={() => setActiveTab('devices')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📱</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Devices</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Manage and unlink mobile devices linked to staff.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('reports') && (
               <div className="module-card" onClick={() => setActiveTab('reports')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📊</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>View Reports</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Monitor real-time check-ins and export attendance logs.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('announcements') && (
               <div className="module-card" onClick={() => setActiveTab('announcements')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>📢</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Announcements</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Broadcast news and updates to all employees.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('leave-management') && (
               <div className="module-card" onClick={() => setActiveTab('leave-management')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>⛱️</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Leave System</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Manage time-off requests and leave balances.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {hasPerm('payroll-bridge') && (
               <div className="module-card" onClick={() => setActiveTab('payroll-bridge')}>
                 <div style={{fontSize:'3.5rem', marginBottom:'15px'}}>💰</div>
                 <h3 style={{margin:'0 0 10px 0', color: 'white'}}>Payroll Bridge</h3>
                 <p style={{fontSize:'0.85rem', color:'#64748b', margin:0}}>Export attendance data formatted for payroll.</p>
                 <button className="btn-blue" style={{marginTop:'20px', width:'100%'}}>OPEN MODULE</button>
               </div>
             )}
             {(!user?.permissions || user.permissions.length === 0) && (
               <div style={{gridColumn:'1 / -1', padding:'100px', textAlign:'center', background:'#1e293b', borderRadius:'20px', border:'1px dashed #334155'}}>
                 <div style={{fontSize:'4rem', marginBottom:'20px'}}>🔒</div>
                 <h3 style={{color: 'white'}}>No Modules Authorized</h3>
                 <p style={{color:'#64748b'}}>Please contact the system administrator to activate your access modules.</p>
               </div>
             )}
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', borderBottom:'1px solid #334155', paddingBottom:'20px'}}>
            <h2 style={{margin:0, color: 'white'}}>👥 Employee Master List</h2>
            <div style={{display:'flex', gap:'10px'}}>
              <input
                placeholder="🔍 Search name or ID..."
                style={{width:'250px'}}
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
              />
              <button onClick={exportEmployeesExcel} className="btn-excel">📊 EXPORT EXCEL</button>
              <button onClick={prepareNewEmployee} className="btn-green">+ ADD NEW EMPLOYEE</button>
            </div>
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border: '1px solid #334155', borderRadius: '12px', background: '#0f172a'}}>
            <table>
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
                    <td style={{fontWeight:'900', color:'#3b82f6'}}>{e.employeeId}</td>
                    <td style={{fontWeight:'700', color: 'white'}}>{e.name}</td>
                    <td>{e.jobTitle || '-'}</td>
                    <td>{e.department || '-'}</td>
                    <td>
                      {e.branchName ? (
                         <span style={{background:'rgba(59, 130, 246, 0.1)', color:'#60a5fa', padding:'4px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'900', border: '1px solid rgba(59, 130, 246, 0.3)'}}>📍 {e.branchName}</span>
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
                        background: (e.status === 'Terminated' || e.status === 'Inactive') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        color: (e.status === 'Terminated' || e.status === 'Inactive') ? '#ef4444' : '#10b981',
                        padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', border: '1px solid currentColor'
                      }}>{e.status}</span>
                    </td>
                    <td style={{textAlign:'center'}}>
                      <div style={{display:'flex', gap:'8px', justifyContent:'center'}}>
                        <button onClick={() => prepareEditEmployee(e)} className="btn-edit">Edit</button>
                        <button onClick={() => deleteEmployee(e.employeeId)} className="btn-red" style={{padding: '5px 12px', fontSize: '0.75rem'}}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 && <div style={{textAlign:'center', padding:'40px', color:'#64748b', fontWeight: 'bold'}}>No employee records found.</div>}
          </div>
        </div>
      </div>
      )}

      {activeTab === 'org-units' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'30px'}}>
            {/* CREATE FORM */}
            <div style={{background:'rgba(255,255,255,0.03)', padding:'30px', borderRadius:'20px', border:'1px solid #334155'}}>
              <h3 style={{marginTop:0, color:'#3b82f6', fontWeight: '900', textTransform: 'uppercase', fontSize: '0.9rem'}}>🏢 Create Department</h3>
              <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'25px'}}>Register new organizational units for staff mapping.</p>
              <div className="form-group">
                <label>Department Name</label>
                <input
                  placeholder="Ex: Information Technology"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addOrgUnit()}
                />
              </div>
              <button onClick={addOrgUnit} className="btn-blue" style={{marginTop:'25px', width:'100%', padding: '15px'}}>SAVE DEPARTMENT</button>
            </div>

            {/* LIST TABLE */}
            <div>
              <h2 style={{marginTop:0, fontSize: '1.2rem', color: 'white'}}>📋 Registered Departments</h2>
              <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border:'1px solid #334155', borderRadius:'12px', background: '#0f172a'}}>
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
                        <td style={{fontWeight:'900', color:'#3b82f6'}}>{o.name}</td>
                        <td style={{textAlign:'right'}}>
                          <button onClick={() => deleteOrgUnit(o.id)} className="btn-red" style={{padding: '5px 12px', fontSize: '0.75rem'}}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {orgUnits.length === 0 && (
                      <tr><td colSpan="2" style={{textAlign:'center', padding:'50px', color:'#64748b', fontWeight: 'bold'}}>No departments registered yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'position-titles' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'30px'}}>
            {/* CREATE FORM */}
            <div style={{background:'rgba(255,255,255,0.03)', padding:'30px', borderRadius:'20px', border:'1px solid #334155'}}>
              <h3 style={{marginTop:0, color:'#60a5fa', fontWeight: '900', textTransform: 'uppercase', fontSize: '0.9rem'}}>💼 Create Position</h3>
              <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'25px'}}>Define job position titles for your staff.</p>
              <div className="form-group">
                <label>Position Title</label>
                <input
                  placeholder="Ex: Sales Manager"
                  value={newPositionTitle}
                  onChange={e => setNewPositionTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && savePositionTitle()}
                />
              </div>
              <button onClick={savePositionTitle} className="btn-blue" style={{marginTop:'25px', width:'100%', padding: '15px'}}>SAVE POSITION TITLE</button>
            </div>

            {/* LIST TABLE */}
            <div>
              <h2 style={{marginTop:0, fontSize: '1.2rem', color: 'white'}}>📋 Job Positions</h2>
              <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border:'1px solid #334155', borderRadius:'12px', background: '#0f172a'}}>
                <table>
                  <thead>
                    <tr>
                      <th>Title Name</th>
                      <th style={{textAlign:'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionTitles.map((p, i) => (
                      <tr key={i}>
                        <td style={{fontWeight:'900', color:'#60a5fa'}}>{p.name}</td>
                        <td style={{textAlign:'right'}}>
                          <button onClick={() => deletePositionTitle(p.id)} className="btn-red" style={{padding: '5px 12px', fontSize: '0.75rem'}}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {positionTitles.length === 0 && (
                      <tr><td colSpan="2" style={{textAlign:'center', padding:'50px', color:'#64748b', fontWeight: 'bold'}}>No positions defined yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'schedules' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'30px'}}>
            {/* CREATE FORM */}
            <div style={{background:'rgba(255,255,255,0.03)', padding:'30px', borderRadius:'20px', border:'1px solid #334155'}}>
              <h3 style={{marginTop:0, color:'#f59e0b', fontWeight: '900', textTransform: 'uppercase', fontSize: '0.9rem'}}>⏰ Create Work Shift</h3>
              <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'25px'}}>Define shift timings and grace periods.</p>

              <div className="form-group" style={{marginBottom:'15px'}}>
                <label>Shift Name</label>
                <input
                  placeholder="Ex: Morning Shift"
                  value={shiftName}
                  onChange={e => setShiftName(e.target.value)}
                />
              </div>

              <div className="form-grid" style={{marginBottom:'15px'}}>
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Grace Period (Minutes)</label>
                <input type="number" value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} />
              </div>

              <button onClick={saveShift} className="btn-blue" style={{marginTop:'25px', width:'100%', padding: '15px', background: '#f59e0b'}}>SAVE SHIFT TEMPLATE</button>
            </div>

            {/* LIST TABLE */}
            <div>
              <h2 style={{marginTop:0, fontSize: '1.2rem', color: 'white'}}>📋 Registered Shifts</h2>
              <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border:'1px solid #334155', borderRadius:'12px', background: '#0f172a'}}>
                <table>
                  <thead>
                    <tr>
                      <th>Shift Name</th>
                      <th>Timings</th>
                      <th>Grace</th>
                      <th style={{textAlign:'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s, i) => (
                      <tr key={i}>
                        <td style={{fontWeight:'900', color:'#f59e0b'}}>{s.name}</td>
                        <td style={{fontSize:'0.9rem'}}>{s.startTime} - {s.endTime}</td>
                        <td style={{fontSize:'0.9rem'}}>{s.gracePeriod} mins</td>
                        <td style={{textAlign:'right'}}>
                          <button onClick={() => deleteShift(s.id)} className="btn-red" style={{padding: '5px 12px', fontSize: '0.75rem'}}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {schedules.length === 0 && (
                      <tr><td colSpan="4" style={{textAlign:'center', padding:'50px', color:'#64748b', fontWeight: 'bold'}}>No shifts defined yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'assign-schedule' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px', borderBottom: '1px solid #334155', paddingBottom: '20px'}}>
            <h2 style={{margin:0, color: 'white'}}>📅 Employee Schedule Assignment</h2>
            <input
              placeholder="🔍 Search staff identity..."
              style={{padding:'12px', borderRadius:'10px', border:'1px solid #334155', width:'350px'}}
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
            />
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border: '1px solid #334155', borderRadius: '12px', background: '#0f172a'}}>
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Full Name</th>
                  <th>Department</th>
                  <th>Current Schedule</th>
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
                      <td style={{fontWeight:'900', color:'#3b82f6'}}>{e.employeeId}</td>
                      <td style={{fontWeight: '700', color: 'white'}}>{e.name}</td>
                      <td>{e.department || '-'}</td>
                      <td>
                        <span style={{background:'rgba(245, 158, 11, 0.1)', color:'#f59e0b', padding:'5px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'900', border: '1px solid rgba(245, 158, 11, 0.3)'}}>
                          ⏰ {e.schedule || 'Regular Shift'}
                        </span>
                      </td>
                      <td style={{textAlign:'center'}}>
                        <button
                          onClick={() => { setSelectedScheduleEmp(e); setNewShiftValue(e.schedule || ''); setIsScheduleModalOpen(true); }}
                          className="btn-edit"
                          style={{padding:'10px 20px', borderRadius: '10px', background:'#f59e0b'}}
                        >
                          SET SCHEDULE
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'branches' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'30px'}}>
            {/* CREATE/EDIT FORM */}
            <div style={{background:'rgba(255,255,255,0.03)', padding:'30px', borderRadius:'20px', border:'1px solid #334155'}}>
              <h3 style={{marginTop:0, color:'#10b981', fontWeight: '900', textTransform: 'uppercase', fontSize: '0.9rem'}}>{editingBranchId ? '✏️ Edit Branch' : '📍 Setup New Branch'}</h3>
              <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'25px'}}>Configure coordinates for office geofencing.</p>

              <div className="form-group" style={{marginBottom:'20px'}}>
                <label>Branch Name</label>
                <input placeholder="Ex: Head Office" value={branchName} onChange={e => setBranchName(e.target.value)} />
              </div>

              <div className="form-grid" style={{marginBottom:'20px'}}>
                <div className="form-group">
                  <label>Latitude</label>
                  <input placeholder="24.7136" value={branchLat} onChange={e => setBranchLat(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <input placeholder="46.6753" value={branchLon} onChange={e => setBranchLon(e.target.value)} />
                </div>
              </div>

              <button onClick={useCurrentLocation} style={{width:'100%', background:'rgba(59, 130, 246, 0.1)', color:'#3b82f6', border:'1px solid rgba(59, 130, 246, 0.3)', padding:'10px', borderRadius:'8px', cursor:'pointer', fontWeight: '900', fontSize: '0.7rem', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
                📍 USE CURRENT LOCATION
              </button>

              <div className="form-group">
                <label>Geofence Radius (Meters)</label>
                <input type="number" value={branchRad} onChange={e => setBranchRad(e.target.value)} />
              </div>

              <button onClick={saveBranch} className="btn-green" style={{marginTop:'30px', width:'100%', padding: '15px'}}>
                {editingBranchId ? 'UPDATE BRANCH INFO' : 'SAVE BRANCH LOCATION'}
              </button>

              {editingBranchId && (
                <button onClick={() => {setEditingBranchId(null); setBranchName(''); setBranchLat(''); setBranchLon(''); setBranchRad('50');}} style={{marginTop:'10px', width:'100%', background:'transparent', color:'#94a3b8', border:'1px solid #334155', padding:'10px', borderRadius:'8px', cursor:'pointer', fontWeight: '900', fontSize: '0.7rem'}}>CANCEL EDIT</button>
              )}
            </div>

            {/* LIST TABLE */}
            <div>
              <h2 style={{marginTop:0, fontSize: '1.2rem', color: 'white'}}>📍 Registered Branches</h2>
              <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border:'1px solid #334155', borderRadius:'12px', background: '#0f172a'}}>
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
                        <td style={{fontWeight:'900', color:'#10b981'}}>{b.name}</td>
                        <td style={{fontSize:'0.75rem', color:'#94a3b8'}}>{b.pinLatitude}, {b.pinLongitude}</td>
                        <td style={{fontWeight: '800'}}>{b.radiusMeters}m</td>
                        <td style={{textAlign:'right'}}>
                          <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                            <button onClick={() => editBranch(b)} className="btn-edit">Edit</button>
                            <button onClick={() => deleteBranch(b.departmentId)} className="btn-red" style={{padding: '5px 12px', fontSize: '0.75rem'}}>Del</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {departments.length === 0 && (
                      <tr><td colSpan="4" style={{textAlign:'center', padding:'50px', color:'#64748b', fontWeight: 'bold'}}>No branch locations configured.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
            <h2 style={{margin:0, color: 'white'}}>📊 Attendance Analytics</h2>
            <div style={{display:'flex', gap:'12px'}}>
              <button onClick={viewReportPDF} className="btn-red" style={{padding:'12px 25px', fontWeight:'900', fontSize:'0.75rem', letterSpacing: '1px'}}>VIEW PDF</button>
              <button onClick={exportReportExcelFile} className="btn-excel" style={{padding:'12px 25px', fontWeight:'900', fontSize:'0.75rem', letterSpacing: '1px'}}>EXPORT EXCEL</button>
            </div>
          </div>

          <div style={{background:'rgba(255,255,255,0.03)', padding:'25px', borderRadius:'16px', marginBottom:'25px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'20px', border:'1px solid #334155'}}>
            <div className="form-group">
              <label>REPORT VIEW</label>
              <select value={reportBy} onChange={e => setReportBy(e.target.value)}>
                <option value="Branch">By Branch Name</option>
                <option value="Employee">By Employee Identity</option>
              </select>
            </div>

            <div className="form-group">
              <label>{reportBy === 'Branch' ? 'SELECT BRANCH' : `SEARCH ${reportBy}`}</label>
              {reportBy === 'Branch' ? (
                <select value={reportSearch} onChange={e => setReportSearch(e.target.value)}>
                  <option value="">-- All Branches --</option>
                  {departments.map(d => (
                    <option key={d.departmentId} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input placeholder={`Enter ${reportBy}...`} value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
              )}
            </div>

            <div className="form-group">
              <label>START DATE</label>
              <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
            </div>

            <div className="form-group">
              <label>END DATE</label>
              <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
            </div>
          </div>

          <div style={{maxHeight:'55vh', overflowY:'auto', border:'1px solid #334155', borderRadius:'12px', background: '#0f172a'}}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Branch</th>
                  <th>Date</th>
                  <th>Schedule</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Overtime</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredLogs().length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{textAlign:'center', padding:'60px', color:'#64748b', fontWeight: 'bold'}}>
                      <div style={{fontSize: '3rem', marginBottom: '15px'}}>📈</div>
                      No analytics records found for the current criteria.
                    </td>
                  </tr>
                ) : (
                  getFilteredLogs().slice().reverse().map((l, idx) => {
                    const emp = employees.find(e => e.employeeId === l.employeeId);
                    const sched = schedules.find(s => (s.name === emp?.schedule || (emp?.schedule && emp.schedule.startsWith(s.name))));
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

      {activeTab === 'assign-branch' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px', borderBottom: '1px solid #334155', paddingBottom: '20px'}}>
            <h2 style={{margin:0, color: 'white'}}>🔗 Employee Branch Assignment</h2>
            <input
              placeholder="🔍 Search staff identity..."
              style={{padding:'12px', borderRadius:'10px', border:'1px solid #334155', width:'350px'}}
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
            />
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border: '1px solid #334155', borderRadius: '12px', background: '#0f172a'}}>
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Full Name</th>
                  <th>Current Branch Assignment</th>
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
                      <td style={{fontWeight:'900', color:'#3b82f6'}}>{e.employeeId}</td>
                      <td style={{fontWeight: '700', color: 'white'}}>{e.name}</td>
                      <td>
                        {e.branchName ? (
                          <span style={{background:'rgba(59, 130, 246, 0.1)', color:'#60a5fa', padding:'5px 12px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'900', border: '1px solid rgba(59, 130, 246, 0.3)'}}>📍 {e.branchName}</span>
                        ) : (
                          <span style={{color:'#64748b', fontSize:'0.8rem', fontStyle: 'italic'}}>No Branch Assigned</span>
                        )}
                      </td>
                      <td style={{textAlign:'center'}}>
                        <button
                          onClick={() => { setSelectedAssignEmp(e); setSelectedAssignBranch(''); setIsAssignModalOpen(true); }}
                          className="btn-edit"
                          style={{padding:'10px 20px', borderRadius: '10px'}}
                        >
                          MANAGE ASSIGNMENT
                        </button>
                      </td>
                    </tr>
                  ))}
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
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'25px', borderBottom: '1px solid #334155', paddingBottom: '20px'}}>
            <h2 style={{margin:0, color: 'white'}}>📱 Registered Device Security</h2>
            <input
              placeholder="🔍 Search name or ID..."
              style={{padding:'12px', borderRadius:'10px', border:'1px solid #334155', width:'350px'}}
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
            />
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto', overflowX:'auto', border: '1px solid #334155', borderRadius: '12px', background: '#0f172a'}}>
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Full Name</th>
                  <th>Linked Device Context</th>
                  <th>Registration Timeline</th>
                  <th style={{textAlign:'center'}}>Security Action</th>
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
                      <td style={{fontWeight:'900', color:'#3b82f6'}}>{e.employeeId}</td>
                      <td style={{fontWeight: '700', color: 'white'}}>{e.name}</td>
                      <td>
                        {e.registeredDeviceId || e.deviceId ? (
                          <div style={{display:'flex', flexDirection:'column', gap: '2px'}}>
                            <span style={{color:'#10b981', fontWeight:'900', fontSize: '0.9rem'}}>{e.registeredDeviceName || 'Mobile Device'}</span>
                            <span style={{fontSize:'0.65rem', color:'#64748b', fontWeight: 'bold'}}>UUID: {e.registeredDeviceId || e.deviceId}</span>
                          </div>
                        ) : (
                          <span style={{color:'#64748b', fontStyle:'italic', fontSize: '0.85rem'}}>No Secure Device Linked</span>
                        )}
                      </td>
                      <td style={{fontSize: '0.8rem'}}>{e.registrationDate ? new Date(e.registrationDate).toLocaleString() : 'N/A'}</td>
                      <td style={{textAlign:'center'}}>
                        {e.registeredDeviceId || e.deviceId ? (
                          <button
                            onClick={() => resetEmployeeDevice(e.employeeId, e.name)}
                            className="btn-red"
                            style={{padding:'10px 20px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900'}}
                          >
                            UNLINK DEVICE
                          </button>
                        ) : (
                          <span style={{fontSize: '0.7rem', color: '#10b981', fontWeight: '900', border: '1px dashed #10b981', padding: '5px 12px', borderRadius: '8px'}}>READY FOR PAIRING</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'announcements' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card" style={{textAlign:'center', padding:'100px'}}>
             <div style={{fontSize:'5rem', marginBottom:'20px'}}>📢</div>
             <h2 style={{color:'white'}}>Company Announcements</h2>
             <p style={{color:'#64748b'}}>This module is currently being optimized for your tenant.</p>
             <button onClick={() => setActiveTab('dashboard')} style={{marginTop:'30px'}}>Return Home</button>
          </div>
        </div>
      )}

      {activeTab === 'leave-management' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card" style={{textAlign:'center', padding:'100px'}}>
             <div style={{fontSize:'5rem', marginBottom:'20px'}}>⛱️</div>
             <h2 style={{color:'white'}}>Leave Management System</h2>
             <p style={{color:'#64748b'}}>Track and approve employee time-off requests here.</p>
             <button onClick={() => setActiveTab('dashboard')} style={{marginTop:'30px'}}>Return Home</button>
          </div>
        </div>
      )}

      {activeTab === 'payroll-bridge' && (
        <div className="fade-in">
          <BackToDashboard onClick={() => setActiveTab('dashboard')} />
          <div className="card" style={{textAlign:'center', padding:'100px'}}>
             <div style={{fontSize:'5rem', marginBottom:'20px'}}>💰</div>
             <h2 style={{color:'white'}}>Payroll Integration Bridge</h2>
             <p style={{color:'#64748b'}}>Securely export attendance data to your payroll software.</p>
             <button onClick={() => setActiveTab('dashboard')} style={{marginTop:'30px'}}>Return Home</button>
          </div>
        </div>
      )}

      {/* ASSIGN BRANCH MODAL */}
      {isAssignModalOpen && selectedAssignEmp && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{maxWidth:'550px'}}>
            <h2 style={{marginTop:0, color:'#3b82f6', fontWeight: '900'}}>🔗 Branch Geofence Assignment</h2>
            <div style={{background: 'rgba(59, 130, 246, 0.05)', padding: '15px', borderRadius: '15px', marginBottom: '25px', border: '1px solid rgba(59, 130, 246, 0.2)'}}>
               <p style={{color:'#94a3b8', margin: '0 0 5px 0', fontSize: '0.75rem', fontWeight: '800'}}>CONFIGURING FOR:</p>
               <h3 style={{margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: '900'}}>{selectedAssignEmp.name} (ID: {selectedAssignEmp.employeeId})</h3>
            </div>

            <div className="form-group">
              <label>SELECT OFFICE BRANCH</label>
              <select
                value={selectedAssignBranch}
                onChange={e => setSelectedAssignBranch(e.target.value)}
                style={{width: '100%', fontSize: '1rem', padding: '15px'}}
              >
                <option value="">-- Choose Secure Location --</option>
                {departments.map(d => (
                  <option key={d.departmentId} value={d.departmentId}>{d.name} ({d.radiusMeters}m Geofence)</option>
                ))}
              </select>
            </div>

            <div style={{display:'flex', gap:'15px', marginTop:'40px'}}>
               <button onClick={saveAssignment} className="btn-blue" style={{flex:1, padding: '18px', fontSize: '1rem', fontWeight: '900'}}>COMMIT ASSIGNMENT</button>
               <button onClick={() => setIsAssignModalOpen(false)} style={{padding:'18px 25px', background:'transparent', color:'#64748b', border:'1px solid #334155', borderRadius:'16px', fontWeight:'900', cursor:'pointer', fontSize: '0.9rem'}}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE MODAL */}
      {isScheduleModalOpen && selectedScheduleEmp && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{maxWidth:'550px'}}>
            <h2 style={{marginTop:0, color:'#f59e0b', fontWeight: '900'}}>📅 Work Schedule Assignment</h2>
            <div style={{background: 'rgba(245, 158, 11, 0.05)', padding: '15px', borderRadius: '15px', marginBottom: '25px', border: '1px solid rgba(245, 158, 11, 0.2)'}}>
               <p style={{color:'#94a3b8', margin: '0 0 5px 0', fontSize: '0.75rem', fontWeight: '800'}}>SETTING HOURS FOR:</p>
               <h3 style={{margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: '900'}}>{selectedScheduleEmp.name}</h3>
            </div>

            <div className="form-group">
              <label>SELECT WORK SHIFT</label>
              <select
                style={{width: '100%', fontSize: '1.1rem', padding: '15px', background:'#0f172a', border:'1px solid #334155', color:'white', borderRadius:'12px', cursor: 'pointer'}}
                value={newShiftValue}
                onChange={e => setNewShiftValue(e.target.value)}
              >
                <option value="">-- Choose Schedule from Management --</option>
                {schedules.map(s => (
                  <option key={s.id} value={`${s.name} (${s.startTime}-${s.endTime})`}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
                {schedules.length === 0 && (
                  <>
                    <option value="07:00 to 17:00">07:00 to 17:00</option>
                    <option value="07:30 to 17:30">07:30 to 17:30</option>
                    <option value="08:00 to 18:00">08:00 to 18:00</option>
                    <option value="09:00 to 19:00">09:00 to 19:00</option>
                    <option value="Night: 19:00 to 05:00">Night: 19:00 to 05:00</option>
                  </>
                )}
              </select>
            </div>

            <div style={{display:'flex', gap:'15px', marginTop:'40px'}}>
               <button onClick={saveShiftAssignment} className="btn-blue" style={{background:'#f59e0b', flex:1, padding: '18px', fontSize: '1rem', fontWeight: '900'}}>COMMIT SCHEDULE</button>
               <button onClick={() => setIsScheduleModalOpen(false)} style={{padding:'18px 25px', background:'transparent', color:'#64748b', border:'1px solid #334155', borderRadius:'16px', fontWeight:'900', cursor:'pointer', fontSize: '0.9rem'}}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW EMPLOYEE MODAL */}
      {isAddEmpModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h2 style={{marginTop:0, marginBottom:'30px', color:'#10b981', fontWeight: '900'}}>
               {isEditingEmp ? '👤 UPDATE EMPLOYEE PROFILE' : '👤 REGISTER NEW EMPLOYEE'}
            </h2>

            <div className="form-grid">
              <div className="form-group">
                <label>EMPLOYEE ID {employees.length === 0 ? '(EDITABLE)' : '(AUTO)'}</label>
                <input
                  style={{background:'#0f172a', opacity: (employees.length > 0 && !isEditingEmp) ? 0.6 : 1}}
                  value={empId}
                  onChange={e => employees.length === 0 && setEmpId(e.target.value)}
                  disabled={employees.length > 0 && !isEditingEmp}
                />
              </div>
              <div className="form-group">
                <label>FULL NAME</label>
                <input placeholder="Ex: Juan Dela Cruz" value={empName} onChange={e => setEmpName(e.target.value)} />
              </div>

              <div className="form-group">
                <label>POSITION TITLE</label>
                <select value={empJobTitle} onChange={e => setEmpJobTitle(e.target.value)}>
                  <option value="">-- Select Title --</option>
                  {positionTitles.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                  {positionTitles.length === 0 && (
                    <>
                      <option value="Manager">Manager</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Team Lead">Team Lead</option>
                      <option value="Staff">Staff</option>
                      <option value="Consultant">Consultant</option>
                      <option value="Admin">Admin</option>
                      <option value="Developer">Developer</option>
                    </>
                  )}
                </select>
              </div>
              <div className="form-group">
                <label>ORG. DEPARTMENT</label>
                <select value={empDepartment} onChange={e => setEmpDepartment(e.target.value)}>
                  <option value="">-- Select Dept --</option>
                  {orgUnits.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>BRANCH LOCATION</label>
                <select value={empDept} onChange={e => setEmpDept(e.target.value)}>
                  <option value="">-- Select Branch --</option>
                  {departments.map(d => (
                    <option key={d.departmentId} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>GENDER</label>
                <select value={empGender} onChange={e => setEmpGender(e.target.value)}>
                  <option value="">-- Select --</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="form-group">
                <label>NATIONALITY</label>
                <select value={empNationality} onChange={e => setEmpNationality(e.target.value)}>
                  <option value="">-- Select --</option>
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
                <label>DATE OF BIRTH</label>
                <input type="date" value={empBirthDate} onChange={e => setEmpBirthDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>EMAIL ADDRESS</label>
                <input type="email" placeholder="Ex: juan@example.com" value={empEmail} onChange={e => setEmpEmail(e.target.value)} />
              </div>

              <div className="form-group">
                <label>MOBILE NUMBER</label>
                <input placeholder="Ex: 09123456789" value={empMobile} onChange={e => setEmpMobile(e.target.value)} />
              </div>
              <div className="form-group">
                <label>JOINING DATE</label>
                <input type="date" value={empJoiningDate} onChange={e => setEmpJoiningDate(e.target.value)} />
              </div>

              {isEditingEmp && (
                <div className="form-group">
                  <label>EMPLOYMENT STATUS</label>
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
                    <label>TERMINATION DATE</label>
                    <input type="date" value={empTermDate} onChange={e => setEmpTermDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>REASON FOR EXIT</label>
                    <input placeholder="Ex: Resigned" value={empTermNote} onChange={e => setEmpTermNote(e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <div style={{display:'flex', gap:'20px', marginTop:'45px'}}>
              <button onClick={saveNewEmployee} className="btn-green" style={{flex:1, padding:'18px', fontSize: '1rem', fontWeight: '900'}}>
                {isEditingEmp ? 'COMMIT PROFILE UPDATE' : 'REGISTER EMPLOYEE'}
              </button>
              <button onClick={() => setIsAddEmpModalOpen(false)} style={{padding:'18px 35px', background:'transparent', color:'#64748b', border:'1px solid #334155', borderRadius:'18px', fontWeight:'900', cursor:'pointer', fontSize: '0.9rem'}}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

const inputStyle = { display:'block', width:'100%', padding:'15px', borderRadius:'10px', border:'1px solid #334155', background:'#0f172a', color:'white', marginBottom:'15px', outline:'none', boxSizing:'border-box' };
const addBtn = { background:'#3b82f6', color:'white', border:'none', padding:'15px', borderRadius:'10px', fontWeight:'bold', cursor:'pointer' };

const BackToDashboard = ({ onClick }) => (
  <button onClick={onClick} style={{
    background:'rgba(59, 130, 246, 0.1)',
    border:'1px solid rgba(59, 130, 246, 0.3)',
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
    fontSize: '0.8rem',
    cursor: 'pointer',
    marginTop: 0
  }} onMouseOver={e => {
    e.currentTarget.style.transform = 'translateX(-5px)';
    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
  }} onMouseOut={e => {
    e.currentTarget.style.transform = 'translateX(0)';
    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
  }}>
    <span style={{fontSize:'1.4rem'}}>⬅️</span>
    <span style={{letterSpacing:'1px'}}>BACK TO DASHBOARD</span>
  </button>
);
