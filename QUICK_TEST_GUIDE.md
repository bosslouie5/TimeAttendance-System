# Quick Testing Guide - Leave Approval System

## 🚀 QUICK START (5-10 minutes)

### Terminal 1: Start Backend
```powershell
cd "c:\Users\60003078\Desktop\Advance Software\Time Attendance App\backend"
npm start
# Should show: SYSTEM LIVE: http://localhost:4001
```

### Terminal 2: Start Web-Dev
```powershell
cd "c:\Users\60003078\Desktop\Advance Software\Time Attendance App\web-dev"
npm run dev
# Should show: http://localhost:5173
```

### Terminal 3: Start Web-Admin
```powershell
cd "c:\Users\60003078\Desktop\Advance Software\Time Attendance App\web-admin"
npm run dev
# Should show: http://localhost:5174
```

### Terminal 4: Start Mobile App
```powershell
cd "c:\Users\60003078\Desktop\Advance Software\Time Attendance App\mobile-app"
npm run dev
# Should show: http://localhost:5175
```

---

## 🧪 COMPLETE TEST SCENARIO (10-15 minutes)

### Step 1: Setup Employee Hierarchy (Web-Admin)
1. Open: http://localhost:5174/portal/demo
2. Login: Username="admin", Password="12345"
3. Click "Employees" tab
4. Create Employee:
   - Employee ID: 0000
   - Name: Manager John
   - Department: Management
   - Reports To: (leave empty)
   - Save
5. Create Employee:
   - Employee ID: 0001
   - Name: Employee Jane
   - Department: Sales
   - Reports To: 0000
   - Save
6. Verify both appear in employees list

### Step 2: Create Manager User (Web-Dev)
1. Open: http://localhost:5173
2. Login: Username="john cruz", Password="Louiecruz23"
3. Click "Leave Requests" tab
4. Select Tenant: "demo" from dropdown
5. Fill "Create Tenant Admin User":
   - Username: manager_john
   - Password: TestPass123
   - Display Name: Manager John
   - Employee ID: 0000
   - Click "Create User"
6. Verify success message
7. Note: User created with employeeId=0000

### Step 3: Manager Login & Detection
1. Open new browser tab: http://localhost:5174/portal/demo
2. Login: Username="manager_john", Password="TestPass123"
3. Verify:
   - ✅ Login successful
   - ✅ "✅ Leave Approvals" menu item appears
   - ✅ Dashboard loads
4. Navigation should show manager-specific features

### Step 4: Submit Leave (Mobile App)
1. Open: http://localhost:5175
2. Assume Login: Employee ID=0001 (default test employee)
3. Click "HR HUB" tab
4. Scroll to "Submit Leave Request" form
5. Fill:
   - Leave Type: Sick Leave
   - Start Date: 2026-08-01
   - End Date: 2026-08-03
   - Reason: Medical check-up
   - Reports To: (leave empty)
   - Click "Submit"
6. Verify: "Leave Request Saved" message
7. Leave appears in "My Leave Requests" section below

### Step 5: Manager Reviews Approvals (Web-Admin)
1. Go back to: http://localhost:5174/portal/demo
2. Should still be logged in as Manager John
3. Click "✅ Leave Approvals" menu item
4. Should see table with:
   - Employee ID: 0001
   - Employee Name: Employee Jane
   - Leave Type: Sick Leave
   - Dates: 2026-08-01 to 2026-08-03
   - Reason: Medical check-up
   - Status: Pending (yellow badge)
5. Two buttons visible: "✓ Approve" and "✗ Reject"

### Step 6: Manager Approves Leave
1. In "Leave Approvals" table, click "✓ Approve" button
2. Verify:
   - ✅ Button becomes disabled
   - ✅ Table updates (may flash)
   - ✅ "Leave Updated" notification appears
3. Refresh page - approval should persist

### Step 7: Employee Sees Approved Status (Mobile App)
1. Go to: http://localhost:5175
2. Click "HR HUB" tab
3. Scroll to "My Leave Requests" section
4. Verify leave status changed to:
   - Status: "Approved"
   - Approved By: Manager John
   - Timestamp: Shows approval date/time

### Step 8: Manager Sees on Web-Dev (Multi-Tenant View)
1. Go to: http://localhost:5173
2. Click "Leave Requests" tab
3. Select Tenant: "demo" from dropdown
4. Table should show:
   - Employee 0001's leave
   - Status: "Approved"
   - Manager: John (0000)

---

## 🔍 VERIFICATION CHECKLIST

