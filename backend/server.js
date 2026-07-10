const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');
const { validateDeviceBinding } = require('./deviceBinding');

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
  let data = { settings: {}, users: [], employees: [], departments: [], logs: [], orgUnits: [], assignments: [], positionTitles: [], schedules: [], leaves: [], announcements: [], notifications: [] };

  if (db) {
    const collections = ['users', 'employees', 'departments', 'logs', 'orgUnits', 'assignments', 'positionTitles', 'schedules', 'leaves', 'announcements'];
    for (const col of collections) {
      try { data[col] = await db.collection(col).find({}).toArray(); } catch (e) { data[col] = []; }
    }
  } else if (fs.existsSync(DB_PATH)) {
    try {
      const local = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      data = { ...data, ...local };
    } catch (e) { }
  }

  // --- AUTO-MIGRATION & RULE 7: STRICT ISOLATION PREP ---
  let needsFix = false;

  // 1. Ensure all departments have a departmentId
  data.departments = (data.departments || []).map(d => {
    if (!d.departmentId) {
      d.departmentId = (d.name || 'branch').toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() + Math.random().toString(36).substr(2, 5);
      needsFix = true;
    }
    return d;
  });

  // 2. RULE 7: Automatic Module Injection for all users (Respect per-tenant overrides)
  // If a tenant already has an explicit permissions array (even if reduced),
  // we must respect it so toggles can disable modules. Only seed default
  // permissions when none are present.
  data.users = (data.users || []).map(u => {
    const currentPerms = u.permissions || [];
    if (!currentPerms || currentPerms.length === 0) {
      u.permissions = Array.from(ALL_MODULES);
      needsFix = true;
    }
    return u;
  });

  if (needsFix) {
    console.log(`\x1b[33m[SYSTEM] Auto-Syncing Rules & Permissions...\x1b[0m`);
    await saveData(data);
  }

  return data;
}

async function saveData(data) {
  const db = await getDb();
  if (db) {
    const collections = ['users', 'employees', 'departments', 'logs', 'orgUnits', 'assignments', 'positionTitles', 'schedules', 'leaves', 'announcements'];
    for (const col of collections) {
      if (data[col]) {
        await db.collection(col).deleteMany({});
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
  const tid = (req.headers['x-tenant-id'] || req.query.tenantId || req.query.tenant || req.params.tenantId || '').toString().trim();
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

    // Pro Developer Bypass: Master accounts are never IP-locked
    const isMasterDev = devAccounts.some(a => a.username.toLowerCase() === username.toLowerCase());
    const isDevBypass = req.body.devMode === true || req.query.devMode === 'true' || isMasterDev;

    if (!isLocal && !isTestMode && !isDevBypass && allowedIp && !matchIp(clientIp, allowedIp)) {
       console.warn(`[AUTH] Login Blocked: Unauthorized IP ${clientIp} for Tenant ${tenantId}`);
       return res.status(403).json({
         error: 'Access Denied: Network Lock Active',
         message: 'Ang iyong IP (' + clientIp + ') ay hindi rehistrado sa office network ng ' + user.companyName + '.',
         code: 'IP_BLOCKED',
         detectedIp: clientIp
       });
    }

    const finalTenantId = user.tenantId || user.username;
    console.log(`[AUTH] Login success: ${username} (Tenant: ${finalTenantId})`);

    // Respect stored tenant permissions on login. If none exist, fall back
    // to the full default set so new tenants get full access by default.
    const currentPermissions = user.permissions || [];
    const permissionsToReturn = (currentPermissions && currentPermissions.length > 0) ? currentPermissions : ALL_MODULES;

    res.json({ success: true, user: { ...user, tenantId: finalTenantId, permissions: permissionsToReturn, employeeId: user.employeeId || null } });
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
  const { employeeId } = req.query;
  const tenantId = req.tenantId || 'master';

  let filtered = data.departments.filter(d => d.tenantId === tenantId);

  // RULE: If employeeId is provided (from Mobile App), filter by assignment only
  if (employeeId) {
    const assigns = (data.assignments || []).filter(a =>
      (a.employeeId || "").toString().toLowerCase() === employeeId.toString().toLowerCase() &&
      (a.tenantId || "").toLowerCase() === tenantId.toLowerCase()
    );

    if (assigns.length > 0) {
      const deptIds = assigns.map(a => a.departmentId);
      filtered = filtered.filter(d => deptIds.includes(d.departmentId));
    } else {
      // If no assignment, return empty list to prevent unauthorized access to other branches
      filtered = [];
    }
  }

  res.json(filtered);
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
  const newId = `${Date.now()}`;
  const newUnit = { ...req.body, tenantId: req.tenantId || 'master', id: newId, orgUnitId: newId };
  data.orgUnits.push(newUnit);
  await saveData(data);
  res.json(newUnit);
});

app.put('/api/org-units/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const index = (data.orgUnits || []).findIndex(o =>
    (o.orgUnitId === id || o.id === id) && o.tenantId === (req.tenantId || 'master')
  );
  if (index === -1) {
    return res.status(404).json({ error: 'Org unit not found' });
  }
  data.orgUnits[index] = { ...data.orgUnits[index], ...req.body };
  await saveData(data);
  res.json(data.orgUnits[index]);
});

