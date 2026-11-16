import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { AppConfig } from './config';
import { TimelineItem, CourseSummary, ScrapeResult } from './types';
import { checkSessionValid, hasSavedSession, runInteractiveLogin } from './auth';

export class ElearningScraper {
  private config: AppConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private interceptedItems: TimelineItem[] = [];

  constructor(config: AppConfig) {
    this.config = config;
  }

  public async init(): Promise<void> {
    // Check if storage state exists
    if (!hasSavedSession(this.config.storageStatePath)) {
      console.log('[!] Tidak ada session tersimpan. Memulai login interaktif terlebih dahulu...');
      await runInteractiveLogin();
    }

    console.log(`[*] Meluncurkan Chromium (headless: ${this.config.headless})...`);
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      storageState: this.config.storageStatePath,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });

    this.page = await this.context.newPage();

    // Setup network interception for Moodle timeline web service calls
    this.setupNetworkInterception();

    // Verify session
    const valid = await checkSessionValid(this.page, this.config);
    if (!valid) {
      console.log('[!] Session tidak valid atau kedaluwarsa. Menjalankan login interaktif ulang...');
      await this.close();
      await runInteractiveLogin();

      // Relaunch with refreshed storage state
      return this.init();
    }
  }

  private setupNetworkInterception(): void {
    if (!this.page) return;

    this.page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/lib/ajax/service.php')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            if (Array.isArray(data)) {
              for (const entry of data) {
                if (entry?.data?.events && Array.isArray(entry.data.events)) {
                  this.parseMoodleAjaxEvents(entry.data.events);
                }
              }
            } else if (data?.events && Array.isArray(data.events)) {
              this.parseMoodleAjaxEvents(data.events);
            }
          }
        } catch {
          // Ignore non-json or unreadable responses
        }
      }
    });
  }

  private parseMoodleAjaxEvents(events: any[]): void {
    for (const ev of events) {
      if (!ev) continue;
      const dueDate = ev.formattedtime || (ev.timesort ? new Date(ev.timesort * 1000).toLocaleString('id-ID') : 'Tidak ditentukan');
      const item: TimelineItem = {
        id: ev.id || `${ev.name}-${ev.timesort}`,
        name: ev.activityname || ev.name || 'Untitled Event',
        courseName: ev.course?.fullname || ev.course?.shortname || 'Mata Kuliah Tidak Dikenal',
        activityType: (ev.activitytype || 'other') as any,
        dueDate: dueDate,
        dueTimestamp: ev.timesort ? ev.timesort * 1000 : undefined,
        isOverdue: Boolean(ev.overdue),
        actionUrl: ev.action?.url || ev.url || '',
        actionName: ev.action?.name || 'Buka Aktivitas',
        status: ev.overdue ? 'Overdue' : 'Upcoming',
      };

      // Deduplicate by id or actionUrl
      if (!this.interceptedItems.some((x) => x.id === item.id || (x.actionUrl && x.actionUrl === item.actionUrl))) {
        this.interceptedItems.push(item);
      }
    }
  }

  public async scrape(): Promise<ScrapeResult> {
    if (!this.page) {
      throw new Error('Scraper belum diinisialisasi. Panggil init() terlebih dahulu.');
    }

    console.log('\n[*] ========================================================');
    console.log('[*] Memulai pengambilan data Timeline & Deadline...');
    console.log('[*] ========================================================');

    // 1. Navigate to Dashboard
    console.log(`[*] Mengunjungi Dashboard: ${this.config.dashboardUrl}`);
    await this.page.goto(this.config.dashboardUrl, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout,
    }).catch(async () => {
      // Fallback if networkidle takes too long
      console.log('[*] networkidle timeout, melanjutkan dengan domcontentloaded...');
      await this.page!.waitForLoadState('domcontentloaded');
    });

    // Extract student name
    const studentName = await this.extractStudentName();
    console.log(`[+] Terdeteksi Akun Mahasiswa: ${studentName || 'Tidak Diketahui'}`);

    // Try interacting with the timeline filter to load all items (e.g. Next 6 months / All)
    await this.expandTimelineFilters();

    // Wait a moment for AJAX requests to finish
    await this.page.waitForTimeout(3000);

    // 2. Extract DOM timeline items from dashboard
    console.log('[*] Mengambil data timeline langsung dari DOM Dashboard...');
    const domItems = await this.extractTimelineFromDom();
    console.log(`[+] Berhasil mengekstrak ${domItems.length} item dari DOM Dashboard.`);

    // 3. Fallback / supplement: check Calendar Upcoming view
    console.log(`[*] Mengecek kalender upcoming: ${this.config.calendarUrl}`);
    const calendarItems = await this.extractFromCalendarUpcoming();
    console.log(`[+] Berhasil mengekstrak ${calendarItems.length} item dari Kalender Upcoming.`);

    // 4. Extract enrolled courses list
    const courses = await this.extractCourses();

    // 5. Merge and deduplicate all sources
    const allItems = this.mergeItems([
      ...this.interceptedItems,
      ...domItems,
      ...calendarItems,
    ]);

    // Sort by dueTimestamp ascending (earliest deadlines first)
    allItems.sort((a, b) => {
      if (a.dueTimestamp && b.dueTimestamp) {
        return a.dueTimestamp - b.dueTimestamp;
      }
      return 0;
    });

    const overdueCount = allItems.filter((i) => i.isOverdue).length;
    const upcomingCount = allItems.length - overdueCount;

    return {
      scrapedAt: new Date().toISOString(),
      studentName,
      totalTimelineItems: allItems.length,
      overdueCount,
      upcomingCount,
      items: allItems,
      courses,
    };
  }

  private async extractStudentName(): Promise<string> {
    if (!this.page) return '';
    try {
      return await this.page.evaluate(() => {
        const userMenu =
          document.querySelector('.usermenu .usertext') ||
          document.querySelector('.userbutton .usertext') ||
          document.querySelector('.user-name') ||
          document.querySelector('[data-region="user-menu"]');
        return userMenu ? (userMenu.textContent || '').trim() : '';
      });
    } catch {
      return '';
    }
  }

  private async expandTimelineFilters(): Promise<void> {
    if (!this.page) return;
    try {
      // Look for timeline filter dropdowns (RemUI or standard Moodle)
      // Often button with [data-filter="all"] or dropdown inside [data-region="timeline-view"]
      const dropdowns = await this.page.$$(
        '[data-region="timeline-view"] [data-action="select-day-filter"], [data-region="timeline-view"] .dropdown-toggle'
      );
      for (const dd of dropdowns) {
        try {
          await dd.click();
          await this.page.waitForTimeout(500);

          // Click 'All' or 'Next 6 months' if available
          const allOption = await this.page.$(
            '[data-filtername="all"], [data-days="0"], [data-days="180"], a:has-text("All"), a:has-text("Next 6 months")'
          );
          if (allOption) {
            await allOption.click();
            await this.page.waitForTimeout(1500);
            break;
          }
        } catch {
          // ignore
        }
      }

      // Check if there is a "Show more activities" or "Load more" button
      const showMoreBtn = await this.page.$(
        '[data-region="timeline-view"] [data-action="more-events"], [data-region="timeline-view"] button:has-text("more")'
      );
      if (showMoreBtn) {
        console.log('[*] Menemukan tombol "Show more", mengklik untuk memuat lebih banyak...');
        await showMoreBtn.click();
        await this.page.waitForTimeout(1500);
      }
    } catch {
      // Non-critical
    }
  }

  private async extractTimelineFromDom(): Promise<TimelineItem[]> {
    if (!this.page) return [];
    try {
      return await this.page.evaluate(() => {
        const results: TimelineItem[] = [];

        // Select timeline containers
        const timelineRoot = document.querySelector('[data-region="timeline-view"]') || document.querySelector('.block-timeline');
        if (!timelineRoot) return results;

        // Find list items
        const itemNodes = timelineRoot.querySelectorAll(
          '[data-region="event-list-item"], .timeline-event-list-item, [data-event-id], .list-group-item'
        );

        itemNodes.forEach((node, index) => {
          const titleEl = node.querySelector(
            '[data-region="event-name"], .event-name, h6, .list-group-item-heading, a[href*="/mod/"]'
          );
          const linkEl = node.querySelector('a[href*="/mod/"]') || node.querySelector('a');
          const courseEl = node.querySelector(
            '[data-region="course-name"], .course-name, .text-muted, small'
          );
          const dateEl = node.querySelector(
            '[data-region="event-time"], .event-time, .text-danger, .date, time'
          );
          const actionBtn = node.querySelector('button, .btn, a.btn');

          const name = titleEl ? (titleEl.textContent || '').trim() : '';
          const actionUrl = linkEl ? (linkEl as HTMLAnchorElement).href : '';
          const courseName = courseEl ? (courseEl.textContent || '').trim() : 'Mata Kuliah';
          const dueDate = dateEl ? (dateEl.textContent || '').trim() : '';
          const actionName = actionBtn ? (actionBtn.textContent || '').trim() : '';

          if (name && (actionUrl || dueDate)) {
            let activityType: any = 'other';
            if (actionUrl.includes('/mod/assign/')) activityType = 'assign';
            else if (actionUrl.includes('/mod/quiz/')) activityType = 'quiz';
            else if (actionUrl.includes('/mod/forum/')) activityType = 'forum';

            const isOverdue =
              node.classList.contains('overdue') ||
              (dateEl?.classList.contains('text-danger') ?? false) ||
              dueDate.toLowerCase().includes('overdue') ||
              dueDate.toLowerCase().includes('terlambat');

            results.push({
              id: `dom-${index}-${name.slice(0, 15)}`,
              name,
              courseName,
              activityType,
              dueDate: dueDate || 'Lihat di elearning',
              isOverdue,
              actionUrl,
              actionName: actionName || 'Buka',
              status: isOverdue ? 'Overdue' : 'Upcoming',
            });
          }
        });

        return results;
      });
    } catch (err: any) {
      console.log('[-] Gagal mengekstrak dari DOM Dashboard:', err.message);
      return [];
    }
  }

  private async extractFromCalendarUpcoming(): Promise<TimelineItem[]> {
    if (!this.page) return [];
    try {
      await this.page.goto(this.config.calendarUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      return await this.page.evaluate(() => {
        const results: TimelineItem[] = [];
        const eventCards = document.querySelectorAll('.eventlist .event, [data-event-component]');

        eventCards.forEach((card, index) => {
          const nameEl = card.querySelector('.name, [data-region="event-item-name"]');
          const dateEl = card.querySelector('.date, .calendar-event-date');
          const courseEl = card.querySelector('.course, [data-region="course-name"]');
          const linkEl = card.querySelector('.card-footer a, a.card-link, .name a, a[href*="/mod/"]');

          const name = nameEl ? (nameEl.textContent || '').trim() : '';
          const dueDate = dateEl ? (dateEl.textContent || '').trim() : '';
          const courseName = courseEl ? (courseEl.textContent || '').trim() : 'Mata Kuliah';
          const actionUrl = linkEl ? (linkEl as HTMLAnchorElement).href : '';

          if (name) {
            let activityType: any = 'other';
            if (actionUrl.includes('/mod/assign/')) activityType = 'assign';
            else if (actionUrl.includes('/mod/quiz/')) activityType = 'quiz';
            else if (actionUrl.includes('/mod/forum/')) activityType = 'forum';

            results.push({
              id: `cal-${index}-${name.slice(0, 15)}`,
              name,
              courseName,
              activityType,
              dueDate: dueDate || 'Lihat di kalender',
              isOverdue: dueDate.toLowerCase().includes('overdue') || dueDate.toLowerCase().includes('terlambat'),
              actionUrl,
              actionName: 'Buka Kalender/Tugas',
              status: 'Upcoming',
            });
          }
        });

        return results;
      });
    } catch (err: any) {
      console.log('[-] Catatan: Halaman upcoming calendar tidak dapat diakses atau kosong:', err.message);
      return [];
    }
  }

  private async extractCourses(): Promise<CourseSummary[]> {
    if (!this.page) return [];
    try {
      await this.page.goto(this.config.dashboardUrl, { waitUntil: 'domcontentloaded' });
      return await this.page.evaluate(() => {
        const list: CourseSummary[] = [];
        const courseCards = document.querySelectorAll(
          '[data-region="course-content"], .course-info-container, .dashboard-card, .coursename'
        );

        courseCards.forEach((card, idx) => {
          const link = card.querySelector('a[href*="/course/view.php"]') as HTMLAnchorElement | null;
          const title = card.querySelector('.coursename, .course-name, h5, h6');
          const fullName = (title?.textContent || link?.textContent || '').trim();
          if (fullName && link) {
            const match = link.href.match(/id=(\d+)/);
            const id = match ? match[1] : idx;
            if (!list.some((c) => c.fullName === fullName)) {
              list.push({
                id,
                fullName,
                url: link.href,
              });
            }
          }
        });

        return list;
      });
    } catch {
      return [];
    }
  }

  private mergeItems(items: TimelineItem[]): TimelineItem[] {
    const map = new Map<string, TimelineItem>();

    for (const item of items) {
      // Generate normalized key based on activity name and course name
      const normName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normCourse = item.courseName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = item.actionUrl || `${normCourse}_${normName}`;

      if (!map.has(key)) {
        map.set(key, item);
      } else {
        // Merge attributes to keep the most complete data
        const existing = map.get(key)!;
        if (!existing.dueTimestamp && item.dueTimestamp) {
          existing.dueTimestamp = item.dueTimestamp;
        }
        if (existing.dueDate.length < item.dueDate.length) {
          existing.dueDate = item.dueDate;
        }
        if (!existing.actionUrl && item.actionUrl) {
          existing.actionUrl = item.actionUrl;
        }
        if (item.isOverdue) {
          existing.isOverdue = true;
          existing.status = 'Overdue';
        }
      }
    }

    return Array.from(map.values());
  }

  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.page = null;
  }
}
