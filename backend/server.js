const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');

const app = express();
// --- BRANDING & ENVIRONMENT ---
const ALL_MODULES = [
  'dashboard', 'employees', 'org-units', 'branches', 'assign-branch',
  'reports', 'setup', 'devices', 'position-titles', 'schedules',
  'assign-schedule', 'announcements', 'leave-management', 'payroll-bridge',
  'subscription-info'
];
const brand = JSON.parse(fs.readFileSync(path.join(__dirname, 'brand_config.json'), 'utf8'));
const isTestMode = process.env.SYSTEM_MODE === 'test';
const PORT = process.env.PORT || (isTestMode ? 4002 : 4001);
const HOST = '0.0.0.0';

const distFolder = isTestMode ? 'dist-test' : 'dist';
const dbFile = isTestMode ? 'data-test.json' : 'data.json';

const DB_PATH = path.join(__dirname, dbFile);
const MONGODB_URI = process.env.MONGODB_URI;
let dbClient = null;

console.log(`\n\x1b[36m[${brand.brandName.toUpperCase()}] System Starting...\x1b[0m`);
console.log(`\x1b[35m[ENV] Mode: ${isTestMode ? 'DEVELOPER LAB (' + brand.devHostname + ')' : 'PRODUCTION (' + brand.prodHostname + ')'}\x1b[0m`);
console.log(`\x1b[35m[ENV] Database: ${MONGODB_URI ? 'MONGODB ATLAS (Cloud)' : dbFile + ' (Local JSON)'}\x1b[0m\n`);

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('PASTE_YOUR_MONGODB')) {
    return null;
  }

  if (dbClient) return dbClient.db();

  try {
    dbClient = new MongoClient(uri);
    await dbClient.connect();
    const dbName = dbClient.db().databaseName;
    console.log(`\x1b[32m[DB] Connected to MongoDB Atlas ✓ (DB: ${dbName})\x1b[0m`);
    return dbClient.db();
  } catch (e) {
    console.error(`\x1b[31m[DB] Connection Failed: ${e.message}\x1b[0m`);
    dbClient = null; // Reset client on failure
    return null;
  }
}

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

// --- SMART IP REDIRECT (PRO FEATURE) ---
app.get('/', async (req, res, next) => {
  try {
    let clientIp = req.headers['x-forwarded-for'] || req.ip.replace('::ffff:', '');
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

    const data = await loadData();

    // Find a tenant that matches this IP (Public IP Lock)
    const matchingTenant = data.users.find(u =>
      u.publicIp && u.publicIp === clientIp
    );

    if (matchingTenant && !isTestMode) {
      console.log(`[SMART-REDIRECT] IP ${clientIp} recognized as Tenant: ${matchingTenant.companyName}`);
      return res.redirect(`/portal/${matchingTenant.tenantId || matchingTenant.username}`);
    }
  } catch (e) { console.error('[SMART-REDIRECT] Error:', e.message); }
  next();
});

// --- PRO DIAGNOSTICS (Render Debugging) ---
console.log(`\n\x1b[33m[DIAGNOSTICS] Checking UI Folders...\x1b[0m`);
[
  { name: 'Web-Admin', path: webAdminDist },
  { name: 'Web-Dev', path: webDevDist },
  { name: 'Mobile-App', path: mobileDist }
].forEach(ui => {
  if (fs.existsSync(ui.path)) {
    console.log(`\x1b[32m[✓] ${ui.name}: Found at ${ui.path}\x1b[0m`);
  } else {
    console.log(`\x1b[31m[✗] ${ui.name}: MISSING! (Expected at ${ui.path})\x1b[0m`);
    console.log(`    Tip: Make sure to run 'npm run build' in the Render build command.`);
  }
});
console.log('');

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
async function loadData() {
  const db = await getDb();
  let data = { settings: {}, users: [], employees: [], departments: [], logs: [], orgUnits: [], assignments: [], positionTitles: [], schedules: [] };

  if (db) {
    const collections = ['users', 'employees', 'departments', 'logs', 'orgUnits', 'assignments', 'positionTitles', 'schedules'];
    for (const col of collections) {
      data[col] = await db.collection(col).find({}).toArray();
    }
  } else if (fs.existsSync(DB_PATH)) {
    try {
      const local = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      data = { ...data, ...local };
    } catch (e) { }
  }

  // --- AUTO-MIGRATION: Ensure all departments have a departmentId ---
  let needsFix = false;
  data.departments = (data.departments || []).map(d => {
    if (!d.departmentId) {
      d.departmentId = (d.name || 'branch').toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() + Math.random().toString(36).substr(2, 5);
      needsFix = true;
    }
    return d;
  });

  if (needsFix) {
    console.log(`[MIGRATION] Fixed missing Department IDs. Saving...`);
    await saveData(data);
  }

  return data;
}