app.delete('/api/org-units/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  data.orgUnits = (data.orgUnits || []).filter(o =>
    !((o.orgUnitId === id || o.id === id) && o.tenantId === (req.tenantId || 'master'))
  );
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

app.put('/api/position-titles/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  let updated = null;
  data.positionTitles = (data.positionTitles || []).map(p => {
    const pid = p.titleId || p.id;
    if (pid === id && p.tenantId === (req.tenantId || 'master')) {
      updated = { ...p, ...req.body };
      return updated;
    }
    return p;
  });
  if (updated) {
    await saveData(data);
    res.json(updated);
  } else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/position-titles/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  data.positionTitles = (data.positionTitles || []).filter(p => !((p.titleId === id || p.id === id) && p.tenantId === (req.tenantId || 'master')));
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
  const tenantId = req.tenantId || 'master';
  const { employeeId } = req.body;

  // Accept either a single departmentId or an array of departmentIds
  let departmentIds = [];
  if (Array.isArray(req.body.departmentIds)) departmentIds = req.body.departmentIds;
  else if (req.body.departmentId) departmentIds = [req.body.departmentId];

  // Remove existing assignments for this employee (for this tenant)
  data.assignments = (data.assignments || []).filter(a => !(a.employeeId === employeeId && a.tenantId === tenantId));

  // Add new assignments
  departmentIds.forEach(did => {
    data.assignments.push({ employeeId, departmentId: did, tenantId });
  });

  // Update employee.branchName to include all assigned branch names (comma-separated)
  const emp = data.employees.find(e => e.employeeId === employeeId && e.tenantId === tenantId);
  if (emp) {
    const names = (departmentIds || []).map(did => {
      const dep = data.departments.find(d => d.departmentId === did && d.tenantId === tenantId);
      return dep ? dep.name : null;
    }).filter(Boolean);
    emp.branchName = names.length === 0 ? '' : names.join(', ');
  }

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
  // Devices are employees with registeredDeviceId
  res.json(data.employees.filter(e => e.tenantId === (req.tenantId || 'master') && (e.registeredDeviceId || e.deviceId)));
});

// --- HR Leaves API ---
app.get('/api/hr/leaves', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId || req.query.tenant || 'master';
  const { employeeId } = req.query;

  let filtered = (data.leaves || []).filter(l => (tenantId === 'master' || !tenantId) ? true : (l.tenantId === tenantId));

  if (employeeId) {
    filtered = filtered.filter(l => (l.employeeId || "").toString() === employeeId.toString());
  }

  res.json(filtered);
});

app.post('/api/hr/leaves', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.leaves) data.leaves = [];
  const tenantId = req.tenantId || req.body.tenantId || 'master';

  // Logic: If no reportsTo, default to HR Management and skip Manager step
  const reportsTo = req.body.reportsTo || req.body.manager || '';
  const isDirectToHR = !reportsTo || reportsTo === 'HR Management';

  const newLeave = {
    ...req.body,
    id: `leave-${Date.now()}`,
    status: isDirectToHR ? 'Pending (Admin)' : (req.body.status || 'Pending (Manager)'),
    tenantId,
    reportsTo: isDirectToHR ? 'HR Management' : reportsTo,
    createdAt: new Date().toISOString()
  };
  data.leaves.push(newLeave);
  await saveData(data);
  res.json(newLeave);
});

