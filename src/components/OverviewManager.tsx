'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Truck,
  Droplets,
  Wrench,
  Users,
  Wallet,
  Receipt,
  Printer,
  RotateCcw,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Building2,
  Gauge,
  Fuel
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  calculateExecutiveKpis,
  calculateVehicleRankings,
  getUnifiedRecentActivity,
  FleetKpiSummary,
  VehicleOverviewRank,
  RecentUnifiedActivity
} from '@/lib/overview';
import { numberToWords } from '@/lib/profitAndLoss';
import { BillData, getStoredInvoices, INVOICES_CHANGE_EVENT } from '@/lib/invoices';
import { FuelEntry, getStoredFuelEntries, FUEL_ENTRIES_CHANGE_EVENT } from '@/lib/fuel';
import { MaintenanceEntry, getStoredMaintenanceEntries, MAINTENANCE_ENTRIES_CHANGE_EVENT } from '@/lib/maintenance';
import { ExpenseEntry, getStoredExpenses, EXPENSES_CHANGE_EVENT } from '@/lib/expenses';
import { Driver, getStoredDrivers, DRIVERS_CHANGE_EVENT } from '@/lib/drivers';
import { Vehicle, getStoredVehicles, VEHICLES_CHANGE_EVENT } from '@/lib/vehicles';
import { CustomDatePicker } from './CustomDatePicker';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

type TimePreset = 'all' | 'week' | '15days' | 'month' | '3months' | '6months' | '1year' | 'custom';
type LeaderboardSort = 'profit' | 'revenue' | 'km';

function formatDateDDMMYYYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

interface OverviewManagerProps {
  onNavigate?: (tabId: string) => void;
}

