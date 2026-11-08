'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Search,
  MoreVertical,
  X,
  Printer,
  Truck,
  Droplets,
  Wrench,
  Users,
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  calculateVehiclePnl,
  calculateFleetPnl,
  numberToWords,
  VehiclePnlSummary,
  MonthPnlRecord,
  isDateInRange
} from '@/lib/profitAndLoss';
import { BillData, getStoredInvoices, INVOICES_CHANGE_EVENT } from '@/lib/invoices';
import { FuelEntry, getStoredFuelEntries, FUEL_ENTRIES_CHANGE_EVENT } from '@/lib/fuel';
import { MaintenanceEntry, getStoredMaintenanceEntries, MAINTENANCE_ENTRIES_CHANGE_EVENT } from '@/lib/maintenance';
import { ExpenseEntry, getStoredExpenses, EXPENSES_CHANGE_EVENT } from '@/lib/expenses';
import { Driver, getStoredDrivers, DRIVERS_CHANGE_EVENT } from '@/lib/drivers';
import { Vehicle, getStoredVehicles, VEHICLES_CHANGE_EVENT } from '@/lib/vehicles';
import { CustomDatePicker } from './CustomDatePicker';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

type DatePreset = 'all' | 'week' | '15days' | 'month' | '3months' | '6months' | '1year' | 'custom';

function formatDateDDMMYYYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function ProfitAndLossManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bills, setBills] = useState<BillData[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreset, setActivePreset] = useState<DatePreset>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [detailedVehicle, setDetailedVehicle] = useState<string | null>(null);
  const [statementVehicle, setStatementVehicle] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Apply preset date ranges
  const applyPreset = useCallback((preset: DatePreset) => {
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
      console.error('Error refreshing profit and loss data from Supabase:', err);
    }
  }, []);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for refresh module event from DashboardHeader
  useEffect(() => {
    const handleModuleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'profitAndLoss' || e.detail.module === 'all') {
        refreshFromSupabase();
      }
    };
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
    return () => window.removeEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
  }, [refreshFromSupabase]);

  // Close 3-dot dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.pnl-action-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filter vehicles by search query
  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => v.registrationNumber.toLowerCase().includes(q));
  }, [vehicles, searchQuery]);

  // Global Fleet P&L Summary
  const fleetPnl = useMemo(() => {
    return calculateFleetPnl(vehicles, bills, fuelEntries, maintenanceEntries, expenses, fromDate, toDate, drivers);
  }, [vehicles, bills, fuelEntries, maintenanceEntries, expenses, fromDate, toDate, drivers]);

  // Calculate P&L for each vehicle in the current date range
  const vehiclePnlList = useMemo(() => {
    return filteredVehicles.map((v) => {
      return calculateVehiclePnl(
        v.registrationNumber,
        bills,
        fuelEntries,
        maintenanceEntries,
        expenses,
        fromDate,
        toDate,
        drivers
      );
    });
  }, [filteredVehicles, bills, fuelEntries, maintenanceEntries, expenses, fromDate, toDate, drivers]);

  // Selected vehicle for detailed breakdown modal
  const selectedVehiclePnl = useMemo(() => {
    if (!detailedVehicle) return null;
    return calculateVehiclePnl(
      detailedVehicle,
      bills,
      fuelEntries,
      maintenanceEntries,
      expenses,
      fromDate,
      toDate,
      drivers
    );
  }, [detailedVehicle, bills, fuelEntries, maintenanceEntries, expenses, fromDate, toDate, drivers]);

  // Selected vehicle for PDF print
  const statementPnl = useMemo(() => {
    if (!statementVehicle) return null;
    return calculateVehiclePnl(
      statementVehicle,
      bills,
      fuelEntries,
      maintenanceEntries,
      expenses,
      fromDate,
      toDate,
      drivers
    );
  }, [statementVehicle, bills, fuelEntries, maintenanceEntries, expenses, fromDate, toDate, drivers]);

  // Trigger print via hidden iframe for crisp A4 PDF generation
  const handlePrintStatement = () => {
    if (!statementVehicle) return;
    setIsPrinting(true);

    const printEl = document.getElementById('aus_pnl_statement_print_root');
    if (!printEl) {
      setIsPrinting(false);
      return;
    }

    let printFrame = document.getElementById('aus_pnl_print_frame') as HTMLIFrameElement | null;
    if (printFrame) {
      printFrame.remove();
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'aus_pnl_print_frame';
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
    <title>Profit and Loss Statement - ${statementVehicle}</title>
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
      {/* Top Header: Matching Vehicle, Driver, Fuel, Maintenance, and Expenses Managers */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Profit & Loss Management</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Analyze vehicle financial performance, revenue against fuel, repairs, driver salaries, and export P&L statements
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative w-52 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vehicle number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 text-sm font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Preset Time Range Filters Bar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Period:</span>
            </span>

            {[
              { id: 'all', label: 'All Time' },
              { id: 'week', label: 'Week (7 Days)' },
              { id: '15days', label: '15 Days' },
              { id: 'month', label: 'This Month' },
              { id: '3months', label: '3 Months' },
              { id: '6months', label: '6 Months' },
              { id: '1year', label: '1 Year' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => {
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as DatePreset)}
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

      {/* Global Fleet Financial Performance Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 to-emerald-50/40 dark:from-zinc-900 dark:to-emerald-950/20 border border-gray-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold tracking-wider text-gray-500 dark:text-zinc-400">
              Total Fleet Net Performance ({activePreset === 'all' ? 'All Records' : `${fromDate || 'Start'} to ${toDate || 'Current'}`})
            </span>
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-black font-mono tracking-tight ${fleetPnl.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {fleetPnl.netProfit >= 0 ? '+' : ''}Rs.{fleetPnl.netProfit.toLocaleString('en-IN')}
              </span>
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase ${fleetPnl.netProfit >= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
                {fleetPnl.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'} ({fleetPnl.profitMargin}%)
              </span>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-200 dark:border-zinc-800">
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
              <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase">Revenue</span>
              <p className="text-base font-black font-mono text-gray-900 dark:text-zinc-100">
                Rs.{fleetPnl.totalRevenue.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">Fuel</span>
              <p className="text-base font-black font-mono text-gray-900 dark:text-zinc-100">
                Rs.{fleetPnl.totalFuel.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase">Repairs</span>
              <p className="text-base font-black font-mono text-gray-900 dark:text-zinc-100">
                Rs.{fleetPnl.totalMaintenance.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
              <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase">Driver Pay</span>
              <p className="text-base font-black font-mono text-gray-900 dark:text-zinc-100">
                Rs.{fleetPnl.totalDriverSalary.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase">Expenses</span>
              <p className="text-base font-black font-mono text-gray-900 dark:text-zinc-100">
                Rs.{fleetPnl.totalExpenses.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dual-Column Responsive Grid matching VehicleManager, DriverManager & FuelManager */}
      {vehiclePnlList.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Truck className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-1">
            No Vehicles Found
          </h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
            {searchQuery ? `No vehicles matched "${searchQuery}"` : 'Please register vehicles in the Vehicles module first.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehiclePnlList.map((pnl) => {
            const isProfit = pnl.netProfit >= 0;
            const recentMonths = pnl.monthlyBreakdown.slice(0, 3);

            return (
              <div
                key={pnl.vehicleNumber}
                className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between relative group"
              >
                {/* Top Section: Vehicle Number, Net Profit/Loss, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Vehicle Number */}
                  <div className="space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Vehicle Registration
                    </span>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isProfit
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400'
                      }`}>
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
                          {pnl.vehicleNumber}
                        </h3>
                        <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                          {pnl.tripCount} {pnl.tripCount === 1 ? 'trip' : 'trips'} ({pnl.totalKm.toLocaleString('en-IN')} KM ran)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Net Profit / Loss Number */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Net {isProfit ? 'Profit' : 'Loss'}
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className={`text-2xl font-black tracking-tight ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isProfit ? '+' : ''}Rs.{pnl.netProfit.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                      isProfit
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                    }`}>
                      Margin: {pnl.profitMargin}%
                    </span>
                  </div>

                  {/* 3. 3-Dot Menu Options */}
                  <div className="relative pnl-action-menu shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === pnl.vehicleNumber ? null : pnl.vehicleNumber);
                      }}
                      title="P&L Operations"
                      className="w-9 h-9 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-gray-100 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === pnl.vehicleNumber && (
                      <div className="absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                        {/* Generate Statement Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setStatementVehicle(pnl.vehicleNumber);
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Printer className="w-4 h-4 text-indigo-600" />
                          <span>Generate P&L Statement (PDF)</span>
                        </button>

                        {/* View Detailed Breakdown Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setDetailedVehicle(pnl.vehicleNumber);
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <ExternalLink className="w-4 h-4 text-gray-500" />
                          <span>View Monthly Breakdown</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle Financial Stats Bar */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-zinc-800 grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-gray-50/80 dark:bg-zinc-800/40">
                    <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-zinc-400">Revenue</span>
                    <p className="font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">Rs.{pnl.revenue.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50/80 dark:bg-zinc-800/40">
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Fuel</span>
                    <p className="font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">Rs.{pnl.fuelCost.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50/80 dark:bg-zinc-800/40">
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Repairs</span>
                    <p className="font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">Rs.{pnl.maintenanceCost.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50/80 dark:bg-zinc-800/40">
                    <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">Driver</span>
                    <p className="font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">Rs.{pnl.driverSalary.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50/80 dark:bg-zinc-800/40">
                    <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Expenses</span>
                    <p className="font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">Rs.{pnl.expensesCost.toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Bottom Nested Table: Month-Wise Breakdown for this vehicle */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-zinc-300">
                      <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Monthly P&L Trend</span>
                    </div>

                    {pnl.monthlyBreakdown.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setDetailedVehicle(pnl.vehicleNumber)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                      >
                        View all ({pnl.monthlyBreakdown.length})
                      </button>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200/80 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-100/70 dark:bg-zinc-800/60">
                          <th className="py-2.5 px-3 text-left font-semibold">Month</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Revenue</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Total Costs</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Net P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                        {recentMonths.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-3 px-3 text-center text-xs text-gray-400 dark:text-zinc-500 italic">
                              No financial records in selected period
                            </td>
                          </tr>
                        ) : (
                          recentMonths.map((m) => {
                            const monthProfit = m.netProfit >= 0;
                            return (
                              <tr key={m.monthKey} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                                <td className="py-2.5 px-3 font-semibold text-gray-800 dark:text-zinc-200 text-xs">
                                  {m.monthLabel}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">
                                  Rs.{m.revenue.toLocaleString('en-IN')}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-gray-600 dark:text-zinc-400 text-xs">
                                  Rs.{m.totalCost.toLocaleString('en-IN')}
                                </td>
                                <td className={`py-2.5 px-3 text-right font-mono font-black text-xs ${monthProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {monthProfit ? '+' : ''}Rs.{m.netProfit.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          DETAILED MONTHLY BREAKDOWN MODAL FOR A VEHICLE
      ========================================================================= */}
      {selectedVehiclePnl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full shadow-2xl p-6 relative my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    Monthly Profit & Loss Breakdown - {selectedVehiclePnl.vehicleNumber}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Month-by-month financial statement of revenue and deductions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatementVehicle(selectedVehiclePnl.vehicleNumber);
                    setDetailedVehicle(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Statement PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailedVehicle(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Table of all monthly records for this vehicle */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100/80 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5">Month</th>
                    <th className="py-3 px-3.5 text-right">Revenue (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Fuel (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Repairs (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Driver Pay (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Expenses (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Total Costs (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Net P&L (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80">
                  {selectedVehiclePnl.monthlyBreakdown.map((m) => {
                    const monthProfit = m.netProfit >= 0;
                    return (
                      <tr key={m.monthKey} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                        <td className="py-3 px-3.5 font-bold text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          {m.monthLabel}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          Rs.{m.revenue.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          Rs.{m.fuelCost.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-blue-700 dark:text-blue-400 whitespace-nowrap">
                          Rs.{m.maintenanceCost.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-purple-700 dark:text-purple-400 whitespace-nowrap">
                          Rs.{m.driverSalary.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-rose-700 dark:text-rose-400 whitespace-nowrap">
                          Rs.{m.expensesCost.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          Rs.{m.totalCost.toLocaleString('en-IN')}
                        </td>
                        <td className={`py-3 px-3.5 text-right font-mono font-black whitespace-nowrap ${monthProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {monthProfit ? '+' : ''}Rs.{m.netProfit.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3.5 text-right font-bold whitespace-nowrap">
                          {m.profitMargin}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailedVehicle(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATEMENT (PDF) GENERATOR MODAL
      ========================================================================= */}
      {statementPnl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    Generate P&L Statement (PDF)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Official financial report for {statementPnl.vehicleNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatementVehicle(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Financial Snapshot */}
              <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Freight Revenue:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-zinc-100">Rs.{statementPnl.revenue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Fuel Cost:</span>
                  <span className="font-mono text-gray-800 dark:text-zinc-200">Rs.{statementPnl.fuelCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Repairs & Spares:</span>
                  <span className="font-mono text-gray-800 dark:text-zinc-200">Rs.{statementPnl.maintenanceCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Driver Salaries & Batas:</span>
                  <span className="font-mono text-gray-800 dark:text-zinc-200">Rs.{statementPnl.driverSalary.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Tolls, Taxes & Expenses:</span>
                  <span className="font-mono text-gray-800 dark:text-zinc-200">Rs.{statementPnl.expensesCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="border-t border-indigo-200 dark:border-indigo-800 pt-2 flex items-center justify-between text-sm">
                  <span className="font-bold text-gray-800 dark:text-zinc-200">Net Profit / Loss:</span>
                  <span className={`font-mono font-black ${statementPnl.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                    {statementPnl.netProfit >= 0 ? '+' : ''}Rs.{statementPnl.netProfit.toLocaleString('en-IN')} ({statementPnl.profitMargin}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setStatementVehicle(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  disabled={isPrinting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'Preparing PDF...' : 'Print / Save Statement (PDF)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          HIDDEN PRINT CONTAINER FOR CRISP A4 PDF GENERATION
      ========================================================================= */}
      <div style={{ display: 'none' }}>
        {statementPnl && (
          <div id="aus_pnl_statement_print_root" className="statement-container">
            <div className="header-title">
              <div className="company-name">AUS TRANSPORT</div>
              <div className="report-title">VEHICLE PROFIT & LOSS STATEMENT</div>
            </div>

            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Vehicle Registration No</span>
                <span className="meta-value">{statementPnl.vehicleNumber}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Report Period</span>
                <span className="meta-value">
                  {fromDate || 'Start'} to {toDate || 'Current'}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Generated On</span>
                <span className="meta-value">{new Date().toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Income & Expense Breakdown Table */}
            <table>
              <thead>
                <tr>
                  <th style={{ width: '65%' }}>Financial Particulars</th>
                  <th className="text-right" style={{ width: '35%' }}>Amount (Rs)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold">A. Total Operating Revenue (Freight Invoices)</td>
                  <td className="text-right font-mono font-bold">
                    Rs.{statementPnl.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: '16px' }}>1. Fuel Consumption (Diesel / Petrol)</td>
                  <td className="text-right font-mono">
                    Rs.{statementPnl.fuelCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: '16px' }}>2. Vehicle Repairs & Maintenance</td>
                  <td className="text-right font-mono">
                    Rs.{statementPnl.maintenanceCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: '16px' }}>3. Driver Trip Salaries & Daily Batas</td>
                  <td className="text-right font-mono">
                    Rs.{statementPnl.driverSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: '16px' }}>4. Tolls, FASTag, Permits, Taxes & Overheads</td>
                  <td className="text-right font-mono">
                    Rs.{statementPnl.expensesCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr style={{ background: '#f9fafb' }}>
                  <td className="font-bold">B. Total Operating Expenditure (1 + 2 + 3 + 4)</td>
                  <td className="text-right font-mono font-bold">
                    Rs.{statementPnl.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="font-bold" style={{ textTransform: 'uppercase' }}>
                    Net Operating {statementPnl.netProfit >= 0 ? 'Profit' : 'Loss'} (A - B)
                  </td>
                  <td className={`text-right font-mono font-bold ${statementPnl.netProfit >= 0 ? 'profit-text' : 'loss-text'}`}>
                    {statementPnl.netProfit >= 0 ? '+' : ''}Rs.{statementPnl.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({statementPnl.profitMargin}%)
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Monthly Trend Section */}
            {statementPnl.monthlyBreakdown.length > 0 && (
              <>
                <div style={{ marginTop: '14px', marginBottom: '6px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                  Month-Wise Financial Performance Trend
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="text-right">Revenue (Rs)</th>
                      <th className="text-right">Fuel (Rs)</th>
                      <th className="text-right">Repairs (Rs)</th>
                      <th className="text-right">Driver (Rs)</th>
                      <th className="text-right">Expenses (Rs)</th>
                      <th className="text-right">Total Costs (Rs)</th>
                      <th className="text-right">Net P&L (Rs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementPnl.monthlyBreakdown.map((m) => (
                      <tr key={m.monthKey}>
                        <td className="font-bold">{m.monthLabel}</td>
                        <td className="text-right font-mono">{m.revenue.toLocaleString('en-IN')}</td>
                        <td className="text-right font-mono">{m.fuelCost.toLocaleString('en-IN')}</td>
                        <td className="text-right font-mono">{m.maintenanceCost.toLocaleString('en-IN')}</td>
                        <td className="text-right font-mono">{m.driverSalary.toLocaleString('en-IN')}</td>
                        <td className="text-right font-mono">{m.expensesCost.toLocaleString('en-IN')}</td>
                        <td className="text-right font-mono">{m.totalCost.toLocaleString('en-IN')}</td>
                        <td className={`text-right font-mono font-bold ${m.netProfit >= 0 ? 'profit-text' : 'loss-text'}`}>
                          {m.netProfit >= 0 ? '+' : ''}{m.netProfit.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="summary-box">
              <span><strong>Net Result in Words: </strong></span>
              <span className="words-text">{numberToWords(statementPnl.netProfit)}</span>
            </div>

            <div className="signature-row">
              <div className="signature-line">Prepared / Verified By</div>
              <div className="signature-line">Authorized Signatory</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
