import { Page, Locator } from 'playwright';
import path from 'path';
import { ProductConfig, AppConfig } from './config';
import { dismissModalsWithAI } from './ai-agent';

export interface ProductBoostResult {
  product: ProductConfig;
  status: 'BOOSTED' | 'ALREADY_BOOSTING' | 'NOT_FOUND' | 'FAILED' | 'LIMIT_REACHED';
  remainingMinutes?: number;
  message: string;
}

// Regex to detect remaining countdown time like 03:59:12 or 3:45:00
const COUNTDOWN_REGEX = /(\d{1,2}):(\d{2}):(\d{2})/;

function parseCountdownToMinutes(text: string): number | null {
  const match = text.match(COUNTDOWN_REGEX);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return hours * 60 + minutes + (seconds > 0 ? 1 : 0);
}

export async function takeDebugScreenshot(page: Page, screenshotsDir: string, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}_${timestamp}.png`;
  const filePath = path.join(screenshotsDir, filename);
  try {
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  } catch (err) {
    return '';
  }
}

export async function dismissModals(page: Page): Promise<void> {
  try {
    // 1. Tahap 1: Cek Sekarang / Check Now (HANYA tombol primer di dalam .eds-modal:visible!)
    const checkNowBtn = page
      .locator(
        '.eds-modal:visible button.eds-button--primary, ' +
        'button.eds-button--primary:has-text("Cek Sekarang"), ' +
        'button.eds-button--primary:has-text("Check Now")'
      )
      .first();

    if (await checkNowBtn.isVisible({ timeout: 4500 }).catch(() => false)) {
      console.log('[*] Popup modal terdeteksi: Menekan "Cek Sekarang" / "Check Now"...');
      await checkNowBtn.click({ force: true, timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 2. Tahap 2: Skip / Lewati
    const skipBtn = page
      .locator('button, a, span, div, [role="button"]')
      .filter({ hasText: /^(Skip|Lewati)$/i })
      .first();

    if (await skipBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log('[*] Popup onboarding/guide: Menekan "Skip" / "Lewati"...');
      await skipBtn.click({ force: true, timeout: 2500 }).catch(() => {});
      await skipBtn.dispatchEvent('click').catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 3. Tahap 3: Batal / Cancel (jika ada dialog konfirmasi)
    const cancelBtn = page
      .locator('button, a, span, div, [role="button"]')
      .filter({ hasText: /^(Batal|Cancel)$/i })
      .first();

    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[*] Dialog konfirmasi: Menekan "Batal" / "Cancel"...');
      await cancelBtn.click({ force: true, timeout: 2000 }).catch(() => {});
      await cancelBtn.dispatchEvent('click').catch(() => {});
      await page.waitForTimeout(1500);
    }

    // 4. Tahap 4: Popup kedua / Quick Bidding -> Tekan tombol exit/close (X / Tutup / Close)
    const exitBtn = page
      .locator(
        '.eds-modal:visible i.eds-modal__close, ' +
        '.eds-modal:visible button.eds-modal__header-close-btn, ' +
        '.eds-modal:visible .eds-modal__close-btn, ' +
        '.eds-modal:visible [aria-label="Close"], ' +
        '.eds-modal:visible .eds-icon-close, ' +
        '.shopee-modal:visible [class*="close"], ' +
        '[class*="modal"]:visible [class*="close"], ' +
        'button:has-text("Tutup"):visible, ' +
        'button:has-text("Close"):visible'
      )
      .first();

    if (await exitBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log('[*] Popup kedua terdeteksi: Menekan tombol exit/close (X)...');
      await exitBtn.click({ force: true, timeout: 2000 }).catch(() => {});
      await exitBtn.dispatchEvent('click').catch(() => {});
      await page.waitForTimeout(1200);
    }

    // 5. Fallback tombol Escape jika masih ada sisa overlay popup
    const anyModal = page.locator('.eds-modal:visible, .shopee-modal:visible, [class*="modal__mask"]:visible').first();
    if (await anyModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('[*] Masih ada modal terdeteksi, menekan tombol Escape...');
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
    }
  } catch {
    // ignore
  }
}

export async function verifySession(page: Page, baseUrl: string): Promise<boolean> {
  const currentUrl = page.url();
  if (currentUrl.includes('/account/signin') || currentUrl.includes('/account/login')) {
    return false;
  }
  try {
    const isLoginButtonPresent = await page
      .locator('button:has-text("Log In"), button:has-text("Đăng nhập")')
      .first()
      .isVisible({ timeout: 2000 });
    if (isLoginButtonPresent) return false;
  } catch {
    // ignore
  }
  return true;
}

export async function navigateToProductList(page: Page, baseUrl: string, config?: AppConfig): Promise<void> {
  const productListUrl = `${baseUrl}/portal/product/list/all`;
  console.log(`[*] Navigating to ${productListUrl}...`);
  await page.goto(productListUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

  try {
    await page.waitForSelector('.eds-table, .shopee-table, .product-list-view', { timeout: 15000 });
  } catch {
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  // Jeda waktu agar popup yang delay/beranimasi (~2.5-3.5 detik) selesai tampil
  console.log('[*] Menunggu popup selamat datang / update sistem jika ada...');
  await page.waitForTimeout(3500);

  // 1. Coba tutup menggunakan selector rule-based terlebih dahulu
  await dismissModals(page);
  await page.waitForTimeout(1500);

  // 2. Hanya panggil AI Vision jika MASIH ada modal/overlay yang menutupi layar
  const hasRemainingModal = await page
    .locator('.eds-modal:visible, .shopee-modal:visible, [class*="modal__mask"]:visible')
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  if (hasRemainingModal && config?.ninerouterApiKey) {
    console.log('[*] Masih ada popup tersisa, memanggil AI Vision Guardian...');
    await dismissModalsWithAI(page, config);
  } else {
    console.log('[*] Layar terkonfirmasi bersih dari popup.');
  }
}

async function findSearchInput(page: Page): Promise<Locator | null> {
  const candidates = [
    'input[placeholder*="Search" i]',
    'input[placeholder*="Cari" i]',
    'input[placeholder*="Tìm" i]',
    '.shopee-search-bar input',
    '.search-box input',
    'input.shopee-input__inner',
  ];

  for (const selector of candidates) {
    const loc = page.locator(selector).first();
    if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
      return loc;
    }
  }
  return null;
}

export async function boostSingleProduct(
  page: Page,
  product: ProductConfig,
  config: AppConfig
): Promise<ProductBoostResult> {
  console.log(`\n-----------------------------------------------------`);
  console.log(`[*] Processing product #${product.id}: "${product.name}" (query: "${product.searchQuery}")`);

  const hasModalBeforeSearch = await page.locator('.eds-modal:visible, .shopee-modal:visible').first().isVisible({ timeout: 400 }).catch(() => false);
  if (hasModalBeforeSearch) {
    await dismissModals(page);
    if (config.ninerouterApiKey) {
      await dismissModalsWithAI(page, config);
    }
  }

  // 1. Enter search query and filter products
  const searchInput = await findSearchInput(page);
  if (searchInput) {
    console.log('[*] Entering search query into search bar...');
    await searchInput.fill('');
    await searchInput.fill(product.searchQuery);

    await searchInput.press('Enter').catch(() => {});

    const applyButton = page.locator('button:has-text("Apply"), button:has-text("Terapkan")').first();
    if (await applyButton.isVisible({ timeout: 800 }).catch(() => false)) {
      await applyButton.click({ force: true, timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(2500); // Allow table to refresh
  }

  const hasModalAfterSearch = await page.locator('.eds-modal:visible, .shopee-modal:visible').first().isVisible({ timeout: 400 }).catch(() => false);
  if (hasModalAfterSearch) {
    await dismissModals(page);
    if (config.ninerouterApiKey) {
      await dismissModalsWithAI(page, config);
    }
  }

  // 2. Identify the matching row index in the product table
  const matchInfo = await page.evaluate(
    ({ query, name }) => {
      const rows = Array.from(document.querySelectorAll('.eds-table__body tr, .shopee-table__row'));
      if (rows.length === 0) return { rowIndex: -1, totalRows: 0 };

      for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent || '';
        if (text.includes(query) || (name && text.includes(name))) {
          return { rowIndex: i, totalRows: rows.length };
        }
      }

      // Default to top result if search filtered products
      return { rowIndex: 0, totalRows: rows.length };
    },
    { query: product.searchQuery, name: product.name }
  );

  if (matchInfo.rowIndex === -1 || matchInfo.totalRows === 0) {
    console.log(`[!] No product rows found for query "${product.searchQuery}"`);
    await takeDebugScreenshot(page, config.screenshotsDir, `not_found_prod_${product.id}`);
    return {
      product,
      status: 'NOT_FOUND',
      message: `Product matching query "${product.searchQuery}" was not found.`,
    };
  }

  const rowIndex = matchInfo.rowIndex;
  console.log(`[*] Matched product at row index [${rowIndex}] (total rows: ${matchInfo.totalRows})`);

  // 3. Locate Action column on the right side
  const actionContainers = page.locator('.list-view-action, .eds-table__fixed-right .eds-table__row');
  const actionCount = await actionContainers.count();

  if (actionCount <= rowIndex) {
    console.log(`[!] Action column not found for row index [${rowIndex}]. Total action cells: ${actionCount}`);
    await takeDebugScreenshot(page, config.screenshotsDir, `no_action_col_${product.id}`);
    return {
      product,
      status: 'FAILED',
      message: `Action column could not be located at row index [${rowIndex}].`,
    };
  }

  const actionContainer = actionContainers.nth(rowIndex);
  await actionContainer.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // Check if Action column already displays "Boosting" / "Dinaikkan" or active timer
  const actionText = await actionContainer.innerText().catch(() => '');
  const countdownMinutes = parseCountdownToMinutes(actionText);

  if (
    actionText.includes('Boosting') ||
    actionText.includes('Dinaikkan') ||
    actionText.includes('Menaikkan') ||
    countdownMinutes !== null
  ) {
    const mins = countdownMinutes || 240;
    console.log(`[i] Product is already boosting/dinaikkan! Remaining: ~${mins} minutes.`);
    return {
      product,
      status: 'ALREADY_BOOSTING',
      remainingMinutes: mins,
      message: `Product is currently active. Remaining: ~${mins}m.`,
    };
  }

  // 4. Click the "More" / "Lainnya" button in the Action column
  const moreButton = actionContainer
    .locator('button:has-text("More"), span:has-text("More"), button:has-text("Lainnya"), span:has-text("Lainnya"), [class*="more"]')
    .first();

  if (!(await moreButton.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('[!] Button "More" / "Lainnya" not found in the Action column.');
    await takeDebugScreenshot(page, config.screenshotsDir, `no_more_btn_${product.id}`);
    return {
      product,
      status: 'FAILED',
      message: 'Button "More" / "Lainnya" could not be located in Action column.',
    };
  }

  console.log('[*] Clicking "More" / "Lainnya" button in Action column...');
  await moreButton.click();
  await page.waitForTimeout(800);

  // 5. Inspect the opened dropdown menu (.more-dropdown-menu:visible / .eds-dropdown-menu:visible)
  const dropdownMenu = page.locator('.more-dropdown-menu:visible, .eds-dropdown-menu:visible').first();
  const dropdownText = await dropdownMenu.innerText().catch(() => '');
  const popoverCountdown = parseCountdownToMinutes(dropdownText);

  if (popoverCountdown !== null) {
    console.log(`[i] Dropdown displays active timer: ~${popoverCountdown} mins remaining.`);
    await page.keyboard.press('Escape').catch(() => {});
    return {
      product,
      status: 'ALREADY_BOOSTING',
      remainingMinutes: popoverCountdown,
      message: `Product is currently active (~${popoverCountdown}m remaining).`,
    };
  }

  // 6. Locate "Bump Now" / "Naikkan Produk" item inside the visible dropdown
  const bumpNowItem = page
    .locator('.more-dropdown-menu:visible, .eds-dropdown-menu:visible')
    .locator('.eds-dropdown-item, li, div')
    .filter({ hasText: /Bump Now|Naikkan Produk|Naikkan/i })
    .first();

  if (await bumpNowItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    const itemText = await bumpNowItem.innerText().catch(() => '');
    const isSlotFull =
      dropdownText.includes('All 5 bump slots in use') ||
      dropdownText.includes('Maksimum produk') ||
      dropdownText.includes('slot telah digunakan') ||
      dropdownText.includes('sudah digunakan') ||
      dropdownText.includes('sedang digunakan') ||
      dropdownText.includes('slot naikkan produk') ||
      itemText.includes('All 5 bump slots in use') ||
      itemText.includes('Maksimum produk') ||
      itemText.includes('sedang digunakan') ||
      itemText.includes('telah digunakan') ||
      itemText.includes('sudah digunakan');

    // Also check if item has disabled class or attribute
    const itemClass = (await bumpNowItem.getAttribute('class').catch(() => '')) || '';
    const ariaDisabled = (await bumpNowItem.getAttribute('aria-disabled').catch(() => '')) || '';
    const isDisabled = itemClass.includes('disabled') || ariaDisabled === 'true';

    if (isSlotFull || isDisabled) {
      console.log('[!] 5 Slot Naikkan Produk sedang digunakan / penuh (Shopee maximum active bumps reached)!');
      await takeDebugScreenshot(page, config.screenshotsDir, `slots_full_${product.id}`);
      await page.keyboard.press('Escape').catch(() => {});
      return {
        product,
        status: 'LIMIT_REACHED',
        remainingMinutes: 240,
        message: '5 slot naikkan produk sedang digunakan (penuh). Dapat digunakan kembali setiap 4 jam.',
      };
    }

    console.log('[*] Clicking "Bump Now" / "Naikkan Produk" from dropdown...');
    await bumpNowItem.click({ force: true, timeout: 3000 });
    await page.waitForTimeout(2000);

    // Verify if slots full limit popup appeared
    const bodyText = await page.innerText('body').catch(() => '');
    if (
      bodyText.includes('All 5 bump slots in use') ||
      bodyText.includes('Exceeded maximum number of bumped products') ||
      bodyText.includes('Maksimum produk') ||
      bodyText.includes('slot telah digunakan')
    ) {
      console.log('[!] Bump limit reached (All 5 bump slots currently in use)!');
      return {
        product,
        status: 'LIMIT_REACHED',
        message: 'All 5 bump slots are currently in use.',
      };
    }

    console.log(`[✓] Successfully triggered "Bump Now" / "Naikkan Produk" for product #${product.id}!`);
    await takeDebugScreenshot(page, config.screenshotsDir, `bumped_prod_${product.id}`);

    return {
      product,
      status: 'BOOSTED',
      remainingMinutes: 240, // Standard 4-hour cooldown
      message: '"Bump Now" / "Naikkan Produk" triggered successfully (cooldown 4h).',
    };
  }

  console.log('[!] "Bump Now" / "Naikkan Produk" was not found in the dropdown.');
  await takeDebugScreenshot(page, config.screenshotsDir, `no_bump_now_${product.id}`);
  await page.keyboard.press('Escape').catch(() => {});

  return {
    product,
    status: 'FAILED',
    message: 'Option "Bump Now" / "Naikkan Produk" was not found inside the "More" / "Lainnya" dropdown.',
  };
}

export async function runBoostCycle(page: Page, config: AppConfig): Promise<ProductBoostResult[]> {
  const results: ProductBoostResult[] = [];

  const isValidSession = await verifySession(page, config.baseUrl);
  if (!isValidSession) {
    throw new Error('SESSION_INVALID: Please run "npm run login" to authenticate your session.');
  }

  await navigateToProductList(page, config.baseUrl, config);

  const stillValid = await verifySession(page, config.baseUrl);
  if (!stillValid) {
    throw new Error('SESSION_EXPIRED: Redirected to login page. Please re-run "npm run login".');
  }

  const productsToProcess = config.products.slice(0, 5);
  if (productsToProcess.length === 0) {
    console.log('[!] No products defined in products.json. Please configure up to 5 products.');
    return results;
  }

  console.log(`[*] Starting boost cycle for ${productsToProcess.length} configured products...`);

  for (const product of productsToProcess) {
    try {
      const result = await boostSingleProduct(page, product, config);
      results.push(result);
    } catch (err) {
      console.error(`[ERROR] Failed processing product #${product.id}:`, err);
      results.push({
        product,
        status: 'FAILED',
        message: `Exception: ${(err as Error).message}`,
      });
    }
  }

  return results;
}
