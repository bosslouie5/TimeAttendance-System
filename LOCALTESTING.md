# 🚀 TIMEKEY - LOCAL TESTING WORKFLOW GUIDE

Eto ang opisyal na guide para sa pag-improve ng **Timekey** nang safe, portable, at branded.

## 🛠️ THE ENVIRONMENT
- **Production (Timekey.pro):** Port 4001 | Database: `data.json`
- **Development (Timekey.dev):** Port 4002 | Database: `data-test.json`

---

## 🔄 STEP-BY-STEP WORKFLOW

### 1. Pag-clone ng Real Data
Bago mag-code, kailangan mo ng kopya ng totoong data para sa analysis.
- I-run ang **`DEV_TOOLS.bat`**.
- Piliin ang **Option [0]** (Local) o **Option [S]** (SaaS).
- **Automation:** Kusang iko-copy ng system ang `data.json` (Live) papunta sa `data-test.json` (Lab). Safe na pag-tripan ang data sa Port 4002!

### 2. Pag-run ng Developer Lab
Depende kung nasaan ka, piliin ang tamang option:

#### A. Kung nasa Office (Inside Company Network):
- Piliin ang **Option [0] RUN DEVELOPER SYSTEM**.
- Tatakbo ang system sa `http://localhost:4002`.
- **Mobile Testing:** Isaksak ang USB Cable at piliin ang **Option [1] ACTIVATE USB CONNECT**. Ito ang bridge mo para ma-test ang Mobile App kahit naka-block ang WiFi ng kumpanya.

#### B. Kung nasa Labas (SaaS Test Mode):
- Piliin ang **Option [S] RUN SAAS TEST**.
- Gagawa ito ng public link via Cloudflare na nakaturo sa Port 4002.
- Makukuha mo ang link sa `CURRENT_SERVER_LINK.txt` sa iyong Desktop.

### 3. Pag-improve ng Code
- Gawin ang mga pagbabago sa `/web-dev`, `/web-admin`, o `/mobile-app`.
- Lahat ng results ay makikita mo agad sa Port 4002 habang nag-re-refresh ka.

### 4. Pag-compile (The Build)
Kapag satisfied ka na sa bagong features:
- Sa **`DEV_TOOLS.bat`**, piliin ang **Option [2] REBUILD LOCAL TEST**.
- Ito ang mag-hahanda ng mga files para maging production-ready (`dist-test` folders).

### 5. Secure Commit (Going Live)
Kapag handa ka na ilabas ang update sa Riyadh:
- Piliin ang **Option [4] COMMIT LOCAL TO WEB**.
- **Rule of Safety:** Ang system ay mag-lilipat LANG ng mga buttons/UI/logic. **HINDI** sasama ang `data-test.json`.
- **Result:** Ang clients mo ay magkakaroon ng bagong features pero ang kanilang existing attendance records ay hindi magagalaw.

---

## 🛡️ IMPORTANT RULES
1. **Rule 4 (Portable):** Huwag mag-install ng kahit ano sa Windows. Gamitin lang ang nasa `DEV_TOOLS` folder.
2. **Rule 2 (Permission):** Huwag baguhin ang mga core functions sa Port 4001 nang hindi dumaan sa test sa Port 4002.
3. **Emergency Stop:** Gamitin ang **Option [6] STOP EVERYTHING** sa `DEV_TOOLS.bat` kung kailangan linisin ang mga tumatakbong processes.

---
*Status: Riyadh Context Active 🇸🇦 | Developer: Ninja Mode*

> 💡 **NINJA TRIGGER:** Kapag sinabing **"tropa mag enhance tayo"**, automatic na mag-swiswitch ang system at si AI sa **Local Dev Mode (Port 4002)** gamit ang fresh sync data.