async function saveData(data) {
  const db = await getDb();
  if (db) {
    const collections = ['users', 'employees', 'departments', 'logs', 'orgUnits', 'assignments', 'positionTitles', 'schedules'];
    for (const col of collections) {
      if (data[col]) {
        await db.collection(col).deleteMany({}); // Wipe and replace for "JSON-like" behavior for now
        if (data[col].length > 0) await db.collection(col).insertMany(data[col]);
      }
    }
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// --- DEV ACCOUNTS UTILS ---
const DEV_ACCOUNTS_PATH = path.join(__dirname, 'dev_accounts.json');

async function loadDevAccounts() {
  const db = await getDb();
  if (db) {
    const accounts = await db.collection('devAccounts').find({}).toArray();

    // Ensure dev1 and john cruz are ALWAYS present in the results even if DB has other accounts
    const localSeed = [
      { username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' },
      { username: 'dev', password: 'dev', displayName: 'Developer' },
      { username: 'dev1', password: 'dev1', displayName: 'Developer 1' }
    ];

    if (accounts.length > 0) {
      // Merge: priority to localSeed to prevent lockout
      const combined = [...accounts.map(({ _id, ...acc }) => acc)];
      localSeed.forEach(s => {
        if (!combined.find(c => c.username.toLowerCase() === s.username.toLowerCase())) {
          combined.push(s);
        }
      });
      return combined;
    }

    // Seed DB with standard ninja accounts if empty
    let seed = [
      { username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' },
      { username: 'dev', password: 'dev', displayName: 'Developer' },
      { username: 'dev1', password: 'dev1', displayName: 'Developer 1' }
    ];

    if (fs.existsSync(DEV_ACCOUNTS_PATH)) {
      try {
        const local = JSON.parse(fs.readFileSync(DEV_ACCOUNTS_PATH, 'utf8'));
        // Merge unique accounts from local json
        local.forEach(l => {
          if (!seed.find(s => s.username.toLowerCase() === l.username.toLowerCase())) seed.push(l);
        });
      } catch (e) {}
    }

    await db.collection('devAccounts').insertMany(seed);
    return seed;
  }

  if (!fs.existsSync(DEV_ACCOUNTS_PATH)) return [{ username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' }];
  try { return JSON.parse(fs.readFileSync(DEV_ACCOUNTS_PATH, 'utf8')); }
  catch (e) { return [{ username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' }]; }
}

function getNetworkIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function matchIp(client, allowed) {
  if (!allowed) return true;
  if (allowed === '*' || allowed === 'ANY') return true;
  const allowedList = allowed.split(',').map(i => i.trim());
  return allowedList.some(a => {
    if (a.includes('*')) {
      const regex = new RegExp('^' + a.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(client);
    }
    return a === client;
  });
}

const tenantGuard = (req, res, next) => {
  const tid = req.headers['x-tenant-id'] || req.query.tenantId;
  req.tenantId = tid;
  next();
};

app.use('/portal/:tenantId', express.static(webAdminDist));

// --- API ENDPOINTS ---

app.post('/api/auth/web-login', async (req, res) => {
  const { tenantId, username, password } = req.body;
  const data = await loadData();
  const devAccounts = await loadDevAccounts();

  console.log(`[AUTH] Login attempt: Tenant=${tenantId || 'ANY'}, User=${username}`);

  // 1. MASTER DEVELOPER BYPASS (Consultant Access)
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
          permissions: ALL_MODULES
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
    // IP GATEKEEPER CHECK FOR REGULAR USERS
  let clientIp = req.headers['x-forwarded-for'] || req.ip.replace('::ffff:', '');
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.');
    const allowedIp = user.publicIp || user.adminIp;
    const isDevBypass = req.body.devMode === true || req.query.devMode === 'true';

    if (!isLocal && !isTestMode && !isDevBypass && allowedIp && !matchIp(clientIp, allowedIp)) {
       console.warn(`[AUTH] Login Blocked: Unauthorized IP ${clientIp} for Tenant ${tenantId}`);
       return res.status(403).json({ error: 'Access Denied: Please login from the office network.' });
    }

    const finalTenantId = user.tenantId || user.username;
    console.log(`[AUTH] Login success: ${username} (Tenant: ${finalTenantId})`);

    // AUTO-INJECT NEW MODULES
    const currentPermissions = user.permissions || [];
    const updatedPermissions = Array.from(new Set([...ALL_MODULES, ...currentPermissions]));

    res.json({ success: true, user: { ...user, tenantId: finalTenantId, permissions: updatedPermissions } });
  } else {
    console.warn(`[AUTH] Login failed for user: ${username}`);
    res.status(401).json({ error: 'Invalid Credentials' });
  }
});

app.post('/api/auth/dev-login', async (req, res) => {
  const { username, password } = req.body;
  const accounts = await loadDevAccounts();
  const user = accounts.find(a => a.username.toLowerCase() === username.toLowerCase() && a.password === password);

  if (user) {
    console.log(`[DEV-AUTH] Login success: ${username}`);
    res.json({ success: true, user });
  } else {
    console.warn(`[DEV-AUTH] Login failed: ${username}`);
    res.status(401).json({ error: 'Invalid Developer Credentials' });
  }
});

// --- TENANT ACTIVATION & IP CAPTURE (PRO FEATURE) ---
app.get('/activate/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const data = await loadData();
  const userIndex = data.users.findIndex(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());

  if (userIndex === -1) return res.status(404).send('<h1>Invalid Activation Link</h1>');

  let clientIp = req.headers['x-forwarded-for'] || req.ip.replace('::ffff:', '');
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  // Update Tenant Data in Atlas/Local JSON
  data.users[userIndex].publicIp = clientIp;
  data.users[userIndex].adminIp = clientIp;
  await saveData(data);

  res.send(`
    <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:white; min-height:100vh;">
      <h1 style="color:#10b981;">TENTANT ACTIVATED ✓</h1>
      <p>Company: ${data.users[userIndex].companyName}</p>
      <p>IP Address Locked: <b>${clientIp}</b></p>
      <hr style="border:1px solid #334155; margin:30px 0;">
      <a href="/portal/${tenantId}" style="background:#3b82f6; color:white; padding:15px 30px; text-decoration:none; border-radius:10px; font-weight:bold;">GO TO ADMIN PORTAL</a>
    </div>
  `);
});

app.get('/api/master/users', async (req, res) => {
  const data = await loadData();
  res.json(data.users);
});

app.get('/api/master/logs', async (req, res) => {
  const data = await loadData();
  res.json(data.logs);
});

app.get('/api/master/employees', async (req, res) => {
  const data = await loadData();
  res.json(data.employees);
});

app.get('/api/master/departments', async (req, res) => {
  const data = await loadData();
  res.json(data.departments);
});
app.get('/api/master/org-units', async (req, res) => {
  const data = await loadData();
  res.json(data.orgUnits || []);
});
app.get('/api/master/position-titles', async (req, res) => {
  const data = await loadData();
  res.json(data.positionTitles || []);
});
app.get('/api/master/schedules', async (req, res) => {
  const data = await loadData();
  res.json(data.schedules || []);
});

app.get('/api/master/dev-accounts', async (req, res) => {
  const accounts = await loadDevAccounts();
  res.json(accounts);
});

app.post('/api/master/dev-accounts', async (req, res) => {
  const accounts = await loadDevAccounts();
  accounts.push(req.body);
  const db = await getDb();
  if (db) {
    await db.collection('devAccounts').deleteMany({});
    await db.collection('devAccounts').insertMany(accounts);
  } else {
    fs.writeFileSync(DEV_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2));
  }
  res.json({ success: true });
});

app.put('/api/master/dev-accounts/:username', async (req, res) => {
  const { username } = req.params;
  const accounts = await loadDevAccounts();
  const index = accounts.findIndex(a => a.username.toLowerCase() === username.toLowerCase());
  if (index !== -1) {
    accounts[index] = { ...accounts[index], ...req.body };
    const db = await getDb();
    if (db) {
      await db.collection('devAccounts').deleteMany({});
      await db.collection('devAccounts').insertMany(accounts);
    } else {
      fs.writeFileSync(DEV_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2));
    }
    res.json({ success: true });
  } else res.status(404).send();
});

app.delete('/api/master/dev-accounts/:username', async (req, res) => {
  const { username } = req.params;
  let accounts = await loadDevAccounts();
  accounts = accounts.filter(a => a.username.toLowerCase() !== username.toLowerCase());
  const db = await getDb();
  if (db) {
    await db.collection('devAccounts').deleteMany({});
    if (accounts.length > 0) await db.collection('devAccounts').insertMany(accounts);
  } else {
    fs.writeFileSync(DEV_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2));
  }
  res.json({ success: true });
});

// --- CORE APP ENDPOINTS ---
app.get('/api/employees', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json(data.employees.filter(e => e.tenantId === (req.tenantId || 'master')));
});

app.post('/api/employees', tenantGuard, async (req, res) => {
  const data = await loadData();
  const newEmp = { ...req.body, tenantId: req.tenantId || 'master' };
  data.employees.push(newEmp);
  await saveData(data);
  res.json(newEmp);
});

app.put('/api/employees/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const index = data.employees.findIndex(e => e.employeeId === id && e.tenantId === (req.tenantId || 'master'));
  if (index !== -1) {
    data.employees[index] = { ...data.employees[index], ...req.body };
    await saveData(data);
    res.json(data.employees[index]);
  } else res.status(404).send();
});

app.delete('/api/employees/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  data.employees = data.employees.filter(e => !(e.employeeId === id && e.tenantId === (req.tenantId || 'master')));
  await saveData(data);
  res.json({ success: true });
});

app.get('/api/departments', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json(data.departments.filter(d => d.tenantId === (req.tenantId || 'master')));
});

app.post('/api/departments', tenantGuard, async (req, res) => {
  const data = await loadData();
  const newDept = { ...req.body, tenantId: req.tenantId || 'master' };

  // Robustness check: Ensure departmentId exists
  if (!newDept.departmentId) {
    newDept.departmentId = newDept.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  }

  data.departments.push(newDept);
  await saveData(data);
  res.json(newDept);
});

app.put('/api/departments/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const index = data.departments.findIndex(d => d.departmentId === id && d.tenantId === (req.tenantId || 'master'));
  if (index !== -1) {
    data.departments[index] = { ...data.departments[index], ...req.body };
    await saveData(data);
    res.json(data.departments[index]);
  } else {
    res.status(404).json({ error: 'Department not found' });
  }
});

