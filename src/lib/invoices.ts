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

export const INITIAL_BILLS: BillData[] = [
  {
    billNumber: 424,
    date: '07-10-2026',
    vehicleNumber: 'TN 99 E 8505',
    consigneePreset: 'broiler_branch',
    consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
    consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
    consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
    consigneeOverride: false,
    activeTrip: 1,
    visibleTrips: 2,
    trips: [
      { id: 1, enabled: true, date: '02-10-2026', dcNo: 67122, particulars: 'CHICKS - 19980', itemName: 'CHICKS', itemQuantity: '19980', driverId: '', driverName: '', route: 'Tiruchirappalli, Vellakovil', startingKm: 880040, closingKm: 880474, rate: 21.32, tollEnabled: true, tollAmount: 595 },
      { id: 2, enabled: true, date: '07-10-2026', dcNo: 67123, particulars: 'CHICKS - 20820', itemName: 'CHICKS', itemQuantity: '20820', driverId: '', driverName: '', route: 'Madurai, Vellakovil', startingKm: 880474, closingKm: 880861, rate: 21.32, tollEnabled: true, tollAmount: 820 },
      { id: 3, enabled: true, date: '09-10-2026', dcNo: 67124, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 4, enabled: true, date: '11-10-2026', dcNo: 67125, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 5, enabled: true, date: '12-10-2026', dcNo: 67126, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 6, enabled: true, date: '14-10-2026', dcNo: 67127, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
    ],
    keralaRtoEnabled: false,
    keralaRtoMultiplier: 0,
    keralaRtoAmount: 0,
    dieselAvgRate: 0,
    rupeesInWordsMode: 'auto',
    rupeesInWordsText: 'Eighteen Thousand Nine Hundred Nineteen Only.',
    status: 'unpaid',
    locked: false,
    updatedAt: new Date().toISOString(),
  },
  {
    billNumber: 423,
    date: '30-09-2026',
    vehicleNumber: 'TN 99 E 8505',
    consigneePreset: 'broiler_branch',
    consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
    consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
    consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
    consigneeOverride: false,
    activeTrip: 1,
    visibleTrips: 3,
    trips: [
      { id: 1, enabled: true, date: '25-09-2026', dcNo: 66910, particulars: 'CHICKS - 18500', itemName: 'CHICKS', itemQuantity: '18500', route: 'Salem, Namakkal', startingKm: 878200, closingKm: 878850, rate: 21.32, tollEnabled: true, tollAmount: 640 },
      { id: 2, enabled: true, date: '28-09-2026', dcNo: 66911, particulars: 'CHICKS - 19200', itemName: 'CHICKS', itemQuantity: '19200', route: 'Erode, Tiruppur', startingKm: 878850, closingKm: 879480, rate: 21.32, tollEnabled: true, tollAmount: 420 },
      { id: 3, enabled: true, date: '30-09-2026', dcNo: 66912, particulars: 'CHICKS - 17800', itemName: 'CHICKS', itemQuantity: '17800', route: 'Palani, Pollachi', startingKm: 879480, closingKm: 880040, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 4, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 5, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 6, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 21.32, tollEnabled: false, tollAmount: 0 },
    ],
    keralaRtoEnabled: false,
    keralaRtoMultiplier: 0,
    keralaRtoAmount: 0,
    dieselAvgRate: 93.38,
    rupeesInWordsMode: 'auto',
    rupeesInWordsText: 'Thirty Five Thousand Nine Hundred Forty Only.',
    status: 'unpaid',
    locked: false,
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    billNumber: 422,
    date: '22-09-2026',
    vehicleNumber: 'TN 76 AK 1094',
    consigneePreset: 'broiler_branch',
    consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
    consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
    consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
    consigneeOverride: false,
    activeTrip: 1,
    visibleTrips: 2,
    trips: [
      { id: 1, enabled: true, date: '18-09-2026', dcNo: 66750, particulars: 'CHICKS - 21000', itemName: 'CHICKS', itemQuantity: '21000', route: 'Pollachi, Palani', startingKm: 303980, closingKm: 304520, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 2, enabled: true, date: '21-09-2026', dcNo: 66751, particulars: 'CHICKS - 18000', itemName: 'CHICKS', itemQuantity: '18000', route: 'Salem, Namakkal', startingKm: 304520, closingKm: 305100, rate: 20.27, tollEnabled: true, tollAmount: 750 },
      { id: 3, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 4, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 5, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 6, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
    ],
    keralaRtoEnabled: false,
    keralaRtoMultiplier: 0,
    keralaRtoAmount: 0,
    dieselAvgRate: 93.38,
    rupeesInWordsMode: 'auto',
    rupeesInWordsText: 'Twenty Three Thousand Four Hundred Fifty One Only.',
    status: 'paid',
    locked: false,
    updatedAt: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
];

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
  if (typeof window === 'undefined') return INITIAL_BILLS;
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(INITIAL_BILLS));
      return INITIAL_BILLS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(INITIAL_BILLS));
    return INITIAL_BILLS;
  } catch (err) {
    console.error('Error reading invoices from localStorage:', err);
    return INITIAL_BILLS;
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
