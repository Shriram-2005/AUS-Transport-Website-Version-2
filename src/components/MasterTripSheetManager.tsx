'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Search,
  Download,
  Printer,
  Calendar,
  Truck,
  X,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Database,
  Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BillData, getBillTdsRate } from '@/lib/invoices';
import { FuelEntry } from '@/lib/fuel';
import { MaintenanceEntry } from '@/lib/maintenance';
import { ExpenseEntry, isTollExpense } from '@/lib/expenses';
import { Driver } from '@/lib/drivers';
import { isDateInRange, parseDateToTimestamp } from '@/lib/profitAndLoss';
import { CustomDatePicker } from './CustomDatePicker';
import { EditableSelectDropdown } from './EditableSelectDropdown';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

export interface SheetColumnDef {
  id?: string;
  column_key: string;
  label: string;
  data_type: 'text' | 'number' | 'currency';
  sort_order: number;
  is_default: boolean;
}

const DEFAULT_SHEET_COLUMNS: SheetColumnDef[] = [
  { column_key: 'date', label: 'Date', data_type: 'text', sort_order: 1, is_default: true },
  { column_key: 'vehicleNumber', label: 'Vehicle Number', data_type: 'text', sort_order: 2, is_default: true },
  { column_key: 'driverName', label: 'Driver Name', data_type: 'text', sort_order: 3, is_default: true },
  { column_key: 'dcNo', label: 'DC Number', data_type: 'text', sort_order: 4, is_default: true },
  { column_key: 'fromPlace', label: 'From Place', data_type: 'text', sort_order: 5, is_default: true },
  { column_key: 'toPlace', label: 'To Place', data_type: 'text', sort_order: 6, is_default: true },
  { column_key: 'particulars', label: 'Particulars', data_type: 'text', sort_order: 7, is_default: true },
  { column_key: 'quantity', label: 'Quantity', data_type: 'number', sort_order: 8, is_default: true },
  { column_key: 'openingKm', label: 'Opening KM', data_type: 'number', sort_order: 9, is_default: true },
  { column_key: 'closingKm', label: 'Closing KM', data_type: 'number', sort_order: 10, is_default: true },
  { column_key: 'runningKm', label: 'Running KM', data_type: 'number', sort_order: 11, is_default: true },
  { column_key: 'dieselQty', label: 'Diesel Qty (L)', data_type: 'number', sort_order: 12, is_default: true },
  { column_key: 'dieselRate', label: 'Rate', data_type: 'currency', sort_order: 13, is_default: true },
  { column_key: 'dieselAmount', label: 'Diesel Amount', data_type: 'currency', sort_order: 14, is_default: true },
  { column_key: 'mileage', label: 'Mileage', data_type: 'number', sort_order: 15, is_default: true },
  { column_key: 'driverFoodExp', label: 'Driver Food Exp', data_type: 'currency', sort_order: 16, is_default: true },
  { column_key: 'rtoExp', label: 'RTO Expenses', data_type: 'currency', sort_order: 17, is_default: true },
  { column_key: 'maintenanceExp', label: 'Repairs & Maint. Exp', data_type: 'currency', sort_order: 18, is_default: true },
  { column_key: 'tollGateExp', label: 'Toll Gate Exp', data_type: 'currency', sort_order: 19, is_default: true },
  { column_key: 'otherExp', label: 'Expenses', data_type: 'currency', sort_order: 20, is_default: true },
  { column_key: 'driverSalary', label: 'Driver Salary', data_type: 'currency', sort_order: 21, is_default: true },
  { column_key: 'totalExpenses', label: 'Total Expenses', data_type: 'currency', sort_order: 22, is_default: true },
  { column_key: 'freightPerKm', label: 'Freight Per KM', data_type: 'currency', sort_order: 23, is_default: true },
  { column_key: 'freightAmount', label: 'Freight Amount', data_type: 'currency', sort_order: 24, is_default: true },
  { column_key: 'billAmount', label: 'Bill Amount', data_type: 'currency', sort_order: 25, is_default: true },
  { column_key: 'profit', label: 'Profit', data_type: 'currency', sort_order: 26, is_default: true },
  { column_key: 'loss', label: 'Loss', data_type: 'currency', sort_order: 27, is_default: true },
];

type PeriodPreset = 'all' | 'month' | '3months' | 'custom';

function normalizeVeh(v?: string): string {
  return (v || '').replace(/\s+/g, '').trim().toUpperCase();
}