app.delete('/api/departments/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const initialCount = data.departments.length;
  data.departments = data.departments.filter(d => !(d.departmentId === id && d.tenantId === (req.tenantId || 'master')));
  if (data.departments.length < initialCount) {
    await saveData(data);
    res.json({ success: true });
  } else res.status(404).json({ error: 'Not found' });
});

app.get('/api/org-units', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json((data.orgUnits || []).filter(o => o.tenantId === (req.tenantId || 'master')));
});

app.post('/api/org-units', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.orgUnits) data.orgUnits = [];
  const newUnit = { ...req.body, tenantId: req.tenantId || 'master', orgUnitId: 'org-' + Date.now() };
  data.orgUnits.push(newUnit);
  await saveData(data);
  res.json(newUnit);
});

app.delete('/api/org-units/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  data.orgUnits = (data.orgUnits || []).filter(o => !(o.orgUnitId === id && o.tenantId === (req.tenantId || 'master')));
  await saveData(data);
  res.json({ success: true });
});

app.get('/api/position-titles', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json((data.positionTitles || []).filter(p => p.tenantId === (req.tenantId || 'master')));
});

app.post('/api/position-titles', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.positionTitles) data.positionTitles = [];
  const newTitle = { ...req.body, tenantId: req.tenantId || 'master', titleId: 'pt-' + Date.now() };
  data.positionTitles.push(newTitle);
  await saveData(data);
  res.json(newTitle);
});

