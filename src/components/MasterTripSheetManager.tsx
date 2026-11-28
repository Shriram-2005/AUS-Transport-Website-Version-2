'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Calculator,
  Link2,
  PenLine,
  MoreVertical,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BillData, getBillTdsRate, parseMonthFromDate } from '@/lib/invoices';
import { FuelEntry } from '@/lib/fuel';
import { MaintenanceEntry } from '@/lib/maintenance';
import { ExpenseEntry } from '@/lib/expenses';
import { Driver } from '@/lib/drivers';
import { isDateInRange, parseDateToTimestamp } from '@/lib/profitAndLoss';
import {
  COL_META_ROW_KEY,
  ColumnMetaConfig,
  ColumnSourceType,
  DB_LINK_FIELD_OPTIONS,
  evaluateFormula,
  parseColumnMeta,
  validateFormula,
} from '@/lib/tripSheetUtils';
import { exportMasterTripSheetToExcel, MonthSummaryInfo, printMasterTripSheetPdf } from '@/lib/tripSheetExport';
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
  { column_key: 'fuelParticulars', label: 'Fuel Type', data_type: 'text', sort_order: 12, is_default: true },
  { column_key: 'dieselQty', label: 'Diesel Qty (L)', data_type: 'number', sort_order: 13, is_default: true },
  { column_key: 'dieselRate', label: 'Rate', data_type: 'currency', sort_order: 14, is_default: true },
  { column_key: 'dieselAmount', label: 'Diesel Amount', data_type: 'currency', sort_order: 15, is_default: true },
  { column_key: 'mileage', label: 'Mileage', data_type: 'number', sort_order: 16, is_default: true },
  { column_key: 'maintenanceExp', label: 'Repairs & Maint.', data_type: 'currency', sort_order: 17, is_default: true },
  { column_key: 'tollGateExp', label: 'Toll Gate Exp', data_type: 'currency', sort_order: 18, is_default: true },
  { column_key: 'expensesTotal', label: 'Expenses', data_type: 'currency', sort_order: 19, is_default: true },
  { column_key: 'driverSalary', label: 'Driver Salary', data_type: 'currency', sort_order: 20, is_default: true },
  { column_key: 'totalExpenses', label: 'Total Expenses', data_type: 'currency', sort_order: 21, is_default: true },
  { column_key: 'freightPerKm', label: 'Freight Per KM', data_type: 'currency', sort_order: 22, is_default: true },
  { column_key: 'freightAmount', label: 'Freight Amount', data_type: 'currency', sort_order: 23, is_default: true },
  { column_key: 'billAmount', label: 'Bill Amount', data_type: 'currency', sort_order: 24, is_default: true },
  { column_key: 'profit', label: 'Profit', data_type: 'currency', sort_order: 25, is_default: true },
  { column_key: 'loss', label: 'Loss', data_type: 'currency', sort_order: 26, is_default: true },
];

type PeriodPreset = 'all' | 'month' | '3months' | 'date' | 'custom';

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
  consignorFromAddress?: string;
  consigneeName?: string;
  tdsPercentage?: number;
}

interface ExpensePillItem {
  category: string;
  amount: number;
}

interface VehicleMeta {
  type: string;
  capacity: string;
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
  const [vehicleMetaMap, setVehicleMetaMap] = useState<Record<string, VehicleMeta>>({});

  // DB-backed columns, column link/formula metadata, & custom cell values
  const [columns, setColumns] = useState<SheetColumnDef[]>(DEFAULT_SHEET_COLUMNS);
  const [colMeta, setColMeta] = useState<Record<string, ColumnMetaConfig>>({});
  const [cellValues, setCellValues] = useState<Record<string, Record<string, string>>>({});

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [singleDate, setSingleDate] = useState('');

