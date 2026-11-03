const BAR_WIDTH = 10;
const SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTE = SECONDS_PER_MINUTE * SECOND;
const HOUR = MINUTES_PER_HOUR * MINUTE;
const DAY = HOURS_PER_DAY * HOUR;
const PAD = 2;
const WEEK_DAYS = 7;
const FULL = 100;

export function countdown(iso: string, now: Date): string {
  const ms = Date.parse(iso) - now.getTime();
  if (!(ms > 0)) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) {
    const minutes = String(Math.floor((ms % HOUR) / MINUTE)).padStart(PAD, '0');
    return `${Math.floor(ms / HOUR)}h${minutes}m`;
  }
  return `${Math.floor(ms / DAY)}d${Math.floor((ms % DAY) / HOUR)}h`;
}

function dayNumber(date: Date, timeZone: string | undefined): number {
  return Date.parse(date.toLocaleDateString('en-CA', { timeZone })) / DAY;
}

function dayLabel(date: Date, now: Date, parts: Record<string, string>, tz?: string): string {
  if (date.getTime() - now.getTime() >= WEEK_DAYS * DAY) {
    return `${parts.weekday} ${parts.day} ${parts.month}`;
  }
  const gap = dayNumber(date, tz) - dayNumber(now, tz);
  if (gap === 0) return 'today';
  return gap === 1 ? 'tomorrow' : String(parts.weekday);
}

export function resetAt(iso: string, now: Date, timeZone?: string): string {
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((x) => [x.type, x.value]));
  return `${dayLabel(date, now, parts, timeZone)} ${parts.hour}:${parts.minute}`;
}

export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  if (Number.isNaN(ms)) return 'never';
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  return `${Math.floor(ms / DAY)} d ago`;
}

export function usageBar(percent: number): string {
  const filled = Math.min(BAR_WIDTH, Math.max(0, Math.round((percent / FULL) * BAR_WIDTH)));
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}