export function OverviewManager({ onNavigate }: OverviewManagerProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bills, setBills] = useState<BillData[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // Filter states
  const [activePreset, setActivePreset] = useState<TimePreset>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>('profit');
  const [isPrinting, setIsPrinting] = useState(false);

  // Apply preset date ranges
  const applyPreset = useCallback((preset: TimePreset) => {
    setActivePreset(preset);
    const today = new Date();
    const todayStr = formatDateDDMMYYYY(today);

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'week') {
      const past = new Date(today);
      past.setDate(today.getDate() - 7);
      setFromDate(formatDateDDMMYYYY(past));
      setToDate(todayStr);
    } else if (preset === '15days') {
      const past = new Date(today);
      past.setDate(today.getDate() - 15);
      setFromDate(formatDateDDMMYYYY(past));
      setToDate(todayStr);
    } else if (preset === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(formatDateDDMMYYYY(startOfMonth));
      setToDate(todayStr);
    } else if (preset === '3months') {
      const past = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      setFromDate(formatDateDDMMYYYY(past));
      setToDate(todayStr);
    } else if (preset === '6months') {
      const past = new Date(today.getFullYear(), today.getMonth() - 6, 1);
      setFromDate(formatDateDDMMYYYY(past));
      setToDate(todayStr);
    } else if (preset === '1year') {
      const past = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      setFromDate(formatDateDDMMYYYY(past));
      setToDate(todayStr);
    }
  }, []);

  // Load all data sources from LocalStorage on mount
  useEffect(() => {
    setVehicles(getStoredVehicles());
    setBills(getStoredInvoices());
    setFuelEntries(getStoredFuelEntries());
    setMaintenanceEntries(getStoredMaintenanceEntries());
    setExpenses(getStoredExpenses());
    setDrivers(getStoredDrivers());

    const handleVehiclesUpdate = (e: any) => setVehicles(e.detail || getStoredVehicles());
    const handleInvoicesUpdate = (e: any) => setBills(e.detail || getStoredInvoices());
    const handleFuelUpdate = (e: any) => setFuelEntries(e.detail || getStoredFuelEntries());
    const handleMaintUpdate = (e: any) => setMaintenanceEntries(e.detail || getStoredMaintenanceEntries());
    const handleExpensesUpdate = (e: any) => setExpenses(e.detail || getStoredExpenses());
    const handleDriversUpdate = (e: any) => setDrivers(e.detail || getStoredDrivers());

    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    window.addEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);
    window.addEventListener(FUEL_ENTRIES_CHANGE_EVENT as any, handleFuelUpdate);
    window.addEventListener(MAINTENANCE_ENTRIES_CHANGE_EVENT as any, handleMaintUpdate);
    window.addEventListener(EXPENSES_CHANGE_EVENT as any, handleExpensesUpdate);
    window.addEventListener(DRIVERS_CHANGE_EVENT as any, handleDriversUpdate);

    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
      window.removeEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);
      window.removeEventListener(FUEL_ENTRIES_CHANGE_EVENT as any, handleFuelUpdate);
      window.removeEventListener(MAINTENANCE_ENTRIES_CHANGE_EVENT as any, handleMaintUpdate);
      window.removeEventListener(EXPENSES_CHANGE_EVENT as any, handleExpensesUpdate);
      window.removeEventListener(DRIVERS_CHANGE_EVENT as any, handleDriversUpdate);
    };
  }, []);

  // Sync latest from Supabase
  const refreshFromSupabase = useCallback(async () => {
    try {
      const supabase = createClient();

      // Vehicles
      const { data: vData } = await supabase.from('vehicles').select('*');
      if (vData && vData.length > 0) {
        setVehicles(vData.map((v: any) => ({
          id: v.id,
          registrationNumber: (v.registration_number || '').trim().toUpperCase(),
          currentKm: Number(v.current_km) || 0,
          status: v.status || 'active',
          model: v.model || '',
        })));
      }

      // Invoices
      const { data: iData } = await supabase.from('invoices').select('*');
      if (iData && iData.length > 0) {
        setBills(iData.map((item: any) => {
          if (item.raw_data && item.raw_data.trips) {
            return {
              ...item.raw_data,
              id: item.id,
              billNumber: item.bill_number,
              date: item.bill_date,
              vehicleNumber: item.vehicle_number,
              status: item.payment_status || 'unpaid',
            };
          }
          return {
            id: item.id,
            billNumber: item.bill_number,
            date: item.bill_date,
            vehicleNumber: item.vehicle_number,
            activeTrip: 1,
            visibleTrips: 1,
            trips: [],
            keralaRtoEnabled: false,
            keralaRtoMultiplier: 0,
            keralaRtoAmount: 0,
            dieselAvgRate: 0,
            rupeesInWordsMode: 'auto',
            rupeesInWordsText: '',
            status: 'unpaid',
          };
        }));
      }

      // Fuel
      const { data: fData } = await supabase.from('fuel_entries').select('*');
      if (fData && fData.length > 0) {
        setFuelEntries(fData.map((f: any) => ({
          id: f.id,
          vehicleNumber: (f.vehicle_number || '').trim().toUpperCase(),
          date: f.entry_date || '',
          billNumber: f.bill_number || '',
          particulars: f.fuel_type === 'Petrol' ? 'Petrol' : 'Diesel',
          liters: Number(f.liters) || 0,
          ratePerLiter: Number(f.rate_per_liter) || 0,
          totalAmount: Number(f.total_amount) || 0,
          bunkName: f.bunk_name || '',
        })));
      }

      // Maintenance
      const { data: mData } = await supabase.from('maintenance_entries').select('*');
      if (mData && mData.length > 0) {
        setMaintenanceEntries(mData.map((m: any) => ({
          id: m.id,
          vehicleNumber: (m.vehicle_number || '').trim().toUpperCase(),
          date: m.entry_date || '',
          billNumber: m.bill_number || '',
          category: m.category || 'General Routine Maintenance',
          description: m.description || '',
          amount: Number(m.amount) || 0,
          workshopName: m.workshop_name || '',
          odometerKm: m.odometer_km ? Number(m.odometer_km) : undefined,
        })));
      }

      // Expenses
      const { data: eData } = await supabase.from('expense_entries').select('*');
      if (eData && eData.length > 0) {
        setExpenses(eData.map((e: any) => ({
          id: e.id,
          vehicleNumber: (e.vehicle_number || 'GENERAL').trim().toUpperCase(),
          date: e.entry_date || '',
          voucherNumber: e.voucher_number || '',
          category: e.category || 'FASTag & Highway Toll',
          description: e.description || '',
          amount: Number(e.amount) || 0,
          paymentMode: e.payment_mode || 'Cash',
          paidTo: e.paid_to || '',
        })));
      }

      // Drivers
      const { data: dData } = await supabase.from('drivers').select('*');
      if (dData && dData.length > 0) {
        setDrivers(dData.map((d: any) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          licenseNumber: d.license_number,
          ratePerKm: Number(d.rate_per_km) || 0,
          status: d.status || 'active',
        })));
      }
    } catch (err) {
      console.error('Error refreshing overview data from Supabase:', err);
    }
  }, []);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for global refresh module event
  useEffect(() => {
    const handleModuleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'overview' || e.detail.module === 'all') {
        refreshFromSupabase();
      }
    };
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
    return () => window.removeEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
  }, [refreshFromSupabase]);

  // Aggregated Executive KPIs
  const kpis = useMemo(() => {
    return calculateExecutiveKpis(vehicles, bills, fuelEntries, maintenanceEntries, expenses, drivers, fromDate, toDate);
  }, [vehicles, bills, fuelEntries, maintenanceEntries, expenses, drivers, fromDate, toDate]);

  // Vehicle Rankings Leaderboard
  const vehicleRankings = useMemo(() => {
    const list = calculateVehicleRankings(vehicles, bills, fuelEntries, maintenanceEntries, expenses, drivers, fromDate, toDate);
    if (leaderboardSort === 'revenue') {
      return list.sort((a, b) => b.revenue - a.revenue);
    }
    if (leaderboardSort === 'km') {
      return list.sort((a, b) => b.totalKm - a.totalKm);
    }
    return list.sort((a, b) => b.netProfit - a.netProfit);
  }, [vehicles, bills, fuelEntries, maintenanceEntries, expenses, drivers, fromDate, toDate, leaderboardSort]);

  // Recent Activity Feed
  const recentActivities = useMemo(() => {
    return getUnifiedRecentActivity(bills, fuelEntries, maintenanceEntries, expenses, 6);
  }, [bills, fuelEntries, maintenanceEntries, expenses]);

  // Financial Cost Ratios (% of revenue)
  const costRatios = useMemo(() => {
    const rev = kpis.totalRevenue > 0 ? kpis.totalRevenue : 1;
    const fuelPct = Math.round((kpis.totalFuelCost / rev) * 100);
    const maintPct = Math.round((kpis.totalMaintenanceCost / rev) * 100);
    const driverPct = Math.round((kpis.totalDriverSalary / rev) * 100);
    const expPct = Math.round((kpis.totalExpensesCost / rev) * 100);
    const marginPct = kpis.profitMargin;

    return { fuelPct, maintPct, driverPct, expPct, marginPct };
  }, [kpis]);

  // Print Executive Fleet Report (PDF)
  const handlePrintExecutiveReport = () => {
    setIsPrinting(true);

    const printEl = document.getElementById('aus_executive_report_print_root');
    if (!printEl) {
      setIsPrinting(false);
      return;
    }

    let printFrame = document.getElementById('aus_overview_print_frame') as HTMLIFrameElement | null;
    if (printFrame) {
      printFrame.remove();
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'aus_overview_print_frame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    printFrame.style.visibility = 'hidden';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (!frameDoc) {
      setIsPrinting(false);
      window.print();
      return;
    }

    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Executive Fleet Performance Report</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm 10mm;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #111827;
        background: #fff;
        line-height: 1.4;
        font-size: 11px;
      }
      .statement-container {
        width: 100%;
        max-width: 100%;
      }
      .header-title {
        text-align: center;
        border-bottom: 2px solid #000;
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .company-name {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .report-title {
        font-size: 13px;
        font-weight: 700;
        color: #374151;
        margin-top: 2px;
      }
      .meta-grid {
        display: flex;
        justify-content: space-between;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 14px;
        font-size: 11px;
      }
      .meta-item {
        display: flex;
        flex-direction: column;
      }
      .meta-label {
        font-size: 9px;
        text-transform: uppercase;
        color: #6b7280;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .meta-value {
        font-size: 12px;
        font-weight: 700;
        color: #111827;
        font-family: monospace;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
      }
      th {
        background: #f3f4f6;
        border: 1px solid #000;
        padding: 6px 8px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: left;
      }
      td {
        border: 1px solid #d1d5db;
        padding: 5px 8px;
        font-size: 10px;
      }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .font-mono { font-family: monospace; }
      .font-bold { font-weight: 700; }
      .totals-row td {
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        font-weight: 800;
        background: #f9fafb;
        font-size: 11px;
      }
      .summary-box {
        margin-top: 10px;
        padding: 8px 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.5;
      }
      .words-text {
        font-weight: 700;
        font-style: italic;
        color: #1f2937;
      }
      .signature-row {
        display: flex;
        justify-content: space-between;
        margin-top: 45px;
        padding-top: 8px;
      }
      .signature-line {
        border-top: 1px dashed #4b5563;
        width: 180px;
        text-align: center;
        font-size: 10px;
        font-weight: 600;
        color: #4b5563;
        padding-top: 4px;
      }
      .profit-text { color: #047857; font-weight: 800; }
      .loss-text { color: #b91c1c; font-weight: 800; }
    </style>
  </head>
  <body>
    ${printEl.innerHTML}
  </body>
</html>`);
    frameDoc.close();

    setTimeout(() => {
      try {
        printFrame?.contentWindow?.focus();
        printFrame?.contentWindow?.print();
      } catch (err) {
        console.error('Print error:', err);
      } finally {
        setIsPrinting(false);
      }
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Top Header: Matching all managers */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <LayoutDashboard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span>Fleet Executive Overview</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Real-time executive summary of fleet revenue, profitability, running distance, fuel, maintenance, and vehicle rankings
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshFromSupabase}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            title="Reload latest records from Supabase"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={handlePrintExecutiveReport}
            disabled={isPrinting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Preparing PDF...' : 'Print Executive Report (PDF)'}</span>
          </button>
        </div>
      </div>

      {/* Preset Time Range Filters Bar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Report Period:</span>
            </span>

            {[
              { id: 'all', label: 'All Time' },
              { id: 'week', label: 'This Week' },
              { id: '15days', label: '15 Days' },
              { id: 'month', label: 'This Month' },
              { id: '3months', label: '3 Months' },
              { id: '6months', label: '6 Months' },
              { id: '1year', label: '1 Year' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => {
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as TimePreset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="text-xs text-gray-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 font-semibold cursor-pointer underline"
            >
              Reset to All
            </button>
          )}
        </div>

        {/* Custom Date Pickers row when 'custom' is active */}
        {activePreset === 'custom' && (
          <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap items-center gap-3">
            <div className="w-48">
              <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">From Date</label>
              <CustomDatePicker value={fromDate} onChange={(val) => setFromDate(val)} placeholder="Start Date" />
            </div>
            <div className="w-48">
              <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">To Date</label>
              <CustomDatePicker value={toDate} onChange={(val) => setToDate(val)} placeholder="End Date" />
            </div>
          </div>
        )}
      </div>

      {/* 6 Top-Level Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Total Freight Revenue */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
            <span className="text-[11px] uppercase font-bold tracking-wider">Freight Revenue</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
              Rs.{kpis.totalRevenue.toLocaleString('en-IN')}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold mt-0.5">
              {kpis.totalTrips} {kpis.totalTrips === 1 ? 'trip' : 'trips'} logged
            </p>
          </div>
        </div>

        {/* 2. Net Operating Profit */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
            <span className="text-[11px] uppercase font-bold tracking-wider">Net {kpis.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              kpis.netProfit >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400'
            }`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className={`text-xl font-black font-mono tracking-tight ${kpis.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {kpis.netProfit >= 0 ? '+' : ''}Rs.{kpis.netProfit.toLocaleString('en-IN')}
            </h3>
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
              kpis.netProfit >= 0
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
            }`}>
              Margin: {kpis.profitMargin}%
            </span>
          </div>
        </div>

        {/* 3. Total Fleet Distance */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
            <span className="text-[11px] uppercase font-bold tracking-wider">Running Distance</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
              {kpis.totalRunningKm.toLocaleString('en-IN')} <span className="text-xs font-semibold text-gray-500">KM</span>
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold mt-0.5">
              Avg: {kpis.totalTrips > 0 ? Math.round(kpis.totalRunningKm / kpis.totalTrips) : 0} KM / trip
            </p>
          </div>
        </div>

        {/* 4. Fuel Consumed */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
            <span className="text-[11px] uppercase font-bold tracking-wider">Fuel Expense</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
              Rs.{kpis.totalFuelCost.toLocaleString('en-IN')}
            </h3>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-mono font-semibold mt-0.5">
              {kpis.totalFuelLiters.toLocaleString('en-IN')} L (Avg: Rs.{kpis.avgFuelRate}/L)
            </p>
          </div>
        </div>

        {/* 5. Repairs & Maintenance */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
            <span className="text-[11px] uppercase font-bold tracking-wider">Repairs & Spares</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
              Rs.{kpis.totalMaintenanceCost.toLocaleString('en-IN')}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold mt-0.5">
              {kpis.totalMaintenanceJobs} workshop jobs
            </p>
          </div>
        </div>

        {/* 6. Fleet & Receivables */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
            <span className="text-[11px] uppercase font-bold tracking-wider">Fleet & Drivers</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
              {kpis.totalVehicles} <span className="text-xs font-semibold text-gray-500">Trucks</span>
            </h3>
            <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold mt-0.5">
              {kpis.activeDrivers} Active Drivers
            </p>
          </div>
        </div>
      </div>

      {/* Operating Cost Breakdown Ratio Bar */}
      <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
              Fleet Cost Structure & Profit Ratio
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Percentage of total freight revenue consumed by operating expenses
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase">Total Operating Costs</span>
            <p className="text-base font-black font-mono text-gray-900 dark:text-zinc-100">
              Rs.{kpis.totalOperatingCosts.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Visual Progress Ratio Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100 dark:bg-zinc-800">
          <div style={{ width: `${Math.min(100, Math.max(0, costRatios.fuelPct))}%` }} className="bg-amber-500 h-full" title={`Fuel: ${costRatios.fuelPct}%`} />
          <div style={{ width: `${Math.min(100, Math.max(0, costRatios.driverPct))}%` }} className="bg-purple-500 h-full" title={`Driver Salaries: ${costRatios.driverPct}%`} />
          <div style={{ width: `${Math.min(100, Math.max(0, costRatios.maintPct))}%` }} className="bg-blue-500 h-full" title={`Maintenance: ${costRatios.maintPct}%`} />
          <div style={{ width: `${Math.min(100, Math.max(0, costRatios.expPct))}%` }} className="bg-rose-500 h-full" title={`Tolls & Overheads: ${costRatios.expPct}%`} />
          {kpis.netProfit > 0 && (
            <div style={{ width: `${Math.min(100, Math.max(0, costRatios.marginPct))}%` }} className="bg-emerald-500 h-full" title={`Net Profit: ${costRatios.marginPct}%`} />
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
            <div>
              <p className="text-gray-500 dark:text-zinc-400 font-semibold">Fuel ({costRatios.fuelPct}%)</p>
              <p className="font-mono font-bold text-gray-900 dark:text-zinc-100">Rs.{kpis.totalFuelCost.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
            <div>
              <p className="text-gray-500 dark:text-zinc-400 font-semibold">Driver Pay ({costRatios.driverPct}%)</p>
              <p className="font-mono font-bold text-gray-900 dark:text-zinc-100">Rs.{kpis.totalDriverSalary.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
            <div>
              <p className="text-gray-500 dark:text-zinc-400 font-semibold">Repairs ({costRatios.maintPct}%)</p>
              <p className="font-mono font-bold text-gray-900 dark:text-zinc-100">Rs.{kpis.totalMaintenanceCost.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
            <div>
              <p className="text-gray-500 dark:text-zinc-400 font-semibold">Overheads ({costRatios.expPct}%)</p>
              <p className="font-mono font-bold text-gray-900 dark:text-zinc-100">Rs.{kpis.totalExpensesCost.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <p className="text-gray-500 dark:text-zinc-400 font-semibold">Net Profit ({costRatios.marginPct}%)</p>
              <p className={`font-mono font-black ${kpis.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {kpis.netProfit >= 0 ? '+' : ''}Rs.{kpis.netProfit.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => onNavigate?.('invoices')}
          className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 text-left transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Plus className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">Create Invoice</h4>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">Freight billing</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('fuel')}
          className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-amber-500 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 text-left transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Fuel className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">Log Fuel Slip</h4>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">Bunk entries</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('maintenance')}
          className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 text-left transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Wrench className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">Log Repair</h4>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">Workshop bills</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('expenses')}
          className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-purple-500 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 text-left transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Wallet className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">Add Expense</h4>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">Tolls & taxes</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('profitAndLoss')}
          className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-500 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 text-left transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">Profit & Loss</h4>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">Full statements</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('vehicles')}
          className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 text-left transition-all cursor-pointer group shadow-2xs"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Truck className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-gray-900 dark:text-zinc-100">Manage Fleet</h4>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">Vehicles & KMs</p>
        </button>
      </div>

      {/* Main Grid: Vehicle Leaderboard (2-Column Cards) & Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Vehicle Leaderboard */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100">
                Vehicle Performance Leaderboard
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Ranked operational output and profitability by truck
              </p>
            </div>

            {/* Sort Buttons */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-100 dark:bg-zinc-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLeaderboardSort('profit')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  leaderboardSort === 'profit' ? 'bg-white dark:bg-zinc-900 shadow-2xs text-gray-900 dark:text-zinc-100 font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                By Net Profit
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardSort('revenue')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  leaderboardSort === 'revenue' ? 'bg-white dark:bg-zinc-900 shadow-2xs text-gray-900 dark:text-zinc-100 font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                By Revenue
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardSort('km')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  leaderboardSort === 'km' ? 'bg-white dark:bg-zinc-900 shadow-2xs text-gray-900 dark:text-zinc-100 font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                By Distance
              </button>
            </div>
          </div>

          {/* Vehicle Cards in Responsive Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {vehicleRankings.map((vr, idx) => {
              const isProfit = vr.netProfit >= 0;

              return (
                <div
                  key={vr.registrationNumber}
                  className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-3 hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold font-mono text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold font-mono text-gray-900 dark:text-zinc-100">
                          {vr.registrationNumber}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold">
                          {vr.tripCount} trips ({vr.totalKm.toLocaleString('en-IN')} KM)
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-base font-black font-mono ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isProfit ? '+' : ''}Rs.{vr.netProfit.toLocaleString('en-IN')}
                      </span>
                      <p className="text-[10px] font-bold text-gray-500 dark:text-zinc-400">
                        Margin: {vr.profitMargin}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800 text-center text-[11px]">
                    <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-zinc-800/40">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">Revenue</span>
                      <p className="font-mono font-bold text-gray-800 dark:text-zinc-200">Rs.{vr.revenue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-zinc-800/40">
                      <span className="text-[10px] text-amber-600 uppercase font-semibold">Fuel</span>
                      <p className="font-mono font-bold text-gray-800 dark:text-zinc-200">Rs.{vr.fuelCost.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-zinc-800/40">
                      <span className="text-[10px] text-blue-600 uppercase font-semibold">Repairs</span>
                      <p className="font-mono font-bold text-gray-800 dark:text-zinc-200">Rs.{vr.maintenanceCost.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Column: Unified Recent Activity Stream */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100">
              Live Fleet Operations Feed
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Recent events across billing, bunk, maintenance, and expenses
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-center text-xs text-gray-400 dark:text-zinc-500 py-8">
                No recent transactions recorded
              </p>
            ) : (
              recentActivities.map((act) => {
                const badgeColor =
                  act.type === 'invoice'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                    : act.type === 'fuel'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-900'
                    : act.type === 'maintenance'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-900'
                    : 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border-purple-200 dark:border-purple-900';

                return (
                  <div
                    key={act.id}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${badgeColor}`}>
                          {act.type}
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-zinc-100 truncate max-w-[150px]">
                          {act.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-zinc-400 truncate max-w-[200px]">
                        {act.subtitle}
                      </p>
                      <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                        {act.date}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-black text-gray-900 dark:text-zinc-100">
                        Rs.{Math.round(act.amount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          HIDDEN PRINT CONTAINER FOR CRISP A4 PDF EXECUTIVE FLEET REPORT
      ========================================================================= */}
      <div style={{ display: 'none' }}>
        <div id="aus_executive_report_print_root" className="statement-container">
          <div className="header-title">
            <div className="company-name">AUS TRANSPORT</div>
            <div className="report-title">EXECUTIVE FLEET PERFORMANCE REPORT</div>
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Active Fleet Size</span>
              <span className="meta-value">{kpis.totalVehicles} Vehicles ({kpis.activeDrivers} Drivers)</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Reporting Period</span>
              <span className="meta-value">{fromDate || 'Start'} to {toDate || 'Current'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Generated On</span>
              <span className="meta-value">{new Date().toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Executive KPI Summary Table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: '60%' }}>Key Financial & Operational Metric</th>
                <th className="text-right" style={{ width: '40%' }}>Recorded Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-bold">Total Operating Freight Revenue</td>
                <td className="text-right font-mono font-bold">Rs.{kpis.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={{ paddingLeft: '16px' }}>1. Fuel Consumption (Diesel / Petrol)</td>
                <td className="text-right font-mono">Rs.{kpis.totalFuelCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={{ paddingLeft: '16px' }}>2. Vehicle Repairs, Spare Parts & Servicing</td>
                <td className="text-right font-mono">Rs.{kpis.totalMaintenanceCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={{ paddingLeft: '16px' }}>3. Driver Trip Salaries & Daily Batas</td>
                <td className="text-right font-mono">Rs.{kpis.totalDriverSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={{ paddingLeft: '16px' }}>4. Tolls, FASTag, Road Taxes & Operating Expenses</td>
                <td className="text-right font-mono">Rs.{kpis.totalExpensesCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td className="font-bold">Total Fleet Operating Expenditure</td>
                <td className="text-right font-mono font-bold">Rs.{kpis.totalOperatingCosts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="font-bold" style={{ textTransform: 'uppercase' }}>
                  Net Operating {kpis.netProfit >= 0 ? 'Profit' : 'Loss'}
                </td>
                <td className={`text-right font-mono font-bold ${kpis.netProfit >= 0 ? 'profit-text' : 'loss-text'}`}>
                  {kpis.netProfit >= 0 ? '+' : ''}Rs.{kpis.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({kpis.profitMargin}%)
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Vehicle Leaderboard Breakdown */}
          <div style={{ marginTop: '14px', marginBottom: '6px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
            Vehicle Performance & Profitability Breakdown
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '5%' }}>#</th>
                <th style={{ width: '22%' }}>Vehicle No</th>
                <th className="text-right" style={{ width: '13%' }}>Distance (KM)</th>
                <th className="text-right" style={{ width: '15%' }}>Revenue (Rs)</th>
                <th className="text-right" style={{ width: '15%' }}>Fuel Cost (Rs)</th>
                <th className="text-right" style={{ width: '15%' }}>Repairs (Rs)</th>
                <th className="text-right" style={{ width: '15%' }}>Net P&L (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {vehicleRankings.map((vr, idx) => (
                <tr key={vr.registrationNumber}>
                  <td className="text-center font-mono">{idx + 1}</td>
                  <td className="font-mono font-bold">{vr.registrationNumber}</td>
                  <td className="text-right font-mono">{vr.totalKm.toLocaleString('en-IN')}</td>
                  <td className="text-right font-mono">{vr.revenue.toLocaleString('en-IN')}</td>
                  <td className="text-right font-mono">{vr.fuelCost.toLocaleString('en-IN')}</td>
                  <td className="text-right font-mono">{vr.maintenanceCost.toLocaleString('en-IN')}</td>
                  <td className={`text-right font-mono font-bold ${vr.netProfit >= 0 ? 'profit-text' : 'loss-text'}`}>
                    {vr.netProfit >= 0 ? '+' : ''}{vr.netProfit.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="summary-box">
            <span><strong>Net Profit / Result in Words: </strong></span>
            <span className="words-text">{numberToWords(kpis.netProfit)}</span>
          </div>

          <div className="signature-row">
            <div className="signature-line">Prepared / Verified By</div>
            <div className="signature-line">Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

