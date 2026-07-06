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
  if (db) {
    const collections = ['users', 'employees', 'departments', 'logs', 'orgUnits', 'assignments', 'positionTitles', 'schedules'];
    const data = { settings: {} };
    for (const col of collections) {
      data[col] = await db.collection(col).find({}).toArray();
    }
    return data;
  }

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
    if (accounts.length > 0) return accounts.map(({ _id, ...acc }) => acc);

    // Seed DB with standard ninja accounts if empty
    let seed = [
      { username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' },
      { username: 'dev', password: 'dev', displayName: 'Developer' },
      { username: 'dev1', password: 'dev1', displayName: 'Developer 1' }
    ];

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
  }

  if (!fs.existsSync(DEV_ACCOUNTS_PATH)) return [{ username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' }];
  try { return JSON.parse(fs.readFileSync(DEV_ACCOUNTS_PATH, 'utf8')); }
  catch (e) { return [{ username: 'john cruz', password: 'Louiecruz23', displayName: 'Admin John' }]; }
}

async function saveDevAccounts(accounts) {
  const db = await getDb();
  if (db) {
    await db.collection('devAccounts').deleteMany({});
    if (accounts.length > 0) await db.collection('devAccounts').insertMany(accounts);
    return;
  }
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

// Global IP Matcher (with Wildcard Support)
const matchIp = (clientIp, allowedIp) => {
  if (!allowedIp || allowedIp === '*' || allowedIp === '0.0.0.0') return true;

  // Support wildcards like 112.198.*.*
  const pattern = allowedIp.replace(/\*/g, '.*');
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(clientIp) || clientIp === allowedIp;
};

const tenantGuard = async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;

  req.tenantId = tenantId;
  next();
};

// --- PORTAL SECURITY ---
app.use('/portal/:tenantId', async (req, res, next) => {
  const { tenantId } = req.params;
  const data = await loadData();

  // Find user by tenantId instead of username
  const user = data.users.find(u => (u.tenantId || u.username).toLowerCase() === tenantId.toLowerCase());

  if (!user) return res.status(404).send('<h1>Portal Not Found</h1>');

  // --- UNIQUE IP HOST BINDING ---
  // If the tenant has a Virtual Host IP (adminIp) assigned, we verify it here
  // Note: This is a "Soft Lock" to ensure they use their designated portal address
  const host = req.headers.host || '';
  if (user.adminIp && user.adminIp !== '127.0.0.1' && !host.includes(user.adminIp) && !isTestMode && !host.includes('localhost')) {
     console.log(`[SECURITY] Tenant ${tenantId} accessed via wrong host: ${host}. Expected: ${user.adminIp}`);
     // We allow it for now but log it, or we could redirect them to the correct IP
  }

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

  let clientIp = req.headers['x-forwarded-for'] || req.ip.replace('::ffff:', '');
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.');

  // Master/Developer Bypass: allow access if local, in test mode, or via devMode bypass
  const isDevBypass = req.query.devMode === 'true' || req.headers.referer?.includes('devMode=true');
  if (isLocal || isTestMode || isDevBypass) return next();

  // WORLDWIDE IP GATEKEEPER WITH WILDCARD SUPPORT
  const allowedIp = user.publicIp || user.adminIp;
  if (allowedIp && !matchIp(clientIp, allowedIp)) {
    return res.status(403).send(`
      <div style="font-family:sans-serif; text-align:center; padding-top:100px; background:#0f172a; color:white; min-height:100vh;">
        <h1 style="color:#f59e0b;">🚫 ACCESS RESTRICTED</h1>
        <p>This portal is locked to the official office network.</p>
        <p>Your current IP: <b>${clientIp}</b> does not match the registered office IP (<b>${allowedIp}</b>).</p>
        <div style="margin-top:20px; font-size:0.8rem; color:#64748b;">Global Security Gatekeeper v6.5</div>
      </div>
    `);
  }

  next();
});

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
  data.users[userIndex].adminIp = '';

  await saveData(data);

  res.send(`
    <div style="font-family:sans-serif; text-align:center; padding-top:100px; background:#0f172a; color:white; min-height:100vh; padding-left:20px; padding-right:20px;">
      <div style="font-size:4rem; margin-bottom:20px; animation: bounce 2s infinite;">✅</div>
      <h1 style="color:#10b981; font-size:2rem; margin-bottom:10px;">SYSTEM ACTIVATED</h1>
      <p style="color:#94a3b8; font-size:1.1rem; margin-bottom:30px;">Company: <b style="color:white;">${data.users[userIndex].companyName}</b></p>

      <div style="background:rgba(255,255,255,0.05); padding:30px; border-radius:20px; border:1px solid #334155; display:inline-block; max-width:400px; width:100%;">
         <div style="color:#f59e0b; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Registered Office Network</div>
         <div style="font-size:1.8rem; font-weight:bold; color:#06b6d4; margin-bottom:20px; font-family:monospace;">${clientIp}</div>
         <div style="height:1px; background:#334155; margin-bottom:20px;"></div>
         <p style="margin:0; font-size:0.85rem; color:#64748b; line-height:1.5;">
           This portal is now locked to this IP. You can access your web portal using the unique host link below.
         </p>
      </div>

      <div style="margin-top:40px;">
        <a href="/portal/${tenantId}" style="text-decoration:none; background:#8b5cf6; color:white; padding:15px 40px; border-radius:12px; font-weight:bold; display:inline-block; transition:0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          Launch Admin Portal
        </a>
      </div>

      <style>
        @keyframes bounce { 0%, 20%, 50%, 80%, 100% {transform: translateY(0);} 40% {transform: translateY(-20px);} 60% {transform: translateY(-10px);} }
        body { margin: 0; }
      </style>
    </div>
  `);
});

