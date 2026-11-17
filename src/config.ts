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
  ninerouterApiKey?: string;
  ninerouterBaseUrl: string;
  ninerouterModel: string;
  n8nWebhookUrl?: string;
  accountName: string;
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

  const ninerouterApiKey = process.env.NINEROUTER_API_KEY || process.env.ROUTER_API_KEY || '';
  const ninerouterBaseUrl = (
    process.env.NINEROUTER_BASE_URL ||
    process.env.ROUTER_BASE_URL ||
    'http://localhost:20128/v1'
  ).replace(/\/$/, '');
  const ninerouterModel =
    process.env.NINEROUTER_MODEL || process.env.ROUTER_MODEL || 'gemini-2.5-flash-lite';

  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_URL || '';
  const accountName =
    process.env.ACCOUNT_NAME || (process.cwd().toLowerCase().includes('akun2') ? 'Akun 2' : 'Akun 1');

  return {
    baseUrl,
    headless,
    checkIntervalMinutes: isNaN(checkIntervalMinutes) ? 15 : checkIntervalMinutes,
    storageStatePath,
    productsPath,
    screenshotsDir,
    products,
    ninerouterApiKey: ninerouterApiKey || undefined,
    ninerouterBaseUrl,
    ninerouterModel,
    n8nWebhookUrl: n8nWebhookUrl || undefined,
    accountName,
  };
}
