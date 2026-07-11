# Time Attendance App

This project contains a cross-platform time attendance system with:

- Web admin portal for managing employees, departments, and location-based department assignments.
- Backend API that stores employee/department data and validates login/time-in operations.
- React + Capacitor mobile app for Employee ID login and department time-in.

## Structure

- `backend/` — Node.js API server
- `web-admin/` — React admin portal
- `mobile-app/` — React + Capacitor mobile app

## Backend

1. Open `backend/`
2. Run `npm install`
3. Start with `npm run dev`
   - Runs on `http://localhost:4000`

## Web Admin

1. Open `web-admin/`
2. Run `npm install`
3. Start with `npm run dev`

## Mobile App (React + Capacitor)

1. Open `mobile-app/`
2. Run `npm install`
3. **Browser Test**: `npm run dev`
4. **Android Build**:
   - Ensure you have Android Studio installed.
   - Run `npm run apk`
   - *Note: If you encounter JAVA_HOME errors, ensure your environment variables are set correctly.*

## Full Test Setup

Run the full local test setup from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-test.ps1
```

This will:

- start the backend on port 4001
- start the web admin on the first available port starting at 5173
- build and sync the mobile app for Android

## Firewall Fix

If you are testing on a real device and get a "Network Error", run the `FIX_FIREWALL.bat` file in the project root as Administrator. This will allow your phone to connect to the backend on port 4001.

## Web Testing

1. Open the web admin at `http://localhost:5173`
2. Create an employee and department
3. Assign the department to the employee
4. Test time-in using the mobile app or browser-based location simulation

## Phone Testing via USB

1. Connect your Android phone via USB
2. Enable USB debugging in Developer options
3. Run:

```powershell
cd mobile-app
npm run build
npx cap sync android
npx cap run android
```

If the phone app cannot reach the backend, update `mobile-app/src/App.jsx` to use your computer's local IP address instead of `localhost`.

## Notes

- The backend uses a JSON file store at `backend/data.json`.
- The app authenticates using `Employee ID`.
- **Location Check**: The app compares your current GPS coordinates with the department's pin.
  - Default sample data has coordinates `0, 0`.
  - To test successfully, either update the department coordinates in the Web Admin or use a GPS spoofing tool/browser sensor set to `0, 0`.
- **Mobile API Connection**: If testing on a real Android device, change `API_BASE` in `mobile-app/src/App.jsx` from `localhost` to your computer's IP address (e.g., `192.168.x.x`).
