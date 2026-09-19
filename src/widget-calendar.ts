import { toJalali, JALALI_MONTHS_EN } from './jalali';
import type { WidgetDef } from './grid';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Iranian holidays (approximate Gregorian dates for 2025-2026)
const HOLIDAYS = new Set([
  '2026-03-21', '2026-03-22', '2026-03-23', '2026-03-24', '2026-03-25',
  '2026-04-02', '2026-04-04',
  '2026-05-13', '2026-06-05', '2026-06-06', '2026-06-27',
  '2026-09-09', '2026-09-27', '2026-11-25',
  '2026-12-31',
  '2027-03-21', '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25',
  '2027-04-02', '2027-04-04',
  '2027-05-13', '2027-06-05', '2027-06-06', '2027-06-27',
  '2027-09-09', '2027-09-27', '2027-11-25'
]);

function daysInMonth(year: number, month: number): number {
  if (month === 1 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) return 29;
  return DAYS_IN_MONTH[month];
}

function gregorianKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const weeks: (number | null)[][] = [];
  let day = 1;

  for (let w = 0; w < 6; w++) {
    const row: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < firstDay) { row.push(null); continue; }
      if (day > totalDays) { row.push(null); continue; }
      row.push(day++);
    }
    weeks.push(row);
    if (day > totalDays) break;
  }
  return weeks;
}

export const calendarWidget: WidgetDef = {
  id: 'calendar',
  title: 'Calendar',
  defaultSize: { colSpan: 2, rowSpan: 2 },
  render(container) {
    container.innerHTML = '';
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

    const monthLabel = document.createElement('div');
    monthLabel.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-primary);';
    monthLabel.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const jalaliLabel = document.createElement('div');
    jalaliLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);';
    const j = toJalali(year, month + 1, today);
    jalaliLabel.textContent = `${j.jd} ${JALALI_MONTHS_EN[j.jm - 1]} ${j.jy}`;

    header.append(monthLabel, jalaliLabel);

    // Weekday headers
    const weekdaysRow = document.createElement('div');
    weekdaysRow.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:4px;';
    for (const wd of WEEKDAYS) {
      const cell = document.createElement('div');
      cell.style.cssText = 'font-size:9px;text-align:center;color:var(--text-secondary);font-weight:600;padding:2px 0;';
      cell.textContent = wd;
      weekdaysRow.appendChild(cell);
    }

    // Day grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:1px;';
    const weeks = buildMonthGrid(year, month);

    for (const week of weeks) {
      for (const day of week) {
        const cell = document.createElement('div');
        cell.style.cssText = 'font-size:11px;text-align:center;padding:3px 0;border-radius:6px;';
        if (day === null) {
          cell.textContent = '';
        } else {
          cell.textContent = String(day);
          const key = gregorianKey(year, month, day);
          const isToday = day === today;
          const isHoliday = HOLIDAYS.has(key);

          if (isToday) {
            cell.style.background = 'rgba(41, 151, 255, 0.3)';
            cell.style.color = 'white';
            cell.style.fontWeight = '700';
          } else if (isHoliday) {
            cell.style.color = '#ff453a';
          } else {
            cell.style.color = 'rgba(255,255,255,0.7)';
          }
        }
        grid.appendChild(cell);
      }
    }

    container.append(header, weekdaysRow, grid);
  }
};
