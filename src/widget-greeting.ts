import type { WidgetDef } from './grid';

const GREETINGS: Array<{ from: number; to: number; text: string }> = [
  { from: 5, to: 12, text: 'Good morning' },
  { from: 12, to: 17, text: 'Good afternoon' },
  { from: 17, to: 21, text: 'Good evening' },
  { from: 21, to: 5, text: 'Good night' }
];

function getGreeting(): string {
  const h = new Date().getHours();
  return GREETINGS.find((g) => {
    if (g.from < g.to) return h >= g.from && h < g.to;
    return h >= g.from || h < g.to;
  })?.text ?? 'Hello';
}

function getDayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

export const greetingWidget: WidgetDef = {
  id: 'greeting',
  title: 'Greeting',
  defaultSize: { colSpan: 2, rowSpan: 1 },
  render(container) {
    container.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'bento-greeting';
    const label = document.createElement('div');
    label.className = 'bento-greeting-label';
    label.textContent = `${getGreeting()}, stranger`;
    const sub = document.createElement('div');
    sub.className = 'bento-greeting-sub';
    sub.textContent = `It's ${getDayName()}`;
    el.append(label, sub);
    container.appendChild(el);
  }
};
