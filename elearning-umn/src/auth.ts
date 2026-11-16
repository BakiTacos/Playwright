import { chromium, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import readline from 'readline';
import { AppConfig, loadConfig } from './config';

export function hasSavedSession(storageStatePath: string): boolean {
  if (!fs.existsSync(storageStatePath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8'));
    return Array.isArray(data.cookies) && data.cookies.length > 0;
  } catch {
    return false;
  }
}

export async function checkSessionValid(page: Page, config: AppConfig): Promise<boolean> {
  try {
    console.log('[*] Verifying existing session at:', config.dashboardUrl);
    const response = await page.goto(config.dashboardUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout,
    });

    // Check if redirected to login page
    const currentUrl = page.url();
    if (currentUrl.includes('/login/')) {
      console.log('[-] Session expired or not logged in (redirected to login page).');
      return false;
    }

    // Check for logged-in indicators in Moodle / RemUI
    const isLoggedIn = await page.evaluate(() => {
      const body = document.body;
      const notLoggedInClass = body.classList.contains('notloggedin');
      const hasUserMenu = Boolean(
        document.querySelector('.usermenu') ||
        document.querySelector('.userbutton') ||
        document.querySelector('[data-region="timeline-view"]') ||
        document.querySelector('#nav-drawer') ||
        document.querySelector('.navbar')
      );
      return !notLoggedInClass && hasUserMenu;
    });

    if (isLoggedIn) {
      console.log('[+] Existing session is ACTIVE and valid!');
      return true;
    }

    return false;
  } catch (err: any) {
    console.log('[-] Error checking session:', err.message);
    return false;
  }
}

export async function runInteractiveLogin(): Promise<void> {
  const config = loadConfig();
  console.log('\n=============================================================');
  console.log('       UMN E-LEARNING (elearning.umn.ac.id) - LOGIN SETUP     ');
  console.log('=============================================================');
  console.log(`Target URL        : ${config.loginUrl}`);
  console.log(`Session file path : ${config.storageStatePath}`);
  console.log('-------------------------------------------------------------\n');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: null, // Full native window
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  console.log('[*] Membuka halaman login UMN E-Learning...');
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });

  // If credentials exist in .env, attempt autofill
  if (config.username && config.password) {
    try {
      console.log(`[*] Mengisi username otomatis untuk: ${config.username}`);
      await page.fill('#username', config.username);
      await page.fill('#password', config.password);
      console.log('[*] Form terisi, klik Log in...');
      await page.click('#loginbtn');
    } catch (e: any) {
      console.log('[!] Tidak dapat mengisi form otomatis:', e.message);
    }
  }

  console.log('\n[!] SILAKAN SELESAIKAN LOGIN DI JENDELA BROWSER:');
  console.log('  1. Masukkan NIM / Username dan Password akun UMN.');
  console.log('  2. Selesaikan verifikasi / Captcha / SSO jika diminta.');
  console.log('  3. Tunggu hingga masuk ke Dashboard Elearning.');
  console.log('[*] Sistem sedang mendeteksi otomatis saat login berhasil...\n');

  // Wait for login success: URL changes away from /login/ and body no longer has 'notloggedin'
  try {
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        const isNotOnLogin = !url.includes('/login/index.php') && !url.includes('/login/');
        const hasLoggedInElements = Boolean(
          document.querySelector('.usermenu') ||
          document.querySelector('.userbutton') ||
          document.querySelector('[data-region="timeline-view"]') ||
          document.querySelector('.my-courses') ||
          document.querySelector('#page-my-index')
        );
        return isNotOnLogin && hasLoggedInElements;
      },
      { timeout: 180000 } // 3 minutes for user to finish login
    );

    // Give a brief moment for all auth cookies to be placed
    await page.waitForTimeout(2000);

    // Save storage state
    await context.storageState({ path: config.storageStatePath });
    console.log('\n[+] =========================================================');
    console.log(`[+] LOGIN BERHASIL! Session disimpan ke:`);
    console.log(`    ${config.storageStatePath}`);
    console.log('[+] =========================================================\n');
  } catch (err: any) {
    console.error('\n[-] Timeout atau gagal mendeteksi login:', err.message);
    console.log('[-] Anda dapat mencoba login kembali dengan: npm run login');
  } finally {
    await browser.close();
  }
}

// If executed directly: npm run login
if (require.main === module) {
  runInteractiveLogin().catch((err) => {
    console.error('Fatal error during login:', err);
    process.exit(1);
  });
}
