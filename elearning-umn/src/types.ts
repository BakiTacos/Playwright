export interface TimelineItem {
  id: string | number;
  name: string;
  courseName: string;
  activityType: 'assign' | 'quiz' | 'forum' | 'choice' | 'feedback' | 'other';
  dueDate: string;
  dueTimestamp?: number; // Unix timestamp in seconds or ms
  timeRemaining?: string;
  isOverdue: boolean;
  actionUrl: string;
  actionName?: string;
  status?: string;
}

export interface CourseSummary {
  id: string | number;
  fullName: string;
  shortName?: string;
  url?: string;
}

export interface ScrapeResult {
  scrapedAt: string;
  studentName?: string;
  totalTimelineItems: number;
  overdueCount: number;
  upcomingCount: number;
  items: TimelineItem[];
  courses?: CourseSummary[];
}