app.put('/api/hr/leaves/:id/status', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const { status, approvedBy } = req.body;
  const data = await loadData();
  let updated = null;
  data.leaves = (data.leaves || []).map(l => {
    if (l.id === id && l.tenantId === (req.tenantId || l.tenantId || 'master')) {
      updated = {
        ...l,
        status,
        approvedBy: approvedBy || l.approvedBy || 'admin',
        updatedAt: new Date().toISOString()
      };
      return updated;
    }
    return l;
  });
  if (updated) {
    // Create notifications for employee and tenant admins
    try {
      if (!data.notifications) data.notifications = [];
      const tenantId = req.tenantId || updated.tenantId || 'master';
      const empNote = {
        id: `note-${Date.now()}-emp`,
        tenantId,
        title: `Leave ${updated.status}`,
        message: `Your leave request (${updated.type}) has been ${updated.status}.`,
        type: updated.status === 'Approved' ? 'success' : (updated.status === 'Rejected' ? 'warning' : 'info'),
        targetEmployeeId: updated.employeeId,
        createdAt: new Date().toISOString()
      };
      data.notifications.unshift(empNote);

      const mgrNote = {
        id: `note-${Date.now()}-mgr`,
        tenantId,
        title: `Leave ${updated.status}: ${updated.employeeName}`,
        message: `${updated.employeeName} (${updated.employeeId}) leave request has been ${updated.status} by ${managerName || managerId}.`,
        type: 'info',
        targetEmployeeId: managerId || '',
        createdAt: new Date().toISOString()
      };
      data.notifications.unshift(mgrNote);
      // persist trimmed list
      data.notifications = data.notifications.slice(0, 500);
    } catch (e) { console.error('Notification error', e.message); }

    await saveData(data);
    res.json(updated);
  } else res.status(404).json({ error: 'Leave not found' });
});

// Get leaves for approval (subordinates' leave requests for this manager)
app.get('/api/hr/leaves/for-approval/:employeeId', tenantGuard, async (req, res) => {
  const { employeeId } = req.params;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  
  // Find all employees who report to this manager
  const subordinates = (data.employees || []).filter(e => 
    e.reportsTo === employeeId && e.tenantId === tenantId
  );
  
  // Get leaves from subordinates that need approval
  const subordinateIds = subordinates.map(s => s.employeeId);
  const leavesForApproval = (data.leaves || []).filter(l => 
    subordinateIds.includes(l.employeeId) && 
    l.tenantId === tenantId &&
    (l.status === 'Pending' || l.status === 'Pending (Manager)')
  );
  
  res.json(leavesForApproval);
});

// Get subordinates for a specific employee (manager)
app.get('/api/employees/subordinates/:employeeId', tenantGuard, async (req, res) => {
  const { employeeId } = req.params;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  
  const subordinates = (data.employees || []).filter(e => 
    e.reportsTo === employeeId && e.tenantId === tenantId
  );
  
  res.json(subordinates);
});

// Manager approval of leave request
app.put('/api/hr/leaves/:id/manager-approve', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const { status, managerId, managerName } = req.body;
  const data = await loadData();
  let updated = null;
  
  data.leaves = (data.leaves || []).map(l => {
    if (l.id === id && l.tenantId === (req.tenantId || l.tenantId || 'master')) {
      const newStatus = status === 'Approved' ? 'Pending (Admin)' : status;
      updated = {
        ...l,
        status: newStatus,
        approvedByManager: managerName || managerId || 'manager',
        managerId: managerId || '',
        managerApprovedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return updated;
    }
    return l;
  });
  
  if (updated) {
    await saveData(data);
    res.json(updated);
  } else res.status(404).json({ error: 'Leave not found' });
});

// Notifications API (simple tenant-scoped notifications)
app.get('/api/hr/notifications', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId || req.query.tenant || 'master';
  const filtered = (data.notifications || []).filter(n => (tenantId === 'master' || !tenantId) ? true : (n.tenantId === tenantId));
  res.json(filtered);
});