app.delete('/api/position-titles/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  data.positionTitles = (data.positionTitles || []).filter(p => !(p.titleId === id && p.tenantId === (req.tenantId || 'master')));
  await saveData(data);
  res.json({ success: true });
});

app.get('/api/schedules', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json((data.schedules || []).filter(s => s.tenantId === (req.tenantId || 'master')));
});

app.post('/api/schedules', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.schedules) data.schedules = [];
  const newSched = { ...req.body, tenantId: req.tenantId || 'master', scheduleId: 'sch-' + Date.now() };
  data.schedules.push(newSched);
  await saveData(data);
  res.json(newSched);
});

app.delete('/api/schedules/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  data.schedules = (data.schedules || []).filter(s => !(s.scheduleId === id && s.tenantId === (req.tenantId || 'master')));
  await saveData(data);
  res.json({ success: true });
});

app.post('/api/schedule-assign', tenantGuard, async (req, res) => {
  const { employeeId, shift } = req.body;
  const data = await loadData();
  const emp = data.employees.find(e => e.employeeId === employeeId && e.tenantId === (req.tenantId || 'master'));
  if (emp) {
    emp.schedule = shift;
    await saveData(data);
    res.json({ success: true });
  } else res.status(404).send();
});

app.get('/api/assignments', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json((data.assignments || []).filter(a => a.tenantId === (req.tenantId || 'master')));
});

