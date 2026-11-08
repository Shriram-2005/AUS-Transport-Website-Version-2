// Repairs & Maintenance store with LocalStorage persistence, live custom events, and Supabase sync
// Independent from freight invoices

export interface MaintenanceEntry {
  id: string;               // Standard RFC-4122 UUID
  vehicleNumber: string;    // Registration number in uppercase
  date: string;             // DD-MM-YYYY
  billNumber: string;       // Workshop bill / invoice / job slip number
  category: string;         // Pre-defined or custom service category
  description: string;      // Manual work details / spare parts replaced
  amount: number;           // Total cost in INR
  workshopName?: string;    // Garage / Workshop name
  odometerKm?: number;      // Current KM reading at service (optional)
  createdAt?: string;
  updatedAt?: string;
}

export interface MaintenanceSummaryStats {
  totalCost: number;
  serviceCount: number;
  lastServiceDate: string;
}

const STORAGE_KEY = 'aus_transport_maintenance_entries_v1';
const CATEGORIES_STORAGE_KEY = 'aus_transport_maintenance_categories_v1';
const WORKSHOPS_STORAGE_KEY = 'aus_transport_maintenance_workshops_v1';

export const MAINTENANCE_ENTRIES_CHANGE_EVENT = 'aus_maintenance_entries_changed';
export const MAINTENANCE_CATEGORIES_CHANGE_EVENT = 'aus_maintenance_categories_changed';
export const MAINTENANCE_WORKSHOPS_CHANGE_EVENT = 'aus_maintenance_workshops_changed';

export const DEFAULT_MAINTENANCE_CATEGORIES: string[] = [
  'Engine Oil & Filter Change',
  'Tyre Replacement / Alignment / Puncture',
  'Brake Shoes & Disc Pad Service',
  'Clutch & Pressure Plate Overhaul',
  'Greasing & Full Water Wash',
  'Leaf Spring (Patta) Repair / Retension',
  'Electrical & Battery Replacement',
  'Gearbox & Differential Oil Service',
  'Radiator & Coolant Service',
  'Air Filter & Fuel Filter Change',
  'Body Welding & Tinkering / Paint',
  'FC & Fitness Certificate Work',
  'General Routine Maintenance',
  'Other Custom Work',
];

export const DEFAULT_WORKSHOPS: string[] = [
  'In-House Yard Workshop',
  'TVS Service Station',
  'Ashok Leyland Authorized Workshop',
  'Tata Motors Commercial Workshop',
  'Sri Murugan Auto Garage',
  'Royal Auto Electrical Works',
  'City Commercial Tyre Service',
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
 * Normalizes maintenance entry ensuring valid numbers, uppercase vehicle number, and clean text
 */
function normalizeMaintenanceEntry(m: any): MaintenanceEntry {
  const amount = Number(m.amount) || 0;
  const odo = m.odometerKm !== undefined && m.odometerKm !== null ? Number(m.odometerKm) : Number(m.odometer_km) || 0;
  const rawId = m.id ? String(m.id).trim() : '';

  return {
    id: isValidUUID(rawId) ? rawId : generateUUID(),
    vehicleNumber: (m.vehicleNumber || m.vehicle_number || '').trim().toUpperCase(),
    date: (m.date || m.entry_date || '').trim(),
    billNumber: (m.billNumber || m.bill_number || '').trim(),
    category: (m.category || 'General Routine Maintenance').trim(),
    description: (m.description || '').trim(),
    amount: Math.round(amount * 100) / 100,
    workshopName: (m.workshopName || m.workshop_name || '').trim(),
    odometerKm: odo > 0 ? odo : undefined,
    createdAt: m.createdAt || m.created_at || new Date().toISOString(),
    updatedAt: m.updatedAt || m.updated_at || new Date().toISOString(),
  };
}

export function getStoredMaintenanceEntries(): MaintenanceEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeMaintenanceEntry);
    }
    return [];
  } catch (err) {
    console.error('Error reading maintenance entries from localStorage:', err);
    return [];
  }
}

export function saveStoredMaintenanceEntries(entries: MaintenanceEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = entries.map(normalizeMaintenanceEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(MAINTENANCE_ENTRIES_CHANGE_EVENT, { detail: normalized }));
  } catch (err) {
    console.error('Error saving maintenance entries to localStorage:', err);
  }
}

