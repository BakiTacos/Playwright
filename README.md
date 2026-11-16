# Shopee Seller Center Auto-Boost (Playwright)

An automated Playwright automation project built to continuously boost up to **5 determined products** on Shopee Seller Center.

---

## 📌 Background & Mechanics

* **Shopee Boost Limit:** Shopee allows sellers to boost up to **5 products** simultaneously.
* **Duration:** Each boost lasts **4 hours** (240 minutes).
* **Cooldown:** After 4 hours, the product can be boosted again.
* **Authentication:** Due to Shopee's anti-bot and 2FA protections (QR code, SMS OTP, Captchas), this project uses Playwright's **`storageState`** mechanism. You log in once interactively, and your authenticated cookies & tokens are preserved for subsequent background runs.

---

## 📂 Project Structure

```text
├── src/
│   ├── auth.ts         # Interactive script to log in & save session (storageState.json)
│   ├── booster.ts      # Core logic to search, inspect timer, and trigger Boost
│   ├── config.ts       # Loads environment variables and product configuration
│   └── index.ts        # CLI entry point (single cycle or continuous watch loop)
├── .env                # Regional Shopee domain & runner options
├── .env.example        # Template for environment variables
├── products.json       # Definition of the 5 products to boost
├── storageState.json   # (Generated) Stored authenticated session
├── screenshots/        # (Generated) Automated audit screenshots
├── package.json
└── tsconfig.json
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies & Playwright Browser

Dependencies and Playwright Chromium are already installed in this directory. If moving to another machine:

```bash
npm install
npx playwright install chromium
```

---

### 2. Configure Environment (`.env`)

Edit `.env` to match your local Shopee region:

```env
# Regional Shopee Seller Center URL:
# Vietnam:     https://seller.shopee.vn
# Philippines: https://seller.shopee.ph
# Singapore:   https://seller.shopee.sg
# Malaysia:    https://seller.shopee.com.my
# Indonesia:   https://seller.shopee.co.id
# Thailand:    https://seller.shopee.co.th
# Brazil:      https://seller.shopee.com.br
SHOPEE_BASE_URL=https://seller.shopee.vn

# Headless mode:
# Set to 'false' while testing so you can see the browser actions.
# Set to 'true' if running on a headless VPS / background daemon.
HEADLESS=false

# Default check interval in minutes (fallback if timer cannot be parsed)
CHECK_INTERVAL_MINUTES=15
```

---

### 3. Define Your 5 Products (`products.json`)

Open `products.json` and specify the 5 products you want to boost. You can search by **Product Name**, **Item ID**, or **Parent SKU**:

```json
[
  {
    "id": 1,
    "name": "Bánh Tacos Phô Mai",
    "searchQuery": "Bánh Tacos Phô Mai"
  },
  {
    "id": 2,
    "name": "Bánh Bông Lan Trứng Muối",
    "searchQuery": "Bánh Bông Lan Trứng Muối"
  },
  {
    "id": 3,
    "name": "Bánh Tiramisu Hộp Thiếc",
    "searchQuery": "Bánh Tiramisu"
  },
  {
    "id": 4,
    "name": "Set Bánh Macaron 6 Vị",
    "searchQuery": "Set Bánh Macaron"
  },
  {
    "id": 5,
    "name": "Trà Sữa Đóng Chai",
    "searchQuery": "Trà Sữa Đóng Chai"
  }
]
```

> **Tip:** Make `searchQuery` specific enough so that the intended item appears as the top result when filtered on the My Products page.

---

### 4. Authenticate (One-time Setup)

Run the login script:

```bash
npm run login
```

1. A Chromium browser window will open and navigate to Shopee Seller Center.
2. Log in using your preferred method:
   - **QR Code scan** via Shopee mobile app (recommended, fast & avoids captchas).
   - **Username / Password** + SMS OTP verification.
3. Once logged in and on the Seller Center dashboard / product list, the script will automatically detect the authenticated session and save it to `storageState.json`.

---

### 5. Run the Auto Booster

#### Option A: One-time Boost Check
Run a single cycle across the 5 products, report remaining cooldowns or boost eligible items, and exit:

```bash
npm run boost
```

#### Option B: Continuous 24/7 Watch Mode (Recommended)
Keeps running continuously. It boosts eligible products, parses active countdown timers, calculates the exact shortest remaining cooldown, sleeps until the timer expires, and automatically re-boosts:

```bash
npm run watch
# or
npm run start
```

---

## 🛠️ How It Works Under the Hood

1. **Session Reuse:** Loads cookies and local storage tokens from `storageState.json`.
2. **Product Navigation:** Navigates directly to `${SHOPEE_BASE_URL}/portal/product/list/all`.
3. **Smart Search:** Enters the product `searchQuery` into the search bar and filters the list.
4. **State Detection:**
   - If the product displays a countdown timer (e.g. `03:45:12`), it parses the remaining minutes and logs it as `ALREADY_BOOSTING`.
   - If the product has a **"Bump Now"** (or "Boost Now" / "Naikkan") button available (either directly on the row or under the `More` / `Lainnya` / `Thêm` dropdown), it clicks it.
   - Detects if the 5/5 concurrent bump limit was reached.
5. **Audit Screenshots:** Automatically saves screenshots to `screenshots/` on key events (e.g., successful boost, error, not found) for verification.
6. **Smart Cooldown Sleep:** In `watch` mode, it dynamically schedules the next run based on the earliest product timer that will expire (+ a 2-minute buffer).

---

## 🔍 Troubleshooting

* **Session expired:** If Shopee logs out your session, delete `storageState.json` and re-run `npm run login`.
* **Product Not Found:** Ensure your `searchQuery` matches what Shopee returns in the Seller Center search bar.
* **Captchas or Cloudflare:** Run with `HEADLESS=false` in `.env` if you experience any bot challenges.
