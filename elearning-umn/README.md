# UMN E-Learning Timeline Scraper (Playwright)

Proyek otomasi Playwright berbasis TypeScript untuk mengakses [elearning.umn.ac.id](https://elearning.umn.ac.id) dan mengekstrak data timeline, tugas (assignments), kuis (quizzes), jadwal deadline, serta daftar mata kuliah.

---

## 🌟 Fitur Utama

1. **Dual Extraction Strategy**:
   - **Moodle AJAX Interception**: Mencegat respons API internal Moodle (`core_calendar_get_action_events_by_timesort`) untuk mendapatkan data deadline yang presisi dengan timestamp Unix dan link aksi.
   - **DOM & Upcoming Calendar Fallback**: Ekstraksi elemen visual dari Dashboard dan Kalender Upcoming jika Moodle menggunakan layout custom/RemUI.
2. **Session Persistence (`storageState.json`)**:
   - Cukup login sekali melalui browser interaktif (`npm run login`), sesi cookie disimpan dan digunakan kembali tanpa perlu login berulang kali.
   - Mendukung login SSO UMN, Google Workspace, dan username/password biasa tanpa terhalang Cloudflare/Captcha.
3. **Ekspor Data Otomatis**:
   - **JSON** (`output/timeline.json`): Data terstruktur lengkap (id, nama tugas, mata kuliah, deadline, status overdue, URL).
   - **CSV** (`output/timeline.csv`): Siap dibuka di Microsoft Excel atau Google Sheets.
   - **Terminal Table**: Tampilan tabel ringkas langsung di konsol terminal.

---

## 📁 Struktur Folder

```text
elearning-umn/
├── output/              # Lokasi penyimpanan file hasil ekspor (timeline.json, timeline.csv)
├── src/
│   ├── auth.ts          # Modul autentikasi & interaktif login
│   ├── config.ts        # Konfigurasi environment & parameter scraper
│   ├── index.ts         # Entry point CLI utama
│   ├── scraper.ts       # Logika Playwright scraper (AJAX intercept + DOM parsing)
│   ├── storage.ts       # Modul ekspor ke JSON, CSV & tabel terminal
│   └── types.ts         # Definisi tipe TypeScript
├── .env.example         # Template konfigurasi environment
├── package.json         # Dependensi dan npm scripts
├── tsconfig.json        # Konfigurasi TypeScript
└── README.md
```

---

## 🚀 Panduan Penggunaan

### 1. Masuk ke Folder Project & Install Dependensi

```bash
cd elearning-umn
npm install
```

*(Opsional jika browser Playwright belum terpasang di sistem)*:
```bash
npx playwright install chromium
```

### 2. Login Interaktif (Hanya Sekali di Awal)

Jalankan perintah berikut untuk membuka browser:

```bash
npm run login
```

- Jendela Chromium akan terbuka menampilkan halaman login `elearning.umn.ac.id`.
- Masukkan akun UMN Anda (NIM/SSO UMN).
- Selesaikan verifikasi jika ada.
- Setelah berhasil masuk ke Dashboard, browser akan otomatis mendeteksi login, menyimpan sesi ke `storageState.json`, dan menutup browser secara otomatis.

### 3. Mengambil Data Timeline

Setelah sesi tersimpan, jalankan scraper:

```bash
npm run scrape
```

Atau dalam mode headless (di latar belakang):
```bash
npm run scrape -- --headless
```

### 4. Hasil Data

Hasil ekstraksi akan disimpan di folder `output/`:
- `output/timeline.json`
- `output/timeline.csv`

Format JSON contoh:
```json
{
  "scrapedAt": "2026-11-16T05:20:00.000Z",
  "studentName": "Nama Mahasiswa",
  "totalTimelineItems": 3,
  "overdueCount": 1,
  "upcomingCount": 2,
  "items": [
    {
      "id": 10542,
      "name": "Tugas 3 - ERD dan Normalisasi",
      "courseName": "IF210 - Sistem Basis Data",
      "activityType": "assign",
      "dueDate": "Jumat, 20 November 2026, 23:59",
      "dueTimestamp": 1795107540000,
      "isOverdue": false,
      "actionUrl": "https://elearning.umn.ac.id/mod/assign/view.php?id=...",
      "actionName": "Add submission",
      "status": "Upcoming"
    }
  ]
}
```

---

## ⚙️ Konfigurasi `.env`

File `.env` dapat disesuaikan sesuai kebutuhan:

```env
ELEARNING_BASE_URL=https://elearning.umn.ac.id
HEADLESS=false
BROWSER_TIMEOUT=45000
OUTPUT_DIR=./output
EXPORT_CSV=true
EXPORT_JSON=true
```
