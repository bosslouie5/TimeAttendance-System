const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const app = express();
// --- BRANDING & ENVIRONMENT ---
const brand = JSON.parse(fs.readFileSync(path.join(__dirname, 'brand_config.json'), 'utf8'));
const isTestMode = process.env.SYSTEM_MODE === 'test';
const PORT = isTestMode ? 4002 : 4001;
const HOST = '0.0.0.0';

const distFolder = isTestMode ? 'dist-test' : 'dist';
const dbFile = isTestMode ? 'data-test.json' : 'data.json';

console.log(`\n\x1b[36m[${brand.brandName.toUpperCase()}] System Starting...\x1b[0m`);
console.log(`\x1b[35m[ENV] Mode: ${isTestMode ? 'DEVELOPER LAB (' + brand.devHostname + ')' : 'PRODUCTION (' + brand.prodHostname + ')'}\x1b[0m`);
console.log(`\x1b[35m[ENV] Database: ${dbFile}\x1b[0m\n`);

const DB_PATH = path.join(__dirname, dbFile);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-tenant-id', 'Authorization']
}));
app.use(bodyParser.json());

const webDevDist = path.join(__dirname, `../web-dev/${distFolder}`);
const webAdminDist = path.join(__dirname, `../web-admin/${distFolder}`);
const mobileDist = path.join(__dirname, `../mobile-app/${distFolder}`);
const apksDir = path.join(__dirname, 'apks');

if (!fs.existsSync(apksDir)) fs.mkdirSync(apksDir);
app.use('/apks', express.static(apksDir));

// Force Download Endpoint for APKs
app.get('/api/master/download-apk/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(apksDir, filename);

  if (fs.existsSync(filePath)) {
    console.log(`[DOWNLOAD] Serving APK: ${filename}`);
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`[DOWNLOAD] Error sending file:`, err);
        if (!res.headersSent) res.status(500).send("Error downloading file.");
      }
    });
  } else {
    res.status(404).send("File not found.");
  }
});

