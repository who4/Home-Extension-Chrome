import { storage } from './storage';
import type { WidgetDef } from './grid';

const FOCUS_KEY = 'focusSession';

interface FocusState {
  active: boolean;
  startedAt: number;
  durationMinutes: number;
  type: 'focus' | 'break';
}

let timerInterval: number | undefined;
let audioCtx: AudioContext | null = null;
let noiseNode: AudioBufferSourceNode | null = null;

async function getFocusState(): Promise<FocusState> {
  return storage.get<FocusState>(FOCUS_KEY, { active: false, startedAt: 0, durationMinutes: 25, type: 'focus' });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startNoise(scene: 'rain' | 'cafe' | 'fire'): void {
  stopNoise();
  audioCtx = new AudioContext();
  const bufferSize = 2 * audioCtx.sampleRate;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);

  // Simple noise generation
  for (let i = 0; i < bufferSize; i++) {
    const t = i / audioCtx.sampleRate;
    switch (scene) {
      case 'rain':
        // Brown noise (low-pass filtered white noise)
        data[i] = (Math.random() * 2 - 1) * 0.5 * Math.exp(-t * 0.3);
        break;
      case 'cafe':
        // Mid-range noise with slight modulation
        data[i] = (Math.random() * 2 - 1) * 0.3 * (1 + 0.3 * Math.sin(t * 0.5));
        break;
      case 'fire':
        // Crackly noise with random bursts
        data[i] = (Math.random() * 2 - 1) * 0.2 * (Math.random() > 0.997 ? 3 : 1);
        break;
    }
  }

  noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  noiseNode.loop = true;

  // Low-pass filter for warmth
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = scene === 'rain' ? 800 : scene === 'fire' ? 1200 : 2000;

  const gain = audioCtx.createGain();
  gain.gain.value = 0.15;

  noiseNode.connect(filter).connect(gain).connect(audioCtx.destination);
  noiseNode.start();
}

function stopNoise(): void {
  noiseNode?.stop();
  noiseNode = null;
  audioCtx?.close();
  audioCtx = null;
}

export const focusWidget: WidgetDef = {
  id: 'focus',
  title: 'Focus Mode',
  defaultSize: { colSpan: 2, rowSpan: 1 },
  async render(container) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;';

    const state = await getFocusState();
    const timerEl = document.createElement('div');
    timerEl.style.cssText = 'font-size:2rem;font-weight:600;color:var(--text-primary);font-variant-numeric:tabular-nums;font-family:-apple-system,monospace;';

    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:11px;color:var(--text-secondary);';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const startBtn = document.createElement('button');
    startBtn.style.cssText = 'background:rgba(48,209,88,0.2);border:1px solid rgba(48,209,88,0.4);color:#30D158;font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600;';

    const stopBtn = document.createElement('button');
    stopBtn.style.cssText = 'background:rgba(255,69,58,0.15);border:1px solid rgba(255,69,58,0.3);color:#ff453a;font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:inherit;';
    stopBtn.textContent = 'Stop';

    const sceneSelect = document.createElement('select');
    sceneSelect.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text-secondary);font-size:11px;padding:4px 8px;border-radius:6px;font-family:inherit;';
    for (const s of ['rain', 'cafe', 'fire']) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      sceneSelect.appendChild(opt);
    }

    btnRow.append(startBtn, stopBtn, sceneSelect);
    container.append(timerEl, statusEl, btnRow);

    // Timer logic
    const updateTimer = (): void => {
      if (!state.active) {
        timerEl.textContent = formatTime(state.durationMinutes * 60);
        statusEl.textContent = 'Ready to focus';
        startBtn.textContent = '▶ Start';
        return;
      }

      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      const total = state.durationMinutes * 60;
      const remaining = Math.max(0, total - elapsed);
      timerEl.textContent = formatTime(remaining);
      statusEl.textContent = state.type === 'focus' ? 'Focusing...' : 'Break time';

      if (remaining <= 0) {
        state.active = false;
        void storage.set(FOCUS_KEY, state);
        clearInterval(timerInterval);
        stopNoise();
        startBtn.textContent = '▶ Start';
        statusEl.textContent = state.type === 'focus' ? 'Focus session complete!' : 'Break over';
      }
    };

    updateTimer();
    window.clearInterval(timerInterval);
    if (state.active) {
      timerInterval = window.setInterval(updateTimer, 1000);
    }

    startBtn.addEventListener('click', async () => {
      const s = await getFocusState();
      if (s.active) return;
      s.active = true;
      s.startedAt = Date.now();
      s.type = 'focus';
      await storage.set(FOCUS_KEY, s);
      startNoise(sceneSelect.value as 'rain' | 'cafe' | 'fire');
      timerInterval = window.setInterval(updateTimer, 1000);
      updateTimer();
    });

    stopBtn.addEventListener('click', async () => {
      const s = await getFocusState();
      s.active = false;
      await storage.set(FOCUS_KEY, s);
      window.clearInterval(timerInterval);
      stopNoise();
      updateTimer();
    });
  },
  cleanup() {
    window.clearInterval(timerInterval);
    stopNoise();
  }
};
