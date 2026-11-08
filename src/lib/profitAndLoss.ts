// Profit & Loss calculation engine across Freight Invoices, Fuel, Repairs, Driver Pay, and Expenses
// Independent calculation with custom period filtering and monthly breakdowns

import { BillData, parseMonthFromDate } from './invoices';
import { FuelEntry } from './fuel';
import { MaintenanceEntry } from './maintenance';
import { ExpenseEntry } from './expenses';
import { Driver } from './drivers';

export interface MonthPnlRecord {
  monthKey: string;     // e.g. "2026-11"
  monthLabel: string;   // e.g. "November 2026"
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  driverSalary: number;
  expensesCost: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  tripCount: number;
  totalKm: number;
}

export interface VehiclePnlSummary {
  vehicleNumber: string;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  driverSalary: number;
  expensesCost: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  tripCount: number;
  totalKm: number;
  monthlyBreakdown: MonthPnlRecord[];
}

export interface FleetPnlSummary {
  totalRevenue: number;
  totalFuel: number;
  totalMaintenance: number;
  totalDriverSalary: number;
  totalExpenses: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  vehiclesCount: number;
}

/**
 * Calculates final invoice freight amount for a bill
 */
export function calculateBillTotal(bill: BillData): number {
  let total = 0;
  const visible = bill.visibleTrips ?? bill.trips?.length ?? 0;
  for (const trip of (bill.trips || []).slice(0, visible)) {
    if (trip.enabled !== false) {
      const runningKm = Math.max(0, (Number(trip.closingKm) || 0) - (Number(trip.startingKm) || 0));
      total += runningKm * (Number(trip.rate) || 0);
      if (trip.tollEnabled) {
        total += Number(trip.tollAmount) || 0;
      }
    }
  }
  if (bill.keralaRtoEnabled && (Number(bill.keralaRtoMultiplier) || 0) > 0) {
    total += (Number(bill.keralaRtoMultiplier) || 0) * (Number(bill.keralaRtoAmount) || 0);
  }
  return Math.round(total);
}

/**
 * Parses date string in DD-MM-YYYY or YYYY-MM-DD into a comparable numeric timestamp
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
 * Checks whether a given date string is within the [fromDate, toDate] interval (inclusive)
 */
export function isDateInRange(dateStr?: string, fromDate?: string, toDate?: string): boolean {
  if (!dateStr) return false;
  const t = parseDateToTimestamp(dateStr);
  if (t === 0) return true;

  const fromT = fromDate ? parseDateToTimestamp(fromDate) : 0;
  const toT = toDate ? parseDateToTimestamp(toDate) + 86399999 : Infinity;

  return t >= fromT && t <= toT;
}

/**
 * Calculates Profit and Loss for a specific vehicle across a given date range
 */
