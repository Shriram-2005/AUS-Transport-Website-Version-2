// Expenses store with LocalStorage persistence, live custom events, and Supabase sync
// Independent from freight invoices

export interface ExpenseEntry {
  id: string;               // Standard RFC-4122 UUID
  vehicleNumber: string;    // Registration number in uppercase, or 'GENERAL'
  date: string;             // DD-MM-YYYY
  voucherNumber: string;    // Voucher / Reference / Bill number
  category: string;         // Expense category
  description: string;      // Manual description / remarks
  amount: number;           // Total amount in INR
  paymentMode: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'FASTag Wallet';
  paidTo?: string;          // Recipient / Vendor name
  createdAt?: string;
  updatedAt?: string;
}

export interface ExpenseSummaryStats {
  totalAmount: number;
  expenseCount: number;
  lastExpenseDate: string;
}

const STORAGE_KEY = 'aus_transport_expenses_v1';
const CATEGORIES_STORAGE_KEY = 'aus_transport_expense_categories_v1';

export const EXPENSES_CHANGE_EVENT = 'aus_expenses_changed';
export const EXPENSE_CATEGORIES_CHANGE_EVENT = 'aus_expense_categories_changed';

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'FASTag & Highway Toll',
  'Vehicle Commercial Insurance',
  'State Permit & Road Tax',
  'Vehicle EMI & Loan Finance',
  'Driver Daily Allowance & Batta',
  'Loading & Unloading (Hamali / Coolie)',
  'Weighbridge (Dharmakanta) Fees',
  'RTO, Police & Border Checkpost',
  'Yard & Parking Shed Rent',
  'Tyre Retreading / Resoling',
  'Office Electricity & Internet',
  'Accounting, Audit & Legal Fees',
  'Other Miscellaneous Expense',
];

export const PAYMENT_MODES: ExpenseEntry['paymentMode'][] = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'FASTag Wallet',
  'Cheque',
];

/**
 * Standard RFC-4122 UUID v4 generator for both client state and Supabase UUID columns
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidUUID(str?: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Normalizes expense entry ensuring valid numbers, uppercase vehicle number, and clean text
 */
function normalizeExpenseEntry(e: any): ExpenseEntry {
  const amount = Number(e.amount) || 0;
  const rawId = e.id ? String(e.id).trim() : '';
  const rawVeh = (e.vehicleNumber || e.vehicle_number || 'GENERAL').trim().toUpperCase();

  const validModes: ExpenseEntry['paymentMode'][] = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'FASTag Wallet'];
  const mode = validModes.includes(e.paymentMode || e.payment_mode)
    ? (e.paymentMode || e.payment_mode)
    : 'Cash';

  return {
    id: isValidUUID(rawId) ? rawId : generateUUID(),
    vehicleNumber: rawVeh || 'GENERAL',
    date: (e.date || e.entry_date || '').trim(),
    voucherNumber: (e.voucherNumber || e.voucher_number || '').trim(),
    category: (e.category || 'FASTag & Highway Toll').trim(),
    description: (e.description || '').trim(),
    amount: Math.round(amount * 100) / 100,
    paymentMode: mode,
    paidTo: (e.paidTo || e.paid_to || '').trim(),
    createdAt: e.createdAt || e.created_at || new Date().toISOString(),
    updatedAt: e.updatedAt || e.updated_at || new Date().toISOString(),
  };
}

export function getStoredExpenses(): ExpenseEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeExpenseEntry);
    }
    return [];
  } catch (err) {
    console.error('Error reading expenses from localStorage:', err);
    return [];
  }
}

export function saveStoredExpenses(entries: ExpenseEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = entries.map(normalizeExpenseEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(EXPENSES_CHANGE_EVENT, { detail: normalized }));
  } catch (err) {
    console.error('Error saving expenses to localStorage:', err);
  }
}