### Backend API Responses
```powershell
# Test 1: Get employees with hierarchy
curl -s -H "x-tenant-id: demo" http://localhost:4001/api/employees | jq '.[] | {employeeId, reportsTo}'

# Test 2: Get leaves for approval (as manager 0000)
curl -s -H "x-tenant-id: demo" http://localhost:4001/api/hr/leaves/for-approval/0000 | jq '.[] | {employeeId, status, leaveType}'

# Test 3: Get subordinates of manager 0000
curl -s -H "x-tenant-id: demo" http://localhost:4001/api/employees/subordinates/0000 | jq '.[] | {employeeId, employeeName}'

# Test 4: Verify tenant user has employeeId
curl -s -H "x-tenant-id: demo" http://localhost:4001/api/tenant-users | jq '.[] | {username, employeeId}'
```

### Browser DevTools Checks
1. Open Chrome DevTools (F12)
2. Network tab → Look for:
   - `/api/hr/leaves/for-approval/0000` - Should return leave from employee 0001
   - `/api/hr/leaves/0000/manager-approve` - Should return 200 on approval
3. Application tab → LocalStorage:
   - `leave_requests` - Should show submitted leave
   - `cached_id` - Should show current employee ID
4. Console - Should have no errors related to leave fetching

### Data Persistence (data.json)
```powershell
# Check data.json content
Get-Content "c:\Users\60003078\Desktop\Advance Software\Time Attendance App\backend\data.json" | ConvertFrom-Json | Select-Object -ExpandProperty employees | Where-Object { $_.employeeId -in @("0000", "0001") } | ConvertTo-Json

# Verify leaves have manager approval data
Get-Content "c:\Users\60003078\Desktop\Advance Software\Time Attendance App\backend\data.json" | ConvertFrom-Json | Select-Object -ExpandProperty leaves | Where-Object { $_.employeeId -eq "0001" } | ConvertTo-Json
```

---

## ❌ TROUBLESHOOTING

### Problem: "Invalid Credentials" on manager login
**Solution:**
1. Verify tenant user was created in Step 2
2. Check spelling of username/password
3. Verify tenantId is "demo"
4. Check backend logs for tenant user creation message

### Problem: "No pending leaves" showing for manager
**Solution:**
1. Verify Employee 0000 has reportsTo=null
2. Verify Employee 0001 has reportsTo="0000"
3. Verify leave was submitted with status="Pending"
4. Check API response: `curl -H "x-tenant-id: demo" http://localhost:4001/api/hr/leaves/for-approval/0000`

### Problem: "Leave Approvals" menu item not showing
**Solution:**
1. Check if login response included `employeeId`
2. Browser console - check for fetch errors
3. Verify `isManagerView` state is true
4. Try manual refresh of page

### Problem: Approval button doesn't work
**Solution:**
1. Check browser console for errors
2. Verify manager is logged in with employeeId
3. Check backend logs for PUT request errors
4. Verify `x-tenant-id` header in network request

### Problem: Backend won't start
**Solution:**
```powershell
# Kill all node processes
taskkill /F /IM node.exe

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
cd backend && npm install

# Try start again
npm start
```

---

## 📊 EXPECTED RESULTS

### After Step 7 (All Steps Complete)
- ✅ Employee hierarchy established (0000 → 0001)
- ✅ Manager user created with employeeId
- ✅ Manager can login and see "Leave Approvals" menu
- ✅ Employee submitted leave visible to manager
- ✅ Manager approved leave (timestamp + managerId recorded)
- ✅ Employee sees "Approved" status in mobile app
- ✅ Web-dev shows approved status in multi-tenant view

### API Response Example (After Approval)
```json
{
  "id": "leave-123456",
  "employeeId": "0001",
  "employeeName": "Employee Jane",
  "leaveType": "Sick Leave",
  "startDate": "2026-08-01",
  "endDate": "2026-08-03",
  "reason": "Medical check-up",
  "status": "Approved",
  "managerId": "0000",
  "managerName": "Manager John",
  "managerApprovedAt": "2026-07-31T14:30:45.123Z",
  "tenantId": "demo"
}
```

---

## 🎯 SUCCESS CRITERIA

- ✅ Backend API all three leave approval endpoints working
- ✅ employeeId persists in tenant user records
- ✅ Web-admin shows manager approval UI (menu + tab)
- ✅ Web-dev shows leave requests across tenants
- ✅ Mobile app shows approval queue for managers
- ✅ Approve/Reject buttons update leave status
- ✅ All frontends sync without manual refresh
- ✅ Tenant isolation maintained (x-tenant-id scoping)

---

**Time to Test:** ~15 minutes
**Complexity:** Medium (involves 3 frontends + backend)
**Success Rate Target:** 100% of test steps should pass
