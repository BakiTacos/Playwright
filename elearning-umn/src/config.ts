import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env
dotenv.config();

export interface AppConfig {
  baseUrl: string;
  loginUrl: string;
  dashboardUrl: string;
  calendarUrl: string;
  storageStatePath: string;
  headless: boolean;
  timeout: number;
  outputDir: string;
  username?: string;
  password?: string;
  exportCsv: boolean;
  exportJson: boolean;
}

export function loadConfig(): AppConfig {
  const baseUrl = (process.env.ELEARNING_BASE_URL || 'https://elearning.umn.ac.id').replace(/\/+$/, '');
  const storageStatePath = path.resolve(
    process.cwd(),
    process.env.STORAGE_STATE_PATH || './storageState.json'
  );
  const outputDir = path.resolve(process.cwd(), process.env.OUTPUT_DIR || './output');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // CLI argument override for headless: e.g. --headless or --no-headless
  const args = process.argv.slice(2);
  let headless = process.env.HEADLESS === 'true';
  if (args.includes('--headless')) headless = true;
  if (args.includes('--no-headless') || args.includes('--head')) headless = false;

  return {
    baseUrl,
    loginUrl: `${baseUrl}/login/index.php`,
    dashboardUrl: `${baseUrl}/my/`,
    calendarUrl: `${baseUrl}/calendar/view.php?view=upcoming`,
    storageStatePath,
    headless,
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '45000', 10),
    outputDir,
    username: process.env.UMN_USERNAME || undefined,
    password: process.env.UMN_PASSWORD || undefined,
    exportCsv: process.env.EXPORT_CSV !== 'false',
    exportJson: process.env.EXPORT_JSON !== 'false',
  };
}