export function addStoredMaintenanceEntry(
  data: Omit<MaintenanceEntry, 'id'> & { id?: string }
): MaintenanceEntry {
  const entries = getStoredMaintenanceEntries();
  const newEntry = normalizeMaintenanceEntry({
    ...data,
    id: data.id || generateUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const updated = [newEntry, ...entries];
  saveStoredMaintenanceEntries(updated);
  return newEntry;
}

export function updateStoredMaintenanceEntry(
  id: string,
  updates: Partial<MaintenanceEntry>
): void {
  const entries = getStoredMaintenanceEntries();
  const updated = entries.map((entry) => {
    if (entry.id === id) {
      return normalizeMaintenanceEntry({
        ...entry,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
    return entry;
  });
  saveStoredMaintenanceEntries(updated);
}

export function deleteStoredMaintenanceEntry(id: string): void {
  const entries = getStoredMaintenanceEntries();
  const updated = entries.filter((entry) => entry.id !== id);
  saveStoredMaintenanceEntries(updated);
}

// ==============================================================================
// Master Categories Store
// ==============================================================================

export function getStoredCategories(): string[] {
  if (typeof window === 'undefined') return DEFAULT_MAINTENANCE_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!raw) {
      saveStoredCategories(DEFAULT_MAINTENANCE_CATEGORIES);
      return DEFAULT_MAINTENANCE_CATEGORIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Array.from(new Set(parsed.map((s) => String(s).trim()).filter(Boolean)));
    }
    return DEFAULT_MAINTENANCE_CATEGORIES;
  } catch (err) {
    console.error('Error reading maintenance categories from localStorage:', err);
    return DEFAULT_MAINTENANCE_CATEGORIES;
  }
}

export function saveStoredCategories(categories: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = Array.from(new Set(categories.map((s) => String(s).trim()).filter(Boolean)));
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(MAINTENANCE_CATEGORIES_CHANGE_EVENT, { detail: clean }));
  } catch (err) {
    console.error('Error saving maintenance categories to localStorage:', err);
  }
}

export function addStoredCategory(category: string): string[] {
  const trimmed = category.trim();
  if (!trimmed) return getStoredCategories();
  const current = getStoredCategories();
  if (!current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...current, trimmed];
    saveStoredCategories(updated);
    return updated;
  }
  return current;
}

// ==============================================================================
// Master Workshops Store
// ==============================================================================

export function getStoredWorkshops(): string[] {
  if (typeof window === 'undefined') return DEFAULT_WORKSHOPS;
  try {
    const raw = localStorage.getItem(WORKSHOPS_STORAGE_KEY);
    if (!raw) {
      saveStoredWorkshops(DEFAULT_WORKSHOPS);
      return DEFAULT_WORKSHOPS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return Array.from(new Set(parsed.map((s) => String(s).trim()).filter(Boolean)));
    }
    return DEFAULT_WORKSHOPS;
  } catch (err) {
    console.error('Error reading workshops from localStorage:', err);
    return DEFAULT_WORKSHOPS;
  }
}

export function saveStoredWorkshops(workshops: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = Array.from(new Set(workshops.map((s) => String(s).trim()).filter(Boolean)));
    localStorage.setItem(WORKSHOPS_STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(MAINTENANCE_WORKSHOPS_CHANGE_EVENT, { detail: clean }));
  } catch (err) {
    console.error('Error saving workshops to localStorage:', err);
  }
}

export function addStoredWorkshop(workshop: string): string[] {
  const trimmed = workshop.trim();
  if (!trimmed) return getStoredWorkshops();
  const current = getStoredWorkshops();
  if (!current.some((w) => w.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...current, trimmed];
    saveStoredWorkshops(updated);
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
 * Filters maintenance entries by vehicle and date range (inclusive)
 */
export function filterMaintenanceEntries(
  entries: MaintenanceEntry[],
  vehicleNumber?: string,
  fromDate?: string,
  toDate?: string
): MaintenanceEntry[] {
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
 * Calculates summary metrics for repairs & maintenance
 */
export function calculateMaintenanceSummary(entries: MaintenanceEntry[]): MaintenanceSummaryStats {
  let totalCost = 0;
  let latestTime = 0;
  let lastServiceDate = '';

  for (const item of entries) {
    totalCost += Number(item.amount) || 0;
    const t = parseDateToTimestamp(item.date);
    if (t > latestTime) {
      latestTime = t;
      lastServiceDate = item.date;
    }
  }

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    serviceCount: entries.length,
    lastServiceDate,
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