app.post('/api/hr/notifications', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.notifications) data.notifications = [];
  const tenantId = req.tenantId || req.body.tenantId || 'master';
  const newNote = { id: `note-${Date.now()}`, tenantId, title: req.body.title || '', message: req.body.message || '', type: req.body.type || 'info', createdAt: new Date().toISOString(), targetEmployeeId: req.body.targetEmployeeId || '' };
  data.notifications.unshift(newNote);
  // Keep notifications length reasonable
  data.notifications = data.notifications.slice(0, 200);
  await saveData(data);
  res.json(newNote);
});

app.get('/api/hr/announcements', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId || req.query.tenant || 'master';
  const filtered = (data.announcements || []).filter(a => (tenantId === 'master' || !tenantId) ? true : (a.tenantId === tenantId));
  res.json(filtered);
});

app.post('/api/hr/announcements', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.announcements) data.announcements = [];
  const tenantId = req.tenantId || req.body.tenantId || 'master';
  const newAnnouncement = { ...req.body, id: `announcement-${Date.now()}`, tenantId, createdAt: new Date().toISOString() };
  data.announcements.push(newAnnouncement);
  await saveData(data);
  res.json(newAnnouncement);
});

app.get('/api/tenant-users', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  const users = (data.users || []).filter(u => (u.tenantId || u.username) === tenantId);
  res.json(users);
});

app.post('/api/tenant-users', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  const existingTenant = data.users.find(u => (u.tenantId || u.username) === tenantId);
  if (!existingTenant) return res.status(404).json({ error: 'Tenant not found' });

  const username = (req.body.username || '').trim();
  const password = req.body.password;
  const displayName = (req.body.displayName || '').trim();
  const employeeId = (req.body.employeeId || '').trim();

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Username, password, and display name are required.' });
  }

  const usernameExists = data.users.some(u => u.username.toLowerCase() === username.toLowerCase() && (u.tenantId || u.username) === tenantId);
  if (usernameExists) {
    return res.status(400).json({ error: 'A user with that username already exists for this tenant.' });
  }

  const newUser = {
    username,
    password,
    displayName,
    tenantId,
    employeeId,
    companyName: existingTenant.companyName,
    permissions: Array.isArray(req.body.permissions) && req.body.permissions.length > 0 ? req.body.permissions : existingTenant.permissions || ALL_MODULES,
    adminIp: existingTenant.adminIp,
    publicIp: existingTenant.publicIp,
    portalUrl: existingTenant.portalUrl || `http://${getNetworkIP()}:${PORT}/portal/${tenantId}`
  };

  data.users.push(newUser);
  await saveData(data);
  res.json(newUser);
});

app.put('/api/tenant-users/:username', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  const username = req.params.username;

  const userIndex = data.users.findIndex(u =>
    u.username.toLowerCase() === username.toLowerCase() &&
    (u.tenantId || u.username) === tenantId
  );

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found for this tenant.' });
  }

  const { password, displayName, employeeId } = req.body;

  if (password) {
    data.users[userIndex].password = password;
  }

  if (displayName) {
    data.users[userIndex].displayName = displayName.trim();
  }

  if (employeeId !== undefined) {
    data.users[userIndex].employeeId = employeeId.trim();
  }

  await saveData(data);
  res.json(data.users[userIndex]);
});

app.post('/api/device/reset', tenantGuard, async (req, res) => {
  const { employeeId } = req.body;
  const data = await loadData();
  const emp = data.employees.find(e => e.employeeId === employeeId && e.tenantId === (req.tenantId || 'master'));
  if (emp) {
    delete emp.deviceId;
    delete emp.registeredDeviceId;
    delete emp.registeredDeviceName;
    delete emp.registrationDate;
    await saveData(data);
    res.json({ success: true });
  } else res.status(404).send();
});