export function calculateVehiclePnl(
  vehicleNumber: string,
  bills: BillData[],
  fuelEntries: FuelEntry[],
  maintenanceEntries: MaintenanceEntry[],
  expenses: ExpenseEntry[],
  fromDate?: string,
  toDate?: string,
  driversList: Driver[] = []
): VehiclePnlSummary {
  const cleanVehicle = (vehicleNumber || '').trim().toUpperCase();

  // Driver rates lookup map
  const driverRateMap = new Map<string, number>();
  for (const d of driversList) {
    if (d.name) driverRateMap.set(d.name.trim().toLowerCase(), Number(d.ratePerKm) || 0);
    if (d.id) driverRateMap.set(String(d.id), Number(d.ratePerKm) || 0);
  }

  const monthMap: Record<string, MonthPnlRecord> = {};

  const getOrCreateMonth = (dateStr: string): MonthPnlRecord => {
    const parsed = parseMonthFromDate(dateStr) || {
      key: new Date().toISOString().substring(0, 7),
      label: 'Current Period',
    };
    if (!monthMap[parsed.key]) {
      monthMap[parsed.key] = {
        monthKey: parsed.key,
        monthLabel: parsed.label,
        revenue: 0,
        fuelCost: 0,
        maintenanceCost: 0,
        driverSalary: 0,
        expensesCost: 0,
        totalCost: 0,
        netProfit: 0,
        profitMargin: 0,
        tripCount: 0,
        totalKm: 0,
      };
    }
    return monthMap[parsed.key];
  };

  let totalRevenue = 0;
  let totalKmRan = 0;
  let totalTripCount = 0;
  let totalDriverSalary = 0;

  // 1. Process Invoices (Revenue and Driver Salaries for this vehicle)
  for (const bill of bills) {
    const billVehicle = (bill.vehicleNumber || '').trim().toUpperCase();
    if (cleanVehicle && billVehicle !== cleanVehicle) continue;

    // Use bill.date from non-editable invoice header
    const billDate = (bill.date || '').trim();
    if (!isDateInRange(billDate, fromDate, toDate)) continue;

    const m = getOrCreateMonth(billDate);

    const billRev = calculateBillTotal(bill);
    totalRevenue += billRev;
    m.revenue += billRev;

    const visible = bill.visibleTrips ?? bill.trips?.length ?? 0;
    const trips = (bill.trips || []).slice(0, visible);

    for (const trip of trips) {
      if (trip.enabled !== false) {
        const runningKm = Math.max(0, (Number(trip.closingKm) || 0) - (Number(trip.startingKm) || 0));
        totalKmRan += runningKm;
        totalTripCount += 1;
        m.totalKm += runningKm;
        m.tripCount += 1;

        // Driver salary for this trip
        let driverRate = Number(trip.driverRate) || 0;
        if (driverRate <= 0) {
          if (trip.driverId && driverRateMap.has(String(trip.driverId))) {
            driverRate = driverRateMap.get(String(trip.driverId)) || 0;
          } else if (trip.driverName && driverRateMap.has(trip.driverName.trim().toLowerCase())) {
            driverRate = driverRateMap.get(trip.driverName.trim().toLowerCase()) || 0;
          }
        }

        const tripSalary = runningKm * driverRate;
        totalDriverSalary += tripSalary;
        m.driverSalary += tripSalary;
      }
    }
  }

  // 2. Process Fuel Entries
  let totalFuel = 0;
  for (const f of fuelEntries) {
    const fVeh = (f.vehicleNumber || '').trim().toUpperCase();
    if (cleanVehicle && fVeh !== cleanVehicle) continue;
    if (!isDateInRange(f.date, fromDate, toDate)) continue;

    const m = getOrCreateMonth(f.date);
    const cost = Number(f.totalAmount) || 0;
    totalFuel += cost;
    m.fuelCost += cost;
  }

  // 3. Process Repair & Maintenance Entries
  let totalMaintenance = 0;
  for (const maint of maintenanceEntries) {
    const mVeh = (maint.vehicleNumber || '').trim().toUpperCase();
    if (cleanVehicle && mVeh !== cleanVehicle) continue;
    if (!isDateInRange(maint.date, fromDate, toDate)) continue;

    const m = getOrCreateMonth(maint.date);
    const cost = Number(maint.amount) || 0;
    totalMaintenance += cost;
    m.maintenanceCost += cost;
  }

  // 4. Process Expenses Entries
  let totalExpenses = 0;
  for (const exp of expenses) {
    const eVeh = (exp.vehicleNumber || '').trim().toUpperCase();
    if (cleanVehicle && eVeh !== cleanVehicle) continue;
    if (!isDateInRange(exp.date, fromDate, toDate)) continue;

    const m = getOrCreateMonth(exp.date);
    const cost = Number(exp.amount) || 0;
    totalExpenses += cost;
    m.expensesCost += cost;
  }

  // Calculate monthly totals and margins
  const monthlyBreakdown = Object.values(monthMap).map((m) => {
    const tCost = m.fuelCost + m.maintenanceCost + m.driverSalary + m.expensesCost;
    const net = m.revenue - tCost;
    const margin = m.revenue > 0 ? (net / m.revenue) * 100 : 0;
    return {
      ...m,
      revenue: Math.round(m.revenue),
      fuelCost: Math.round(m.fuelCost),
      maintenanceCost: Math.round(m.maintenanceCost),
      driverSalary: Math.round(m.driverSalary),
      expensesCost: Math.round(m.expensesCost),
      totalCost: Math.round(tCost),
      netProfit: Math.round(net),
      profitMargin: Math.round(margin * 10) / 10,
    };
  }).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const grandTotalCost = totalFuel + totalMaintenance + totalDriverSalary + totalExpenses;
  const netProfit = totalRevenue - grandTotalCost;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    vehicleNumber: cleanVehicle,
    revenue: Math.round(totalRevenue),
    fuelCost: Math.round(totalFuel),
    maintenanceCost: Math.round(totalMaintenance),
    driverSalary: Math.round(totalDriverSalary),
    expensesCost: Math.round(totalExpenses),
    totalCost: Math.round(grandTotalCost),
    netProfit: Math.round(netProfit),
    profitMargin: Math.round(profitMargin * 10) / 10,
    tripCount: totalTripCount,
    totalKm: totalKmRan,
    monthlyBreakdown,
  };
}

