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

  // Tenant Management States
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantSearch, setTenantSearch] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmpTenant, setSelectedEmpTenant] = useState('ALL');

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
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState(null);
  const [activeApiBase, setActiveApiBase] = useState(null);
  const [saasStatus, setSaasStatus] = useState('Connecting...');

  // Dashboard Sync & Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastSyncTime, setLastSyncTime] = useState(null);

  useEffect(() => {
    const discoverSaaS = async () => {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host.includes('trycloudflare.com')) {
         setSaasStatus('Direct Connection Active');
         setActiveApiBase('/api');
         return;
      }
      try {
        const res = await fetch(`https://raw.githubusercontent.com/bosslouie5/TimeAttendance-System/main/backend/active_link.txt?t=${Date.now()}`);
        if (res.ok) {
          const url = (await res.text()).trim();
          if (url && url.startsWith('http')) {
            setActiveApiBase(`${url}/api`);
            setSaasStatus(`Connected: ${url}`);
            return;
          }
        }
      } catch (e) { setSaasStatus('Waiting for Backend...'); }
    };
    discoverSaaS();
    const interval = setInterval(discoverSaaS, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (activeApiBase) loadInitialData(); }, [activeApiBase]);
  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

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

  const provisionPortal = async () => {
    if (!newCompanyName || !newUsername || !newPassword) return alert('Fill all fields');
    try {
      const res = await fetch(`${activeApiBase}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: newTenantId, companyName: newCompanyName, username: newUsername, password: newPassword, permissions: ['reports', 'setup', 'schedules'], adminIp: newAdminIp, startDate: newStartDate, endDate: newEndDate }) });
      if (res.ok) { setIsProvisioning(false); loadInitialData(); setStatus('Tenant Provisioned ✓'); }
    } catch (e) { setStatus('Provisioning Failed'); }
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

  const updatePermissions = async (targetTenant, perm) => {
    const tenantId = targetTenant.tenantId || targetTenant.username;
    const currentPerms = targetTenant.permissions || [];
    const newPerms = currentPerms.includes(perm) ? currentPerms.filter(p => p !== perm) : [...currentPerms, perm];
    try {
      const res = await fetch(`${activeApiBase}/users/${tenantId}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: newPerms }) });
      if (res.ok) { loadInitialData(); setStatus('Permissions Updated ✓'); }
    } catch (e) { setStatus('Update failed'); }
  };

  const broadcastLink = async () => {
    setIsBroadcasting(true);
    try {
      const res = await fetch(`${activeApiBase}/master/broadcast-link`, { method: 'POST' });
      if (res.ok) setStatus('Broadcast Success ✓');
    } catch (e) { setStatus('Broadcast Failed'); }
    finally { setIsBroadcasting(false); }
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
        .stat-card { background: #1e293b; padding: 25px; border-radius: 20px; border: 1px solid #334155; text-align: center; }
        .module-card { background: #1e293b; padding: 30px; border-radius: 20px; border: 1px solid #334155; cursor: pointer; transition: 0.3s; text-align: center; }
        .module-card:hover { transform: translateY(-5px); border-color: #3b82f6; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.2); }
        .btn-hover:hover { filter: brightness(1.2); }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { text-align: left; padding: 12px; color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 12px; border-bottom: 1px solid #1e293b; font-size: 0.9rem; }
      `}</style>

      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #1e293b', paddingBottom:'20px', marginBottom:'20px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
           <div onClick={() => setIsMenuOpen(!isMenuOpen)} style={{cursor:'pointer', padding:'8px', borderRadius:'8px', background:'#1e293b', border:'1px solid #334155'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="3"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></div>
           <div><h1 style={{margin:0, color:'#3b82f6', fontSize:'1.5rem'}}>DEV CONTROL CENTER</h1><p style={{margin:0, color:'#64748b', fontSize:'0.8rem'}}>Master Infrastructure Management</p></div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
           <button onClick={broadcastLink} className="btn-hover" style={{background:'#8b5cf6', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', fontWeight:'bold'}}>{isBroadcasting ? 'Broadcasting...' : '🚀 BROADCAST SYSTEM UPDATE'}</button>
           <div style={{textAlign:'right'}}><div style={{fontSize:'0.8rem', color:'#60a5fa'}}>{currentTime.toLocaleTimeString()}</div><div style={{fontSize:'0.6rem', color:'#64748b'}}>{saasStatus}</div></div>
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
            <ModuleCard icon="📇" title="Employee Master List" desc="Global list of registered staff" color="#3b82f6" onClick={() => setActiveTab('employees')} />
            <ModuleCard icon="📍" title="Branch Setup" desc="Configure geofence office locations" color="#10b981" onClick={() => setActiveTab('branches')} />
            <ModuleCard icon="🏢" title="Dept. Management" desc="Organizational units for each company" color="#3b82f6" onClick={() => setActiveTab('org-departments')} />
            <ModuleCard icon="💼" title="Position Management" desc="Define custom job position titles" color="#60a5fa" onClick={() => setActiveTab('position-titles')} />
            <ModuleCard icon="🛡️" title="Tenant Permissions" desc="Manage module access per company" color="#8b5cf6" onClick={() => setActiveTab('tenant-permissions')} />
            <ModuleCard icon="📊" title="System-Wide Reports" desc="Analytics and attendance logs" color="#10b981" onClick={() => setActiveTab('reports')} />
            <ModuleCard icon="🔗" title="Assign Branch" desc="Map employees to office locations" color="#3b82f6" onClick={() => setActiveTab('assign-branch')} />
            <ModuleCard icon="📱" title="Registered Devices" desc="Manage secure device linking" color="#10b981" onClick={() => setActiveTab('devices')} />
            <ModuleCard icon="⏰" title="Schedule Management" desc="Set office hours and shifts" color="#f59e0b" onClick={() => setActiveTab('schedules')} />
          </div>
        </div>
      )}

      {activeTab === 'tenants' && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'20px'}} className="fade-in">
           <div className="glass-card" style={{padding:'20px', background:'#1e293b', borderRadius:'15px', maxHeight:'80vh', overflowY:'auto'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h2>Tenants</h2><button onClick={() => {setIsProvisioning(true); setSelectedTenant(null);}} style={smallBtn}>+ New</button></div>
              {users.map(u => (
                <div key={u.tenantId || u.username} onClick={() => {setSelectedTenant(u); setIsProvisioning(false);}} className="tenant-item" style={{padding:'15px', borderRadius:'10px', background: selectedTenant?.tenantId === (u.tenantId || u.username) ? '#3b82f6' : '#0f172a', marginBottom:'10px', cursor:'pointer'}}>
                   <div style={{fontWeight:'bold'}}>{u.companyName}</div>
                   <div style={{fontSize:'0.7rem', opacity:0.6}}>ID: {u.tenantId || u.username}</div>
                </div>
              ))}
           </div>
           <div style={{background:'#1e293b', padding:'30px', borderRadius:'15px', border:'1px solid #334155'}}>
              {isProvisioning ? (
                <div>
                   <h2>🚀 Provision Portal</h2>
                   <input style={inputStyle} placeholder="Company Name" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} />
                   <input style={inputStyle} placeholder="Admin Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                   <input style={inputStyle} type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                   <button onClick={provisionPortal} style={{...addBtn, width:'100%', marginTop:'20px'}}>Deploy Infrastructure</button>
                </div>
              ) : selectedTenant ? (
                <div>
                   <div style={{display:'flex', justifyContent:'space-between', marginBottom:'30px'}}><h1>{selectedTenant.companyName}</h1><button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} style={smallBtn}>Actions</button></div>
                   {isActionMenuOpen && (
                     <div style={{background:'#0f172a', padding:'20px', borderRadius:'15px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'25px'}}>
                        <button onClick={() => deleteTenant(selectedTenant.tenantId || selectedTenant.username)} style={{...smallBtn, background:'#ef4444'}}>Delete Tenant</button>
                        <button onClick={() => window.open(`${activeApiBase?.replace('/api','')}/portal/${selectedTenant.tenantId || selectedTenant.username}`, '_blank')} style={smallBtn}>Launch Admin</button>
                     </div>
                   )}
                   <p>Portal ID: {selectedTenant.tenantId || selectedTenant.username}</p>
                   <p>Expiry: {selectedTenant.endDate || 'Lifetime'}</p>
                </div>
              ) : <div style={{textAlign:'center', padding:'50px', opacity:0.5}}>Select a tenant to manage</div>}
           </div>
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="fade-in">
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
                 <div style={{maxHeight:'60vh', overflowY:'auto'}}>
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
                         {[
                           { id: 'dashboard', name: 'Dashboard' },
                           { id: 'employees', name: 'Employee Management' },
                           { id: 'org-units', name: 'Org Units' },
                           { id: 'branches', name: 'Branch/Location Setup' },
                           { id: 'assign-branch', name: 'Employee Assignment' },
                           { id: 'reports', name: 'Attendance Reports' },
                           { id: 'setup', name: 'System Setup' },
                           { id: 'devices', name: 'Device Management' },
                           { id: 'position-titles', name: 'Position Titles' },
                           { id: 'schedules', name: 'Schedule Management' }
                         ].map(perm => (
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

      {/* OTHER TABS (Simplified for restoration) */}
      {activeTab !== 'dashboard' && activeTab !== 'tenants' && (
        <div className="fade-in" style={{background:'#1e293b', padding:'40px', borderRadius:'20px', textAlign:'center'}}>
           <h2>Module: {activeTab.toUpperCase()}</h2>
           <p style={{color:'#64748b'}}>Full module logic remains active in Port 4001 build. Re-integrating source context...</p>
           <button onClick={() => setActiveTab('dashboard')} style={{...addBtn, marginTop:'20px'}}>Back to Dashboard</button>
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

const MenuItem = ({ children, onClick, style }) => <div onClick={onClick} style={{padding:'15px 20px', cursor:'pointer', borderBottom:'1px solid #334155', color:'#cbd5e1', ...style}} className="btn-hover">{children}</div>;
const inputStyle = { display:'block', width:'100%', padding:'15px', borderRadius:'10px', border:'1px solid #334155', background:'#0f172a', color:'white', marginBottom:'15px', outline:'none', boxSizing:'border-box' };
const smallBtn = { padding:'8px 15px', border:'none', borderRadius:'8px', background:'#334155', color:'white', fontSize:'0.8rem', cursor:'pointer', fontWeight:'bold' };
const addBtn = { background:'#3b82f6', color:'white', border:'none', padding:'15px', borderRadius:'10px', fontWeight:'bold', cursor:'pointer' };

export default App;
