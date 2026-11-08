// Executive Overview analytics engine aggregating all transport modules
// Combines Invoices, Fuel, Repairs, Expenses, Drivers, and Vehicles

import { BillData } from './invoices';
import { FuelEntry } from './fuel';
import { MaintenanceEntry } from './maintenance';
import { ExpenseEntry } from './expenses';
import { Driver } from './drivers';
import { Vehicle } from './vehicles';
import { calculateBillTotal, parseDateToTimestamp, isDateInRange } from './profitAndLoss';

export interface FleetKpiSummary {
  totalRevenue: number;
  totalTrips: number;
  totalRunningKm: number;
  totalFuelCost: number;
  totalFuelLiters: number;
  avgFuelRate: number;
  totalMaintenanceCost: number;
  totalMaintenanceJobs: number;
  totalDriverSalary: number;
  totalExpensesCost: number;
  totalOperatingCosts: number;
  netProfit: number;
  profitMargin: number;
  totalVehicles: number;
  activeDrivers: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesAmount: number;
}

export interface VehicleOverviewRank {
  registrationNumber: string;
  tripCount: number;
  totalKm: number;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  driverSalary: number;
  expensesCost: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
}

export interface RecentUnifiedActivity {
  id: string;
  date: string;
  timestamp: number;
  type: 'invoice' | 'fuel' | 'maintenance' | 'expense';
  title: string;
  subtitle: string;
  amount: number;
  vehicleNumber?: string;
}

/**
 * Calculates aggregated executive KPIs across all modules for a given date range
 */
export function calculateExecutiveKpis(
  vehicles: Vehicle[],
  bills: BillData[],
  fuelEntries: FuelEntry[],
  maintenanceEntries: MaintenanceEntry[],
  expenses: ExpenseEntry[],
  drivers: Driver[],
  fromDate?: string,
  toDate?: string
): FleetKpiSummary {
  // 1. Driver rates map
  const driverRateMap = new Map<string, number>();
  for (const d of drivers) {
    if (d.name) driverRateMap.set(d.name.trim().toLowerCase(), Number(d.ratePerKm) || 0);
    if (d.id) driverRateMap.set(String(d.id), Number(d.ratePerKm) || 0);
  }

  let totalRevenue = 0;
  let totalTrips = 0;
  let totalRunningKm = 0;
  let totalDriverSalary = 0;
  let unpaidInvoicesCount = 0;
  let unpaidInvoicesAmount = 0;

  // Process Bills / Invoices
  for (const bill of bills) {
    const billDate = (bill.date || '').trim();
    if (!isDateInRange(billDate, fromDate, toDate)) continue;

    const bTotal = calculateBillTotal(bill);
    totalRevenue += bTotal;

    if (bill.status === 'unpaid') {
      unpaidInvoicesCount += 1;
      unpaidInvoicesAmount += bTotal;
    }

    const visible = bill.visibleTrips ?? bill.trips?.length ?? 0;
    const trips = (bill.trips || []).slice(0, visible);

    for (const trip of trips) {
      if (trip.enabled !== false) {
        totalTrips += 1;
        const km = Math.max(0, (Number(trip.closingKm) || 0) - (Number(trip.startingKm) || 0));
        totalRunningKm += km;

        let rate = Number(trip.driverRate) || 0;
        if (rate <= 0) {
          if (trip.driverId && driverRateMap.has(String(trip.driverId))) {
            rate = driverRateMap.get(String(trip.driverId)) || 0;
          } else if (trip.driverName && driverRateMap.has(trip.driverName.trim().toLowerCase())) {
            rate = driverRateMap.get(trip.driverName.trim().toLowerCase()) || 0;
          }
        }
        totalDriverSalary += km * rate;
      }
    }
  }

  // Process Fuel
  let totalFuelCost = 0;
  let totalFuelLiters = 0;
  for (const f of fuelEntries) {
    if (!isDateInRange(f.date, fromDate, toDate)) continue;
    totalFuelCost += Number(f.totalAmount) || 0;
    totalFuelLiters += Number(f.liters) || 0;
  }
  const avgFuelRate = totalFuelLiters > 0 ? totalFuelCost / totalFuelLiters : 0;

  // Process Maintenance
  let totalMaintenanceCost = 0;
  let totalMaintenanceJobs = 0;
  for (const m of maintenanceEntries) {
    if (!isDateInRange(m.date, fromDate, toDate)) continue;
    totalMaintenanceCost += Number(m.amount) || 0;
    totalMaintenanceJobs += 1;
  }

  // Process Expenses
  let totalExpensesCost = 0;
  for (const exp of expenses) {
    if (!isDateInRange(exp.date, fromDate, toDate)) continue;
    totalExpensesCost += Number(exp.amount) || 0;
  }

  const totalOperatingCosts = totalFuelCost + totalMaintenanceCost + totalDriverSalary + totalExpensesCost;
  const netProfit = totalRevenue - totalOperatingCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const activeDrivers = drivers.filter((d) => d.status !== 'inactive').length;

  return {
    totalRevenue: Math.round(totalRevenue),
    totalTrips,
    totalRunningKm,
    totalFuelCost: Math.round(totalFuelCost),
    totalFuelLiters: Math.round(totalFuelLiters * 100) / 100,
    avgFuelRate: Math.round(avgFuelRate * 100) / 100,
    totalMaintenanceCost: Math.round(totalMaintenanceCost),
    totalMaintenanceJobs,
    totalDriverSalary: Math.round(totalDriverSalary),
    totalExpensesCost: Math.round(totalExpensesCost),
    totalOperatingCosts: Math.round(totalOperatingCosts),
    netProfit: Math.round(netProfit),
    profitMargin: Math.round(profitMargin * 10) / 10,
    totalVehicles: vehicles.length,
    activeDrivers,
    unpaidInvoicesCount,
    unpaidInvoicesAmount: Math.round(unpaidInvoicesAmount),
  };
}

