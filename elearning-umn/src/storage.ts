import fs from 'fs';
import path from 'path';
import { AppConfig } from './config';
import { ScrapeResult, TimelineItem } from './types';

export function saveResults(data: ScrapeResult, config: AppConfig): { jsonPath?: string; csvPath?: string } {
  const result: { jsonPath?: string; csvPath?: string } = {};

  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // 1. Save JSON
  if (config.exportJson) {
    const jsonPath = path.join(config.outputDir, 'timeline.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
    result.jsonPath = jsonPath;
    console.log(`[+] Berhasil menyimpan data JSON ke: ${jsonPath}`);
  }

  // 2. Save CSV
  if (config.exportCsv) {
    const csvPath = path.join(config.outputDir, 'timeline.csv');
    const csvContent = convertToCsv(data.items);
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    result.csvPath = csvPath;
    console.log(`[+] Berhasil menyimpan data CSV ke: ${csvPath}`);
  }

  return result;
}

function escapeCsv(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function convertToCsv(items: TimelineItem[]): string {
  const headers = [
    'ID',
    'Mata Kuliah',
    'Nama Aktivitas / Tugas',
    'Tipe',
    'Waktu / Deadline',
    'Status',
    'Action URL',
  ];

  const rows = items.map((item) => [
    escapeCsv(item.id),
    escapeCsv(item.courseName),
    escapeCsv(item.name),
    escapeCsv(item.activityType),
    escapeCsv(item.dueDate),
    escapeCsv(item.status || (item.isOverdue ? 'Overdue' : 'Upcoming')),
    escapeCsv(item.actionUrl),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function printConsoleSummary(data: ScrapeResult): void {
  console.log('\n========================================================================================');
  console.log('                          RINGKASAN TIMELINE ELEARNING UMN                              ');
  console.log('========================================================================================');
  console.log(`Mahasiswa     : ${data.studentName || 'Tidak Terdeteksi'}`);
  console.log(`Waktu Scrape  : ${new Date(data.scrapedAt).toLocaleString('id-ID')}`);
  console.log(`Total Item    : ${data.totalTimelineItems}`);
  console.log(`- Overdue     : ${data.overdueCount}`);
  console.log(`- Upcoming    : ${data.upcomingCount}`);
  console.log('----------------------------------------------------------------------------------------\n');

  if (data.items.length === 0) {
    console.log('[i] Tidak ada deadline atau aktivitas timeline yang ditemukan saat ini.');
    console.log('========================================================================================\n');
    return;
  }

  // Print table
  console.log(
    pad('NO', 4) +
    pad('STATUS', 12) +
    pad('DEADLINE / WAKTU', 32) +
    pad('MATA KULIAH', 30) +
    'TUGAS / AKTIVITAS'
  );
  console.log('-'.repeat(100));

  data.items.forEach((item, index) => {
    const statusText = item.isOverdue ? '[OVERDUE]' : '[UPCOMING]';
    console.log(
      pad(String(index + 1), 4) +
      pad(statusText, 12) +
      pad(item.dueDate, 32) +
      pad(truncate(item.courseName, 28), 30) +
      truncate(item.name, 45)
    );
    if (item.actionUrl) {
      console.log(`      Link: ${item.actionUrl}`);
    }
  });

  console.log('\n========================================================================================\n');
}

function pad(str: string, length: number): string {
  return str.length >= length ? str.slice(0, length) : str + ' '.repeat(length - str.length);
}

function truncate(str: string, maxLength: number): string {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
}
