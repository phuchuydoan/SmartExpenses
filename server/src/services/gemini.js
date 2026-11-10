// Thin client for the Gemini REST API. The API key never leaves the backend.
import { config } from '../config.js';

export const geminiEnabled = () => Boolean(config.geminiApiKey);

export class GeminiError extends Error {}

/**
 * Asks Gemini for a JSON answer that follows `schema` (Gemini responseSchema).
 * `contents` is either a string or an array of { role, text } turns.
 */
export async function generateJson({ system, contents, schema, temperature = 0.4, timeoutMs = 25000 }) {
  if (!geminiEnabled()) throw new GeminiError('Gemini API key is not configured');

  const turns = typeof contents === 'string' ? [{ role: 'user', text: contents }] : contents;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.role === 'model' ? 'model' : 'user', parts: [{ text: t.text }] })),
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
      maxOutputTokens: 2048,
      // Flash models answer faster without extended thinking; the numbers are precomputed anyway.
      ...(config.geminiModel.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch (err) {
    throw new GeminiError(`Could not reach Gemini: ${err.message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GeminiError(`Gemini responded with ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new GeminiError('Gemini returned an empty answer');
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError('Gemini returned invalid JSON');
  }
}
