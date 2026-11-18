// Gemini AI Assistant Core Engine
// Configured for model: gemini-3.8-flash with automatic fallback to gemini-3.5-flash-lite on high demand (503)

import fs from 'fs';
import path from 'path';

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BillUpdatePayload {
  billNumber: string;
  driverName?: string;
  vehicleNumber?: string;
  startingKm?: number;
  closingKm?: number;
  freightRate?: number;
  advanceAmount?: number;
  dieselCut?: number;
  tollCut?: number;
  otherDeductions?: number;
  branchName?: string;
  tdsRate?: number;
  paymentStatus?: 'paid' | 'unpaid';
  date?: string;
}

/**
 * Dynamically resolves the Gemini API key from process.env or .env.local
 */
export function getGeminiApiKey(): string {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch (err) {
    console.warn('Could not read .env.local for GEMINI_API_KEY:', err);
  }
  return '';
}

/**
 * Dynamically resolves the Telegram Bot token from process.env or .env.local
 */
export function getTelegramToken(): string {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim() !== '') {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/TELEGRAM_BOT_TOKEN\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch (err) {
    console.warn('Could not read .env.local for TELEGRAM_BOT_TOKEN:', err);
  }
  return '';
}

/**
 * Call Gemini API:
 * 1. Tries user-requested `gemini-3.8-flash`
 * 2. If high demand (503) or not found, automatically falls back to `gemini-3.5-flash-lite` or `gemini-3.7-flash`
 */
export async function callGemini(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is missing. Please check GEMINI_API_KEY in .env.local.');
  }

  // Candidate models: user-specified gemini-3.8-flash first, followed by proven fast models
  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-flash-latest',
  ];

  const bodyPayload: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
    },
  };

  if (systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  let lastError = '';

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      }

      lastError = data.error?.message || `HTTP ${res.status}`;
      console.warn(`Gemini model [${model}] responded with: ${lastError}. Trying fallback model...`);
    } catch (err: any) {
      lastError = err.name === 'AbortError' ? 'Request timed out' : err.message;
      console.warn(`Gemini model [${model}] error: ${lastError}. Trying fallback model...`);
    }
  }

  throw new Error(lastError || 'Failed to communicate with Gemini API.');
}

/**
 * System prompt defining the AUS Transport Assistant persona and data extraction rules
 */
export const AUS_ASSISTANT_SYSTEM_PROMPT = `
You are the AI Assistant for AUS Transport, an Indian road logistics and freight transport fleet management system.
You help operators query, create, and update freight invoices, driver assignments, vehicle trips, branches/places, and expenses.

Core Capabilities:
1. Find bills by bill number (e.g. 439), vehicle registration (e.g. TN 76 AK 1094), driver name, branch/place, or status.
2. When the user asks for recent bills, final price, or status, provide clear bullet points with Bill Number, Vehicle, Net Receivable Amount, and Status.
3. Parse unstructured user messages into exact billing updates:
   - Starting KM and Closing KM (running KM is Closing - Starting)
   - Freight rate / total amount
   - Deductions: Advance, Diesel cut, Toll expenses, Loading/Unloading charges
   - Driver name assignment
   - Vehicle registration number
   - Branch or Place assignment (e.g. Nilakottai, BPD, etc.)
   - TDS cut percentage (defaults to 1%, configurable per bill)
   - Payment status (paid or unpaid)
4. When the user asks to update or fill a bill, return a clear explanation AND include a JSON block fenced with \`\`\`json { ... } \`\`\` containing the fields to update:
{
  "action": "update_bill",
  "billNumber": "439",
  "driverName": "Murugan",
  "vehicleNumber": "TN 76 AK 1094",
  "startingKm": 45000,
  "closingKm": 45800,
  "freightRate": 16000,
  "advanceAmount": 2000,
  "dieselCut": 3500,
  "tollCut": 500,
  "otherDeductions": 200,
  "branchName": "Nilakottai",
  "tdsRate": 1,
  "paymentStatus": "unpaid",
  "date": "18-11-2026"
}

Rule: Never invent missing data. Only extract what the user specifies or ask for clarification if needed.
`;

/**
 * Parses Gemini response to check if an actionable bill update JSON is present
 */
export function extractBillUpdateAction(aiResponse: string): any | null {
  try {
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed && (parsed.action === 'update_bill' || parsed.billNumber)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not extract JSON action from Gemini response:', err);
  }
  return null;
}