/**
 * Calculates vehicle leaderboard ranking based on Net Profit or Revenue
 */
export function calculateVehicleRankings(
  vehicles: Vehicle[],
  bills: BillData[],
  fuelEntries: FuelEntry[],
  maintenanceEntries: MaintenanceEntry[],
  expenses: ExpenseEntry[],
  drivers: Driver[],
  fromDate?: string,
  toDate?: string
): VehicleOverviewRank[] {
  const driverRateMap = new Map<string, number>();
  for (const d of drivers) {
    if (d.name) driverRateMap.set(d.name.trim().toLowerCase(), Number(d.ratePerKm) || 0);
    if (d.id) driverRateMap.set(String(d.id), Number(d.ratePerKm) || 0);
  }

  return vehicles.map((v) => {
    const cleanReg = v.registrationNumber.trim().toUpperCase();

    let rev = 0;
    let tripsCount = 0;
    let kmRan = 0;
    let dSalary = 0;

    for (const b of bills) {
      if ((b.vehicleNumber || '').trim().toUpperCase() !== cleanReg) continue;
      if (!isDateInRange(b.date, fromDate, toDate)) continue;

      rev += calculateBillTotal(b);
      const visible = b.visibleTrips ?? b.trips?.length ?? 0;
      for (const trip of (b.trips || []).slice(0, visible)) {
        if (trip.enabled !== false) {
          tripsCount += 1;
          const km = Math.max(0, (Number(trip.closingKm) || 0) - (Number(trip.startingKm) || 0));
          kmRan += km;

          let rate = Number(trip.driverRate) || 0;
          if (rate <= 0) {
            if (trip.driverId && driverRateMap.has(String(trip.driverId))) {
              rate = driverRateMap.get(String(trip.driverId)) || 0;
            } else if (trip.driverName && driverRateMap.has(trip.driverName.trim().toLowerCase())) {
              rate = driverRateMap.get(trip.driverName.trim().toLowerCase()) || 0;
            }
          }
          dSalary += km * rate;
        }
      }
    }

    let fCost = 0;
    for (const f of fuelEntries) {
      if ((f.vehicleNumber || '').trim().toUpperCase() !== cleanReg) continue;
      if (!isDateInRange(f.date, fromDate, toDate)) continue;
      fCost += Number(f.totalAmount) || 0;
    }

    let mCost = 0;
    for (const m of maintenanceEntries) {
      if ((m.vehicleNumber || '').trim().toUpperCase() !== cleanReg) continue;
      if (!isDateInRange(m.date, fromDate, toDate)) continue;
      mCost += Number(m.amount) || 0;
    }

    let eCost = 0;
    for (const e of expenses) {
      if ((e.vehicleNumber || '').trim().toUpperCase() !== cleanReg) continue;
      if (!isDateInRange(e.date, fromDate, toDate)) continue;
      eCost += Number(e.amount) || 0;
    }

    const tCost = fCost + mCost + dSalary + eCost;
    const net = rev - tCost;
    const margin = rev > 0 ? (net / rev) * 100 : 0;

    return {
      registrationNumber: cleanReg,
      tripCount: tripsCount,
      totalKm: kmRan,
      revenue: Math.round(rev),
      fuelCost: Math.round(fCost),
      maintenanceCost: Math.round(mCost),
      driverSalary: Math.round(dSalary),
      expensesCost: Math.round(eCost),
      totalCost: Math.round(tCost),
      netProfit: Math.round(net),
      profitMargin: Math.round(margin * 10) / 10,
    };
  }).sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Aggregates the most recent operational events into a single unified stream
 */
export function getUnifiedRecentActivity(
  bills: BillData[],
  fuelEntries: FuelEntry[],
  maintenanceEntries: MaintenanceEntry[],
  expenses: ExpenseEntry[],
  limit = 8
): RecentUnifiedActivity[] {
  const list: RecentUnifiedActivity[] = [];

  for (const b of bills) {
    const t = parseDateToTimestamp(b.date);
    const amount = calculateBillTotal(b);
    list.push({
      id: `inv-${b.billNumber}-${t}`,
      date: b.date,
      timestamp: t,
      type: 'invoice',
      title: `Freight Invoice #${b.billNumber}`,
      subtitle: `${b.vehicleNumber} to ${b.consigneeName || 'Consignee'}`,
      amount,
      vehicleNumber: b.vehicleNumber,
    });
  }

  for (const f of fuelEntries) {
    const t = parseDateToTimestamp(f.date);
    list.push({
      id: `fuel-${f.id}`,
      date: f.date,
      timestamp: t,
      type: 'fuel',
      title: `Bunk Bill #${f.billNumber || 'Slip'}`,
      subtitle: `${f.vehicleNumber} | ${f.liters} L ${f.particulars} @ Rs.${f.ratePerLiter} (${f.bunkName || 'Bunk'})`,
      amount: f.totalAmount,
      vehicleNumber: f.vehicleNumber,
    });
  }

  for (const m of maintenanceEntries) {
    const t = parseDateToTimestamp(m.date);
    list.push({
      id: `maint-${m.id}`,
      date: m.date,
      timestamp: t,
      type: 'maintenance',
      title: m.category,
      subtitle: `${m.vehicleNumber} | ${m.workshopName || 'Garage'} - ${m.description || 'Service'}`,
      amount: m.amount,
      vehicleNumber: m.vehicleNumber,
    });
  }

  for (const e of expenses) {
    const t = parseDateToTimestamp(e.date);
    list.push({
      id: `exp-${e.id}`,
      date: e.date,
      timestamp: t,
      type: 'expense',
      title: e.category,
      subtitle: `${e.vehicleNumber} | ${e.paidTo || 'Paid'} (${e.paymentMode})`,
      amount: e.amount,
      vehicleNumber: e.vehicleNumber,
    });
  }

  return list.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
