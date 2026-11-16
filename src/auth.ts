import { chromium } from 'playwright';
import fs from 'fs';
import readline from 'readline';
import { loadConfig } from './config';

function waitForEnter(promptMessage: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptMessage, () => {
      rl.close();
      resolve();
    });
  });
}

export async function runInteractiveLogin(): Promise<void> {
  const config = loadConfig();
  console.log('=====================================================');
  console.log('       SHOPEE SELLER CENTER - LOGIN & SESSION SETUP  ');
  console.log('=====================================================');
  console.log(`Target URL: ${config.baseUrl}/portal/product/list/all`);
  console.log(`Session file will be saved to: ${config.storageStatePath}`);
  console.log('-----------------------------------------------------');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null, // use native window size
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  console.log('[*] Opening Shopee Seller Center...');
  await page.goto(`${config.baseUrl}/portal/product/list/all`, {
    waitUntil: 'domcontentloaded',
  });

  console.log('\n[!] ACTION REQUIRED IN THE OPENED BROWSER:');
  console.log('  1. Please log in using QR code, SMS OTP, or username & password.');
  console.log('  2. Complete any 2FA/verification required by Shopee.');
  console.log('  3. Once you reach the Seller Center / Product List page, the session will be detected automatically.');
  console.log('  (You can also press ENTER in this terminal once logged in)\n');

  // Listen for navigation to product list or portal
  const autoDetectPromise = new Promise<void>((resolve) => {
    const checkInterval = setInterval(async () => {
      try {
        const currentUrl = page.url();
        if (
          currentUrl.includes('/portal/product/list') ||
          (currentUrl.includes('/portal') && !currentUrl.includes('/account/signin'))
        ) {
          // Verify that page has loaded some logged-in state
          clearInterval(checkInterval);
          console.log(`\n[✓] Login detected! Current URL: ${currentUrl}`);
          resolve();
        }
      } catch {
        // Page might be closed or navigating
      }
    }, 2000);
  });

  const manualEnterPromise = waitForEnter('[Optional] Press ENTER here after you finish logging in...');

  // Wait for either auto detection or user pressing Enter
  await Promise.race([autoDetectPromise, manualEnterPromise]);

  // Give 3 seconds for cookies and local storage to settle
  console.log('[*] Saving authentication state...');
  await page.waitForTimeout(3000);

  // Save storage state (cookies + local storage)
  await context.storageState({ path: config.storageStatePath });

  console.log(`[✓] Authentication state successfully saved to ${config.storageStatePath}`);
  console.log('[✓] You can now run "npm run boost" or "npm run watch" to auto boost your 5 products!');

  await browser.close();
}

if (require.main === module) {
  runInteractiveLogin().catch((err) => {
    console.error('[FATAL] Login script error:', err);
    process.exit(1);
  });
}
