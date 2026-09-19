import { storage } from './storage';
import type { WidgetDef } from './grid';

const HABITS_KEY = 'habits';
const YEAR_KEY = 'habitYear';

export interface Habit {
  id: string;
  name: string;
  color: string;
}

interface HabitYear {
  [habitId: string]: string[]; // array of "YYYY-MM-DD"
}

async function getHabits(): Promise<Habit[]> {
  return storage.get<Habit[]>(HABITS_KEY, []);
}

async function getYearData(): Promise<HabitYear> {
  return storage.get<HabitYear>(YEAR_KEY, {});
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yearDates(year: number): string[] {
  const dates: string[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
}

function drawHeatmap(canvas: HTMLCanvasElement, completedDates: Set<string>, year: number, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 400;
  const h = canvas.clientHeight || 60;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const dates = yearDates(year);
  const startDate = new Date(year, 0, 1);
  const startDay = startDate.getDay(); // 0=Sun
  const cellSize = Math.floor((w - 10) / 53);
  const gap = 2;

  for (let i = 0; i < dates.length; i++) {
    const col = Math.floor((i + startDay) / 7);
    const row = (i + startDay) % 7;
    const x = col * (cellSize + gap) + 2;
    const y = row * (cellSize + gap) + 2;

    ctx.fillStyle = completedDates.has(dates[i]) ? color : 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(x, y, cellSize, cellSize, 1);
    ctx.fill();
  }
}

function streak(dates: string[]): number {
  const sorted = [...dates].sort().reverse();
  if (sorted.length === 0) return 0;
  const today = todayStr();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (sorted[0] !== today && sorted[0] !== yesterdayStr) return 0;

  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    prev.setDate(prev.getDate() - 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    if (sorted[i] === prevStr) count++;
    else break;
  }
  return count;
}

export const habitsWidget: WidgetDef = {
  id: 'habits',
  title: 'Habits',
  defaultSize: { colSpan: 4, rowSpan: 2 },
  async render(container) {
    container.innerHTML = '';
    container.style.overflow = 'auto';

    const habits = await getHabits();
    const yearData = await getYearData();
    const today = todayStr();
    const year = new Date().getFullYear();

    // Add habit form
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'New habit...';
    nameInput.style.cssText = 'flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text-primary);font-size:12px;padding:5px 8px;border-radius:8px;font-family:inherit;';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#30D158';
    colorInput.style.cssText = 'width:30px;height:30px;border:none;background:none;cursor:pointer;padding:0;';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:none;color:white;font-size:14px;width:30px;border-radius:8px;cursor:pointer;';

    addBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const newHabit: Habit = { id: Date.now().toString(), name, color: colorInput.value };
      const all = await getHabits();
      all.push(newHabit);
      await storage.set(HABITS_KEY, all);
      nameInput.value = '';
      this.render(container);
    });

    addRow.append(nameInput, colorInput, addBtn);
    container.appendChild(addRow);

    if (habits.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--text-secondary);font-size:12px;padding:16px 0;';
      empty.textContent = 'Add a habit to start tracking';
      container.appendChild(empty);
      return;
    }

    // Render each habit
    for (const habit of habits) {
      const dates = new Set(yearData[habit.id] || []);
      const completedToday = dates.has(today);

      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:10px;';

      // Header row
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';

      const dot = document.createElement('div');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${habit.color};flex-shrink:0;`;

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-primary);flex:1;';
      nameEl.textContent = habit.name;

      const streakEl = document.createElement('span');
      streakEl.style.cssText = 'font-size:11px;color:var(--text-secondary);';
      const s = streak(habit.id in yearData ? yearData[habit.id] : []);
      streakEl.textContent = s > 0 ? `${s}d streak 🔥` : '';

      const checkBtn = document.createElement('button');
      checkBtn.style.cssText = `width:24px;height:24px;border-radius:6px;border:2px solid ${habit.color};background:${completedToday ? habit.color : 'transparent'};cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:white;transition:all 0.15s;`;
      checkBtn.textContent = completedToday ? '✓' : '';
      checkBtn.addEventListener('click', async () => {
        const all = await getYearData();
        if (!all[habit.id]) all[habit.id] = [];
        if (completedToday) {
          all[habit.id] = all[habit.id].filter((d) => d !== today);
        } else {
          all[habit.id].push(today);
        }
        await storage.set(YEAR_KEY, all);
        this.render(container);
      });

      header.append(dot, nameEl, streakEl, checkBtn);
      row.appendChild(header);

      // Heatmap
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:44px;';
      row.appendChild(canvas);

      // Defer draw to after DOM attachment
      requestAnimationFrame(() => drawHeatmap(canvas, dates, year, habit.color));

      container.appendChild(row);
    }
  }
};
