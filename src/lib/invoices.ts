// Invoices store with LocalStorage persistence, live custom events, and monthly KM calculations

export interface TripItem {
  id: number;
  enabled: boolean;
  date: string;
  dcNo: number | string;
  particulars: string;
  itemName: string;
  itemQuantity: string;
  driverId?: string;
  driverName?: string;
  driverRate?: number;
  route: string;
  startingKm: number;
  closingKm: number;
  rate: number;
  tollEnabled: boolean;
  tollAmount: number;
}

export interface BillData {
  id?: string;
  billNumber: number | string;
  date: string;
  vehicleNumber: string;
  consigneePreset?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  consigneeGst?: string;
  consigneeOverride?: boolean;
  activeTrip: number;
  visibleTrips: number;
  trips: TripItem[];
  keralaRtoEnabled: boolean;
  keralaRtoMultiplier: number;
  keralaRtoAmount: number;
  dieselAvgRate: number;
  rupeesInWordsMode: 'auto' | 'manual';
  rupeesInWordsText: string;
  status: 'paid' | 'unpaid';
  locked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleMonthlyStat {
  monthKey: string;   // e.g. "2026-10"
  monthLabel: string; // e.g. "October 2026"
  totalKm: number;
  tripCount: number;
}

export const INVOICES_STORAGE_KEY = 'aus_transport_invoices_v1';
export const INVOICES_CHANGE_EVENT = 'aus_invoices_changed';

export const INITIAL_BILLS: BillData[] = [];


const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Parses a date string in DD-MM-YYYY, YYYY-MM-DD, or DD/MM/YYYY into monthKey and monthLabel.
 */
export function parseMonthFromDate(dateStr?: string): { key: string; label: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month >= 1 && month <= 12 && year >= 1900) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${MONTH_NAMES[month - 1]} ${year}`;
      return { key, label };
    }
  }

  // YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    if (month >= 1 && month <= 12 && year >= 1900) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `${MONTH_NAMES[month - 1]} ${year}`;
      return { key, label };
    }
  }

  // Fallback to JS Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[month - 1]} ${year}`;
    return { key, label };
  }

  return null;
}

/**
 * Returns stored bills from localStorage or initial bills.
 */
export function getStoredInvoices(): BillData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Error reading invoices from localStorage:', err);
    return [];
  }
}

/**
 * Persists bills to localStorage and fires a custom event for live updates.
 */
export function saveStoredInvoices(bills: BillData[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(bills));
    window.dispatchEvent(new CustomEvent(INVOICES_CHANGE_EVENT, { detail: bills }));
  } catch (err) {
    console.error('Error saving invoices to localStorage:', err);
  }
}

/**
 * Calculates monthly running kilometers for a given vehicle number across all bills.
 */
export function calculateVehicleMonthlyKm(vehicleNumber: string, bills: BillData[]): VehicleMonthlyStat[] {
  if (!vehicleNumber) return [];
  const cleanReg = vehicleNumber.trim().toUpperCase();

  const monthMap: Record<string, VehicleMonthlyStat> = {};

  for (const bill of bills) {
    const billReg = (bill.vehicleNumber || '').trim().toUpperCase();
    if (billReg !== cleanReg) continue;

    const visibleTrips = bill.visibleTrips ?? bill.trips?.length ?? 0;
    const trips = (bill.trips || []).slice(0, visibleTrips);

    for (const trip of trips) {
      if (trip.enabled === false) continue;
      const closing = Number(trip.closingKm) || 0;
      const starting = Number(trip.startingKm) || 0;
      const runningKm = Math.max(0, closing - starting);

      if (runningKm > 0) {
        const dateStr = trip.date || bill.date;
        const parsedMonth = parseMonthFromDate(dateStr);
        if (parsedMonth) {
          if (!monthMap[parsedMonth.key]) {
            monthMap[parsedMonth.key] = {
              monthKey: parsedMonth.key,
              monthLabel: parsedMonth.label,
              totalKm: 0,
              tripCount: 0,
            };
          }
          monthMap[parsedMonth.key].totalKm += runningKm;
          monthMap[parsedMonth.key].tripCount += 1;
        }
      }
    }
  }

  return Object.values(monthMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
