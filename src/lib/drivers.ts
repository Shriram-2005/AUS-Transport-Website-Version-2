// Dynamic Drivers store with LocalStorage persistence, live custom events, and monthly KM/Salary stats
import { BillData, parseMonthFromDate } from './invoices';

export interface Driver {
  id: string;
  name: string;
  ratePerKm: number;
  phone?: string;
  licenseNumber?: string;
  status: 'active' | 'inactive';
  assignedVehicle?: string;
  notes?: string;
  joinedDate?: string;
}

export interface DriverMonthlyStat {
  monthKey: string;   // e.g. "2026-10"
  monthLabel: string; // e.g. "October 2026"
  totalKm: number;
  totalSalary: number;
  tripCount: number;
}

const STORAGE_KEY = 'aus_transport_drivers';
export const DRIVERS_CHANGE_EVENT = 'aus_drivers_changed';

export const INITIAL_DRIVERS: Driver[] = [];

export function getStoredDrivers(): Driver[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Clean up legacy hardcoded mock drivers
      const cleaned = parsed.filter(
        (d: Driver) =>
          !['driver-1', 'driver-2', 'driver-3'].includes(d.id) &&
          !['M. Selvam', 'K. Ramesh', 'P. Murugan'].includes(d.name)
      );
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      }
      return cleaned;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  } catch {
    return [];
  }
}

export function saveStoredDrivers(drivers: Driver[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drivers));
    window.dispatchEvent(new CustomEvent(DRIVERS_CHANGE_EVENT, { detail: drivers }));
  } catch (err) {
    console.error('Failed to save drivers to localStorage:', err);
  }
}

export function addStoredDriver(data: { name: string; ratePerKm?: number; phone?: string; licenseNumber?: string; status?: 'active' | 'inactive' }): Driver {
  const drivers = getStoredDrivers();
  const cleanName = data.name.trim();
  const newDriver: Driver = {
    id: `driver-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName,
    ratePerKm: typeof data.ratePerKm === 'number' && !isNaN(data.ratePerKm) ? data.ratePerKm : 2.50,
    phone: data.phone || '',
    licenseNumber: data.licenseNumber || '',
    status: data.status || 'active',
  };
  const updated = [newDriver, ...drivers];
  saveStoredDrivers(updated);
  return newDriver;
}

export function updateStoredDriver(id: string, updates: Partial<Driver>): void {
  const drivers = getStoredDrivers();
  const updated = drivers.map((d) => {
    if (d.id === id) {
      return {
        ...d,
        ...updates,
        name: updates.name !== undefined ? updates.name.trim() : d.name,
        ratePerKm: updates.ratePerKm !== undefined ? Number(updates.ratePerKm) : d.ratePerKm,
      };
    }
    return d;
  });
  saveStoredDrivers(updated);
}

export function deleteStoredDriver(id: string): void {
  const drivers = getStoredDrivers();
  const updated = drivers.filter((d) => d.id !== id);
  saveStoredDrivers(updated);
}

/**
 * Calculates monthly running kilometers and salary for a driver across all invoices.
 */
export function calculateDriverMonthlyStats(driver: Driver, bills: BillData[]): DriverMonthlyStat[] {
  if (!driver || !driver.name) return [];
  const driverId = driver.id;
  const driverNameClean = driver.name.trim().toLowerCase();
  const defaultRate = Number(driver.ratePerKm) || 0;

  const monthMap: Record<string, DriverMonthlyStat> = {};

  for (const bill of bills) {
    const visibleTrips = bill.visibleTrips ?? bill.trips?.length ?? 0;
    const trips = (bill.trips || []).slice(0, visibleTrips);

    for (const trip of trips) {
      if (trip.enabled === false) continue;

      const isMatch =
        (trip.driverId && trip.driverId === driverId) ||
        (trip.driverName && trip.driverName.trim().toLowerCase() === driverNameClean);

      if (!isMatch) continue;

      const closing = Number(trip.closingKm) || 0;
      const starting = Number(trip.startingKm) || 0;
      const runningKm = Math.max(0, closing - starting);

      if (runningKm > 0) {
        // Use trip-specific driver rate if set, otherwise fallback to driver's default rate
        const tripRate = typeof trip.driverRate === 'number' && trip.driverRate > 0 
          ? trip.driverRate 
          : defaultRate;
        const tripSalary = runningKm * tripRate;

        const dateStr = trip.date || bill.date;
        const parsedMonth = parseMonthFromDate(dateStr);
        if (parsedMonth) {
          if (!monthMap[parsedMonth.key]) {
            monthMap[parsedMonth.key] = {
              monthKey: parsedMonth.key,
              monthLabel: parsedMonth.label,
              totalKm: 0,
              totalSalary: 0,
              tripCount: 0,
            };
          }
          monthMap[parsedMonth.key].totalKm += runningKm;
          monthMap[parsedMonth.key].totalSalary += tripSalary;
          monthMap[parsedMonth.key].tripCount += 1;
        }
      }
    }
  }

  return Object.values(monthMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

/**
 * Calculates lifetime total kilometers and salary for a driver across all invoices.
 */
export function calculateDriverTotalStats(driver: Driver, bills: BillData[]): { totalKm: number; totalSalary: number; tripCount: number } {
  const stats = calculateDriverMonthlyStats(driver, bills);
  return stats.reduce(
    (acc, s) => ({
      totalKm: acc.totalKm + s.totalKm,
      totalSalary: acc.totalSalary + s.totalSalary,
      tripCount: acc.tripCount + s.tripCount,
    }),
    { totalKm: 0, totalSalary: 0, tripCount: 0 }
  );
}
