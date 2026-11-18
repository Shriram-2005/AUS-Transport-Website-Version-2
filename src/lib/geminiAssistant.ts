// Gemini AI Assistant Core Engine
// Configured for model: gemini-3.8-flash

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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/**
 * Call Gemini API with automatic exponential backoff retry for high demand (503)
 */
export async function callGemini(
  prompt: string,
  systemInstruction?: string,
  retries = 3
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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

  let delay = 1000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (res.status === 503 || res.status === 429) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || `Gemini API error with status code ${res.status}`
        );
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response received from Gemini API');
      }
      return text;
    } catch (err: any) {
      if (attempt === retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  throw new Error('Failed to communicate with Gemini after multiple attempts.');
}

/**
 * System prompt defining the AUS Transport Assistant persona and data extraction rules
 */
export const AUS_ASSISTANT_SYSTEM_PROMPT = `
You are the AI Assistant for AUS Transport, an Indian road logistics and freight transport fleet management system.
You help operators query, create, and update freight invoices, driver assignments, vehicle trips, branches/places, and expenses.

Core Capabilities:
1. Find bills by bill number (e.g. 439), vehicle registration (e.g. TN 76 AK 1094), driver name, branch/place, or status.
2. Parse unstructured user messages into exact billing updates:
   - Starting KM and Closing KM (running KM is Closing - Starting)
   - Freight rate / total amount
   - Deductions: Advance, Diesel cut, Toll expenses, Loading/Unloading charges
   - Driver name assignment
   - Vehicle registration number
   - Branch or Place assignment (e.g. Nilakottai, BPD, etc.)
   - TDS cut percentage (defaults to 1%, configurable per bill)
   - Payment status (paid or unpaid)
3. Return accurate calculations and polite, clear answers.
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