  // Insert Column modal
  const [isInsertColOpen, setIsInsertColOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number' | 'currency'>('text');
  const [newColSourceType, setNewColSourceType] = useState<ColumnSourceType>('manual');
  const [newColDbField, setNewColDbField] = useState<string>(DB_LINK_FIELD_OPTIONS[0].key);
  const [newColFormula, setNewColFormula] = useState<string>('');
  const [insertAfterKey, setInsertAfterKey] = useState<string>('__end__');
  const [colSaving, setColSaving] = useState(false);
  const [colError, setColError] = useState('');

  // Delete Column modal (requires typing exact column name)
  const [deletingCol, setDeletingCol] = useState<SheetColumnDef | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Export state & mobile actions menu
  const [exportingExcel, setExportingExcel] = useState(false);
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);
  const headerMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerMoreOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (headerMoreRef.current && !headerMoreRef.current.contains(e.target as Node)) {
        setHeaderMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [headerMoreOpen]);

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
      setSingleDate('');
    } else if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(formatDDMMYYYY(start));
      setToDate(todayStr);
      setSingleDate('');
    } else if (preset === '3months') {
      const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      setFromDate(formatDDMMYYYY(start));
      setToDate(todayStr);
      setSingleDate('');
    } else if (preset === 'date') {
      const target = singleDate || todayStr;
      setSingleDate(target);
      setFromDate(target);
      setToDate(target);
    }
  }, [singleDate]);

  const fetchAllFromSupabase = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const supabase = createClient();

      const [vRes, iRes, fRes, mRes, eRes, dRes, colRes, cellRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('registration_number', { ascending: true }),
        supabase.from('invoices').select('*'),
        supabase.from('fuel_entries').select('*'),
        supabase.from('maintenance_entries').select('*'),
        supabase.from('expense_entries').select('*'),
        supabase.from('drivers').select('*'),
        supabase.from('trip_sheet_columns').select('*').order('sort_order', { ascending: true }),
        supabase.from('trip_sheet_cell_values').select('*'),
      ]);

      const vehSet = new Set<string>();
      const vMeta: Record<string, VehicleMeta> = {};
      const errors: string[] = [];

      if (vRes.error) errors.push(`vehicles: ${vRes.error.message}`);
      else if (vRes.data) {
        vRes.data.forEach((v: any) => {
          const reg = (v.registration_number || '').trim().toUpperCase();
          if (reg) {
            vehSet.add(reg);
            vMeta[normalizeVeh(reg)] = {
              type: (v.vehicle_type || v.type || '').trim(),
              capacity: (v.capacity || v.load_capacity || '').trim(),
            };
          }
        });
      }
      setVehicleMetaMap(vMeta);

      if (iRes.error) errors.push(`invoices: ${iRes.error.message}`);
      else if (iRes.data) {
        const mappedBills: RawInvoiceRecord[] = iRes.data.map((item: any) => {
          // Strictly from Section 1 CONSIGNOR (FROM) in DB
          const consignorFromAddress = (
            item.consignor?.address ||
            item.consignor?.name ||
            ''
          ).trim();
          const consigneeName = (
            item.consignee?.name ||
            item.consignee?.address ||
            ''
          ).trim();

          if (item.vehicle_number) vehSet.add(String(item.vehicle_number).trim().toUpperCase());

          const sqlTrips = Array.isArray(item.trips) ? item.trips : [];
          const rawTrips =
            sqlTrips.length > 0
              ? sqlTrips
              : Array.isArray(item.raw_data?.trips)
              ? item.raw_data.trips.slice(0, item.raw_data.visibleTrips ?? item.raw_data.trips.length)
              : [];

          if (item.raw_data) {
            return {
              ...item.raw_data,
              id: item.id,
              billNumber: item.bill_number,
              date: item.bill_date,
              vehicleNumber: item.vehicle_number,
              trips: rawTrips,
              visibleTrips: rawTrips.length,
              status: item.payment_status || item.raw_data.status || 'unpaid',
              consignorFromAddress,
              consigneeName,
              tdsPercentage: Number(item.tds_percentage ?? item.raw_data.tdsPercentage) || 0,
            };
          }
          return {
            id: item.id,
            billNumber: item.bill_number,
            date: item.bill_date,
            vehicleNumber: item.vehicle_number,
            activeTrip: 1,
            visibleTrips: rawTrips.length,
            trips: rawTrips,
            keralaRtoEnabled: item.expenses?.hasRto ?? false,
            keralaRtoMultiplier: item.expenses?.rtoMultiplier ?? 0,
            keralaRtoAmount: item.expenses?.rtoExpense ?? 0,
            dieselAvgRate: item.expenses?.dieselAvgRate ?? 0,
            rupeesInWordsMode: 'auto',
            rupeesInWordsText: item.amount_in_words || '',
            status: item.payment_status === 'Paid' ? 'paid' : 'unpaid',
            consignorFromAddress,
            consigneeName,
            tdsPercentage: Number(item.tds_percentage) || 0,
          };
        });
        setBills(mappedBills);
      }

      if (fRes.error) errors.push(`fuel_entries: ${fRes.error.message}`);
      else if (fRes.data) {
        setFuelEntries(
          fRes.data.map((f: any) => {
            const v = (f.vehicle_number || '').trim().toUpperCase();
            if (v) vehSet.add(v);
            return {
              id: f.id,
              vehicleNumber: v,
              date: f.entry_date || '',
              billNumber: f.bill_number || '',
              particulars: f.fuel_type || 'Diesel',
              liters: Number(f.liters) || 0,
              ratePerLiter: Number(f.rate_per_liter) || 0,
              totalAmount: Number(f.total_amount) || 0,
              bunkName: f.bunk_name || '',
            };
          })
        );
      }

      if (mRes.error) errors.push(`maintenance_entries: ${mRes.error.message}`);
      else if (mRes.data) {
        setMaintenanceEntries(
          mRes.data.map((m: any) => {
            const v = (m.vehicle_number || '').trim().toUpperCase();
            if (v) vehSet.add(v);
            return {
              id: m.id,
              vehicleNumber: v,
              date: m.entry_date || '',
              billNumber: m.bill_number || '',
              category: m.category || '',
              description: m.description || '',
              amount: Number(m.amount) || 0,
              workshopName: m.workshop_name || '',
              odometerKm: m.odometer_km ? Number(m.odometer_km) : undefined,
            };
          })
        );
      }

      if (eRes.error) errors.push(`expense_entries: ${eRes.error.message}`);
      else if (eRes.data) {
        setExpenses(
          eRes.data.map((e: any) => {
            const v = (e.vehicle_number || 'GENERAL').trim().toUpperCase();
            if (v) vehSet.add(v);
            return {
              id: e.id,
              vehicleNumber: v,
              date: e.entry_date || '',
              voucherNumber: e.voucher_number || '',
              category: e.category || '',
              description: e.description || '',
              amount: Number(e.amount) || 0,
              paymentMode: e.payment_mode || 'Cash',
              paidTo: e.paid_to || '',
            };
          })
        );
      }

      if (dRes.error) errors.push(`drivers: ${dRes.error.message}`);
      else if (dRes.data) {
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

      if (errors.length > 0) {
        setDbError(`Supabase query error: ${errors.join(' | ')}`);
      }

      setVehiclesList(Array.from(vehSet).sort());

      // Columns from Supabase
      if (colRes.error) {
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
          // Seed default column headers into Supabase (headers only, zero dummy data rows)
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

      // Cell overrides, custom column values & column link/formula metadata from Supabase
      if (!cellRes.error && cellRes.data) {
        const map: Record<string, Record<string, string>> = {};
        const metaMap: Record<string, ColumnMetaConfig> = {};
        for (const cell of cellRes.data) {
          if (cell.row_key === COL_META_ROW_KEY) {
            metaMap[cell.column_key] = parseColumnMeta(cell.value);
          } else {
            if (!map[cell.row_key]) map[cell.row_key] = {};
            map[cell.row_key][cell.column_key] = cell.value ?? '';
          }
        }
        setColMeta(metaMap);
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
    const driverMetaMap = new Map<string, { phone: string; licenseNumber: string; ratePerKm: number }>();
    for (const d of drivers) {
      const meta = {
        phone: d.phone || '',
        licenseNumber: d.licenseNumber || '',
        ratePerKm: Number(d.ratePerKm) || 0,
      };
      if (d.name) {
        driverRateMap.set(d.name.trim().toLowerCase(), meta.ratePerKm);
        driverMetaMap.set(d.name.trim().toLowerCase(), meta);
      }
      if (d.id) {
        driverRateMap.set(String(d.id), meta.ratePerKm);
        driverMetaMap.set(String(d.id), meta);
      }
    }

    const displayVehMap = new Map<string, string>();
    const displayDateMap = new Map<string, string>();

    // 1. Collect all trips first so we know exact running KM per vehicle & date for fill-to-fill mileage
    interface RawTripItem {
      bill: RawInvoiceRecord;
      trip: RawInvoiceRecord['trips'][number];
      tripIndex: number;
      tripDate: string;
      dateKey: string;
      timestamp: number;
      vehKey: string;
      runningKm: number;
    }

    const rawTrips: RawTripItem[] = [];
    const totalKmByKey = new Map<string, number>();
    const tripCountByKey = new Map<string, number>();

    for (const bill of bills) {
      const visible = bill.visibleTrips ?? bill.trips?.length ?? 0;
      const trips = (bill.trips || []).slice(0, visible);
      trips.forEach((trip, idx) => {
        if (trip.enabled === false) return;
        const tripDate = (trip.date || bill.date || '').trim();
        const dateKey = normalizeDateKey(tripDate);
        const ts = parseDateToTimestamp(tripDate);
        const vehKey = normalizeVeh(bill.vehicleNumber);
        const runningKm = Math.max(0, (Number(trip.closingKm) || 0) - (Number(trip.startingKm) || 0));
        const key = `${vehKey}|${dateKey}`;

        if (bill.vehicleNumber && !displayVehMap.has(vehKey)) {
          displayVehMap.set(vehKey, bill.vehicleNumber.trim().toUpperCase());
        }
        if (tripDate && !displayDateMap.has(dateKey)) {
          displayDateMap.set(dateKey, tripDate);
        }

        totalKmByKey.set(key, (totalKmByKey.get(key) || 0) + runningKm);
        tripCountByKey.set(key, (tripCountByKey.get(key) || 0) + 1);

        rawTrips.push({
          bill,
          trip,
          tripIndex: idx,
          tripDate,
          dateKey,
          timestamp: ts,
          vehKey,
          runningKm,
        });
      });
    }

    // 2. Index fuel entries by (vehKey|dateKey) AND compute fill-to-fill mileage per vehicle
    // Fill-to-fill mileage: for each fuel fill date on a vehicle, sum trip running KM from previous fill date up to this fill date, divided by this fill's liters.
    const fuelByKey = new Map<
      string,
      { liters: number; amount: number; rate: number; particulars: Set<string>; mileage: number; bunkNames: Set<string>; billNumbers: Set<string> }
    >();

    const fuelByVehicle = new Map<string, FuelEntry[]>();
    for (const f of fuelEntries) {
      const vKey = normalizeVeh(f.vehicleNumber);
      const dKey = normalizeDateKey(f.date);
      if (f.vehicleNumber && !displayVehMap.has(vKey)) displayVehMap.set(vKey, f.vehicleNumber.trim().toUpperCase());
      if (f.date && !displayDateMap.has(dKey)) displayDateMap.set(dKey, f.date.trim());

      const list = fuelByVehicle.get(vKey) || [];
      list.push(f);
      fuelByVehicle.set(vKey, list);
    }

    for (const [vKey, list] of fuelByVehicle.entries()) {
      // Group same-day fills first, sorted chronologically ascending
      const dayMap = new Map<string, { ts: number; dateKey: string; liters: number; amount: number; particulars: Set<string>; bunkNames: Set<string>; billNumbers: Set<string> }>();
      for (const f of list) {
        const dKey = normalizeDateKey(f.date);
        const ts = parseDateToTimestamp(f.date);
        const existing = dayMap.get(dKey) || {
          ts,
          dateKey: dKey,
          liters: 0,
          amount: 0,
          particulars: new Set<string>(),
          bunkNames: new Set<string>(),
          billNumbers: new Set<string>(),
        };
        existing.liters += Number(f.liters) || 0;
        existing.amount += Number(f.totalAmount) || 0;
        if (f.particulars) existing.particulars.add(f.particulars);
        if (f.bunkName) existing.bunkNames.add(f.bunkName);
        if (f.billNumber) existing.billNumbers.add(f.billNumber);
        dayMap.set(dKey, existing);
      }

      const sortedFills = Array.from(dayMap.values()).sort((a, b) => a.ts - b.ts);
      const vehTrips = rawTrips.filter((t) => t.vehKey === vKey);

      for (let i = 0; i < sortedFills.length; i++) {
        const currFill = sortedFills[i];
        const prevFill = i > 0 ? sortedFills[i - 1] : null;

        // Running KM between previous filled date (exclusive) and current filled date (inclusive),
        // or if first fill, trips on/before current fill date (or all trips up to next fill if none before)
        let intervalKm = 0;
        if (prevFill) {
          for (const t of vehTrips) {
            if (t.timestamp > prevFill.ts && t.timestamp <= currFill.ts) {
              intervalKm += t.runningKm;
            }
          }
        } else {
          for (const t of vehTrips) {
            if (t.timestamp <= currFill.ts) {
              intervalKm += t.runningKm;
            }
          }
          // If no trips on or before first fill, check trips between first fill and second fill
          if (intervalKm === 0 && sortedFills.length > 1) {
            const nextFill = sortedFills[1];
            for (const t of vehTrips) {
              if (t.timestamp >= currFill.ts && t.timestamp < nextFill.ts) {
                intervalKm += t.runningKm;
              }
            }
          }
        }

        const mileage =
          intervalKm > 0 && currFill.liters > 0
            ? Math.round((intervalKm / currFill.liters) * 100) / 100
            : 0;
        const rate =
          currFill.liters > 0 ? Math.round((currFill.amount / currFill.liters) * 100) / 100 : 0;

        fuelByKey.set(`${vKey}|${currFill.dateKey}`, {
          liters: currFill.liters,
          amount: currFill.amount,
          rate,
          particulars: currFill.particulars,
          mileage,
          bunkNames: currFill.bunkNames,
          billNumbers: currFill.billNumbers,
        });
      }
    }

    // 3. Index Maintenance by (vehKey|dateKey)
    const maintByKey = new Map<string, number>();
    const maintMetaByKey = new Map<string, { workshops: Set<string>; categories: Set<string> }>();
    for (const m of maintenanceEntries) {
      const vKey = normalizeVeh(m.vehicleNumber);
      const dKey = normalizeDateKey(m.date);
      const k = `${vKey}|${dKey}`;
      if (m.vehicleNumber && !displayVehMap.has(vKey)) displayVehMap.set(vKey, m.vehicleNumber.trim().toUpperCase());
      if (m.date && !displayDateMap.has(dKey)) displayDateMap.set(dKey, m.date.trim());
      maintByKey.set(k, (maintByKey.get(k) || 0) + (Number(m.amount) || 0));
      const meta = maintMetaByKey.get(k) || { workshops: new Set<string>(), categories: new Set<string>() };
      if (m.workshopName) meta.workshops.add(m.workshopName);
      if (m.category) meta.categories.add(m.category);
      maintMetaByKey.set(k, meta);
    }

    // 4. Index Expenses by (vehKey|dateKey) keeping per-category breakdown for pill display
    const expByKey = new Map<string, Map<string, number>>();
    const expMetaByKey = new Map<string, { paidTo: Set<string>; modes: Set<string> }>();
    for (const exp of expenses) {
      const vKey = normalizeVeh(exp.vehicleNumber);
      const dKey = normalizeDateKey(exp.date);
      const k = `${vKey}|${dKey}`;
      if (exp.vehicleNumber && !displayVehMap.has(vKey)) displayVehMap.set(vKey, exp.vehicleNumber.trim().toUpperCase());
      if (exp.date && !displayDateMap.has(dKey)) displayDateMap.set(dKey, exp.date.trim());

      const catMap = expByKey.get(k) || new Map<string, number>();
      const catName = (exp.category || 'Other Expense').trim();
      catMap.set(catName, (catMap.get(catName) || 0) + (Number(exp.amount) || 0));
      expByKey.set(k, catMap);

      const eMeta = expMetaByKey.get(k) || { paidTo: new Set<string>(), modes: new Set<string>() };
      if (exp.paidTo) eMeta.paidTo.add(exp.paidTo);
      if (exp.paymentMode) eMeta.modes.add(exp.paymentMode);
      expMetaByKey.set(k, eMeta);
    }

    const matchedKeys = new Set<string>();

    const rows = rawTrips.map((item) => {
      const { bill, trip, tripIndex, tripDate, dateKey, timestamp, vehKey, runningKm } = item;
      const key = `${vehKey}|${dateKey}`;
      matchedKeys.add(key);

      const groupKm = totalKmByKey.get(key) || 0;
      const groupCount = tripCountByKey.get(key) || 1;
      const share = groupKm > 0 ? runningKm / groupKm : 1 / groupCount;

      const fuelGroup = fuelByKey.get(key);
      const fuelParticulars = fuelGroup ? Array.from(fuelGroup.particulars).join(', ') : '';
      const dieselQty = fuelGroup ? Math.round(fuelGroup.liters * share * 100) / 100 : 0;
      const dieselAmount = fuelGroup ? Math.round(fuelGroup.amount * share) : 0;
      const dieselRate = fuelGroup ? fuelGroup.rate : 0;
      const mileage = fuelGroup ? fuelGroup.mileage : 0;

      const maintGroup = maintByKey.get(key) || 0;
      const maintenanceExp = Math.round(maintGroup * share);

      const expCatMap = expByKey.get(key);
      const expensePills: ExpensePillItem[] = [];
      let expensesTotal = 0;
      if (expCatMap) {
        for (const [catName, catAmt] of expCatMap.entries()) {
          const scaledAmt = Math.round(catAmt * share);
          if (scaledAmt > 0) {
            expensePills.push({ category: catName, amount: scaledAmt });
            expensesTotal += scaledAmt;
          }
        }
      }

      // Invoice Section 2 Toll Gate Exp (billed to company)
      const tollGateExp = trip.tollEnabled ? Math.round(Number(trip.tollAmount) || 0) : 0;

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

      const totalExpenses = dieselAmount + maintenanceExp + expensesTotal + driverSalary;

      const freightPerKm = Number(trip.rate) || 0;
      const freightAmount = Math.round(runningKm * freightPerKm); // Excluding toll expenses
      const billTripsCount = Math.max(
        1,
        (bill.trips || []).slice(0, bill.visibleTrips ?? bill.trips?.length ?? 0).filter((t) => t.enabled !== false).length
      );
      const billRtoTotal =
        bill.keralaRtoEnabled && (Number(bill.keralaRtoMultiplier) || 0) > 0
          ? (Number(bill.keralaRtoMultiplier) || 0) * (Number(bill.keralaRtoAmount) || 0)
          : 0;
      const rtoPerTrip = billRtoTotal / billTripsCount;
      const tdsRate = getBillTdsRate(bill);

      const billAmount = Math.round(freightAmount + tollGateExp + rtoPerTrip); // Amount billed to company including toll expenses
      const pnlRevenue = Math.round((freightAmount + rtoPerTrip) * (1 - tdsRate / 100)); // Exact P&L revenue (excl. toll, after TDS)

      const net = pnlRevenue - totalExpenses;
      const profit = net >= 0 ? net : 0;
      const loss = net < 0 ? Math.abs(net) : 0;

      // Strictly from Section 1 Consignee/Consignor From in DB
      const fromPlace = (bill.consignorFromAddress || '').trim();
      const rowKey = `${bill.billNumber}_${tripIndex}`;
      const parsedMonth = parseMonthFromDate(tripDate);

      const tdsAmount = Math.round((freightAmount + rtoPerTrip) * (tdsRate / 100));
      const dMeta =
        (trip.driverId && driverMetaMap.get(String(trip.driverId))) ||
        (trip.driverName && driverMetaMap.get(trip.driverName.trim().toLowerCase())) ||
        null;
      const vMeta = vehicleMetaMap[vehKey];
      const mMeta = maintMetaByKey.get(key);
      const eMeta = expMetaByKey.get(key);

      const row: Record<string, any> = {
        rowKey,
        billNumber: bill.billNumber,
        timestamp,
        monthKey: parsedMonth?.key || 'unknown',
        monthLabel: parsedMonth?.label || 'Undated',
        date: tripDate,
        vehicleNumber: (bill.vehicleNumber || '').trim().toUpperCase(),
        driverName: (trip.driverName || '').trim(),
        dcNo: String(trip.dcNo || '').trim(),
        fromPlace,
        toPlace: (trip.route || (trip as any).places?.join(', ') || '').trim(),
        particulars: (trip.itemName || trip.particulars || (trip as any).itemType || '').trim(),
        quantity:
          trip.itemQuantity || (trip as any).quantity
            ? Number(trip.itemQuantity || (trip as any).quantity) || (trip.itemQuantity || (trip as any).quantity)
            : '',
        openingKm: Number(trip.startingKm) || 0,
        closingKm: Number(trip.closingKm) || 0,
        runningKm,
        fuelParticulars,
        dieselQty,
        dieselRate,
        dieselAmount,
        mileage,
        maintenanceExp,
        tollGateExp,
        expensesTotal,
        expensePills,
        driverSalary,
        totalExpenses,
        freightPerKm,
        freightAmount,
        billAmount,
        profit,
        loss,
        __db: {
          'invoice.billNumber': bill.billNumber ? `INV-${bill.billNumber}` : '',
          'invoice.companyName': bill.consigneeName || '',
          'invoice.paymentStatus': String(bill.status || '').toLowerCase() === 'paid' ? 'Paid' : 'Unpaid',
          'invoice.tdsPercentage': tdsRate,
          'invoice.tdsAmount': tdsAmount,
          'invoice.keralaRtoPerTrip': Math.round(rtoPerTrip),
          'invoice.pnlRevenue': pnlRevenue,
          'driver.phone': dMeta?.phone || '',
          'driver.licenseNumber': dMeta?.licenseNumber || '',
          'driver.ratePerKm': driverRate,
          'vehicle.type': vMeta?.type || '',
          'vehicle.capacity': vMeta?.capacity || '',
          'fuel.bunkName': fuelGroup ? Array.from(fuelGroup.bunkNames).join(', ') : '',
          'fuel.billNumber': fuelGroup ? Array.from(fuelGroup.billNumbers).join(', ') : '',
          'maintenance.workshopName': mMeta ? Array.from(mMeta.workshops).join(', ') : '',
          'maintenance.category': mMeta ? Array.from(mMeta.categories).join(', ') : '',
          'expense.paidTo': eMeta ? Array.from(eMeta.paidTo).join(', ') : '',
          'expense.paymentMode': eMeta ? Array.from(eMeta.modes).join(', ') : '',
        } as Record<string, string | number>,
      };

      const overrides = cellValues[rowKey];
      if (overrides) {
        for (const [cKey, cVal] of Object.entries(overrides)) {
          row[cKey] = cVal;
        }
      }

      return row;
    });

    // Include standalone Fuel, Maintenance, and Expense entries on dates with no invoice trip
    const extraKeys = new Set<string>([
      ...fuelByKey.keys(),
      ...maintByKey.keys(),
      ...expByKey.keys(),
    ]);

    for (const extraKey of extraKeys) {
      if (matchedKeys.has(extraKey)) continue;
      const [vKey, dKey] = extraKey.split('|');
      const fuelGroup = fuelByKey.get(extraKey);
      const maintCost = Math.round(maintByKey.get(extraKey) || 0);
      const expCatMap = expByKey.get(extraKey);

      const fuelParticulars = fuelGroup ? Array.from(fuelGroup.particulars).join(', ') : '';
      const dieselQty = fuelGroup ? Math.round(fuelGroup.liters * 100) / 100 : 0;
      const dieselAmount = fuelGroup ? Math.round(fuelGroup.amount) : 0;
      const dieselRate = fuelGroup ? fuelGroup.rate : 0;
      const mileage = fuelGroup ? fuelGroup.mileage : 0;

      const expensePills: ExpensePillItem[] = [];
      let expensesTotal = 0;
      if (expCatMap) {
        for (const [catName, catAmt] of expCatMap.entries()) {
          const amt = Math.round(catAmt);
          if (amt > 0) {
            expensePills.push({ category: catName, amount: amt });
            expensesTotal += amt;
          }
        }
      }

      const totalExpenses = dieselAmount + maintCost + expensesTotal;
      if (totalExpenses === 0 && dieselQty === 0) continue;

      const dateDisplay = displayDateMap.get(dKey) || dKey;
      const vehDisplay = displayVehMap.get(vKey) || vKey || 'GENERAL';
      const rowKey = `extra_${vKey}_${dKey}`;
      const parsedMonth = parseMonthFromDate(dateDisplay);

      const vMeta = vehicleMetaMap[vKey];
      const mMeta = maintMetaByKey.get(extraKey);
      const eMeta = expMetaByKey.get(extraKey);

      const extraRow: Record<string, any> = {
        rowKey,
        billNumber: 0,
        timestamp: parseDateToTimestamp(dateDisplay),
        monthKey: parsedMonth?.key || 'unknown',
        monthLabel: parsedMonth?.label || 'Undated',
        date: dateDisplay,
        vehicleNumber: vehDisplay,
        driverName: '',
        dcNo: '',
        fromPlace: '',
        toPlace: '',
        particulars: '',
        quantity: '',
        openingKm: 0,
        closingKm: 0,
        runningKm: 0,
        fuelParticulars,
        dieselQty,
        dieselRate,
        dieselAmount,
        mileage,
        maintenanceExp: maintCost,
        tollGateExp: 0,
        expensesTotal,
        expensePills,
        driverSalary: 0,
        totalExpenses,
        freightPerKm: 0,
        freightAmount: 0,
        billAmount: 0,
        profit: 0,
        loss: totalExpenses,
        __db: {
          'invoice.billNumber': '',
          'invoice.companyName': '',
          'invoice.paymentStatus': '',
          'invoice.tdsPercentage': 0,
          'invoice.tdsAmount': 0,
          'invoice.keralaRtoPerTrip': 0,
          'invoice.pnlRevenue': 0,
          'driver.phone': '',
          'driver.licenseNumber': '',
          'driver.ratePerKm': 0,
          'vehicle.type': vMeta?.type || '',
          'vehicle.capacity': vMeta?.capacity || '',
          'fuel.bunkName': fuelGroup ? Array.from(fuelGroup.bunkNames).join(', ') : '',
          'fuel.billNumber': fuelGroup ? Array.from(fuelGroup.billNumbers).join(', ') : '',
          'maintenance.workshopName': mMeta ? Array.from(mMeta.workshops).join(', ') : '',
          'maintenance.category': mMeta ? Array.from(mMeta.categories).join(', ') : '',
          'expense.paidTo': eMeta ? Array.from(eMeta.paidTo).join(', ') : '',
          'expense.paymentMode': eMeta ? Array.from(eMeta.modes).join(', ') : '',
        } as Record<string, string | number>,
      };

      const overrides = cellValues[rowKey];
      if (overrides) {
        for (const [cKey, cVal] of Object.entries(overrides)) {
          extraRow[cKey] = cVal;
        }
      }

      rows.push(extraRow);
    }

    // Apply DB-linked and Formula columns across all rows (db_link first, then formula)
    for (const row of rows) {
      for (const col of columns) {
        const meta = colMeta[col.column_key];
        if (meta?.sourceType === 'db_link' && meta.dbField) {
          row[col.column_key] = row.__db?.[meta.dbField] ?? '';
        }
      }
      for (const col of columns) {
        const meta = colMeta[col.column_key];
        if (meta?.sourceType === 'formula' && meta.formula) {
          row[col.column_key] = evaluateFormula(meta.formula, row, col.data_type);
        }
      }
    }

    rows.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return (Number(b.billNumber) || 0) - (Number(a.billNumber) || 0);
    });

    return rows;
  }, [bills, fuelEntries, maintenanceEntries, expenses, drivers, vehicleMetaMap, cellValues, colMeta, columns]);

  // Apply Search, Vehicle, and Date filters
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const targetVeh = normalizeVeh(vehicleFilter);

    return allRows.filter((row) => {
      if (targetVeh && normalizeVeh(row.vehicleNumber) !== targetVeh) return false;
      if (!isDateInRange(row.date, fromDate, toDate)) return false;
      if (q) {
        const expCats = (row.expensePills || []).map((p: ExpensePillItem) => p.category).join(' ');
        const hay = [
          row.date,
          row.vehicleNumber,
          row.driverName,
          row.dcNo,
          row.fromPlace,
          row.toPlace,
          row.particulars,
          row.fuelParticulars,
          expCats,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, searchQuery, vehicleFilter, fromDate, toDate]);

  // Monthly Net Profit / Net Loss summary for month headers
  const monthSummaries = useMemo(() => {
    const map = new Map<string, MonthSummaryInfo>();
    for (const row of filteredRows) {
      const mKey = row.monthKey || 'unknown';
      const existing = map.get(mKey) || { profit: 0, loss: 0, net: 0 };
      const p = Number(row.profit) || 0;
      const l = Number(row.loss) || 0;
      existing.profit += p;
      existing.loss += l;
      existing.net = existing.profit - existing.loss;
      map.set(mKey, existing);
    }
    return map;
  }, [filteredRows]);

  // Column Totals for footer
  const columnTotals = useMemo(() => {
    const sums: Record<string, number> = {};
    const summableKeys = [
      'quantity',
      'runningKm',
      'dieselQty',
      'dieselAmount',
      'maintenanceExp',
      'tollGateExp',
      'expensesTotal',
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

    if (newColSourceType === 'db_link' && !newColDbField) {
      setColError('Please select a database field to link.');
      return;
    }

    if (newColSourceType === 'formula') {
      const validKeys = new Set(columns.map((c) => c.column_key));
      const errMsg = validateFormula(newColFormula, validKeys);
      if (errMsg) {
        setColError(`Formula error: ${errMsg}`);
        return;
      }
    }

    const baseKey = cleanLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const column_key = `custom_${baseKey || 'col'}_${Date.now().toString().slice(-4)}`;

    const effectiveDataType: 'text' | 'number' | 'currency' =
      newColSourceType === 'db_link'
        ? DB_LINK_FIELD_OPTIONS.find((f) => f.key === newColDbField)?.dataType || newColType
        : newColSourceType === 'formula' && newColType === 'text'
        ? 'number'
        : newColType;

    const metaConfig: ColumnMetaConfig = {
      sourceType: newColSourceType,
      ...(newColSourceType === 'db_link' ? { dbField: newColDbField } : {}),
      ...(newColSourceType === 'formula' ? { formula: newColFormula.trim() } : {}),
    };

    setColSaving(true);
    try {
      const supabase = createClient();

      const ordered = [...columns];
      const newCol: SheetColumnDef = {
        column_key,
        label: cleanLabel,
        data_type: effectiveDataType,
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
        setColError(`Database error: ${insertErr.message}. Please run Section 18 from supabase/schema.sql first.`);
        setColSaving(false);
        return;
      }

      // Persist link / formula config in Supabase trip_sheet_cell_values (__col_meta__)
      if (newColSourceType !== 'manual') {
        await supabase.from('trip_sheet_cell_values').upsert(
          {
            row_key: COL_META_ROW_KEY,
            column_key: newCol.column_key,
            value: JSON.stringify(metaConfig),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'row_key,column_key' }
        );
      }

      for (const c of reindexed) {
        if (c.column_key !== newCol.column_key) {
          await supabase
            .from('trip_sheet_columns')
            .update({ sort_order: c.sort_order })
            .eq('column_key', c.column_key);
        }
      }

      setColMeta((prev) => ({ ...prev, [newCol.column_key]: metaConfig }));
      setColumns(reindexed);
      setNewColLabel('');
      setNewColType('text');
      setNewColSourceType('manual');
      setNewColFormula('');
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
    if (deleteConfirmText.trim() !== deletingCol.label.trim()) return;
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
        setDeleteConfirmText('');
        return;
      }

      await supabase.from('trip_sheet_cell_values').delete().eq('column_key', targetKey);

      setColumns((prev) => prev.filter((c) => c.column_key !== targetKey));
      setColMeta((prev) => {
        const next = { ...prev };
        delete next[targetKey];
        return next;
      });
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
      setDeleteConfirmText('');
    }
  };

  // Restore / Sync Default Columns in Supabase DB
  const handleRestoreDefaultColumns = async () => {
    try {
      const supabase = createClient();
      const customCols = columns.filter((c) => !c.is_default);
      const merged = [
        ...DEFAULT_SHEET_COLUMNS,
        ...customCols.map((c, idx) => ({ ...c, sort_order: DEFAULT_SHEET_COLUMNS.length + idx + 1 })),
      ];

      await supabase.from('trip_sheet_columns').delete().eq('is_default', true);
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

  const buildFilterSummaryText = () => {
    const periodText =
      periodPreset === 'all'
        ? 'All Time'
        : periodPreset === 'month'
        ? 'This Month'
        : periodPreset === '3months'
        ? 'Last 3 Months'
        : periodPreset === 'date'
        ? `Date: ${singleDate || fromDate || 'Selected Date'}`
        : `${fromDate || 'Start'} to ${toDate || 'End'}`;
    const vehText = vehicleFilter ? `Vehicle: ${vehicleFilter}` : 'All Vehicles';
    const searchText = searchQuery.trim() ? `Search: "${searchQuery.trim()}"` : '';
    return [periodText, vehText, searchText].filter(Boolean).join('  |  ');
  };

  // Export styled Excel (.xlsx)
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await exportMasterTripSheetToExcel({
        columns,
        rows: filteredRows,
        columnTotals,
        monthSummaries,
        showMonthHeaders: true,
        dateTag: formatDDMMYYYY(new Date()),
        filterSummary: buildFilterSummaryText(),
      });
    } catch (err: any) {
      setDbError(err?.message || 'Failed to export Excel workbook.');
    } finally {
      setExportingExcel(false);
    }
  };

  // Print clean PDF containing only the table columns and rows
  const handlePrintPdf = () => {
    printMasterTripSheetPdf({
      columns,
      rows: filteredRows,
      columnTotals,
      monthSummaries,
      showMonthHeaders: true,
      dateTag: formatDDMMYYYY(new Date()),
      filterSummary: buildFilterSummaryText(),
    });
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
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5 sm:gap-3 pb-2.5 border-b border-gray-200 dark:border-zinc-800 no-print">
        <div className="min-w-0">
          <h2 className="text-[clamp(1.1rem,2.2vw,1.5rem)] font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Master Trip Sheet (Excel Ledger)</span>
          </h2>
          <p className="text-[11px] sm:text-xs md:text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            Live SQL database spreadsheet combining Invoices, Fuel, Maintenance, Expenses, and Driver Salaries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setColError('');
              setNewColLabel('');
              setNewColType('text');
              setNewColSourceType('manual');
              setNewColDbField(DB_LINK_FIELD_OPTIONS[0].key);
              setNewColFormula('');
              setIsInsertColOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Insert Column</span>
          </button>

          <button
            type="button"
            onClick={handleRestoreDefaultColumns}
            title="Sync default columns in database"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Sync Columns</span>
          </button>

          <button
            type="button"
            disabled={exportingExcel || filteredRows.length === 0}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            {exportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{exportingExcel ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
            <span className="sm:hidden">{exportingExcel ? 'Exporting...' : 'Excel'}</span>
          </button>

          <button
            type="button"
            disabled={filteredRows.length === 0}
            onClick={handlePrintPdf}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50 text-xs font-semibold transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print PDF</span>
          </button>

          {/* Small screen 3-dot menu for Sync Columns & Print PDF */}
          <div className="relative sm:hidden ml-auto" ref={headerMoreRef}>
            <button
              type="button"
              onClick={() => setHeaderMoreOpen((prev) => !prev)}
              aria-label="More ledger actions"
              className="w-9 h-9 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-200 flex items-center justify-center cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {headerMoreOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-1.5 space-y-1 z-50">
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMoreOpen(false);
                    handleRestoreDefaultColumns();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer text-left"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Sync Columns</span>
                </button>
                <button
                  type="button"
                  disabled={filteredRows.length === 0}
                  onClick={() => {
                    setHeaderMoreOpen(false);
                    handlePrintPdf();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer text-left"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Database schema notice if trip_sheet_columns table not yet created */}
      {schemaMissing && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5 no-print">
          <Database className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Database Tables Setup Required for Custom Columns</p>
            <p className="mt-0.5">
              To insert or delete columns permanently in Supabase, run Section 18 from <span className="font-mono font-semibold">supabase/schema.sql</span> in your Supabase SQL Editor.
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
              placeholder="Search Date, Vehicle, Driver, DC No, From/To Place, Particulars, Expense Category..."
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
              { id: 'date', label: 'Custom Date' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPeriod(p.id as PeriodPreset)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                  periodPreset === p.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] sm:text-xs font-mono font-semibold text-gray-500 dark:text-zinc-400">
            Showing {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'} &middot; {columns.length} columns
          </span>
        </div>

        {periodPreset === 'date' && (
          <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-end gap-2.5 sm:gap-3">
            <div className="w-full sm:w-52">
              <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">Select Custom Date</label>
              <CustomDatePicker
                value={singleDate}
                onChange={(val) => {
                  setSingleDate(val);
                  setFromDate(val);
                  setToDate(val);
                }}
                placeholder="Choose a Date"
              />
            </div>
            {singleDate && (
              <button
                type="button"
                onClick={() => applyPeriod('all')}
                className="px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer self-start sm:self-auto"
              >
                Reset Date
              </button>
            )}
          </div>
        )}

        {periodPreset === 'custom' && (
          <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-end gap-2.5 sm:gap-3">
            <div className="w-full sm:w-48">
              <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">From Date</label>
              <CustomDatePicker value={fromDate} onChange={(val) => setFromDate(val)} placeholder="Start Date" />
            </div>
            <div className="w-full sm:w-48">
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
          <div className="overflow-auto min-h-[260px] max-h-[calc(100dvh-19rem)] sm:max-h-[calc(100dvh-17rem)] lg:max-h-[calc(100dvh-15.5rem)]">
            <table className="w-full border-collapse text-[11px] sm:text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-100 dark:bg-zinc-800 border-b-2 border-gray-300 dark:border-zinc-700">
                  <th className="sticky left-0 z-30 bg-gray-200 dark:bg-zinc-800 border-r border-gray-300 dark:border-zinc-700 py-2 sm:py-2.5 px-2 sm:px-2.5 text-center font-mono font-bold text-gray-600 dark:text-zinc-300 w-9 sm:w-10">
                    #
                  </th>
                  {columns.map((col) => {
                    const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
                    const meta = colMeta[col.column_key];
                    return (
                      <th
                        key={col.column_key}
                        className={`border-r border-gray-300 dark:border-zinc-700 py-2 px-3 whitespace-nowrap font-bold text-[11px] uppercase tracking-wider text-gray-700 dark:text-zinc-200 ${
                          isNumeric ? 'text-right' : 'text-left'
                        } ${!col.is_default ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}`}
                      >
                        <div className={`flex items-center gap-1.5 ${isNumeric ? 'justify-end' : 'justify-between'}`}>
                          <span className="inline-flex items-center gap-1">
                            <span>{col.label}</span>
                            {meta?.sourceType === 'db_link' && (
                              <span
                                title={`Linked to DB: ${meta.dbField}`}
                                className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300"
                              >
                                DB
                              </span>
                            )}
                            {meta?.sourceType === 'formula' && (
                              <span
                                title={`Formula: ${meta.formula}`}
                                className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300"
                              >
                                fx
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirmText('');
                              setDeletingCol(col);
                            }}
                            title={`Delete "${col.label}" column`}
                            className="p-0.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer no-print"
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
                {filteredRows.map((row, rowIdx) => {
                  const prevRow = rowIdx > 0 ? filteredRows[rowIdx - 1] : null;
                  const showMonthHeader = !prevRow || prevRow.monthKey !== row.monthKey;

                  return (
                    <React.Fragment key={row.rowKey}>
                      {showMonthHeader && (() => {
                        const mSummary = monthSummaries.get(row.monthKey);
                        const netMonth = mSummary ? mSummary.net : 0;
                        const isNetProfit = netMonth >= 0;
                        return (
                          <tr className="bg-slate-200/80 dark:bg-zinc-800/95 border-y-2 border-slate-300 dark:border-zinc-700">
                            <td
                              colSpan={columns.length + 1}
                              className="py-2.5 px-4 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-base sm:text-lg font-black uppercase tracking-wide text-gray-900 dark:text-white">
                                  {row.monthLabel}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                                    isNetProfit
                                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                      : 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
                                  }`}
                                >
                                  <span>{isNetProfit ? 'Net Profit:' : 'Net Loss:'}</span>
                                  <span className="font-mono">
                                    Rs.{Math.round(Math.abs(netMonth)).toLocaleString('en-IN')}
                                  </span>
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                      <tr
                        className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors ${
                          rowIdx % 2 === 1 ? 'bg-gray-50/50 dark:bg-zinc-900/50' : 'bg-white dark:bg-zinc-900'
                        }`}
                      >
                        <td className="sticky left-0 z-10 bg-gray-100 dark:bg-zinc-800/90 border-r border-gray-300 dark:border-zinc-700 py-2 px-2.5 text-center font-mono font-semibold text-gray-500 dark:text-zinc-400">
                          {rowIdx + 1}
                        </td>
                        {columns.map((col) => {
                          const isNumeric = col.data_type === 'number' || col.data_type === 'currency';
                          const meta = colMeta[col.column_key];
                          const isComputedCol = meta?.sourceType === 'db_link' || meta?.sourceType === 'formula';
                          const isEditing =
                            !isComputedCol &&
                            editingCell?.rowKey === row.rowKey &&
                            editingCell?.colKey === col.column_key;

                          const isProfit = col.column_key === 'profit' && Number(row.profit) > 0;
                          const isLoss = col.column_key === 'loss' && Number(row.loss) > 0;

                          return (
                            <td
                              key={col.column_key}
                              onDoubleClick={() => {
                                if (isComputedCol) return;
                                setEditingCell({ rowKey: row.rowKey, colKey: col.column_key });
                                setEditingCellVal(String(row[col.column_key] ?? ''));
                              }}
                              title={
                                meta?.sourceType === 'db_link'
                                  ? `Auto-linked from database (${meta.dbField})`
                                  : meta?.sourceType === 'formula'
                                  ? `Auto-calculated (${meta.formula})`
                                  : 'Double-click to edit cell value'
                              }
                              className={`border-r border-gray-200 dark:border-zinc-800 py-2 px-3 whitespace-nowrap ${
                                isComputedCol ? 'cursor-default' : 'cursor-cell'
                              } ${
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
                              ) : col.column_key === 'expensesTotal' ? (
                                <div className="flex flex-wrap items-center justify-end gap-1 max-w-[320px]">
                                  {Array.isArray(row.expensePills) && row.expensePills.length > 0 ? (
                                    row.expensePills.map((pill: ExpensePillItem) => (
                                      <span
                                        key={pill.category}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60"
                                      >
                                        <span className="truncate max-w-[140px] font-sans">{pill.category}:</span>
                                        <span className="font-mono font-bold">Rs.{pill.amount.toLocaleString('en-IN')}</span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 dark:text-zinc-500">Rs.0</span>
                                  )}
                                </div>
                              ) : (
                                <span>{formatCellDisplay(row, col)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>

              <tfoot className="sticky bottom-0 z-20">
                <tr className="bg-gray-100 dark:bg-zinc-800 border-t-2 border-gray-300 dark:border-zinc-700 font-bold text-[11px] sm:text-xs">
                  <td className="sticky left-0 z-30 bg-gray-200 dark:bg-zinc-800 border-r border-gray-300 dark:border-zinc-700 py-2 sm:py-2.5 px-2 sm:px-2.5 text-center font-mono text-[10px] uppercase text-gray-700 dark:text-zinc-200">
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
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto shadow-2xl p-6 space-y-4"
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
                    Manual input, live SQL database link, or row formula
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
                  placeholder="e.g. Margin Per KM / Consignee / TDS Amount"
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Column Data Source */}
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Column Data Source
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'manual', label: 'Manual Entry', icon: PenLine },
                    { id: 'db_link', label: 'Link DB Field', icon: Link2 },
                    { id: 'formula', label: 'Live Formula', icon: Calculator },
                  ].map((src) => {
                    const Icon = src.icon;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => {
                          const next = src.id as ColumnSourceType;
                          setNewColSourceType(next);
                          if (next === 'formula' && newColType === 'text') {
                            setNewColType('currency');
                          }
                          if (next === 'db_link') {
                            const matched = DB_LINK_FIELD_OPTIONS.find((f) => f.key === newColDbField);
                            if (matched) setNewColType(matched.dataType);
                          }
                        }}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          newColSourceType === src.id
                            ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{src.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DB Link Field Picker */}
              {newColSourceType === 'db_link' && (
                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-2">
                  <label className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                    Select Database Field to Link *
                  </label>
                  <select
                    value={newColDbField}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewColDbField(val);
                      const matched = DB_LINK_FIELD_OPTIONS.find((f) => f.key === val);
                      if (matched) {
                        setNewColType(matched.dataType);
                        if (!newColLabel.trim()) setNewColLabel(matched.label);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                  >
                    {(['Invoice', 'Driver', 'Vehicle', 'Fuel & Maintenance', 'Expenses'] as const).map((grp) => (
                      <optgroup key={grp} label={grp}>
                        {DB_LINK_FIELD_OPTIONS.filter((opt) => opt.group === grp).map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                    Populated automatically from your live Supabase records for every matching trip and date.
                  </p>
                </div>
              )}

              {/* Live Formula Builder */}
              {newColSourceType === 'formula' && (() => {
                const validKeys = new Set(columns.map((c) => c.column_key));
                const formulaErr = newColFormula.trim() ? validateFormula(newColFormula, validKeys) : null;
                const sampleRow = filteredRows[0] || allRows[0];
                const sampleResult =
                  sampleRow && newColFormula.trim() && !formulaErr
                    ? evaluateFormula(newColFormula, sampleRow, newColType)
                    : null;

                return (
                  <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2.5">
                    <label className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                      Formula Expression *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. freightAmount - totalExpenses or billAmount / runningKm"
                      value={newColFormula}
                      onChange={(e) => setNewColFormula(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-900 font-mono text-xs font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500"
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {['+', '-', '*', '/', '(', ')'].map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setNewColFormula((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${op} `)}
                          className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-amber-300 dark:border-amber-700 text-xs font-mono font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 cursor-pointer"
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                        Click column to insert:
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {columns
                          .filter((c) => c.data_type === 'number' || c.data_type === 'currency')
                          .map((c) => (
                            <button
                              key={c.column_key}
                              type="button"
                              onClick={() =>
                                setNewColFormula((prev) => `${prev}${prev && !prev.endsWith(' ') && !prev.endsWith('(') ? ' ' : ''}${c.column_key}`)
                              }
                              className="px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 text-[10px] font-semibold text-gray-700 dark:text-zinc-200 hover:border-amber-500 cursor-pointer"
                            >
                              {c.label}
                            </button>
                          ))}
                      </div>
                    </div>
                    {formulaErr ? (
                      <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{formulaErr}</p>
                    ) : sampleResult !== null ? (
                      <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Row 1 Live Preview:{' '}
                        <span className="font-mono font-bold">
                          {newColType === 'currency'
                            ? `Rs.${Math.round(sampleResult).toLocaleString('en-IN')}`
                            : sampleResult}
                        </span>
                      </p>
                    ) : null}
                  </div>
                );
              })()}

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
                      disabled={newColSourceType === 'formula' && t.id === 'text'}
                      onClick={() => setNewColType(t.id as 'text' | 'number' | 'currency')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-40 ${
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
          onClick={() => {
            setDeletingCol(null);
            setDeleteConfirmText('');
          }}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Warning: Delete Column</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Permanently remove &quot;{deletingCol.label}&quot; from database
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 space-y-1">
              <p className="font-bold">This action cannot be undone.</p>
              <p>
                Deleting this column will remove it from the Master Trip Sheet and permanently erase any saved cell values or formula/database link settings for this column in Supabase.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                Type <span className="font-mono text-red-600 dark:text-red-400 select-all">{deletingCol.label}</span> to confirm deletion:
              </label>
              <textarea
                rows={2}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={`Type "${deletingCol.label}" here...`}
                autoFocus
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-xs font-semibold focus:outline-none focus:border-red-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingCol(null);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText.trim() !== deletingCol.label.trim()}
                onClick={handleConfirmDeleteColumn}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs cursor-pointer"
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