app.post('/api/assignments', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.assignments) data.assignments = [];
  const { employeeId, departmentId } = req.body;
  const tenantId = req.tenantId || 'master';

  // Find existing or add new
  const index = data.assignments.findIndex(a => a.employeeId === employeeId && a.tenantId === tenantId);
  if (index !== -1) {
    data.assignments[index].departmentId = departmentId;
  } else {
    data.assignments.push({ employeeId, departmentId, tenantId });
  }

  // Also update branchName in employee object for easier access
  const emp = data.employees.find(e => e.employeeId === employeeId && e.tenantId === tenantId);
  const dept = data.departments.find(d => d.departmentId === departmentId && d.tenantId === tenantId);
  if (emp && dept) emp.branchName = dept.name;

  await saveData(data);
  res.json({ success: true });
});

app.get('/api/logs', tenantGuard, async (req, res) => {
  const data = await loadData();
  res.json(data.logs.filter(l => l.tenantId === (req.tenantId || 'master')));
});

app.post('/api/logs', tenantGuard, async (req, res) => {
  const data = await loadData();
  const newLog = { ...req.body, tenantId: req.tenantId || 'master' };
  data.logs.push(newLog);
  await saveData(data);
  res.json(newLog);
});

app.get('/api/devices', tenantGuard, async (req, res) => {
  const data = await loadData();
  // Devices are employees with deviceId
  res.json(data.employees.filter(e => e.tenantId === (req.tenantId || 'master') && e.deviceId));
});

app.post('/api/device/reset', tenantGuard, async (req, res) => {
  const { employeeId } = req.body;
  const data = await loadData();
  const emp = data.employees.find(e => e.employeeId === employeeId && e.tenantId === (req.tenantId || 'master'));
  if (emp) {
    delete emp.deviceId;
    await saveData(data);
    res.json({ success: true });
  } else res.status(404).send();
});