// Mobile App Auth & Log
app.post('/api/mobile/login', async (req, res) => {
  const { tenantId, employeeId, deviceId, deviceName } = req.body;
  const data = await loadData();

  const user = data.users.find(u => (u.tenantId || u.username || "").toLowerCase() === (tenantId || "").toLowerCase());
  if (!user) return res.status(404).json({ error: 'Company ID not found' });

  const targetTenantId = user.tenantId || user.username;
  const emp = data.employees.find(e =>
    (e.employeeId || "").toString().toLowerCase() === (employeeId || "").toString().toLowerCase() &&
    (e.tenantId || "").toLowerCase() === targetTenantId.toLowerCase()
  );

  if (!emp) return res.status(404).json({ error: 'Employee ID not found' });

  // Device Locking Logic (Pro Security)
  const bindingResult = validateDeviceBinding({
    employee: emp,
    deviceId,
    employees: data.employees,
    tenantId: targetTenantId
  });

  if (!bindingResult.allowed) {
    return res.status(403).json({ error: bindingResult.reason || 'Device Mismatch: This account is locked to another device.' });
  }

  const currentDeviceId = emp.registeredDeviceId || emp.deviceId;
  if (!currentDeviceId) {
    emp.registeredDeviceId = deviceId;
    emp.registeredDeviceName = deviceName || 'Mobile Device';
    emp.registrationDate = new Date().toISOString();
    await saveData(data);
  }

  // Find all branch assignments for this employee
  const assigns = (data.assignments || []).filter(a => a.employeeId === emp.employeeId && a.tenantId === emp.tenantId);
  const branches = assigns.map(a => data.departments.find(d => d.departmentId === a.departmentId)).filter(Boolean);

  res.json({
    success: true,
    tenantId: targetTenantId,
    employee: {
      employeeId: emp.employeeId,
      name: emp.name,
      tenantId: emp.tenantId,
      companyName: user.companyName,
      branches: branches.length > 0 ? branches : [{ name: 'Unassigned', radiusMeters: 50 }]
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
    // --- STRICT LOCK LOGIC (Tropa Rule #3) ---
    if (type === 'IN' && log.timeIn) {
      return res.status(400).json({ error: 'ALREADY_IN', message: 'Mayroon ka nang recorded Time In ngayong araw.' });
    }
    if (type === 'OUT' && log.timeOut) {
      return res.status(400).json({ error: 'ALREADY_OUT', message: 'Mayroon ka nang recorded Time Out ngayong araw.' });
    }

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
  const latestVersionPath = path.join(apksDir, isTestMode ? 'latest-version-test.json' : 'latest-version.json');

  // Any version format allowed - no regex restrictions
  let payload = { version: brand.version || '1.0.0', changelog: 'System is running normally.' };

  if (fs.existsSync(verPath)) {
    try {
      const verData = JSON.parse(fs.readFileSync(verPath, 'utf8'));
      payload = { ...payload, ...verData };
    } catch (e) {
      console.warn('[OTA] Failed to parse version.json', e.message);
    }
  }

  if (fs.existsSync(latestVersionPath)) {
    try {
      const latest = JSON.parse(fs.readFileSync(latestVersionPath, 'utf8'));
      // RULE: Prioritize latest-version.json for version and versionCode as it represents the actual available APK
      payload = {
        ...payload,
        ...latest,
        apkVersion: latest.version,
        apkUrl: latest.downloadUrl || payload.apkUrl || `/api/master/download-apk/TimeKey_Master.apk`,
        downloadUrl: latest.downloadUrl || payload.downloadUrl || payload.apkUrl || `/api/master/download-apk/TimeKey_Master.apk`,
        changelog: latest.notes || payload.changelog || 'System update available.'
      };
    } catch (e) {
      console.warn('[OTA] Failed to parse latest version metadata', e.message);
    }
  }

  if (!payload.apkUrl && payload.downloadUrl) payload.apkUrl = payload.downloadUrl;
  if (!payload.downloadUrl && payload.apkUrl) payload.downloadUrl = payload.apkUrl;
  if (!payload.apkUrl && !payload.downloadUrl) payload.apkUrl = '/api/master/download-apk/TimeKey_Master.apk';

  res.json(payload);
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

app.put('/api/tenant-users/:username', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  const username = req.params.username;

  const userIndex = data.users.findIndex(u =>
    u.username.toLowerCase() === username.toLowerCase() &&
    (u.tenantId || u.username) === tenantId
  );

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found for this tenant.' });
  }

  const { password, displayName, employeeId } = req.body;

  if (password) {
    data.users[userIndex].password = password;
  }

  if (displayName) {
    data.users[userIndex].displayName = displayName.trim();
  }

  if (employeeId !== undefined) {
    data.users[userIndex].employeeId = employeeId.trim();
  }

  await saveData(data);
  res.json(data.users[userIndex]);
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
    const perms = req.body.permissions;
    console.log(`[PERMS] Update request for tenant ${tenantId}:`, perms);
    if (!Array.isArray(perms)) {
      console.warn(`[PERMS] Invalid permissions payload for ${tenantId}`);
      return res.status(400).json({ error: 'Invalid permissions' });
    }
    user.permissions = perms;
    await saveData(data);
    console.log(`[PERMS] Permissions for ${tenantId} updated and saved.`);
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
    // Respect stored tenant permissions. If tenant has no explicit permissions
    // configured, fall back to the default global modules.
    const currentPermissions = user.permissions || [];
    const permissionsToReturn = (currentPermissions && currentPermissions.length > 0) ? currentPermissions : ALL_MODULES;

    // Only return non-sensitive public info
    res.json({
      companyName: user.companyName,
      tenantId: user.tenantId || user.username,
      adminIp: user.adminIp,
      endDate: user.endDate,
      permissions: permissionsToReturn
    });
  } else {
    res.status(404).json({ error: 'Tenant not found.' });
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
    const sourceApk = path.join(mobileAppPath, 'android/app/build/outputs/apk/release/app-release.apk');

    // 0. Cleanup old build to ensure fresh APK
    if (fs.existsSync(sourceApk)) fs.unlinkSync(sourceApk);

    // 0.1 Versioning Logic (Pro Update System)
    const pkgPath = path.join(mobileAppPath, 'package.json');
    const gradlePath = path.join(mobileAppPath, 'android/app/build.gradle');
    let currentVersion = '1.0.0';
    let newVersionCode = 1;

    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const vParts = (pkg.version || '1.0.0').split('.').map(Number);
      vParts[2]++; // Increment patch version
      currentVersion = vParts.join('.');
      pkg.version = currentVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log(`[BUILD] Auto-incremented version to: ${currentVersion}`);
    }

    if (fs.existsSync(gradlePath)) {
      let gradleContent = fs.readFileSync(gradlePath, 'utf8');

      // Update versionCode
      gradleContent = gradleContent.replace(/versionCode (\d+)/, (match, v) => {
        newVersionCode = parseInt(v) + 1;
        return `versionCode ${newVersionCode}`;
      });

      // Update versionName to match package.json
      gradleContent = gradleContent.replace(/versionName ".*?"/, `versionName "${currentVersion}"`);

      fs.writeFileSync(gradlePath, gradleContent);
      console.log(`[BUILD] Gradle versionCode bumped to ${newVersionCode}, versionName to ${currentVersion}.`);
    }

    // 1. Update app_config.json & Sync version.json
    const configPath = path.join(mobileAppPath, 'src/app_config.json');
    const verPath = path.join(__dirname, 'version.json');

    // Read existing config to preserve other settings if any
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try { existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
    }

    const updatePayload = {
      ...existingConfig,
      defaultApiUrl: apiUrl,
      defaultTenantId: tenantId,
      version: currentVersion,
      versionCode: newVersionCode,
      buildDate: new Date().toISOString()
    };

    fs.writeFileSync(configPath, JSON.stringify(updatePayload, null, 2));
    fs.writeFileSync(verPath, JSON.stringify({ version: currentVersion, versionCode: newVersionCode, buildDate: updatePayload.buildDate }, null, 2));
    console.log(`[BUILD] Synced app_config.json and version.json to ${currentVersion} (${newVersionCode})`);

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

  // Resolve absolute API URL for Mobile Device
  let apiUrl = publicUrl;
  if (!apiUrl || apiUrl === '/api') {
      apiUrl = isTestMode ? `http://localhost:4002/api` : `http://${ip}:4001/api`;
  }

  try {
    const mobileAppPath = path.join(__dirname, '../mobile-app');

    // Update app config while preserving existing fields (like version)
    const configPath = path.join(mobileAppPath, 'src/app_config.json');
    let currentConfig = { version: "1.0.0" };
    if (fs.existsSync(configPath)) {
        try { currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}
    }

    const newConfig = {
        ...currentConfig,
        defaultApiUrl: apiUrl,
        defaultTenantId: tenantId
    };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

    const stringsPath = path.join(mobileAppPath, 'android/app/src/main/res/values/strings.xml');
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
    execSync('npm run build && npx cap sync android && cd android && gradlew.bat assembleRelease', { cwd: path.join(__dirname, '../mobile-app'), shell: true });
    const sourceApk = path.join(__dirname, '../mobile-app/android/app/build/outputs/apk/release/app-release.apk');

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
