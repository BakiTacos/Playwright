import { loadConfig } from './config';
import { ElearningScraper } from './scraper';
import { saveResults, printConsoleSummary } from './storage';
import { runInteractiveLogin } from './auth';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Penggunaan:
  npm run scrape                  Ambil data timeline & kalender
  npm run login                   Buka browser interaktif untuk login & simpan session
  npm run scrape -- --headless    Jalankan scraper di background (tanpa membuka jendela browser)
  npm run scrape -- --no-headless Jalankan scraper dengan jendela browser terlihat
    `);
    return;
  }

  // If user passed --login flag
  if (args.includes('--login') || args.includes('login')) {
    await runInteractiveLogin();
    return;
  }

  const config = loadConfig();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        UMN E-LEARNING PLAYWRIGHT TIMELINE SCRAPER        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`- Base URL   : ${config.baseUrl}`);
  console.log(`- Headless   : ${config.headless ? 'YA (tanpa UI)' : 'TIDAK (muncul browser)'}`);
  console.log(`- Session    : ${config.storageStatePath}`);
  console.log(`- Output Dir : ${config.outputDir}`);
  console.log('------------------------------------------------------------');

  const scraper = new ElearningScraper(config);

  try {
    await scraper.init();
    const result = await scraper.scrape();

    // Print summary to terminal
    printConsoleSummary(result);

    // Save to files
    const paths = saveResults(result, config);

    console.log('[*] Selesai mengambil data!');
    if (paths.jsonPath) console.log(`    -> File JSON : ${paths.jsonPath}`);
    if (paths.csvPath)  console.log(`    -> File CSV  : ${paths.csvPath}`);
  } catch (error: any) {
    console.error('\n[-] Terjadi kesalahan saat menjalankan scraper:', error);
  } finally {
    await scraper.close();
  }
}

main().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