// Mobile App Auth & Log
app.post('/api/mobile/login', async (req, res) => {
  const { tenantId, employeeId, deviceId } = req.body;
  const data = await loadData();

  const user = data.users.find(u => (u.tenantId || u.username || "").toLowerCase() === (tenantId || "").toLowerCase());
  if (!user) return res.status(404).json({ error: 'Company ID not found' });

  const targetTenantId = user.tenantId || user.username;
  const emp = data.employees.find(e =>
    (e.employeeId || "").toString().toLowerCase() === (employeeId || "").toString().toLowerCase() &&
    (e.tenantId || "").toLowerCase() === targetTenantId.toLowerCase()
  );

  if (!emp) return res.status(404).json({ error: 'Employee ID not found' });

  // Device Locking Logic
  if (emp.deviceId && emp.deviceId !== deviceId) {
    return res.status(403).json({ error: 'Device Mismatch: This account is locked to another device.' });
  }

  if (!emp.deviceId) {
    emp.deviceId = deviceId;
    await saveData(data);
  }

  // Find branch assignment
  const assign = (data.assignments || []).find(a => a.employeeId === emp.employeeId && a.tenantId === emp.tenantId);
  const branch = assign ? data.departments.find(d => d.departmentId === assign.departmentId) : null;

  res.json({
    success: true,
    tenantId: targetTenantId,
    employee: {
      employeeId: emp.employeeId,
      name: emp.name,
      tenantId: emp.tenantId,
      companyName: user.companyName,
      branch: branch || { name: 'Unassigned', radiusMeters: 50 }
    }
  });
});

// Alias for device register to match mobile app
app.post('/api/device/register', async (req, res) => {
  req.body.tenantId = req.headers['x-tenant-id'] || req.body.tenantId;
  return app._router.handle({ method: 'POST', url: '/api/mobile/login', body: req.body }, res);
});

app.post('/api/mobile/attendance', async (req, res) => {
  const { employeeId, tenantId, type, latitude, longitude, departmentName, status } = req.body;
  const data = await loadData();

  const emp = data.employees.find(e =>
    (e.employeeId || "").toString().toLowerCase() === (employeeId || "").toString().toLowerCase() &&
    (e.tenantId || "").toLowerCase() === (tenantId || "").toLowerCase()
  );
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const timestamp = new Date().toISOString();
  const today = new Date().toLocaleDateString();

  // Find existing log for today
  let log = data.logs.find(l => l.employeeId === employeeId && l.tenantId === tenantId && new Date(l.timestamp).toLocaleDateString() === today);

  if (!log) {
    log = {
      logId: 'log-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      tenantId,
      timestamp,
      departmentName,
      status: status || 'Pending',
      timeIn: type === 'IN' ? timestamp : null,
      timeOut: type === 'OUT' ? timestamp : null,
      locIn: type === 'IN' ? { lat: latitude, lon: longitude } : null,
      locOut: type === 'OUT' ? { lat: latitude, lon: longitude } : null
    };
    data.logs.push(log);
  } else {
    if (type === 'IN') {
      log.timeIn = timestamp;
      log.locIn = { lat: latitude, lon: longitude };
    } else {
      log.timeOut = timestamp;
      log.locOut = { lat: latitude, lon: longitude };
    }
    log.status = status || log.status;
  }

  await saveData(data);
  res.json({ success: true });
});

app.get('/api/app-version', (req, res) => {
  const verPath = path.join(__dirname, 'version.json');
  if (fs.existsSync(verPath)) res.json(JSON.parse(fs.readFileSync(verPath, 'utf8')));
  else res.json({ version: '1.0.0', changelog: 'Initial Release' });
});

// --- ADMIN SYSTEM UPDATES (OTA) ---
app.post('/api/master/update-system', async (req, res) => {
  const { version, changelog, forceUpdate } = req.body;
  const verPath = path.join(__dirname, 'version.json');
  const current = { version, changelog, forceUpdate, buildDate: new Date().toISOString() };
  fs.writeFileSync(verPath, JSON.stringify(current, null, 2), 'utf8');

  // Sync to Mobile Config
  const mobileConfigPath = path.join(__dirname, '../mobile-app/src/app_config.json');
  if (fs.existsSync(mobileConfigPath)) {
    try {
      const mobileConfig = JSON.parse(fs.readFileSync(mobileConfigPath, 'utf8'));
      mobileConfig.version = current.version;
      mobileConfig.buildDate = current.buildDate;
      fs.writeFileSync(mobileConfigPath, JSON.stringify(mobileConfig, null, 2), 'utf8');
      console.log(`[OTA] Synced version ${current.version} to mobile app source.`);
    } catch (e) {
      console.error(`[OTA] Failed to sync mobile config: ${e.message}`);
    }
  }

  console.log(`[OTA] System Updated to Version ${current.version}`);
  res.json({ success: true, newVersion: current.version });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/master/active-link', (req, res) => {
  const linkFile = path.join(__dirname, 'active_link.txt');
  if (fs.existsSync(linkFile)) res.send(fs.readFileSync(linkFile, 'utf8'));
  else res.status(404).send('No active link found');
});