export function addStoredExpense(
  data: Omit<ExpenseEntry, 'id'> & { id?: string }
): ExpenseEntry {
  const entries = getStoredExpenses();
  const newEntry = normalizeExpenseEntry({
    ...data,
    id: data.id || generateUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const updated = [newEntry, ...entries];
  saveStoredExpenses(updated);
  return newEntry;
}

export function updateStoredExpense(
  id: string,
  updates: Partial<ExpenseEntry>
): void {
  const entries = getStoredExpenses();
  const updated = entries.map((entry) => {
    if (entry.id === id) {
      return normalizeExpenseEntry({
        ...entry,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
    return entry;
  });
  saveStoredExpenses(updated);
}

export function deleteStoredExpense(id: string): void {
  const entries = getStoredExpenses();
  const updated = entries.filter((entry) => entry.id !== id);
  saveStoredExpenses(updated);
}

// ==============================================================================
// Master Expense Categories Store
// ==============================================================================

export function getStoredExpenseCategories(): string[] {
  if (typeof window === 'undefined') return DEFAULT_EXPENSE_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!raw) {
      saveStoredExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
      return DEFAULT_EXPENSE_CATEGORIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Array.from(new Set(parsed.map((s) => String(s).trim()).filter(Boolean)));
    }
    return DEFAULT_EXPENSE_CATEGORIES;
  } catch (err) {
    console.error('Error reading expense categories from localStorage:', err);
    return DEFAULT_EXPENSE_CATEGORIES;
  }
}

export function saveStoredExpenseCategories(categories: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = Array.from(new Set(categories.map((s) => String(s).trim()).filter(Boolean)));
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(EXPENSE_CATEGORIES_CHANGE_EVENT, { detail: clean }));
  } catch (err) {
    console.error('Error saving expense categories to localStorage:', err);
  }
}

export function addStoredExpenseCategory(category: string): string[] {
  const trimmed = category.trim();
  if (!trimmed) return getStoredExpenseCategories();
  const current = getStoredExpenseCategories();
  if (!current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...current, trimmed];
    saveStoredExpenseCategories(updated);
    return updated;
  }
  return current;
}

/**
 * Parses date string in DD-MM-YYYY or YYYY-MM-DD into numeric timestamp
 */
export function parseDateToTimestamp(dateStr?: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const trimmed = dateStr.trim();
  if (!trimmed) return 0;

  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  const fallback = new Date(trimmed).getTime();
  return isNaN(fallback) ? 0 : fallback;
}

/**
 * Filters expenses by vehicle (or 'GENERAL') and date range (inclusive)
 */
export function filterExpenses(
  entries: ExpenseEntry[],
  vehicleNumber?: string,
  fromDate?: string,
  toDate?: string
): ExpenseEntry[] {
  const cleanVehicle = (vehicleNumber || '').trim().toUpperCase();
  const fromTime = fromDate ? parseDateToTimestamp(fromDate) : 0;
  const toTime = toDate ? parseDateToTimestamp(toDate) + 86399999 : Infinity;

  return entries
    .filter((item) => {
      if (cleanVehicle && item.vehicleNumber !== cleanVehicle) {
        return false;
      }
      const itemTime = parseDateToTimestamp(item.date);
      if (fromTime > 0 && itemTime < fromTime) {
        return false;
      }
      if (toTime < Infinity && itemTime > toTime) {
        return false;
      }
      return true;
    })
    .sort((a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date));
}

/**
 * Calculates summary metrics for expenses
 */
export function calculateExpenseSummary(entries: ExpenseEntry[]): ExpenseSummaryStats {
  let totalAmount = 0;
  let latestTime = 0;
  let lastExpenseDate = '';

  for (const item of entries) {
    totalAmount += Number(item.amount) || 0;
    const t = parseDateToTimestamp(item.date);
    if (t > latestTime) {
      latestTime = t;
      lastExpenseDate = item.date;
    }
  }

  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    expenseCount: entries.length,
    lastExpenseDate,
  };
}

/**
 * Converts numbers into English words for formal statements
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'Rupees Zero Only.';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelow1000(n: number): string {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertBelow1000(n % 100) : '');
  }

  const integerPart = Math.floor(Math.abs(num));
  if (integerPart === 0) return 'Rupees Zero Only.';

  const crore = Math.floor(integerPart / 10000000);
  let remainder = integerPart % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  const hundreds = remainder % 1000;

  let words = '';
  if (crore > 0) words += convertBelow1000(crore) + ' Crore ';
  if (lakh > 0) words += convertBelow1000(lakh) + ' Lakh ';
  if (thousand > 0) words += convertBelow1000(thousand) + ' Thousand ';
  if (hundreds > 0) words += convertBelow1000(hundreds);

  return 'Rupees ' + words.trim() + ' Only.';
}
