// AI module — Gemini Nano feature detection + NL command parsing.
// All AI features are hidden entirely when LanguageModel API is unavailable.

let sessionReady = false;
let session: unknown = null;

export async function isAIAvailable(): Promise<boolean> {
  try {
    // Chrome's built-in LanguageModel API
    const ai = (window as unknown as { ai?: { languageModel?: unknown } }).ai;
    if (!ai?.languageModel) return false;

    // Check if we can create a session
    const languageModel = ai.languageModel as { create?: (opts?: unknown) => Promise<unknown> };
    if (typeof languageModel.create !== 'function') return false;

    session = await languageModel.create({ topK: 3 });
    sessionReady = true;
    return true;
  } catch {
    return false;
  }
}

export function isAIReady(): boolean {
  return sessionReady && session !== null;
}

interface NLResult {
  action: string;
  params: Record<string, string>;
  confidence: number;
}

/**
 * Parse a natural language command into a structured action.
 * Returns null if AI is unavailable or parsing fails.
 */
export async function parseNLCommand(input: string): Promise<NLResult | null> {
  if (!isAIReady() || !session) return null;

  try {
    const lm = session as {
      prompt: (p: string) => Promise<string>;
    };

    const prompt = `You are a command parser for a browser new tab page.
Given this user input, return a JSON object with "action", "params", and "confidence".
Actions: create_note, remove_shortcut, add_shortcut, toggle_setting, start_focus, stop_focus, search, none.
Params are key-value pairs relevant to the action.
If unsure, return action: "none".
User input: "${input.replace(/"/g, '\\"')}"
Return ONLY valid JSON, no explanation.`;

    const response = await lm.prompt(prompt);
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as NLResult;
  } catch {
    return null;
  }
}

/**
 * Summarize a news headline into a short TL;DR.
 * Returns null if AI is unavailable.
 */
export async function summarizeText(text: string): Promise<string | null> {
  if (!isAIReady() || !session) return null;

  try {
    const lm = session as { prompt: (p: string) => Promise<string> };
    const response = await lm.prompt(
      `Summarize this headline in one short sentence (under 20 words): "${text.replace(/"/g, '\\"')}"`
    );
    return response.trim();
  } catch {
    return null;
  }
}

/**
 * Organize messy text into a checklist.
 * Returns null if AI is unavailable.
 */
export async function organizeNotes(text: string): Promise<string | null> {
  if (!isAIReady() || !session) return null;

  try {
    const lm = session as { prompt: (p: string) => Promise<string> };
    const response = await lm.prompt(
      `Convert these notes into a clean checklist format (one item per line, prefixed with "- "). Remove redundancy. Notes:\n${text}`
    );
    return response.trim();
  } catch {
    return null;
  }
}

/**
 * Get AI availability info for display.
 */
export function getAICapabilities(): { available: boolean; model: string } {
  if (!isAIReady()) return { available: false, model: '' };
  try {
    const lm = session as { model?: string };
    return { available: true, model: lm.model || 'Gemini Nano' };
  } catch {
    return { available: true, model: 'Gemini Nano' };
  }
}
