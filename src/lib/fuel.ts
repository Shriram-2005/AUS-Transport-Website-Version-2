// Fuel entries and master bunks store with LocalStorage persistence, live custom events, and Supabase sync
// Independent from freight invoices

export interface FuelEntry {
  id: string;            // Standard RFC-4122 UUID
  vehicleNumber: string; // Registration number in uppercase
  date: string;          // DD-MM-YYYY
  billNumber: string;    // Bunk bill number
  particulars: 'Diesel' | 'Petrol';
  liters: number;
  ratePerLiter: number;
  totalAmount: number;
  bunkName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FuelSummaryStats {
  totalLiters: number;
  totalAmount: number;
  averageRate: number;
  entryCount: number;
}

const STORAGE_KEY = 'aus_transport_fuel_entries_v1';
const BUNKS_STORAGE_KEY = 'aus_transport_fuel_bunks_v1';

export const FUEL_ENTRIES_CHANGE_EVENT = 'aus_fuel_entries_changed';
export const FUEL_BUNKS_CHANGE_EVENT = 'aus_fuel_bunks_changed';

export const DEFAULT_BUNK_NAMES: string[] = [
  'HP Fuel Station',
  'Indian Oil (IOCL)',
  'Bharat Petroleum (BPCL)',
  'Reliance Petroleum',
  'Nayara Energy',
  'Shell Petrol Bunk',
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
 * Normalizes fuel entry object ensuring clean numbers, uppercase vehicle number, and valid UUID.
 */
function normalizeFuelEntry(f: any): FuelEntry {
  const liters = Number(f.liters) || 0;
  const rate = Number(f.ratePerLiter || f.rate_per_liter) || 0;
  const total = Number(f.totalAmount || f.total_amount) || Math.round(liters * rate * 100) / 100;
  const rawId = f.id ? String(f.id).trim() : '';

  return {
    id: isValidUUID(rawId) ? rawId : generateUUID(),
    vehicleNumber: (f.vehicleNumber || f.vehicle_number || '').trim().toUpperCase(),
    date: (f.date || f.entry_date || '').trim(),
    billNumber: (f.billNumber || f.bill_number || '').trim(),
    particulars: (f.particulars || f.fuel_type || 'Diesel') === 'Petrol' ? 'Petrol' : 'Diesel',
    liters: Math.round(liters * 100) / 100,
    ratePerLiter: Math.round(rate * 100) / 100,
    totalAmount: Math.round(total * 100) / 100,
    bunkName: (f.bunkName || f.bunk_name || '').trim(),
    createdAt: f.createdAt || f.created_at || new Date().toISOString(),
    updatedAt: f.updatedAt || f.updated_at || new Date().toISOString(),
  };
}

export function getStoredFuelEntries(): FuelEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeFuelEntry);
    }
    return [];
  } catch (err) {
    console.error('Error reading fuel entries from localStorage:', err);
    return [];
  }
}

export function saveStoredFuelEntries(entries: FuelEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = entries.map(normalizeFuelEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(FUEL_ENTRIES_CHANGE_EVENT, { detail: normalized }));
  } catch (err) {
    console.error('Error saving fuel entries to localStorage:', err);
  }
}

export function addStoredFuelEntry(data: Omit<FuelEntry, 'id'> & { id?: string }): FuelEntry {
  const entries = getStoredFuelEntries();
  const newEntry = normalizeFuelEntry({
    ...data,
    id: data.id || generateUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const updated = [newEntry, ...entries];
  saveStoredFuelEntries(updated);
  return newEntry;
}

export function updateStoredFuelEntry(id: string, updates: Partial<FuelEntry>): void {
  const entries = getStoredFuelEntries();
  const updated = entries.map((entry) => {
    if (entry.id === id) {
      return normalizeFuelEntry({
        ...entry,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
    return entry;
  });
  saveStoredFuelEntries(updated);
}

export function deleteStoredFuelEntry(id: string): void {
  const entries = getStoredFuelEntries();
  const updated = entries.filter((entry) => entry.id !== id);
  saveStoredFuelEntries(updated);
}

// ==============================================================================
// Master Bunk Names Store
// ==============================================================================

export function getStoredBunkNames(): string[] {
  if (typeof window === 'undefined') return DEFAULT_BUNK_NAMES;
  try {
    const raw = localStorage.getItem(BUNKS_STORAGE_KEY);
    if (!raw) {
      saveStoredBunkNames(DEFAULT_BUNK_NAMES);
      return DEFAULT_BUNK_NAMES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Array.from(new Set(parsed.map((s) => String(s).trim()).filter(Boolean)));
    }
    return DEFAULT_BUNK_NAMES;
  } catch (err) {
    console.error('Error reading bunk names from localStorage:', err);
    return DEFAULT_BUNK_NAMES;
  }
}

export function saveStoredBunkNames(names: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = Array.from(new Set(names.map((s) => String(s).trim()).filter(Boolean)));
    localStorage.setItem(BUNKS_STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(FUEL_BUNKS_CHANGE_EVENT, { detail: clean }));
  } catch (err) {
    console.error('Error saving bunk names to localStorage:', err);
  }
}

export function addStoredBunkName(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return getStoredBunkNames();
  const current = getStoredBunkNames();
  if (!current.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...current, trimmed];
    saveStoredBunkNames(updated);
    return updated;
  }
  return current;
}

/**
 * Parses date string in DD-MM-YYYY or YYYY-MM-DD into a comparable numeric timestamp
 */
export function parseDateToTimestamp(dateStr?: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const trimmed = dateStr.trim();
  if (!trimmed) return 0;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  // YYYY-MM-DD
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
 * Filters fuel entries by vehicle and date range (inclusive)
 */
export function filterFuelEntries(
  entries: FuelEntry[],
  vehicleNumber?: string,
  fromDate?: string,
  toDate?: string
): FuelEntry[] {
  const cleanVehicle = (vehicleNumber || '').trim().toUpperCase();
  const fromTime = fromDate ? parseDateToTimestamp(fromDate) : 0;
  const toTime = toDate ? parseDateToTimestamp(toDate) + 86399999 : Infinity; // end of toDate day

  return entries.filter((item) => {
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
  }).sort((a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date));
}

/**
 * Calculates summary stats (total liters, cost, average rate)
 */
export function calculateFuelSummary(entries: FuelEntry[]): FuelSummaryStats {
  let totalLiters = 0;
  let totalAmount = 0;

  for (const item of entries) {
    totalLiters += Number(item.liters) || 0;
    totalAmount += Number(item.totalAmount) || 0;
  }

  const averageRate = totalLiters > 0 ? totalAmount / totalLiters : 0;

  return {
    totalLiters: Math.round(totalLiters * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    averageRate: Math.round(averageRate * 100) / 100,
    entryCount: entries.length,
  };
}

/**
 * Converts numbers into English words for formal statements
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero';

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

  // Indian numbering system: 1,00,00,000 (Crore), 1,00,000 (Lakh), 1,000 (Thousand), 100 (Hundred)
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
