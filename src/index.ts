import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import { loadConfig, AppConfig } from './config';
import { runBoostCycle, ProductBoostResult } from './booster';

function printSummary(results: ProductBoostResult[]): void {
  console.log('\n=====================================================');
  console.log('              AUTO-BOOST CYCLE SUMMARY               ');
  console.log('=====================================================');
  console.table(
    results.map((r) => ({
      ID: r.product.id,
      Name: r.product.name.slice(0, 30),
      Status: r.status,
      Remaining: r.remainingMinutes ? `${r.remainingMinutes} min` : 'N/A',
      Notes: r.message,
    }))
  );
  console.log('=====================================================\n');
}

function calculateNextWaitMinutes(results: ProductBoostResult[], defaultInterval: number): number {
  const activeCountdowns = results
    .map((r) => r.remainingMinutes)
    .filter((m): m is number => typeof m === 'number' && m > 0);

  if (activeCountdowns.length > 0) {
    const minRemaining = Math.min(...activeCountdowns);
    // Add 2 minutes buffer so the boost button is guaranteed to be available
    return Math.max(minRemaining + 2, 5);
  }

  return defaultInterval;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createBrowserContext(config: AppConfig): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  if (!fs.existsSync(config.storageStatePath)) {
    console.error('\n[ERROR] Session file "storageState.json" was not found!');
    console.error('Please run the interactive login script first:');
    console.error('    npm run login\n');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const context = await browser.newContext({
    storageState: config.storageStatePath,
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  return { browser, context, page };
}

async function main(): Promise<void> {
  const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w');
  const config = loadConfig();

  console.log('=====================================================');
  console.log('       SHOPEE SELLER CENTER - AUTO BOOST ENGINE       ');
  console.log('=====================================================');
  console.log(`Base URL:     ${config.baseUrl}`);
  console.log(`Headless:     ${config.headless}`);
  console.log(`Products:     ${config.products.length} configured`);
  console.log(`Mode:         ${isWatchMode ? 'Continuous Loop (Watch)' : 'Single Run'}`);
  console.log('-----------------------------------------------------');

  let keepRunning = true;
  process.on('SIGINT', () => {
    console.log('\n[!] Stopping auto booster...');
    keepRunning = false;
    process.exit(0);
  });

  do {
    let browser: Browser | null = null;
    try {
      const browserObj = await createBrowserContext(config);
      browser = browserObj.browser;

      const results = await runBoostCycle(browserObj.page, config);
      printSummary(results);

      await browser.close();
      browser = null;

      if (!isWatchMode) {
        break;
      }

      const waitMinutes = calculateNextWaitMinutes(results, config.checkIntervalMinutes);
      const nextRunTime = new Date(Date.now() + waitMinutes * 60 * 1000);
      console.log(`[⏳] Next cycle scheduled in ${waitMinutes} minutes (at ${nextRunTime.toLocaleTimeString()})...`);

      await sleep(waitMinutes * 60 * 1000);
    } catch (err) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      console.error(`[ERROR] Cycle encountered an error: ${(err as Error).message}`);

      if ((err as Error).message.includes('SESSION_')) {
        console.error('[FATAL] Authentication failed. Exiting loop. Please run "npm run login".');
        break;
      }

      if (isWatchMode && keepRunning) {
        console.log(`[!] Retrying in ${config.checkIntervalMinutes} minutes...`);
        await sleep(config.checkIntervalMinutes * 60 * 1000);
      } else {
        process.exit(1);
      }
    }
  } while (isWatchMode && keepRunning);

  console.log('[✓] Done.');
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error:', err);
  process.exit(1);
});