app.get('/api/master/dev-accounts', async (req, res) => res.json(await loadDevAccounts()));

app.post('/api/master/dev-accounts', async (req, res) => {
  const accounts = await loadDevAccounts();
  if (accounts.find(a => a.username.toLowerCase() === req.body.username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  accounts.push(req.body);
  await saveDevAccounts(accounts);
  res.json({ success: true });
});

app.put('/api/master/dev-accounts/:username', async (req, res) => {
  const { username } = req.params;
  const accounts = await loadDevAccounts();
  const index = accounts.findIndex(a => a.username.toLowerCase() === username.toLowerCase());
  if (index !== -1) {
    accounts[index] = { ...accounts[index], ...req.body };
    await saveDevAccounts(accounts);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

app.delete('/api/master/dev-accounts/:username', async (req, res) => {
  const { username } = req.params;
  let accounts = await loadDevAccounts();
  if (accounts.length <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  accounts = accounts.filter(a => a.username.toLowerCase() !== username.toLowerCase());
  await saveDevAccounts(accounts);
  res.json({ success: true });
});

// --- AUTO-UPDATE SYSTEM (PRO OTA) ---
const VERSION_FILE = path.join(__dirname, 'version.json');

app.get('/api/app-version', (req, res) => {
  // Always ensure CORS for OTA checks from any tenant app
  res.header("Access-Control-Allow-Origin", "*");

  if (fs.existsSync(VERSION_FILE)) {
    const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    res.json(versionData);
  } else {
    res.status(404).json({ error: 'Version info not found' });
  }
});

app.post('/api/master/update-version', async (req, res) => {
  const { changelog, forceUpdate, version } = req.body;
  let current = { version: '1.0.0', buildDate: new Date().toISOString(), changelog: '', apkUrl: '/api/master/download-apk/TimeKey_Master.apk', forceUpdate: false };

  if (fs.existsSync(VERSION_FILE)) {
    current = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  }

  // Increment logic if version not provided
  if (!version) {
    const parts = current.version.split('.').map(Number);
    parts[2] += 1; // Increment patch
    if (parts[2] > 9) { parts[2] = 0; parts[1] += 1; }
    if (parts[1] > 9) { parts[1] = 0; parts[0] += 1; }
    current.version = parts.join('.');
  } else {
    current.version = version;
  }

  current.buildDate = new Date().toISOString();
  current.changelog = changelog || 'Minor bug fixes and performance improvements.';
  current.forceUpdate = !!forceUpdate;

  fs.writeFileSync(VERSION_FILE, JSON.stringify(current, null, 2), 'utf8');

  // Sync with mobile app config if possible
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/master/logs', async (req, res) => {
  const data = await loadData();
  res.json(data.logs);
});
app.get('/api/position-titles', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  const filtered = (data.positionTitles || []).filter(p => p.tenantId === tenantId);
  res.json(filtered);
});

app.post('/api/position-titles', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.positionTitles) data.positionTitles = [];
  const newTitle = { ...req.body, id: Date.now().toString(), tenantId: req.tenantId || 'master' };
  data.positionTitles.push(newTitle);
  await saveData(data);
  res.json(newTitle);
});

app.delete('/api/position-titles/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const initialCount = (data.positionTitles || []).length;
  data.positionTitles = (data.positionTitles || []).filter(p => !(p.id === id && p.tenantId === (req.tenantId || 'master')));
  if (data.positionTitles.length < initialCount) {
    await saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Position Title not found' });
  }
});

app.get('/api/master/position-titles', async (req, res) => {
  const data = await loadData();
  res.json(data.positionTitles || []);
});

// Schedule Management Endpoints
app.get('/api/schedules', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  const filtered = (data.schedules || []).filter(s => s.tenantId === tenantId);
  res.json(filtered);
});

app.post('/api/schedules', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!data.schedules) data.schedules = [];
  const newSchedule = { ...req.body, id: Date.now().toString(), tenantId: req.tenantId || 'master' };
  data.schedules.push(newSchedule);
  await saveData(data);
  res.json(newSchedule);
});