/**
 * Calculates Fleet-wide overall Profit and Loss summary
 */
export function calculateFleetPnl(
  vehicles: { registrationNumber: string }[],
  bills: BillData[],
  fuelEntries: FuelEntry[],
  maintenanceEntries: MaintenanceEntry[],
  expenses: ExpenseEntry[],
  fromDate?: string,
  toDate?: string,
  driversList: Driver[] = []
): FleetPnlSummary {
  let totalRevenue = 0;
  let totalFuel = 0;
  let totalMaintenance = 0;
  let totalDriverSalary = 0;
  let totalExpenses = 0;

  for (const v of vehicles) {
    const vPnl = calculateVehiclePnl(
      v.registrationNumber,
      bills,
      fuelEntries,
      maintenanceEntries,
      expenses,
      fromDate,
      toDate,
      driversList
    );
    totalRevenue += vPnl.revenue;
    totalFuel += vPnl.fuelCost;
    totalMaintenance += vPnl.maintenanceCost;
    totalDriverSalary += vPnl.driverSalary;
    totalExpenses += vPnl.expensesCost;
  }

  // Add any non-vehicle GENERAL expenses
  for (const exp of expenses) {
    const eVeh = (exp.vehicleNumber || 'GENERAL').trim().toUpperCase();
    if (eVeh === 'GENERAL' || eVeh === 'OFFICE') {
      if (isDateInRange(exp.date, fromDate, toDate)) {
        totalExpenses += Number(exp.amount) || 0;
      }
    }
  }

  const grandTotalCost = totalFuel + totalMaintenance + totalDriverSalary + totalExpenses;
  const netProfit = totalRevenue - grandTotalCost;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue: Math.round(totalRevenue),
    totalFuel: Math.round(totalFuel),
    totalMaintenance: Math.round(totalMaintenance),
    totalDriverSalary: Math.round(totalDriverSalary),
    totalExpenses: Math.round(totalExpenses),
    totalCost: Math.round(grandTotalCost),
    netProfit: Math.round(netProfit),
    profitMargin: Math.round(profitMargin * 10) / 10,
    vehiclesCount: vehicles.length,
  };
}

/**
 * Converts numbers into English words for formal statements
 */
export function numberToWords(num: number): string {
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  if (absNum === 0) return 'Rupees Zero Only.';

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

  const integerPart = Math.floor(absNum);
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

  const prefix = isNegative ? 'Rupees (Loss) Minus ' : 'Rupees ';
  return prefix + words.trim() + ' Only.';
}

