/**
 * AI explanation provider adapter.
 *
 * Provides welfare-explanation summaries from assessed factors.
 *
 * IMPORTANT CONSTRAINTS (enforced here):
 * - Names, personnel IDs and unit locations are NEVER sent to external AI.
 * - Confidential case notes are NEVER sent.
 * - External AI is DISABLED unless GEMINI_API_KEY is configured.
 * - Separate consent is required before transmitting any free-text wellness entries.
 * - If the provider fails or is unconfigured, a template fallback is returned
 *   and clearly identified as such.
 *
 * The AI may only:
 *   - Summarize already-calculated contributing factors
 *   - Explain the result in accessible language
 *   - Draft a welfare summary for human review
 *
 * The AI must NOT:
 *   - Diagnose conditions
 *   - Change risk scores
 *   - Make disciplinary recommendations
 *   - Contact anyone automatically
 */

import type { Factor } from "@/lib/domain";

interface ExplanationInput {
  /** Factor names and scores only — NO names, IDs or locations */
  factors: Array<{ name: string; kind: string; points: number; value: string }>;
  totalScore: number;
  priority: string;
  missingDataFlags: string[];
  /** Only include if separate AI-processing consent was granted */
  optionalWellnessText?: string;
}

interface ExplanationResult {
  text: string;
  source: "gemini" | "template";
}

export async function getAiExplanation(
  input: ExplanationInput
): Promise<ExplanationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { text: buildTemplateExplanation(input), source: "template" };
  }

  try {
    const result = await callGemini(apiKey, input);
    return { text: result, source: "gemini" };
  } catch (err) {
    console.error("[ai-provider] Gemini call failed, using template:", err);
    return { text: buildTemplateExplanation(input), source: "template" };
  }
}

async function callGemini(
  apiKey: string,
  input: ExplanationInput
): Promise<string> {
  const factorLines = input.factors
    .filter((f) => f.points > 0)
    .map((f) => `- ${f.name} (${f.kind}): ${f.value} — ${f.points} points`)
    .join("\n");

  const missingNote =
    input.missingDataFlags.length > 0
      ? `\nNote: ${input.missingDataFlags.join("; ")}. These add no negative points.`
      : "";

  const prompt = `You are a welfare support assistant. Based on the following anonymized duty and wellness indicators for an unnamed service personnel, write a brief (3–5 sentence) plain-language summary that a welfare officer can use as context before a conversation. Do NOT diagnose any condition, prescribe treatment, or make any recommendation beyond welfare conversation. Do NOT invent any information not present in the factors below.

Welfare indicator score: ${input.totalScore}/100 (${input.priority} priority)

Contributing factors:
${factorLines}${missingNote}

Write the summary in the third person (e.g., "This individual..."). Do not include any identifier.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 256,
            stopSequences: [],
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API returned ${response.status}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error("Empty Gemini response");

    // Validate output doesn't contain personal identifiers (basic guard)
    if (/\bS-\d{4}\b/.test(text) || /personnel id/i.test(text)) {
      throw new Error("AI output contained potential identifier — discarding");
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function buildTemplateExplanation(input: ExplanationInput): string {
  const top = input.factors
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  if (top.length === 0) {
    return `[Template explanation — AI unavailable] The welfare indicator score is ${input.totalScore}/100 (${input.priority}). No individual factor currently exceeds a threshold. The score may change if organizational records are updated or wellness information is shared.`;
  }

  const topNames = top.map((f) => f.name.toLowerCase()).join(", ");
  return `[Template explanation — AI unavailable] The welfare indicator score is ${input.totalScore}/100 (${input.priority}). The highest-contributing factors are: ${topNames}. This is a prioritization aid for a welfare conversation, not a diagnosis. A welfare officer should review the full factor context before any action.`;
}
