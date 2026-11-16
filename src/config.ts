import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export interface ProductConfig {
  id: number | string;
  name: string;
  searchQuery: string;
}

export interface AppConfig {
  baseUrl: string;
  headless: boolean;
  checkIntervalMinutes: number;
  storageStatePath: string;
  productsPath: string;
  screenshotsDir: string;
  products: ProductConfig[];
}

export function loadConfig(): AppConfig {
  const rootDir = process.cwd();
  const storageStatePath = path.join(rootDir, 'storageState.json');
  const productsPath = path.join(rootDir, 'products.json');
  const screenshotsDir = path.join(rootDir, 'screenshots');

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  let products: ProductConfig[] = [];
  if (fs.existsSync(productsPath)) {
    try {
      const raw = fs.readFileSync(productsPath, 'utf-8');
      products = JSON.parse(raw);
    } catch (err) {
      console.warn(`[WARN] Failed to parse products.json: ${(err as Error).message}`);
    }
  } else {
    console.warn(`[WARN] products.json not found at ${productsPath}. Using empty list.`);
  }

  const baseUrl = (process.env.SHOPEE_BASE_URL || 'https://seller.shopee.vn').replace(/\/$/, '');
  const headless = process.env.HEADLESS === 'true';
  const checkIntervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES || '15', 10);

  return {
    baseUrl,
    headless,
    checkIntervalMinutes: isNaN(checkIntervalMinutes) ? 15 : checkIntervalMinutes,
    storageStatePath,
    productsPath,
    screenshotsDir,
    products,
  };
}