function normalizeDateKey(d?: string): string {
  const t = parseDateToTimestamp(d);
  if (!t) return '';
  const dt = new Date(t);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatDDMMYYYY(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

interface RawInvoiceRecord extends BillData {
  consignorAddress?: string;
}

export function MasterTripSheetManager() {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  // Live Supabase data
  const [bills, setBills] = useState<RawInvoiceRecord[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehiclesList, setVehiclesList] = useState<string[]>([]);

  // DB-backed columns & custom cell values
  const [columns, setColumns] = useState<SheetColumnDef[]>(DEFAULT_SHEET_COLUMNS);
  const [cellValues, setCellValues] = useState<Record<string, Record<string, string>>>({});

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Insert Column modal
  const [isInsertColOpen, setIsInsertColOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number' | 'currency'>('text');
  const [insertAfterKey, setInsertAfterKey] = useState<string>('__end__');
  const [colSaving, setColSaving] = useState(false);
  const [colError, setColError] = useState('');

  // Delete Column modal
  const [deletingCol, setDeletingCol] = useState<SheetColumnDef | null>(null);

  // Inline cell editing
  const [editingCell, setEditingCell] = useState<{ rowKey: string; colKey: string } | null>(null);
  const [editingCellVal, setEditingCellVal] = useState('');
  const [savingCell, setSavingCell] = useState(false);

  const applyPeriod = useCallback((preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const today = new Date();
    const todayStr = formatDDMMYYYY(today);
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(formatDDMMYYYY(start));
      setToDate(todayStr);
    } else if (preset === '3months') {
      const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      setFromDate(formatDDMMYYYY(start));
      setToDate(todayStr);
    }
  }, []);

  const fetchAllFromSupabase = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const supabase = createClient();

      const [vRes, iRes, fRes, mRes, eRes, dRes, colRes, cellRes] = await Promise.all([
        supabase.from('vehicles').select('registration_number').order('registration_number', { ascending: true }),
        supabase.from('invoices').select('*'),
        supabase.from('fuel_entries').select('*'),
        supabase.from('maintenance_entries').select('*'),
        supabase.from('expense_entries').select('*'),
        supabase.from('drivers').select('*'),
        supabase.from('trip_sheet_columns').select('*').order('sort_order', { ascending: true }),
        supabase.from('trip_sheet_cell_values').select('*'),
      ]);

      if (!vRes.error && vRes.data) {
        setVehiclesList(
          vRes.data
            .map((v: any) => (v.registration_number || '').trim().toUpperCase())
            .filter(Boolean)
        );
      }

      if (!iRes.error && iRes.data) {
        const mappedBills: RawInvoiceRecord[] = iRes.data.map((item: any) => {
          const consignorAddr =
            item.consignor?.address ||
            item.raw_data?.branch ||
            'Nellakottai Hatcheries, Dindugul DT. TN.';
          if (item.raw_data && item.raw_data.trips) {
            return {
              ...item.raw_data,
              id: item.id,
              billNumber: item.bill_number,
              date: item.bill_date,
              vehicleNumber: item.vehicle_number,
              status: item.payment_status || item.raw_data.status || 'unpaid',
              consignorAddress: consignorAddr,
            };
          }
          return {
            id: item.id,
            billNumber: item.bill_number,
            date: item.bill_date,
            vehicleNumber: item.vehicle_number,
            activeTrip: 1,
            visibleTrips: (item.trips || []).length || 1,
            trips: item.trips || [],
            keralaRtoEnabled: item.expenses?.hasRto ?? false,
            keralaRtoMultiplier: item.expenses?.rtoMultiplier ?? 0,
            keralaRtoAmount: item.expenses?.rtoExpense ?? 0,
            dieselAvgRate: item.expenses?.dieselAvgRate ?? 0,
            rupeesInWordsMode: 'auto',
            rupeesInWordsText: item.amount_in_words || '',
            status: item.payment_status === 'Paid' ? 'paid' : 'unpaid',
            consignorAddress: consignorAddr,
          };
        });
        setBills(mappedBills);
      }

      if (!fRes.error && fRes.data) {
        setFuelEntries(
          fRes.data.map((f: any) => ({
            id: f.id,
            vehicleNumber: (f.vehicle_number || '').trim().toUpperCase(),
            date: f.entry_date || '',
            billNumber: f.bill_number || '',
            particulars: f.fuel_type || 'Diesel',
            liters: Number(f.liters) || 0,
            ratePerLiter: Number(f.rate_per_liter) || 0,
            totalAmount: Number(f.total_amount) || 0,
            bunkName: f.bunk_name || '',
          }))
        );
      }

      if (!mRes.error && mRes.data) {
        setMaintenanceEntries(
          mRes.data.map((m: any) => ({
            id: m.id,
            vehicleNumber: (m.vehicle_number || '').trim().toUpperCase(),
            date: m.entry_date || '',
            billNumber: m.bill_number || '',
            category: m.category || '',
            description: m.description || '',
            amount: Number(m.amount) || 0,
            workshopName: m.workshop_name || '',
            odometerKm: m.odometer_km ? Number(m.odometer_km) : undefined,
          }))
        );
      }

      if (!eRes.error && eRes.data) {
        setExpenses(
          eRes.data.map((e: any) => ({
            id: e.id,
            vehicleNumber: (e.vehicle_number || 'GENERAL').trim().toUpperCase(),
            date: e.entry_date || '',
            voucherNumber: e.voucher_number || '',
            category: e.category || '',
            description: e.description || '',
            amount: Number(e.amount) || 0,
            paymentMode: e.payment_mode || 'Cash',
            paidTo: e.paid_to || '',
          }))
        );
      }

      if (!dRes.error && dRes.data) {
        setDrivers(
          dRes.data.map((d: any) => ({
            id: d.id,
            name: d.name,
            phone: d.phone,
            licenseNumber: d.license_number,
            ratePerKm: Number(d.rate_per_km) || 0,
            status: d.status || 'active',
          }))
        );
      }

      // Columns from Supabase
      if (colRes.error) {
        // Table not yet created in Supabase
        setSchemaMissing(true);
        setColumns(DEFAULT_SHEET_COLUMNS);
      } else {
        setSchemaMissing(false);
        if (colRes.data && colRes.data.length > 0) {
          setColumns(
            colRes.data.map((c: any) => ({
              id: c.id,
              column_key: c.column_key,
              label: c.label,
              data_type: c.data_type || 'text',
              sort_order: Number(c.sort_order) || 0,
              is_default: Boolean(c.is_default),
            }))
          );
        } else {
          // Seed default column definitions into DB (column headers only, zero dummy rows)
          const { data: seeded, error: seedErr } = await supabase
            .from('trip_sheet_columns')
            .upsert(
              DEFAULT_SHEET_COLUMNS.map((c) => ({
                column_key: c.column_key,
                label: c.label,
                data_type: c.data_type,
                sort_order: c.sort_order,
                is_default: c.is_default,
              })),
              { onConflict: 'column_key' }
            )
            .select('*')
            .order('sort_order', { ascending: true });

          if (!seedErr && seeded && seeded.length > 0) {
            setColumns(seeded as SheetColumnDef[]);
          } else {
            setColumns(DEFAULT_SHEET_COLUMNS);
          }
        }
      }

      // Cell overrides / custom column values from Supabase
      if (!cellRes.error && cellRes.data) {
        const map: Record<string, Record<string, string>> = {};
        for (const cell of cellRes.data) {
          if (!map[cell.row_key]) map[cell.row_key] = {};
          map[cell.row_key][cell.column_key] = cell.value ?? '';
        }
        setCellValues(map);
      }
    } catch (err: any) {
      setDbError(err?.message || 'Failed to fetch data from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllFromSupabase();
  }, [fetchAllFromSupabase]);

  useEffect(() => {
    const handleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'tripSheet' || e.detail.module === 'all') {
        fetchAllFromSupabase();
      }
    };
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleRefresh);
    return () => window.removeEventListener(REFRESH_MODULE_EVENT as any, handleRefresh);
  }, [fetchAllFromSupabase]);

  // Build rows strictly from Supabase database records
  const allRows = useMemo(() => {
    const driverRateMap = new Map<string, number>();
    for (const d of drivers) {
      if (d.name) driverRateMap.set(d.name.trim().toLowerCase(), Number(d.ratePerKm) || 0);
      if (d.id) driverRateMap.set(String(d.id), Number(d.ratePerKm) || 0);
    }

    // Index fuel, maintenance, and expenses by (normalizedVehicle + normalizedDateKey)
    const fuelByKey = new Map<string, { liters: number; amount: number }>();
    for (const f of fuelEntries) {
      const k = `${normalizeVeh(f.vehicleNumber)}|${normalizeDateKey(f.date)}`;
      const prev = fuelByKey.get(k) || { liters: 0, amount: 0 };
      prev.liters += Number(f.liters) || 0;
      prev.amount += Number(f.totalAmount) || 0;
      fuelByKey.set(k, prev);
    }

    const maintByKey = new Map<string, number>();
    for (const m of maintenanceEntries) {
      const k = `${normalizeVeh(m.vehicleNumber)}|${normalizeDateKey(m.date)}`;
      maintByKey.set(k, (maintByKey.get(k) || 0) + (Number(m.amount) || 0));
    }

    const expByKey = new Map<
      string,
      { driverFood: number; rto: number; toll: number; other: number }
    >();
    for (const exp of expenses) {
      const k = `${normalizeVeh(exp.vehicleNumber)}|${normalizeDateKey(exp.date)}`;
      const bucket = expByKey.get(k) || { driverFood: 0, rto: 0, toll: 0, other: 0 };
      const amt = Number(exp.amount) || 0;
      const cat = (exp.category || '').toLowerCase();
      const desc = (exp.description || '').toLowerCase();

      if (isTollExpense(exp)) {
        bucket.toll += amt;
      } else if (
        cat.includes('driver') ||
        cat.includes('batta') ||
        cat.includes('food') ||
        cat.includes('allowance') ||
        desc.includes('food') ||
        desc.includes('batta')
      ) {
        bucket.driverFood += amt;
      } else if (
        cat.includes('rto') ||
        cat.includes('checkpost') ||
        cat.includes('border') ||
        cat.includes('permit')
      ) {
        bucket.rto += amt;
      } else {
        bucket.other += amt;
      }
      expByKey.set(k, bucket);
    }

    // Calculate total running KM per (vehicle + date) across all trips to split same-day fuel/expense proportionally
    const totalKmByKey = new Map<string, number>();
    const tripCountByKey = new Map<string, number>();

    interface RawTripItem {
      bill: RawInvoiceRecord;
      trip: RawInvoiceRecord['trips'][number];
      tripIndex: number;
      tripDate: string;
      dateKey: string;
      vehKey: string;
      runningKm: number;
    }

    const rawTrips: RawTripItem[] = [];

    for (const bill of bills) {
      const visible = bill.visibleTrips ?? bill.trips?.length ?? 0;
      const trips = (bill.trips || []).slice(0, visible);
      trips.forEach((trip, idx) => {
        if (trip.enabled === false) return;
        const tripDate = (trip.date || bill.date || '').trim();
        const dateKey = normalizeDateKey(tripDate);
        const vehKey = normalizeVeh(bill.vehicleNumber);
        const runningKm = Math.max(0, (Number(trip.closingKm) || 0) - (Number(trip.startingKm) || 0));
        const key = `${vehKey}|${dateKey}`;

        totalKmByKey.set(key, (totalKmByKey.get(key) || 0) + runningKm);
        tripCountByKey.set(key, (tripCountByKey.get(key) || 0) + 1);

        rawTrips.push({
          bill,
          trip,
          tripIndex: idx,
          tripDate,
          dateKey,
          vehKey,
          runningKm,
        });
      });
    }

    const rows = rawTrips.map((item) => {
      const { bill, trip, tripIndex, tripDate, dateKey, vehKey, runningKm } = item;
      const key = `${vehKey}|${dateKey}`;
      const groupKm = totalKmByKey.get(key) || 0;
      const groupCount = tripCountByKey.get(key) || 1;
      const share = groupKm > 0 ? runningKm / groupKm : 1 / groupCount;

      const fuelGroup = fuelByKey.get(key);
      const dieselQty = fuelGroup ? Math.round(fuelGroup.liters * share * 100) / 100 : 0;
      const dieselAmount = fuelGroup ? Math.round(fuelGroup.amount * share) : 0;
      const dieselRate = dieselQty > 0 ? Math.round((dieselAmount / dieselQty) * 100) / 100 : 0;
      const mileage = runningKm > 0 && dieselQty > 0 ? Math.round((runningKm / dieselQty) * 100) / 100 : 0;

      const maintGroup = maintByKey.get(key) || 0;
      const maintenanceExp = Math.round(maintGroup * share);

      const expGroup = expByKey.get(key);
      const driverFoodExp = expGroup ? Math.round(expGroup.driverFood * share) : 0;
      const tollFromExpenses = expGroup ? Math.round(expGroup.toll * share) : 0;
      const rtoFromExpenses = expGroup ? Math.round(expGroup.rto * share) : 0;
      const otherExp = expGroup ? Math.round(expGroup.other * share) : 0;

      // Bill RTO share across visible enabled trips
      const billTripsCount = Math.max(
        1,
        (bill.trips || []).slice(0, bill.visibleTrips ?? bill.trips?.length ?? 0).filter((t) => t.enabled !== false).length
      );
      const billRtoTotal =
        bill.keralaRtoEnabled && (Number(bill.keralaRtoMultiplier) || 0) > 0
          ? (Number(bill.keralaRtoMultiplier) || 0) * (Number(bill.keralaRtoAmount) || 0)
          : 0;
      const rtoExp = rtoFromExpenses + Math.round(billRtoTotal / billTripsCount);

      const tollGateExp = tollFromExpenses;

      // Driver Salary
      let driverRate = Number(trip.driverRate) || 0;
      if (driverRate <= 0) {
        if (trip.driverId && driverRateMap.has(String(trip.driverId))) {
          driverRate = driverRateMap.get(String(trip.driverId)) || 0;
        } else if (trip.driverName && driverRateMap.has(trip.driverName.trim().toLowerCase())) {
          driverRate = driverRateMap.get(trip.driverName.trim().toLowerCase()) || 0;
        }
      }
      const driverSalary = Math.round(runningKm * driverRate);

      const totalExpenses =
        dieselAmount + driverFoodExp + rtoExp + maintenanceExp + tollGateExp + otherExp + driverSalary;

      const freightPerKm = Number(trip.rate) || 0;
      const freightAmount = Math.round(runningKm * freightPerKm);
      const tripTollOnInvoice = trip.tollEnabled ? Number(trip.tollAmount) || 0 : 0;
      const tdsRate = getBillTdsRate(bill);
      const billGrossForTrip = freightAmount + tripTollOnInvoice + Math.round(billRtoTotal / billTripsCount);
      const billAmount = Math.round(billGrossForTrip * (1 - tdsRate / 100));

      // Net P&L using freightAmount (excluding toll reimbursement, after TDS) vs totalExpenses
      const netFreightAfterTds = Math.round((freightAmount + Math.round(billRtoTotal / billTripsCount)) * (1 - tdsRate / 100));
      const net = netFreightAfterTds - totalExpenses;
      const profit = net >= 0 ? net : 0;
      const loss = net < 0 ? Math.abs(net) : 0;

      const fromPlace =
        (bill.branch && bill.branch.trim()) ||
        (bill.consignorAddress && bill.consignorAddress.trim()) ||
        'Nellakottai Hatcheries, Dindugul DT. TN.';

      const rowKey = `${bill.billNumber}_${tripIndex}`;

      const row: Record<string, any> = {
        rowKey,
        billNumber: bill.billNumber,
        timestamp: parseDateToTimestamp(tripDate),
        date: tripDate,
        vehicleNumber: (bill.vehicleNumber || '').trim().toUpperCase(),
        driverName: (trip.driverName || '').trim(),
        dcNo: String(trip.dcNo || '').trim(),
        fromPlace,
        toPlace: (trip.route || '').trim(),
        particulars: (trip.itemName || trip.particulars || '').trim(),
        quantity: trip.itemQuantity ? Number(trip.itemQuantity) || trip.itemQuantity : '',
        openingKm: Number(trip.startingKm) || 0,
        closingKm: Number(trip.closingKm) || 0,
        runningKm,
        dieselQty,
        dieselRate,
        dieselAmount,
        mileage,
        driverFoodExp,
        rtoExp,
        maintenanceExp,
        tollGateExp,
        otherExp,
        driverSalary,
        totalExpenses,
        freightPerKm,
        freightAmount,
        billAmount,
        profit,
        loss,
      };

      // Overlay any DB-saved custom cell values or manual edits
      const overrides = cellValues[rowKey];
      if (overrides) {
        for (const [cKey, cVal] of Object.entries(overrides)) {
          row[cKey] = cVal;
        }
      }

      return row;
    });

    rows.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return (Number(b.billNumber) || 0) - (Number(a.billNumber) || 0);
    });

    return rows;
  }, [bills, fuelEntries, maintenanceEntries, expenses, drivers, cellValues]);

  // Apply Search, Vehicle, and Date filters
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const targetVeh = normalizeVeh(vehicleFilter);

    return allRows.filter((row) => {
      if (targetVeh && normalizeVeh(row.vehicleNumber) !== targetVeh) return false;
      if (!isDateInRange(row.date, fromDate, toDate)) return false;
      if (q) {
        const hay = [
          row.date,
          row.vehicleNumber,
          row.driverName,
          row.dcNo,
          row.fromPlace,
          row.toPlace,
          row.particulars,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, searchQuery, vehicleFilter, fromDate, toDate]);

  // Column Totals for footer
  const columnTotals = useMemo(() => {
    const sums: Record<string, number> = {};
    const summableKeys = [
      'quantity',
      'runningKm',
      'dieselQty',
      'dieselAmount',
      'driverFoodExp',
      'rtoExp',
      'maintenanceExp',
      'tollGateExp',
      'otherExp',
      'driverSalary',
      'totalExpenses',
      'freightAmount',
      'billAmount',
      'profit',
      'loss',
    ];

    for (const col of columns) {
      if (summableKeys.includes(col.column_key) || !col.is_default) {
        if (col.data_type === 'number' || col.data_type === 'currency' || summableKeys.includes(col.column_key)) {
          let total = 0;
          for (const row of filteredRows) {
            const n = Number(row[col.column_key]);
            if (!isNaN(n)) total += n;
          }
          sums[col.column_key] = Math.round(total * 100) / 100;
        }
      }
    }

    if (sums.runningKm > 0 && sums.dieselQty > 0) {
      sums.mileage = Math.round((sums.runningKm / sums.dieselQty) * 100) / 100;
    }
    if (sums.dieselQty > 0 && sums.dieselAmount > 0) {
      sums.dieselRate = Math.round((sums.dieselAmount / sums.dieselQty) * 100) / 100;
    }

    return sums;
  }, [filteredRows, columns]);

  // Insert Column into Supabase DB
  const handleInsertColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    setColError('');
    const cleanLabel = newColLabel.trim();
    if (!cleanLabel) {
      setColError('Please enter a column name.');
      return;
    }

    const baseKey = cleanLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const column_key = `custom_${baseKey || 'col'}_${Date.now().toString().slice(-4)}`;

    setColSaving(true);
    try {
      const supabase = createClient();

      // Determine new sort_order list
      const ordered = [...columns];
      const newCol: SheetColumnDef = {
        column_key,
        label: cleanLabel,
        data_type: newColType,
        sort_order: ordered.length + 1,
        is_default: false,
      };

      if (insertAfterKey === '__start__') {
        ordered.unshift(newCol);
      } else if (insertAfterKey === '__end__') {
        ordered.push(newCol);
      } else {
        const idx = ordered.findIndex((c) => c.column_key === insertAfterKey);
        if (idx >= 0) ordered.splice(idx + 1, 0, newCol);
        else ordered.push(newCol);
      }

      const reindexed = ordered.map((c, idx) => ({ ...c, sort_order: idx + 1 }));

      const { error: insertErr } = await supabase.from('trip_sheet_columns').insert([
        {
          column_key: newCol.column_key,
          label: newCol.label,
          data_type: newCol.data_type,
          sort_order: reindexed.find((r) => r.column_key === newCol.column_key)?.sort_order || reindexed.length,
          is_default: false,
        },
      ]);

      if (insertErr) {
        setColError(`Database error: ${insertErr.message}. Please run the updated supabase/schema.sql first.`);
        setColSaving(false);
        return;
      }

      // Persist updated sort_order for all columns
      for (const c of reindexed) {
        if (c.column_key !== newCol.column_key) {
          await supabase
            .from('trip_sheet_columns')
            .update({ sort_order: c.sort_order })
            .eq('column_key', c.column_key);
        }
      }

      setColumns(reindexed);
      setNewColLabel('');
      setNewColType('text');
      setInsertAfterKey('__end__');
      setIsInsertColOpen(false);
    } catch (err: any) {
      setColError(err?.message || 'Failed to insert column into database.');
    } finally {
      setColSaving(false);
    }
  };

  // Delete Column from Supabase DB
  const handleConfirmDeleteColumn = async () => {
    if (!deletingCol) return;
    const targetKey = deletingCol.column_key;

    try {
      const supabase = createClient();
      const { error: delColErr } = await supabase
        .from('trip_sheet_columns')
        .delete()
        .eq('column_key', targetKey);

      if (delColErr) {
        setDbError(`Database error deleting column: ${delColErr.message}`);
        setDeletingCol(null);
        return;
      }

      await supabase.from('trip_sheet_cell_values').delete().eq('column_key', targetKey);

      setColumns((prev) => prev.filter((c) => c.column_key !== targetKey));
      setCellValues((prev) => {
        const next: Record<string, Record<string, string>> = {};
        for (const [rKey, colsObj] of Object.entries(prev)) {
          const copy = { ...colsObj };
          delete copy[targetKey];
          next[rKey] = copy;
        }
        return next;
      });
    } catch (err: any) {
      setDbError(err?.message || 'Error deleting column from database.');
    } finally {
      setDeletingCol(null);
    }
  };

  // Restore all 27 default columns in Supabase DB
  const handleRestoreDefaultColumns = async () => {
    try {
      const supabase = createClient();
      const customCols = columns.filter((c) => !c.is_default);
      const merged = [
        ...DEFAULT_SHEET_COLUMNS,
        ...customCols.map((c, idx) => ({ ...c, sort_order: DEFAULT_SHEET_COLUMNS.length + idx + 1 })),
      ];

      const { error } = await supabase.from('trip_sheet_columns').upsert(
        merged.map((c) => ({
          column_key: c.column_key,
          label: c.label,
          data_type: c.data_type,
          sort_order: c.sort_order,
          is_default: c.is_default,
        })),
        { onConflict: 'column_key' }
      );

      if (!error) {
        setColumns(merged);
      }
    } catch (err) {
      console.error('Error restoring default columns:', err);
    }
  };

  // Save inline cell edit to Supabase DB
  const handleSaveCellEdit = async (rowKey: string, colKey: string) => {
    setSavingCell(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('trip_sheet_cell_values').upsert(
        {
          row_key: rowKey,
          column_key: colKey,
          value: editingCellVal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'row_key,column_key' }
      );

      if (!error) {
        setCellValues((prev) => ({
          ...prev,
          [rowKey]: {
            ...(prev[rowKey] || {}),
            [colKey]: editingCellVal,
          },
        }));
      }
    } catch (err) {
      console.error('Error saving cell value:', err);
    } finally {
      setSavingCell(false);
      setEditingCell(null);
    }
  };

  // Export CSV (Excel compatible)
  const handleExportCsv = () => {
    const escapeCsv = (val: any) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['#', ...columns.map((c) => c.label)].map(escapeCsv).join(',');
    const body = filteredRows.map((row, idx) => {
      const cells = [idx + 1, ...columns.map((c) => row[c.column_key] ?? '')];
      return cells.map(escapeCsv).join(',');
    });

    const totalsRow = [
      'TOTAL',
      ...columns.map((c) => (columnTotals[c.column_key] !== undefined ? columnTotals[c.column_key] : '')),
    ]
      .map(escapeCsv)
      .join(',');

    const csvContent = [headers, ...body, totalsRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AUS_Transport_Master_Trip_Sheet_${formatDDMMYYYY(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatCellDisplay = (row: Record<string, any>, col: SheetColumnDef) => {
    const val = row[col.column_key];
    if (val === undefined || val === null || val === '') return '-';

    if (col.data_type === 'currency') {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      if (num === 0) return 'Rs.0';
      return `Rs.${num.toLocaleString('en-IN')}`;
    }

    if (col.data_type === 'number') {
      const num = Number(val);
      if (isNaN(num)) return String(val);
      if (col.column_key === 'mileage') return num > 0 ? `${num.toFixed(2)}` : '-';
      if (col.column_key === 'dieselQty') return num > 0 ? `${num.toFixed(2)}` : '0';
      return num.toLocaleString('en-IN');
    }

    return String(val);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-2 border-b border-gray-200 dark:border-zinc-800 no-print">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Master Trip Sheet (Excel Ledger)</span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Live database spreadsheet combining Invoices, Fuel, Maintenance, Expenses, and Driver Salaries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setColError('');
              setNewColLabel('');
              setIsInsertColOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Insert Column</span>
          </button>

          {columns.length < DEFAULT_SHEET_COLUMNS.length && (
            <button
              type="button"
              onClick={handleRestoreDefaultColumns}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Default Columns</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Database schema notice if trip_sheet_columns table not yet created */}
      {schemaMissing && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5 no-print">
          <Database className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Database Tables Setup Required for Custom Columns</p>
            <p className="mt-0.5">
              All trip rows and calculations below are live from Supabase. To insert or delete columns permanently in Supabase, run the new Section 16 SQL from <span className="font-mono font-semibold">supabase/schema.sql</span> in your Supabase SQL Editor.
            </p>
          </div>
        </div>
      )}

      {dbError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2 no-print">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{dbError}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-xs space-y-3 no-print">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Date, Vehicle, Driver, DC No, From/To Place, Particulars..."
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs sm:text-sm font-medium focus:outline-none focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Vehicle Filter */}
          <div className="w-full md:w-56">
            <EditableSelectDropdown
              value={vehicleFilter}
              options={vehiclesList}
              onChange={(val) => setVehicleFilter(val)}
              title="Filter by Vehicle"
              placeholder="All Vehicles"
              allowClear={true}
              icon={<Truck className="w-4 h-4" />}
            />
          </div>
        </div>

        {/* Date Preset Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Period:</span>
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'month', label: 'This Month' },
              { id: '3months', label: '3 Months' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPeriod(p.id as PeriodPreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === p.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <span className="text-xs font-mono font-semibold text-gray-500 dark:text-zinc-400">
            Showing {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'} &middot; {columns.length} columns
          </span>
        </div>

        {periodPreset === 'custom' && (
          <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap items-center gap-3">
            <div className="w-44">
              <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">From Date</label>
              <CustomDatePicker value={fromDate} onChange={(val) => setFromDate(val)} placeholder="Start Date" />
            </div>
            <div className="w-44">
              <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">To Date</label>
              <CustomDatePicker value={toDate} onChange={(val) => setToDate(val)} placeholder="End Date" />
            </div>
          </div>
        )}
      </div>

      {/* Excel-Style Spreadsheet Table */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-500 dark:text-zinc-400 flex items-center justify-center gap-2.5">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-sm font-semibold">Loading database records...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-16 text-center">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-1">
              No Trip Records Found
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              {allRows.length === 0
                ? 'No invoices/trips exist in the Supabase database yet.'
                : 'No rows match your active search or date/vehicle filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[68dvh]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-100 dark:bg-zinc-800 border-b-2 border-gray-300 dark:border-zinc-700">
                  <th className="sticky left-0 z-30 bg-gray-200 dark:bg-zinc-800 border-r border-gray-300 dark:border-zinc-700 py-2.5 px-2.5 text-center font-mono font-bold text-gray-600 dark:text-zinc-300 w-10">
                    #
                  </th>
                  {columns.map((col) => {
                    const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
                    return (
                      <th
                        key={col.column_key}
                        className={`border-r border-gray-300 dark:border-zinc-700 py-2 px-3 whitespace-nowrap font-bold text-[11px] uppercase tracking-wider text-gray-700 dark:text-zinc-200 ${
                          isNumeric ? 'text-right' : 'text-left'
                        } ${!col.is_default ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}`}
                      >
                        <div className={`flex items-center gap-1.5 ${isNumeric ? 'justify-end' : 'justify-between'}`}>
                          <span>{col.label}</span>
                          <button
                            type="button"
                            onClick={() => setDeletingCol(col)}
                            title={`Delete "${col.label}" column`}
                            className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer no-print"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 dark:divide-zinc-800">
                {filteredRows.map((row, rowIdx) => (
                  <tr
                    key={row.rowKey}
                    className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors ${
                      rowIdx % 2 === 1 ? 'bg-gray-50/50 dark:bg-zinc-900/50' : 'bg-white dark:bg-zinc-900'
                    }`}
                  >
                    <td className="sticky left-0 z-10 bg-gray-100 dark:bg-zinc-800/90 border-r border-gray-300 dark:border-zinc-700 py-2 px-2.5 text-center font-mono font-semibold text-gray-500 dark:text-zinc-400">
                      {rowIdx + 1}
                    </td>
                    {columns.map((col) => {
                      const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
                      const isEditing =
                        editingCell?.rowKey === row.rowKey && editingCell?.colKey === col.column_key;

                      const isProfit = col.column_key === 'profit' && Number(row.profit) > 0;
                      const isLoss = col.column_key === 'loss' && Number(row.loss) > 0;

                      return (
                        <td
                          key={col.column_key}
                          onDoubleClick={() => {
                            setEditingCell({ rowKey: row.rowKey, colKey: col.column_key });
                            setEditingCellVal(String(row[col.column_key] ?? ''));
                          }}
                          title="Double-click to edit cell value"
                          className={`border-r border-gray-200 dark:border-zinc-800 py-2 px-3 whitespace-nowrap cursor-cell ${
                            isNumeric ? 'text-right font-mono' : 'text-left'
                          } ${
                            isProfit
                              ? 'text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50/40 dark:bg-emerald-950/20'
                              : isLoss
                              ? 'text-red-600 dark:text-red-400 font-bold bg-red-50/40 dark:bg-red-950/20'
                              : 'text-gray-800 dark:text-zinc-200'
                          }`}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1 min-w-[110px]">
                              <input
                                type="text"
                                value={editingCellVal}
                                onChange={(e) => setEditingCellVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveCellEdit(row.rowKey, col.column_key);
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                  }
                                }}
                                autoFocus
                                className="w-full px-1.5 py-0.5 text-xs rounded border border-blue-500 bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={savingCell}
                                onClick={() => handleSaveCellEdit(row.rowKey, col.column_key)}
                                className="p-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shrink-0"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span>{formatCellDisplay(row, col)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-gray-100 dark:bg-zinc-800 border-t-2 border-gray-300 dark:border-zinc-700 font-bold">
                  <td className="sticky left-0 z-30 bg-gray-200 dark:bg-zinc-800 border-r border-gray-300 dark:border-zinc-700 py-2.5 px-2.5 text-center font-mono text-[10px] uppercase text-gray-700 dark:text-zinc-200">
                    SUM
                  </td>
                  {columns.map((col) => {
                    const totalVal = columnTotals[col.column_key];
                    const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
                    let display = '';
                    if (totalVal !== undefined) {
                      if (col.data_type === 'currency') {
                        display = `Rs.${Math.round(totalVal).toLocaleString('en-IN')}`;
                      } else if (col.column_key === 'mileage') {
                        display = totalVal > 0 ? totalVal.toFixed(2) : '-';
                      } else {
                        display = totalVal.toLocaleString('en-IN');
                      }
                    }

                    return (
                      <td
                        key={col.column_key}
                        className={`border-r border-gray-300 dark:border-zinc-700 py-2.5 px-3 whitespace-nowrap ${
                          isNumeric ? 'text-right font-mono' : 'text-left'
                        } ${
                          col.column_key === 'profit'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : col.column_key === 'loss'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-zinc-100'
                        }`}
                      >
                        {col.column_key === 'date' ? `TOTAL (${filteredRows.length})` : display}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* INSERT COLUMN MODAL */}
      {isInsertColOpen && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsInsertColOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Insert New Column</h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Saved directly to Supabase database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInsertColOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {colError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold">
                {colError}
              </div>
            )}

            <form onSubmit={handleInsertColumn} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Column Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Advance Paid / Remarks"
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Column Data Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'text', label: 'Text' },
                    { id: 'number', label: 'Number' },
                    { id: 'currency', label: 'Currency (Rs)' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewColType(t.id as 'text' | 'number' | 'currency')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        newColType === t.id
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300'
                          : 'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Insert Position
                </label>
                <EditableSelectDropdown
                  value={
                    insertAfterKey === '__end__'
                      ? 'At End of Sheet'
                      : insertAfterKey === '__start__'
                      ? 'At Start of Sheet'
                      : `After: ${columns.find((c) => c.column_key === insertAfterKey)?.label || ''}`
                  }
                  options={[
                    'At End of Sheet',
                    'At Start of Sheet',
                    ...columns.map((c) => `After: ${c.label}`),
                  ]}
                  onChange={(val) => {
                    if (val === 'At End of Sheet') setInsertAfterKey('__end__');
                    else if (val === 'At Start of Sheet') setInsertAfterKey('__start__');
                    else {
                      const label = val.replace(/^After:\s*/, '');
                      const found = columns.find((c) => c.label === label);
                      if (found) setInsertAfterKey(found.column_key);
                    }
                  }}
                  title="Select Column Position"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsInsertColOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={colSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {colSaving ? 'Saving...' : 'Insert Column'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE COLUMN CONFIRMATION MODAL */}
      {deletingCol && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDeletingCol(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Delete Column</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Remove &quot;{deletingCol.label}&quot; from database?
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-zinc-300">
              This removes the column from the Master Trip Sheet in Supabase (underlying Invoices/Fuel/Expenses records are untouched).
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCol(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteColumn}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Delete Column
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
