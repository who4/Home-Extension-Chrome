import { storage } from './storage';
import type { WidgetDef } from './grid';

const INTENTION_KEY = 'dailyIntention';

interface IntentionData {
  text: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadIntention(): Promise<IntentionData> {
  const stored = await storage.get<IntentionData>(INTENTION_KEY);
  if (stored && stored.date === todayKey()) return stored;
  // Different day: clear old intention
  const empty: IntentionData = { text: '', date: todayKey(), completed: false };
  await storage.set(INTENTION_KEY, empty);
  return empty;
}

async function saveIntention(data: IntentionData): Promise<void> {
  await storage.set(INTENTION_KEY, data);
}

export const intentionWidget: WidgetDef = {
  id: 'intention',
  title: 'Daily Intention',
  defaultSize: { colSpan: 4, rowSpan: 1 },
  async render(container) {
    container.innerHTML = '';

    const label = document.createElement('div');
    label.className = 'bento-intention-label';
    label.textContent = "What's your intention for today?";

    const input = document.createElement('input');
    input.className = 'bento-intention-input';
    input.placeholder = 'Type your intention and press Enter…';

    const data = await loadIntention();
    if (data.text) {
      input.value = data.text;
      if (data.completed) input.classList.add('bento-intention-set');
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        saveIntention({ text: input.value.trim(), date: todayKey(), completed: false });
        input.blur();
      }
    });

    input.addEventListener('blur', () => {
      if (input.value.trim()) {
        saveIntention({ text: input.value.trim(), date: todayKey(), completed: false });
      }
    });

    input.addEventListener('focus', () => input.classList.remove('bento-intention-set'));

    container.append(label, input);
  }
};