// --- RESET UTILS FOR DEV ---
app.post('/api/master/clear-data', async (req, res) => {
  const { tenantId, target } = req.body; // target: 'logs', 'employees', 'departments'
  const data = await loadData();

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

  await saveData(data);
  res.json({ success: true, message: `${target} cleared ${isGlobal ? 'globally' : 'for ' + tenantId}` });
});


app.post('/api/users', async (req, res) => {
  const data = await loadData();
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
  await saveData(data);
  res.json(newUser);
});

app.delete('/api/users/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const data = await loadData();

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

    await saveData(data);
    console.log(`[MASTER] Global Cleanup: Deleted all records for tenant ${tenantId}`);
    res.json({ success: true, message: `Tenant ${tenantId} and all associated data deleted.` });
  } else {
    res.status(404).json({ error: 'Tenant not found.' });
  }
});

app.put('/api/users/:tenantId/permissions', async (req, res) => {
  const { tenantId } = req.params;
  const data = await loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    user.permissions = req.body.permissions;
    await saveData(data);
    res.json({ success: true });
  }
  else res.status(404).json({ error: 'Not found' });
});

app.put('/api/users/:tenantId/enddate', async (req, res) => {
  const { tenantId } = req.params;
  const { endDate } = req.body;
  const data = await loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    user.endDate = endDate;
    await saveData(data);
    res.json({ success: true, endDate });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.put('/api/users/:tenantId/network-lock', async (req, res) => {
  const { tenantId } = req.params;
  const { publicIp, adminIp } = req.body;
  const data = await loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    if (publicIp !== undefined) user.publicIp = publicIp;
    if (adminIp !== undefined) user.adminIp = adminIp;
    await saveData(data);
    res.json({ success: true, publicIp: user.publicIp, adminIp: user.adminIp });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/tenant-info/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const data = await loadData();
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());
  if (user) {
    // AUTO-INJECT NEW MODULES: Ensure every tenant has access to all global modules
    const currentPermissions = user.permissions || [];
    const updatedPermissions = Array.from(new Set([...ALL_MODULES, ...currentPermissions]));

    // Only return non-sensitive public info
    res.json({
      companyName: user.companyName,
      tenantId: user.tenantId || user.username,
      adminIp: user.adminIp,
      endDate: user.endDate,
      permissions: updatedPermissions
    });
  } else {
    res.status(404).json({ error: 'Tenant not found' });
  }
});

app.post('/api/master/build-apk', async (req, res) => {
  const { tenantId, companyName, publicUrl } = req.body;
  const ip = getNetworkIP();

  // Failsafe: Default to Render URL if no publicUrl provided
  const apiUrl = publicUrl || 'https://timeattendance-system.onrender.com/api';

  console.log(`[BUILD] Starting APK Build for ${companyName} (${tenantId})...`);
  console.log(`[BUILD] API URL: ${apiUrl}`);

  try {
    const mobileAppPath = path.join(__dirname, '../mobile-app');
    const sourceApk = path.join(mobileAppPath, 'android/app/build/outputs/apk/debug/app-debug.apk');

    // 0. Cleanup old build to ensure fresh APK
    if (fs.existsSync(sourceApk)) fs.unlinkSync(sourceApk);

    // 0.1 Versioning Logic (Pro Update System)
    const pkgPath = path.join(mobileAppPath, 'package.json');
    let currentVersion = '0.1.0';
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const vParts = pkg.version.split('.').map(Number);
      vParts[2]++; // Increment patch version (e.g., 0.1.0 -> 0.1.1)
      pkg.version = vParts.join('.');
      currentVersion = pkg.version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log(`[BUILD] Auto-incremented version to: ${currentVersion}`);
    }

    // 1. Update app_config.json
    const configPath = path.join(mobileAppPath, 'src/app_config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      defaultApiUrl: apiUrl,
      defaultTenantId: tenantId,
      version: currentVersion,
      buildDate: new Date().toISOString()
    }, null, 2));

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
    const destName = `${safeFileName}_Time_Attendance.apk`;
    const destPath = path.join(apksDir, destName);

    if (fs.existsSync(sourceApk)) {
      fs.copyFileSync(sourceApk, destPath);
      // Create a Master copy for GitHub Distribution
      fs.copyFileSync(sourceApk, path.join(apksDir, 'TimeKey_Master.apk'));

      console.log(`[BUILD] SUCCESS: Generated ${destName} and updated TimeKey_Master.apk`);

      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['host'];

      // GITHUB DISTRIBUTION LOGIC
      const GITHUB_PAGES_URL = "https://bosslouie5.github.io/TimeAttendance-System";

      // If in production mode, point download URL to GitHub
      let finalDownloadUrl = `${protocol}://${host}/api/master/download-apk/${destName}`;
      if (!isTestMode) {
          finalDownloadUrl = `${GITHUB_PAGES_URL}/apks/${destName}`;
      }

      // Update version info based on mode (Isolated Lab vs Production)
      const versionFileName = isTestMode ? 'latest-version-test.json' : 'latest-version.json';
      const latestVersionPath = path.join(apksDir, versionFileName);

      const updateInfo = {
        version: currentVersion,
        downloadUrl: finalDownloadUrl,
        tenantId: tenantId,
        companyName: companyName,
        releaseDate: new Date().toISOString(),
        notes: isTestMode ? `LAB TEST: ${companyName}` : `System update for ${companyName}`
      };
      fs.writeFileSync(latestVersionPath, JSON.stringify(updateInfo, null, 2));
      console.log(`[BUILD] Updated ${versionFileName} for broadcasting.`);

      res.json({ success: true, downloadUrl: finalDownloadUrl, file: destName, version: currentVersion });
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
app.post('/api/master/build-and-run-apk', async (req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.ip.replace('::ffff:', '');
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

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
app.get('/api/master/apks', async (req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.ip.replace('::ffff:', '');
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

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

app.get('/api/settings', async (req, res) => res.json({ currentSystemIp: getNetworkIP(), currentSystemGateway: '10.222.166.1' }));

app.use('/dev', express.static(webDevDist));
app.get('/dev/*', (req, res) => res.sendFile(path.join(webDevDist, 'index.html')));

// --- MOBILE APP SERVICE ---
app.use('/app', express.static(mobileDist));
app.get('/app/*', (req, res) => res.sendFile(path.join(mobileDist, 'index.html')));

app.use('/', express.static(webAdminDist));
app.get('/*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/apks')) return;

  // FAILSAFE: Check if file exists before sending, otherwise send simple landing page or 404
  const targetFile = path.join(webAdminDist, 'index.html');
  if (fs.existsSync(targetFile)) {
    res.sendFile(targetFile);
  } else {
    res.status(404).send(`
      <div style="font-family:sans-serif; text-align:center; padding-top:100px; background:#0f172a; color:white; min-height:100vh;">
        <h1 style="color:#3b82f6;">TIMEKEY SaaS HUB</h1>
        <p>System is online, but static UI builds are not yet deployed to this server.</p>
        <p>Please use the local Dev Control Center to sync UI files.</p>
        <div style="margin-top:20px; font-size:0.8rem; color:#64748b;">Cloud Node Version: ${process.version}</div>
      </div>
    `);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `SYSTEM LIVE: http://localhost:${PORT}`);
  console.log(`Status: Ready for Local or Public connections.`);

  // Start Tunnel Monitoring for SaaS Self-Healing (Disabled in Test Mode)
  if (!isTestMode) {
    startTunnelMonitor();
  } else {
    console.log(`[HUB] Test Mode: SaaS Self-Healing disabled.`);
  }
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
          // Disabled auto-open for production stability unless manually triggered

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

            const data = await loadData();
            data.users.forEach(u => {
              if (u.adminIp || u.publicIp) {
                contentString += `- ${u.companyName}: http://${u.adminIp || u.publicIp}:${PORT}/portal/${u.tenantId || u.username}\n`;
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