app.put('/api/schedules/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  const index = (data.schedules || []).findIndex(s => s.id === id && s.tenantId === tenantId);
  if (index !== -1) {
    data.schedules[index] = { ...data.schedules[index], ...req.body, tenantId };
    await saveData(data);
    res.json(data.schedules[index]);
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

app.delete('/api/schedules/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  const initialCount = (data.schedules || []).length;
  data.schedules = (data.schedules || []).filter(s => !(s.id === id && s.tenantId === tenantId));
  if (data.schedules.length < initialCount) {
    await saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

app.get('/api/master/schedules', async (req, res) => {
  const data = await loadData();
  res.json(data.schedules || []);
});

app.post('/api/schedule-assign', tenantGuard, async (req, res) => {
  const data = await loadData();
  const { employeeId, shift } = req.body;
  const tenantId = req.tenantId || 'master';
  const index = data.employees.findIndex(e => e.employeeId === employeeId && e.tenantId === tenantId);
  if (index !== -1) {
    data.employees[index].schedule = shift;
    await saveData(data);
    res.json({ success: true, employee: data.employees[index] });
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
});

app.get('/api/master/users', async (req, res) => {
  const data = await loadData();
  res.json(data.users);
});
app.get('/api/master/employees', async (req, res) => {
  const data = await loadData();
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
app.get('/api/master/departments', async (req, res) => {
  const data = await loadData();
  res.json(data.departments);
});
app.get('/api/master/org-units', async (req, res) => {
  const data = await loadData();
  res.json(data.orgUnits);
});

// Org Units (Departments)
app.get('/api/org-units', tenantGuard, async (req, res) => {
  const data = await loadData();
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  res.json((data.orgUnits || []).filter(o => o.tenantId === tenantId));
});

app.post('/api/org-units', tenantGuard, async (req, res) => {
  const data = await loadData();
  const newOrg = { ...req.body, tenantId: req.tenantId || 'master', id: Date.now().toString() };
  if (!data.orgUnits) data.orgUnits = [];
  data.orgUnits.push(newOrg);
  await saveData(data);
  res.json(newOrg);
});

app.delete('/api/org-units/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  data.orgUnits = (data.orgUnits || []).filter(o => !(o.id === id && o.tenantId === tenantId));
  await saveData(data);
  res.json({ success: true });
});

// Tenant-specific Data
app.get('/api/employees', tenantGuard, async (req, res) => {
  const data = await loadData();
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

app.get('/api/departments', tenantGuard, async (req, res) => {
  const data = await loadData();
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

app.get('/api/logs', tenantGuard, async (req, res) => {
  const data = await loadData();
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  const filtered = data.logs.filter(l => l.tenantId === req.tenantId);
  res.json(filtered);
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
  const tenantId = req.tenantId || 'master';
  const index = data.employees.findIndex(e => e.employeeId === id && e.tenantId === tenantId);
  if (index !== -1) {
    data.employees[index] = { ...data.employees[index], ...req.body, tenantId };
    await saveData(data);
    res.json(data.employees[index]);
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
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
  } else {
    res.status(404).json({ error: 'Department not found' });
  }
});

app.post('/api/assignments', tenantGuard, async (req, res) => {
  const data = await loadData();
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

  await saveData(data);
  res.json({ success: true });
});

app.post('/api/timein', tenantGuard, async (req, res) => {
  const data = await loadData();
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

  await saveData(data);
  res.json({ success: true, message: 'Log updated' });
});

app.post('/api/device/register', tenantGuard, async (req, res) => {
  const { employeeId, deviceId, deviceName } = req.body;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  const employee = data.employees.find(e => e.employeeId === employeeId && (e.tenantId === tenantId || !e.tenantId));

  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  // SECURITY: Check if this specific device is already linked to ANOTHER employee
  const deviceInUse = data.employees.find(e => e.registeredDeviceId === deviceId && e.employeeId !== employeeId && (e.tenantId === tenantId || !e.tenantId));

  if (deviceInUse) {
    return res.status(403).json({ error: `This device is already linked to ${deviceInUse.name}.` });
  }

  // BUSINESS LOGIC: If the device is NOT registered to anyone else, allow this employee to use/register it.
  // This allows users to switch devices as long as the new device is "clean".
  if (!employee.registeredDeviceId || employee.registeredDeviceId !== deviceId) {
    console.log(`[DEVICE] Registering/Updating device for ${employee.name}: ${deviceId}`);
    employee.registeredDeviceId = deviceId;
    employee.registeredDeviceName = deviceName || 'Unknown Device';
    employee.registrationDate = new Date().toISOString();
    await saveData(data);
  }

  return res.json({
    success: true,
    message: 'Verified ✓',
    tenantId: employee.tenantId,
    employee: { employeeId: employee.employeeId, name: employee.name }
  });
});

app.post('/api/device/reset', tenantGuard, async (req, res) => {
  const { employeeId } = req.body;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  const employee = data.employees.find(e => e.employeeId === employeeId && e.tenantId === tenantId);
  if (employee) {
    delete employee.registeredDeviceId;
    delete employee.registeredDeviceName;
    delete employee.registrationDate;
    await saveData(data);
    res.json({ success: true });
  }
  else res.status(404).json({ error: 'Not found' });
});

app.delete('/api/employees/:id', tenantGuard, async (req, res) => {
  const { id } = req.params;
  const data = await loadData();
  const tenantId = req.tenantId || 'master';
  const initialCount = data.employees.length;
  data.employees = data.employees.filter(e => !(e.employeeId === id && e.tenantId === tenantId));
  if (data.employees.length < initialCount) {
    await saveData(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
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
    const destName = `${tenantId}_${safeFileName}.apk`;
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