// --- DATABASE UTILS ---
function loadData() {
  if (!fs.existsSync(DB_PATH)) return { users: [], settings: {}, employees: [], departments: [], logs: [], orgUnits: [], assignments: [], positionTitles: [], schedules: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!data.employees) data.employees = [];
    if (!data.departments) data.departments = [];
    if (!data.logs) data.logs = [];
    if (!data.users) data.users = [];
    if (!data.orgUnits) data.orgUnits = [];
    if (!data.assignments) data.assignments = [];
    if (!data.positionTitles) data.positionTitles = [];
    if (!data.schedules) data.schedules = [];
    return data;
  } catch (e) { return { users: [], settings: {}, employees: [], departments: [], logs: [], orgUnits: [], assignments: [], positionTitles: [], schedules: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// --- DEV ACCOUNTS UTILS ---
const DEV_ACCOUNTS_PATH = path.join(__dirname, 'dev_accounts.json');
function loadDevAccounts() {
  if (!fs.existsSync(DEV_ACCOUNTS_PATH)) return [{ username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' }];
  try { return JSON.parse(fs.readFileSync(DEV_ACCOUNTS_PATH, 'utf8')); }
  catch (e) { return [{ username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' }]; }
}
function saveDevAccounts(accounts) {
  fs.writeFileSync(DEV_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2), 'utf8');
}

// --- NETWORK UTILS ---
function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const isSameSubnet = (ip, gateway) => {
  if (!gateway) return true;
  const gatewaySubnet = gateway.split('.').slice(0, 3).join('.');
  return ip.startsWith(gatewaySubnet);
};

const tenantGuard = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;

  // RELAXED LICENSE CHECK FOR NOW
  /*
  if (tenantId && tenantId !== 'master') {
    const data = loadData();
    const user = data.users.find(u => u.username.toLowerCase() === tenantId.toLowerCase());
    if (user && user.endDate) {
      if (new Date() > new Date(user.endDate)) {
        return res.status(403).json({ error: 'License Expired' });
      }
    }
  }
  */

  req.tenantId = tenantId;
  next();
};

// --- PORTAL SECURITY ---
app.use('/portal/:tenantId', (req, res, next) => {
  const { tenantId } = req.params;
  const data = loadData();

  // Find user by tenantId instead of username
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());

  if (!user) return res.status(404).send('<h1>Portal Not Found</h1>');

  // LICENSE CHECK
  if (user.endDate) {
    const now = new Date();
    const expiry = new Date(user.endDate);
    if (now > expiry) {
      return res.status(403).send(`
        <div style="font-family:sans-serif; text-align:center; padding-top:100px; background:#0f172a; color:white; min-height:100vh;">
          <h1 style="color:#ef4444;">🚨 ACCOUNT EXPIRED</h1>
          <p>This system license for <b>${user.companyName}</b> has expired on <b>${expiry.toLocaleDateString()}</b>.</p>
          <p>Please contact the developer to renew your access.</p>
        </div>
      `);
    }
  }

  const clientIp = req.ip.replace('::ffff:', '');
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.');

  // Master/Developer Bypass: allow access if local or in test mode
  if (isLocal || isTestMode) return next();

  // STRICT NETWORK LOCK: Check against registered Public IP
  if (user.publicIp && clientIp !== user.publicIp) {
    return res.status(403).send(`
      <div style="font-family:sans-serif; text-align:center; padding-top:100px; background:#0f172a; color:white; min-height:100vh;">
        <h1 style="color:#f59e0b;">🚫 ACCESS RESTRICTED</h1>
        <p>This portal is locked to the official office network.</p>
        <p>Your current IP: <b>${clientIp}</b> does not match the registered office IP.</p>
      </div>
    `);
  }

  next();
});

app.use('/portal/:tenantId', express.static(webAdminDist));

// --- API ENDPOINTS ---

app.post('/api/auth/web-login', (req, res) => {
  const { tenantId, username, password } = req.body;
  const data = loadData();
  const devAccounts = loadDevAccounts();

  console.log(`[AUTH] Login attempt: Tenant=${tenantId || 'ANY'}, User=${username}`);

  // 1. MASTER DEVELOPER BYPASS (Consultant Access)
  // If a developer from dev_accounts.json logs in, allow entry to ANY tenant portal.
  const devAccount = devAccounts.find(a => a.username.toLowerCase() === username.toLowerCase() && a.password === password);

  if (devAccount && tenantId) {
    console.log(`[AUTH] Developer ${devAccount.displayName} providing consultant access to tenant: ${tenantId}`);
    const targetTenant = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());

    if (targetTenant) {
      return res.json({
        success: true,
        user: {
          username: devAccount.username,
          displayName: `${devAccount.displayName} (Consultant)`,
          tenantId: tenantId,
          companyName: targetTenant.companyName,
          isConsultant: true,
          permissions: ['dashboard', 'employees', 'org-units', 'branches', 'assign-branch', 'reports', 'setup', 'devices', 'position-titles'] // Restored Position Access
        }
      });
    }
  }

  // 2. REGULAR LOGIN LOGIC
  const user = data.users.find(u => {
    const isMatchingTenant = !tenantId || (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase();
    const isMatchingUser = u.username.toLowerCase() === username.toLowerCase();
    const isMatchingPass = u.password === password;
    return isMatchingTenant && isMatchingUser && isMatchingPass;
  });

  if (user) {
    const finalTenantId = user.tenantId || user.username;
    console.log(`[AUTH] Login success: ${username} (Tenant: ${finalTenantId})`);
    res.json({ success: true, user: { ...user, tenantId: finalTenantId } });
  } else {
    console.warn(`[AUTH] Login failed for user: ${username}`);
    res.status(401).json({ error: 'Invalid Credentials' });
  }
});

app.post('/api/auth/dev-login', (req, res) => {
  const { username, password } = req.body;
  const accounts = loadDevAccounts();
  const user = accounts.find(a => a.username.toLowerCase() === username.toLowerCase() && a.password === password);

  if (user) {
    console.log(`[DEV-AUTH] Login success: ${username}`);
    res.json({ success: true, user });
  } else {
    console.warn(`[DEV-AUTH] Login failed: ${username}`);
    res.status(401).json({ error: 'Invalid Developer Credentials' });
  }
});

app.get('/api/master/dev-accounts', (req, res) => res.json(loadDevAccounts()));

app.post('/api/master/dev-accounts', (req, res) => {
  const accounts = loadDevAccounts();
  if (accounts.find(a => a.username.toLowerCase() === req.body.username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  accounts.push(req.body);
  saveDevAccounts(accounts);
  res.json({ success: true });
});

app.put('/api/master/dev-accounts/:username', (req, res) => {
  const { username } = req.params;
  const accounts = loadDevAccounts();
  const index = accounts.findIndex(a => a.username.toLowerCase() === username.toLowerCase());
  if (index !== -1) {
    accounts[index] = { ...accounts[index], ...req.body };
    saveDevAccounts(accounts);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

app.delete('/api/master/dev-accounts/:username', (req, res) => {
  const { username } = req.params;
  let accounts = loadDevAccounts();
  if (accounts.length <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  accounts = accounts.filter(a => a.username.toLowerCase() !== username.toLowerCase());
  saveDevAccounts(accounts);
  res.json({ success: true });
});

app.post('/api/master/broadcast-link', async (req, res) => {
  const tunnelLogPath = path.join(__dirname, 'tunnel.log');
  const REGISTRY_URL = 'https://ntfy.sh/attendance_hub_60003078_active_link';

  console.log(`[HUB] Manual Broadcast (ntfy.sh) triggered...`);

  if (!fs.existsSync(tunnelLogPath)) return res.status(404).json({ error: 'Tunnel log not found' });

  try {
    const content = fs.readFileSync(tunnelLogPath, 'utf8');
    const matches = [...content.matchAll(/https:\/\/(?!api|update|download)[a-z0-9-]+\.trycloudflare\.com/g)];

    if (matches.length > 0) {
      const currentUrl = matches[matches.length - 1][0];

      const response = await fetch(REGISTRY_URL, {
        method: 'POST',
        body: currentUrl
      });

      if (response.ok) {
        console.log(`[HUB] Manual Broadcast SUCCESS ✓`);
        res.json({ success: true, url: currentUrl });
      } else {
        res.status(500).json({ error: 'Registry rejected update' });
      }
    } else {
      res.status(404).json({ error: 'No active link' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/master/logs', (req, res) => res.json(loadData().logs));
app.get('/api/position-titles', tenantGuard, (req, res) => {
  const data = loadData();
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  const filtered = (data.positionTitles || []).filter(p => p.tenantId === tenantId);
  res.json(filtered);
});

app.post('/api/position-titles', tenantGuard, (req, res) => {
  const data = loadData();
  if (!data.positionTitles) data.positionTitles = [];
  const newTitle = { ...req.body, id: Date.now().toString(), tenantId: req.tenantId || 'master' };
  data.positionTitles.push(newTitle);
  saveData(data);
  res.json(newTitle);
});

app.delete('/api/position-titles/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const initialCount = (data.positionTitles || []).length;
  data.positionTitles = (data.positionTitles || []).filter(p => !(p.id === id && p.tenantId === (req.tenantId || 'master')));
  if (data.positionTitles.length < initialCount) {
    saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Position Title not found' });
  }
});

app.get('/api/master/position-titles', (req, res) => {
  const data = loadData();
  res.json(data.positionTitles || []);
});

// Schedule Management Endpoints
app.get('/api/schedules', tenantGuard, (req, res) => {
  const data = loadData();
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  const filtered = (data.schedules || []).filter(s => s.tenantId === tenantId);
  res.json(filtered);
});

app.post('/api/schedules', tenantGuard, (req, res) => {
  const data = loadData();
  if (!data.schedules) data.schedules = [];
  const newSchedule = { ...req.body, id: Date.now().toString(), tenantId: req.tenantId || 'master' };
  data.schedules.push(newSchedule);
  saveData(data);
  res.json(newSchedule);
});

app.put('/api/schedules/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  const index = (data.schedules || []).findIndex(s => s.id === id && s.tenantId === tenantId);
  if (index !== -1) {
    data.schedules[index] = { ...data.schedules[index], ...req.body, tenantId };
    saveData(data);
    res.json(data.schedules[index]);
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

app.delete('/api/schedules/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  const initialCount = (data.schedules || []).length;
  data.schedules = (data.schedules || []).filter(s => !(s.id === id && s.tenantId === tenantId));
  if (data.schedules.length < initialCount) {
    saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

app.get('/api/master/schedules', (req, res) => {
  const data = loadData();
  res.json(data.schedules || []);
});

app.post('/api/schedule-assign', tenantGuard, (req, res) => {
  const data = loadData();
  const { employeeId, shift } = req.body;
  const tenantId = req.tenantId || 'master';
  const index = data.employees.findIndex(e => e.employeeId === employeeId && e.tenantId === tenantId);
  if (index !== -1) {
    data.employees[index].schedule = shift;
    saveData(data);
    res.json({ success: true, employee: data.employees[index] });
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
});

app.get('/api/master/users', (req, res) => res.json(loadData().users));
app.get('/api/master/employees', (req, res) => {
  const data = loadData();
  const assignments = data.assignments || [];
  const depts = data.departments || [];

  const emps = data.employees.map(emp => {
    const assignment = assignments.find(a => a.employeeId === emp.employeeId && a.tenantId === emp.tenantId);
    if (assignment) {
      const dept = depts.find(d => d.departmentId === assignment.departmentId && d.tenantId === emp.tenantId);
      return { ...emp, branchName: dept ? dept.name : (emp.branchName || '') };
    }
    return emp;
  });

  res.json(emps);
});
app.get('/api/master/departments', (req, res) => res.json(loadData().departments));
app.get('/api/master/org-units', (req, res) => res.json(loadData().orgUnits));

// Org Units (Departments)
app.get('/api/org-units', tenantGuard, (req, res) => {
  const data = loadData();
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  res.json((data.orgUnits || []).filter(o => o.tenantId === tenantId));
});

app.post('/api/org-units', tenantGuard, (req, res) => {
  const data = loadData();
  const newOrg = { ...req.body, tenantId: req.tenantId || 'master', id: Date.now().toString() };
  if (!data.orgUnits) data.orgUnits = [];
  data.orgUnits.push(newOrg);
  saveData(data);
  res.json(newOrg);
});

app.delete('/api/org-units/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  data.orgUnits = (data.orgUnits || []).filter(o => !(o.id === id && o.tenantId === tenantId));
  saveData(data);
  res.json({ success: true });
});

// Tenant-specific Data
app.get('/api/employees', tenantGuard, (req, res) => {
  const data = loadData();
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant ID required' });

  let emps = data.employees.filter(e => e.tenantId === req.tenantId);

  // Attach department name if exists in assignments
  const assignments = data.assignments || [];
  const depts = data.departments || [];

  emps = emps.map(emp => {
    const assignment = assignments.find(a => a.employeeId === emp.employeeId && a.tenantId === req.tenantId);
    if (assignment) {
      const dept = depts.find(d => d.departmentId === assignment.departmentId);
      return { ...emp, branchName: dept ? dept.name : (emp.branchName || '') };
    }
    return emp;
  });

  res.json(emps);
});

app.get('/api/departments', tenantGuard, (req, res) => {
  const data = loadData();
  const { employeeId } = req.query;
  const tenantId = String(req.tenantId || '').trim().toLowerCase();

  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

  // 1. Get all branches for this tenant with extreme string safety
  let tenantBranches = (data.departments || []).filter(d =>
    String(d.tenantId || '').trim().toLowerCase() === tenantId
  );

  // 2. Filter by assignment if employeeId is provided
  if (employeeId) {
    const targetEmpId = String(employeeId).trim().toLowerCase();

    const myAssignments = (data.assignments || []).filter(a =>
      String(a.employeeId || '').trim().toLowerCase() === targetEmpId &&
      String(a.tenantId || '').trim().toLowerCase() === tenantId
    );

    const assignedDeptIds = myAssignments.map(a => String(a.departmentId || '').trim().toLowerCase());

    // Check by ID or fallback to name comparison if IDs are missing
    tenantBranches = tenantBranches.filter(d =>
      assignedDeptIds.includes(String(d.departmentId || '').trim().toLowerCase())
    );

    console.log(`[SYNC] Found ${tenantBranches.length} assigned branches for Emp ${targetEmpId} in Tenant ${tenantId}`);
  }

  res.json(tenantBranches);
});

app.get('/api/logs', tenantGuard, (req, res) => {
  const data = loadData();
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  const filtered = data.logs.filter(l => l.tenantId === req.tenantId);
  res.json(filtered);
});

app.post('/api/employees', tenantGuard, (req, res) => {
  const data = loadData();
  const newEmp = { ...req.body, tenantId: req.tenantId || 'master' };
  data.employees.push(newEmp);
  saveData(data);
  res.json(newEmp);
});

app.put('/api/employees/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  const index = data.employees.findIndex(e => e.employeeId === id && e.tenantId === tenantId);
  if (index !== -1) {
    data.employees[index] = { ...data.employees[index], ...req.body, tenantId };
    saveData(data);
    res.json(data.employees[index]);
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
});

app.post('/api/departments', tenantGuard, (req, res) => {
  const data = loadData();
  const newDept = { ...req.body, tenantId: req.tenantId || 'master' };
  data.departments.push(newDept);
  saveData(data);
  res.json(newDept);
});

app.put('/api/departments/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const index = data.departments.findIndex(d => d.departmentId === id && d.tenantId === (req.tenantId || 'master'));
  if (index !== -1) {
    data.departments[index] = { ...data.departments[index], ...req.body };
    saveData(data);
    res.json(data.departments[index]);
  } else {
    res.status(404).json({ error: 'Department not found' });
  }
});

app.delete('/api/departments/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const initialCount = data.departments.length;
  data.departments = data.departments.filter(d => !(d.departmentId === id && d.tenantId === (req.tenantId || 'master')));
  if (data.departments.length < initialCount) {
    saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Department not found' });
  }
});

app.post('/api/assignments', tenantGuard, (req, res) => {
  const data = loadData();
  if (!data.assignments) data.assignments = [];
  const tenantId = req.tenantId || 'master';
  const { employeeId, departmentId } = req.body;

  // 1. Update assignments array (one assignment per employee per tenant)
  data.assignments = data.assignments.filter(a =>
    !(a.employeeId === employeeId && a.tenantId === tenantId)
  );

  const newAssignment = { employeeId, departmentId, tenantId };
  data.assignments.push(newAssignment);

  // 2. Sync branchName to employee record for instant display in Master Lists
  const empIndex = data.employees.findIndex(e => e.employeeId === employeeId && e.tenantId === tenantId);
  if (empIndex !== -1) {
    const dept = data.departments.find(d => d.departmentId === departmentId && d.tenantId === tenantId);
    data.employees[empIndex].branchName = dept ? dept.name : '';
  }

  saveData(data);
  res.json({ success: true });
});

app.post('/api/timein', tenantGuard, (req, res) => {
  const data = loadData();
  const { employeeId, type, timestamp, tenantId: logTenant } = req.body;
  const tenantId = logTenant || req.tenantId || 'master';

  // Use Local Date (YYYY-MM-DD) for consistency
  const dateObj = new Date(timestamp);
  const logDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

  // Find ANY log for this employee TODAY
  const latestLogIndex = data.logs.slice().reverse().findIndex(l =>
    String(l.employeeId) === String(employeeId) &&
    String(l.tenantId) === String(tenantId) &&
    (() => {
      const d = new Date(l.timestamp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === logDate;
    })()
  );

  // Real index in the original array
  const existingLogIndex = latestLogIndex >= 0 ? (data.logs.length - 1 - latestLogIndex) : -1;

  // 1. Logic for TIME IN
  if (type === 'IN') {
    if (existingLogIndex >= 0 && data.logs[existingLogIndex].timeIn) {
      return res.status(400).json({ error: 'You have already recorded a TIME IN for today.' });
    }

    const newLog = {
      logId: Date.now().toString(),
      employeeId,
      employeeName: req.body.employeeName,
      departmentId: req.body.departmentId,
      departmentName: req.body.departmentName,
      tenantId,
      timestamp,
      timeIn: timestamp,
      timeOut: null,
      status: 'Present'
    };

    if (existingLogIndex >= 0) {
      data.logs[existingLogIndex] = { ...data.logs[existingLogIndex], ...newLog, timeOut: data.logs[existingLogIndex].timeOut, status: data.logs[existingLogIndex].timeOut ? 'Completed' : 'Present' };
    } else {
      data.logs.push(newLog);
    }
  }

  // 2. Logic for TIME OUT
  else if (type === 'OUT') {
    // SECURITY FIX: Must have a Time In record today before allowing Time Out
    if (existingLogIndex >= 0 && data.logs[existingLogIndex].timeIn) {
      // ANTI-OVERWRITE: Check if Time Out already exists
      if (data.logs[existingLogIndex].timeOut) {
        return res.status(400).json({ error: 'Attendance Denied: You have already recorded a TIME OUT for today.' });
      }
      data.logs[existingLogIndex].timeOut = timestamp;
      data.logs[existingLogIndex].status = 'Completed';
    } else {
      // Rejection: No Time In found
      return res.status(400).json({ error: 'Attendance Denied: No TIME IN record found for today. Please Time In first.' });
    }
  }

  saveData(data);
  res.json({ success: true, message: 'Log updated' });
});

app.post('/api/device/register', tenantGuard, (req, res) => {
  const { employeeId, deviceId, deviceName } = req.body;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  const employee = data.employees.find(e => e.employeeId === employeeId && (e.tenantId === tenantId || !e.tenantId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  if (!employee.registeredDeviceId) {
    const deviceInUse = data.employees.find(e => e.registeredDeviceId === deviceId && e.employeeId !== employeeId && (e.tenantId === tenantId || !e.tenantId));
    if (deviceInUse) return res.status(403).json({ error: `This device is already linked to ${deviceInUse.name}.` });
    employee.registeredDeviceId = deviceId;
    employee.registeredDeviceName = deviceName || 'Unknown Device';
    employee.registrationDate = new Date().toISOString();
    saveData(data);
    return res.json({
      success: true,
      message: 'Registered',
      tenantId: employee.tenantId, // Return the actual tenantId
      employee: { employeeId: employee.employeeId, name: employee.name }
    });
  } else if (employee.registeredDeviceId === deviceId) {
    return res.json({
      success: true,
      message: 'Verified',
      tenantId: employee.tenantId, // Return the actual tenantId
      employee: { employeeId: employee.employeeId, name: employee.name }
    });
  } else {
    return res.status(403).json({ error: 'Already registered on another device.' });
  }
});

app.post('/api/device/reset', tenantGuard, (req, res) => {
  const { employeeId } = req.body;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  const employee = data.employees.find(e => e.employeeId === employeeId && e.tenantId === tenantId);
  if (employee) {
    delete employee.registeredDeviceId;
    delete employee.registeredDeviceName;
    delete employee.registrationDate;
    saveData(data);
    res.json({ success: true });
  }
  else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/employees/:id', tenantGuard, (req, res) => {
  const { id } = req.params;
  const data = loadData();
  const tenantId = req.tenantId || 'master';
  const initialCount = data.employees.length;
  data.employees = data.employees.filter(e => !(e.employeeId === id && e.tenantId === tenantId));
  if (data.employees.length < initialCount) {
    saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
});

// --- RESET UTILS FOR DEV ---
app.post('/api/master/clear-data', (req, res) => {
  const { tenantId, target } = req.body; // target: 'logs', 'employees', 'departments'
  const data = loadData();

  const isGlobal = tenantId === 'MASTER_GLOBAL';

  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

  if (target === 'logs') {
    if (isGlobal) data.logs = [];
    else data.logs = data.logs.filter(l => l.tenantId !== tenantId);
  } else if (target === 'employees') {
    if (isGlobal) {
      data.employees = [];
      data.logs = [];
    } else {
      data.employees = data.employees.filter(e => e.tenantId !== tenantId);
      data.logs = data.logs.filter(l => l.tenantId !== tenantId);
    }
  } else if (target === 'departments') {
    if (isGlobal) {
      data.departments = [];
      data.assignments = [];
    } else {
      data.departments = data.departments.filter(d => d.tenantId !== tenantId);
      if (data.assignments) data.assignments = data.assignments.filter(a => a.tenantId !== tenantId);
    }
  } else if (target === 'orgUnits') {
    if (isGlobal) data.orgUnits = [];
    else data.orgUnits = (data.orgUnits || []).filter(o => o.tenantId !== tenantId);
  } else if (target === 'schedules') {
    if (isGlobal) data.schedules = [];
    else data.schedules = (data.schedules || []).filter(s => s.tenantId !== tenantId);
  } else if (target === 'all') {
    if (isGlobal) {
      data.logs = [];
      data.employees = [];
      data.departments = [];
      data.orgUnits = [];
      data.assignments = [];
      data.schedules = [];
    } else {
      data.logs = data.logs.filter(l => l.tenantId !== tenantId);
      data.employees = data.employees.filter(e => e.tenantId !== tenantId);
      data.departments = data.departments.filter(d => d.tenantId !== tenantId);
      data.orgUnits = (data.orgUnits || []).filter(o => o.tenantId !== tenantId);
      data.schedules = (data.schedules || []).filter(s => s.tenantId !== tenantId);
      if (data.assignments) data.assignments = data.assignments.filter(a => a.tenantId !== tenantId);
    }
  }

  saveData(data);
  res.json({ success: true, message: `${target} cleared ${isGlobal ? 'globally' : 'for ' + tenantId}` });
});


app.post('/api/users', (req, res) => {
  const data = loadData();
  const ip = getNetworkIP();

  // Generate a unique tenantId from companyName if not provided
  const tenantId = req.body.tenantId || req.body.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Ensure tenantId is unique
  if (data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase())) {
    return res.status(400).json({ error: 'Company ID already exists. Try a different Company Name.' });
  }

  const newUser = {
    ...req.body,
    tenantId,
    portalUrl: req.body.adminIp ? `http://${req.body.adminIp}:${PORT}/portal/${tenantId}` : `http://${ip}:${PORT}/portal/${tenantId}`
  };
  data.users.push(newUser);
  saveData(data);
  res.json(newUser);
});

app.delete('/api/users/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const data = loadData();

  // Strict matching to prevent accidental multiple deletions
  const originalCount = data.users.length;
  data.users = data.users.filter(u => (u.tenantId || u.username).toLowerCase() !== tenantId.toLowerCase());

  if (data.users.length < originalCount) {
    // Ninja Clean Up: Delete all data associated with this tenant
    const lowerTenantId = tenantId.toLowerCase();
    data.employees = (data.employees || []).filter(e => (e.tenantId || '').toLowerCase() !== lowerTenantId);
    data.departments = (data.departments || []).filter(d => (d.tenantId || '').toLowerCase() !== lowerTenantId);
    data.orgUnits = (data.orgUnits || []).filter(o => (o.tenantId || '').toLowerCase() !== lowerTenantId);
    data.schedules = (data.schedules || []).filter(s => (s.tenantId || '').toLowerCase() !== lowerTenantId);
    data.logs = (data.logs || []).filter(l => (l.tenantId || '').toLowerCase() !== lowerTenantId);
    data.positionTitles = (data.positionTitles || []).filter(p => (p.tenantId || '').toLowerCase() !== lowerTenantId);
    if (data.assignments) {
      data.assignments = data.assignments.filter(a => (a.tenantId || '').toLowerCase() !== lowerTenantId);
    }

    saveData(data);
    console.log(`[MASTER] Global Cleanup: Deleted all records for tenant ${tenantId}`);
    res.json({ success: true, message: `Tenant ${tenantId} and all associated data deleted.` });
  } else {
    res.status(404).json({ error: 'Tenant not found.' });
  }
});

app.put('/api/users/:tenantId/permissions', (req, res) => {
  const { tenantId } = req.params;
  const data = loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    user.permissions = req.body.permissions;
    saveData(data);
    res.json({ success: true });
  }
  else res.status(404).json({ error: 'Not found' });
});

app.put('/api/users/:tenantId/enddate', (req, res) => {
  const { tenantId } = req.params;
  const { endDate } = req.body;
  const data = loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    user.endDate = endDate;
    saveData(data);
    res.json({ success: true, endDate });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/tenant-info/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const data = loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    // Only return non-sensitive public info
    res.json({
      companyName: user.companyName,
      tenantId: user.tenantId || user.username,
      adminIp: user.adminIp,
      endDate: user.endDate,
      permissions: user.permissions || []
    });
  } else {
    res.status(404).json({ error: 'Tenant not found' });
  }
});

app.post('/api/master/build-apk', (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const { tenantId, companyName, publicUrl } = req.body;
  const ip = getNetworkIP();
  const apiUrl = publicUrl || `http://${ip}:${PORT}/api`;

  console.log(`[BUILD] Starting APK Build for ${companyName} (${tenantId})...`);

  try {
    const mobileAppPath = path.join(__dirname, '../mobile-app');
    const sourceApk = path.join(mobileAppPath, 'android/app/build/outputs/apk/debug/app-debug.apk');

    // 0. Cleanup old build to ensure fresh APK
    if (fs.existsSync(sourceApk)) fs.unlinkSync(sourceApk);

    // 1. Update app_config.json
    const configPath = path.join(mobileAppPath, 'src/app_config.json');
    fs.writeFileSync(configPath, JSON.stringify({ defaultApiUrl: apiUrl, defaultTenantId: tenantId }, null, 2));

    // 2. Update app name in strings.xml
    const stringsPath = path.join(mobileAppPath, 'android/app/src/main/res/values/strings.xml');
    if (fs.existsSync(stringsPath)) {
      let stringsXml = fs.readFileSync(stringsPath, 'utf8');
      stringsXml = stringsXml.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${companyName}<\/string>`);
      stringsXml = stringsXml.replace(/<string name="title_activity_main">.*?<\/string>/, `<string name="title_activity_main">${companyName}<\/string>`);
      fs.writeFileSync(stringsPath, stringsXml);
    }

    // 3. Build Environment Setup
    const DEV_TOOLS = "C:\\Users\\60003078\\Desktop\\Advance Software\\DEV_TOOLS";
    const buildEnv = {
      ...process.env,
      JAVA_HOME: path.join(DEV_TOOLS, "jdk-17.0.10+7"),
      PATH: `${path.join(DEV_TOOLS, "node-v20.11.1-win-x64")};${path.join(DEV_TOOLS, "platform-tools")};${path.join(DEV_TOOLS, "jdk-17.0.10+7", "bin")};${process.env.PATH}`
    };

    // 4. Run Build Script
    console.log(`[BUILD] Running build_apk_portable.bat...`);
    execSync('build_apk_portable.bat', {
      cwd: mobileAppPath,
      shell: true,
      env: buildEnv,
      stdio: 'pipe'
    });

    // 5. Verify and Move APK
    const safeFileName = (companyName || tenantId).toString().replace(/[^a-z0-9]/gi, '_');
    const destName = `${tenantId}_${safeFileName}.apk`;
    const destPath = path.join(apksDir, destName);

    if (fs.existsSync(sourceApk)) {
      fs.copyFileSync(sourceApk, destPath);
      console.log(`[BUILD] SUCCESS: Generated ${destName}`);

      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['host'];
      // Point to the force download endpoint instead of static file
      const finalDownloadUrl = `${protocol}://${host}/api/master/download-apk/${destName}`;

      res.json({ success: true, downloadUrl: finalDownloadUrl, file: destName });
    } else {
      throw new Error("Build finished but app-debug.apk was not found.");
    }
  } catch (error) {
    console.error(`[BUILD] ERROR:`, error.message);
    res.status(500).json({
      success: false,
      error: "Build failed or timed out",
      details: error.message
    });
  }
});

// Build, install and launch on first connected device via ADB
app.post('/api/master/build-and-run-apk', (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.');

  if (!isTestMode && !isLocal) {
    return res.status(403).json({ success: false, error: 'Security: Build-and-Run is only allowed from the Local Server machine.' });
  }

  const { tenantId, companyName, publicUrl } = req.body;
  const ip = getNetworkIP();
  const apiUrl = publicUrl || `http://${ip}:${PORT}/api`;
  try {
    // Update app config and strings
    const configPath = path.join(__dirname, '../mobile-app/src/app_config.json');
    fs.writeFileSync(configPath, JSON.stringify({ defaultApiUrl: apiUrl, defaultTenantId: tenantId }, null, 2));

    const stringsPath = path.join(__dirname, '../mobile-app/android/app/src/main/res/values/strings.xml');
    if (fs.existsSync(stringsPath)) {
      let stringsXml = fs.readFileSync(stringsPath, 'utf8');
      stringsXml = stringsXml.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${companyName}<\/string>`);
      stringsXml = stringsXml.replace(/<string name="title_activity_main">.*?<\/string>/, `<string name="title_activity_main">${companyName}<\/string>`);
      fs.writeFileSync(stringsPath, stringsXml);
    }

    const capPath = path.join(__dirname, '../mobile-app/capacitor.config.json');
    const capConfig = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    delete capConfig.server?.url;
    fs.writeFileSync(capPath, JSON.stringify(capConfig, null, 2));

    // Run build
    execSync('npm run apk', { cwd: path.join(__dirname, '../mobile-app'), shell: true });
    const sourceApk = path.join(__dirname, '../mobile-app/android/app/build/outputs/apk/debug/app-debug.apk');

    if (!fs.existsSync(sourceApk)) throw new Error('APK not found after build');

    // Ensure there's at least one device connected
    const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
    const candidatePaths = [];

    // If ADB_PATH is a directory, point to the executable inside it
    if (process.env.ADB_PATH) {
      const p = path.resolve(process.env.ADB_PATH);
      if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
        candidatePaths.push(path.join(p, adbName));
      } else {
        candidatePaths.push(p);
      }
    }

    if (process.env.ANDROID_SDK_ROOT) candidatePaths.push(path.resolve(process.env.ANDROID_SDK_ROOT, 'platform-tools', adbName));
    if (process.env.ANDROID_HOME) candidatePaths.push(path.resolve(process.env.ANDROID_HOME, 'platform-tools', adbName));

    // Portable ADB Path (Rule 4)
    candidatePaths.push(path.resolve(__dirname, '..', '..', 'DEV_TOOLS', 'platform-tools', adbName));
    candidatePaths.push(path.resolve(__dirname, '..', '..', '..', 'DEV_TOOLS', 'platform-tools', adbName));
    candidatePaths.push(path.join('C:', 'Users', '60003078', 'Desktop', 'Advance Software', 'DEV_TOOLS', 'platform-tools', adbName));
    candidatePaths.push('adb');

    let adbCmd = 'adb';
    for (const candidate of candidatePaths) {
      if (candidate === 'adb') continue;
      try {
        if (fs.existsSync(candidate) && !fs.lstatSync(candidate).isDirectory()) {
          adbCmd = candidate;
          break;
        }
      } catch (e) { }
    }
    console.log('build-and-run adb selected:', adbCmd);

    // Ensure ADB reverse is established so the app can reach the host local API on device
    try {
      execFileSync(adbCmd, ['reverse', 'tcp:4002', 'tcp:4002'], { stdio: 'inherit' });
      execFileSync(adbCmd, ['reverse', 'tcp:4001', 'tcp:4001'], { stdio: 'inherit' });
    } catch (reverseError) {
      console.warn('ADB reverse failed, proceeding anyway:', reverseError.message);
    }

    // Use execFileSync to avoid quoting/space issues
    const devicesOutput = execFileSync(adbCmd, ['devices'], { encoding: 'utf8' });
    const devices = devicesOutput.split('\n').slice(1).map(l => l.trim()).filter(l => l && !l.startsWith('*') && l.includes('\tdevice')).map(l => l.split('\t')[0]);
    if (!devices.length) return res.status(400).json({ success: false, error: 'No connected Android devices found via ADB' });

    // Install APK to first device and launch
    const device = devices[0];
    execFileSync(adbCmd, ['-s', device, 'install', '-r', sourceApk], { stdio: 'inherit' });

    // Launch main activity
    const pkg = 'com.example.timeattendance';
    execFileSync(adbCmd, ['-s', device, 'shell', 'am', 'start', '-n', `${pkg}/.MainActivity`], { stdio: 'inherit' });

    // Copy APK to apks folder for reference
    const safeFileName = (companyName || tenantId).toString().replace(/[^a-z0-9]/gi, '_');
    const destName = `${tenantId}_${safeFileName}.apk`;
    const destPath = path.join(apksDir, destName);
    fs.copyFileSync(sourceApk, destPath);

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['host'];
    const finalDownloadUrl = `${protocol}://${host}/apks/${destName}`;

    res.json({ success: true, message: 'Installed and launched on device', file: destName, downloadUrl: finalDownloadUrl });
  } catch (error) {
    console.error('build-and-run error', error);
    res.status(500).json({ success: false, error: error.message || 'Build-and-run failed' });
  }
});

// List available APKs
app.get('/api/master/apks', (req, res) => {
  const clientIp = req.ip.replace('::ffff:', '');
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.');

  if (!isTestMode && !isLocal) return res.status(403).json({ success: false, error: 'Not allowed' });

  try {
    const files = fs.readdirSync(apksDir).filter(f => f.endsWith('.apk'));

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['host'];

    const list = files.map(f => ({ file: f, downloadUrl: `${protocol}://${host}/apks/${f}` }));
    res.json({ success: true, apks: list });
  } catch (e) { res.status(500).json({ success: false, apks: [] }); }
});

app.get('/api/settings', (req, res) => res.json({ currentSystemIp: getNetworkIP(), currentSystemGateway: '10.222.166.1' }));

app.use('/dev', express.static(webDevDist));
app.get('/dev/*', (req, res) => res.sendFile(path.join(webDevDist, 'index.html')));

// --- MOBILE APP SERVICE ---
app.use('/app', express.static(mobileDist));
app.get('/app/*', (req, res) => res.sendFile(path.join(mobileDist, 'index.html')));

app.use('/', express.static(webAdminDist));
app.get('/*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/apks')) return;
  res.sendFile(path.join(webAdminDist, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `SYSTEM LIVE: http://localhost:${PORT}`);
  console.log(`Status: Ready for Local or Public connections.`);

  // Start Tunnel Monitoring for SaaS Self-Healing
  startTunnelMonitor();
});

// --- SAAS SELF-HEALING: DISCOVERY HUB ---
function startTunnelMonitor() {
  const tunnelLogPath = path.join(__dirname, 'tunnel.log');
  // Use ntfy.sh - super reliable for broadcast
  const REGISTRY_URL = 'https://ntfy.sh/attendance_hub_60003078_active_link';

  console.log(`[HUB] Monitoring tunnel for auto-healing...`);

  setInterval(async () => {
    if (!fs.existsSync(tunnelLogPath)) return;

    try {
      const content = fs.readFileSync(tunnelLogPath, 'utf8');
      const matches = [...content.matchAll(/https:\/\/(?!api|update|download)[a-z0-9-]+\.trycloudflare\.com/g)];

      if (matches.length > 0) {
        const currentUrl = matches[matches.length - 1][0];

        if (global.lastFoundUrl !== currentUrl) {
          global.lastFoundUrl = currentUrl;
          console.log(`\n\x1b[36m[HUB] NEW LINK DETECTED: ${currentUrl}\x1b[0m\n`);

          // --- AUTO-OPEN BROWSER (Ninja Stable Version) ---
          try {
             const { exec } = require('child_process');
             const startCmd = process.platform === 'win32' ? 'start' : 'open';
             // Opening the direct tunnel link for 100% stability and zero CORS issues
             exec(`${startCmd} ${currentUrl}/dev`);
          } catch (e) { console.error('[HUB] Browser auto-open failed'); }

          try {
            // NINJA GITHUB REGISTRY: Update active_link.txt using Portable Git
            const linkFile = path.join(__dirname, 'active_link.txt');
            fs.writeFileSync(linkFile, currentUrl);

            const DEV_TOOLS = "C:\\Users\\60003078\\Desktop\\Advance Software\\DEV_TOOLS";
            const gitExe = path.join(DEV_TOOLS, "Git", "cmd", "git.exe");

            const gitCmd = `"${gitExe}" add active_link.txt && "${gitExe}" commit -m "Registry Update: ${new Date().toLocaleTimeString()}" && "${gitExe}" push origin main`;

            exec(gitCmd, { cwd: __dirname }, (err) => {
               if (!err) console.log(`[HUB] GitHub Registry Updated ✓`);
               else console.error(`[HUB] GitHub Registry Update Failed. Is GitHub public?`);
            });
          } catch (gitErr) { }

          try {
            const shortcutPath = path.join(os.homedir(), 'Desktop', 'CURRENT_SERVER_LINK.txt');
            let contentString = `🚀 TIMEKEY SaaS HUB - ACTIVE LINKS\n`;
            contentString += `==========================================\n`;
            contentString += `GLOBAL ACCESS: ${currentUrl}\n`;
            contentString += `DEV DASHBOARD: ${currentUrl}/dev\n`;
            contentString += `------------------------------------------\n`;
            contentString += `🏢 TENANT VIRTUAL HOSTS (LOCAL TESTING):\n`;

            const data = loadData();
            data.users.forEach(u => {
              if (u.adminIp) {
                contentString += `- ${u.companyName}: http://${u.adminIp}:${PORT}/portal/${u.tenantId || u.username}\n`;
              }
            });
            contentString += `==========================================\n`;
            contentString += `Last Sync: ${new Date().toLocaleString()}\n`;

            fs.writeFileSync(shortcutPath, contentString);
          } catch (err) { }

          try {
            await fetch(REGISTRY_URL, { method: 'POST', body: currentUrl });
            console.log(`[HUB] Auto-Healing Registry Updated (ntfy) ✓`);
          } catch (fetchErr) {
            console.error(`[HUB] Registry Update Failed:`, fetchErr.message);
          }
        }
      }
    } catch (e) { }
  }, 5000);
}
