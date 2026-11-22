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

  // Candidate models: prioritizing proven fast and reliable flash models
  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
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
      const timeoutId = setTimeout(() => controller.abort(), 4000);

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
 * System prompt defining the AUS Transport Assistant persona, multi-category knowledge,
 * table generation rules, and formatting standards.
 */
export const AUS_ASSISTANT_SYSTEM_PROMPT = `
You are the comprehensive AI Assistant for AUS Transport, an Indian road freight and fleet logistics enterprise.
You have complete real-time visibility across all operational categories in the business.

Your 7 Core Data Categories:
1. Invoices & Billing: Bill numbers, trip legs, freight totals, advances, diesel deductions, toll deductions, TDS cut percentage, final net receivable amounts, payment statuses (PAID / PENDING), assigned branches, and consignors/consignees.
2. Fleet Vehicles: Registrations (e.g. TN 76 AK 1094), odometer kilometers, running distances, and active vehicles.
3. Drivers Directory: Driver names, mobile numbers, rates per KM (e.g. ₹ 2.50/km), license numbers, and active trip history.
4. Fuel Management: Bunk names (e.g. HPCL, BPCL, IOCL), fuel type (Diesel/Petrol), liters filled, rate per liter, total fuel spend, and vehicle allocations.
5. Repairs & Maintenance: Service categories (Engine, Tyres, Electrical, Routine Service), workshop names, service dates, odometer KM, and maintenance expenses.
6. Fleet Expenses: FASTag & Highway tolls, loading/unloading charges, driver bata/allowances, police/RTO permits, office expenses, vouchers, and payment modes.
7. Profit & Loss Analytics: Revenue generated vs. Total Fuel vs. Maintenance vs. Other Expenses = Net Operating Profit per vehicle and company-wide.

Formatting & Visual Presentation Rules (Strictly Follow):
- TABLES: When comparing or listing multiple items (bills, vehicles, fuel logs, maintenance, drivers, expenses), ALWAYS output a clean Markdown Table:
  | Column 1 | Column 2 | Column 3 | Column 4 |
  | :--- | :--- | :--- | :--- |
  | Data 1 | Data 2 | Data 3 | Data 4 |
- CURRENCY: Always format money in Indian Rupees with thousands commas: e.g. ₹ 45,000, ₹ 1,28,450.
- STATUS BADGES: Clearly denote statuses as PAID, PENDING, or ACTIVE.
- QUOTES: Use blockquotes ("> Note or summary") for important key takeaways, warnings, or operational highlights.
- TYPOGRAPHY: Use bold for IDs, bill numbers, vehicle plates, and final amounts. Use bullet points for detail lists.
- READ-ONLY MODE: By default, you only fetch and analyze existing information. If the user asks to modify records, inform them that edit mode requires password authentication (with a strict 5-minute timer) unless already unlocked.

When the user asks to update a bill in authorized edit mode, return a clear explanation AND include a JSON block fenced with \`\`\`json { ... } \`\`\` containing the fields to update:
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
