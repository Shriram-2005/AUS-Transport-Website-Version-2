'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Fuel,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  Calendar,
  Printer,
  FileText,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  Truck,
  DollarSign,
  Droplets,
  Layers
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  FuelEntry,
  getStoredFuelEntries,
  saveStoredFuelEntries,
  addStoredFuelEntry,
  updateStoredFuelEntry,
  deleteStoredFuelEntry,
  filterFuelEntries,
  calculateFuelSummary,
  numberToWords,
  FUEL_ENTRIES_CHANGE_EVENT
} from '@/lib/fuel';
import { Vehicle, getStoredVehicles, VEHICLES_CHANGE_EVENT } from '@/lib/vehicles';
import { CustomDatePicker } from './CustomDatePicker';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

function getTodayDDMMYYYY(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function FuelManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState<string>(getTodayDDMMYYYY());
  const [formBillNumber, setFormBillNumber] = useState('');
  const [formParticulars, setFormParticulars] = useState<'Diesel' | 'Petrol'>('Diesel');
  const [formLiters, setFormLiters] = useState<string>('');
  const [formRate, setFormRate] = useState<string>('');
  const [formTotal, setFormTotal] = useState<string>('');
  const [isManualTotal, setIsManualTotal] = useState(false);
  const [formBunkName, setFormBunkName] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete modal state
  const [deletingEntry, setDeletingEntry] = useState<FuelEntry | null>(null);

  // Statement / PDF modal state
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [statementFromDate, setStatementFromDate] = useState<string>('');
  const [statementToDate, setStatementToDate] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Load vehicles and fuel entries on mount & listen to changes
  useEffect(() => {
    const storedVehicles = getStoredVehicles();
    setVehicles(storedVehicles);
    if (storedVehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(storedVehicles[0].registrationNumber);
    }

    setFuelEntries(getStoredFuelEntries());

    const handleVehiclesUpdate = (e: CustomEvent<Vehicle[]>) => {
      if (e.detail) {
        setVehicles(e.detail);
        if (e.detail.length > 0 && !selectedVehicle) {
          setSelectedVehicle(e.detail[0].registrationNumber);
        }
      }
    };

    const handleFuelUpdate = (e: CustomEvent<FuelEntry[]>) => {
      if (e.detail) {
        setFuelEntries(e.detail);
      } else {
        setFuelEntries(getStoredFuelEntries());
      }
    };

    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    window.addEventListener(FUEL_ENTRIES_CHANGE_EVENT as any, handleFuelUpdate);

    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
      window.removeEventListener(FUEL_ENTRIES_CHANGE_EVENT as any, handleFuelUpdate);
    };
  }, [selectedVehicle]);

  // Sync latest from Supabase on mount
  const refreshFromSupabase = useCallback(async () => {
    try {
      const supabase = createClient();

      // Sync vehicles
      const { data: vData } = await supabase.from('vehicles').select('*');
      if (vData && vData.length > 0) {
        const loadedVehicles: Vehicle[] = vData.map((v: any) => ({
          id: v.id,
          registrationNumber: (v.registration_number || '').trim().toUpperCase(),
          currentKm: Number(v.current_km) || 0,
          status: v.status || 'active',
          model: v.model || '',
        }));
        setVehicles(loadedVehicles);
        if (!selectedVehicle && loadedVehicles.length > 0) {
          setSelectedVehicle(loadedVehicles[0].registrationNumber);
        }
      }

      // Sync fuel entries
      const { data: fData, error: fErr } = await supabase
        .from('fuel_entries')
        .select('*')
        .order('entry_date', { ascending: false });

      if (!fErr && fData) {
        const loaded: FuelEntry[] = fData.map((f: any) => ({
          id: f.id,
          vehicleNumber: (f.vehicle_number || '').trim().toUpperCase(),
          date: f.entry_date || '',
          billNumber: f.bill_number || '',
          particulars: f.fuel_type === 'Petrol' ? 'Petrol' : 'Diesel',
          liters: Number(f.liters) || 0,
          ratePerLiter: Number(f.rate_per_liter) || 0,
          totalAmount: Number(f.total_amount) || 0,
          bunkName: f.bunk_name || '',
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        }));
        setFuelEntries(loaded);
        saveStoredFuelEntries(loaded);
      }
    } catch (err) {
      console.error('Error refreshing fuel entries from Supabase:', err);
    }
  }, [selectedVehicle]);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for refresh module event
  useEffect(() => {
    const handleModuleRefresh = (e: Event) => {
      const custom = e as CustomEvent<{ module: string }>;
      if (!custom.detail || custom.detail.module === 'fuel' || custom.detail.module === 'overview' || custom.detail.module === 'all') {
        refreshFromSupabase();
      }
    };
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
    return () => window.removeEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
  }, [refreshFromSupabase]);

  // Recalculate total amount when liters or rate changes (unless manually overridden)
  useEffect(() => {
    if (!isManualTotal) {
      const l = parseFloat(formLiters) || 0;
      const r = parseFloat(formRate) || 0;
      if (l > 0 && r > 0) {
        setFormTotal((l * r).toFixed(2));
      } else if (!formLiters || !formRate) {
        setFormTotal('');
      }
    }
  }, [formLiters, formRate, isManualTotal]);

  // Entries filtered for current vehicle
  const currentVehicleEntries = useMemo(() => {
    if (!selectedVehicle) return [];
    return fuelEntries
      .filter((e) => e.vehicleNumber === selectedVehicle.trim().toUpperCase())
      .sort((a, b) => {
        // Compare dates descending
        const parseD = (s: string) => {
          const parts = s.split('-');
          if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
          return new Date(s).getTime() || 0;
        };
        return parseD(b.date) - parseD(a.date);
      });
  }, [fuelEntries, selectedVehicle]);

  // Filtered by search query (bill number or bunk name)
  const displayEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return currentVehicleEntries;
    return currentVehicleEntries.filter(
      (e) =>
        e.billNumber.toLowerCase().includes(q) ||
        (e.bunkName && e.bunkName.toLowerCase().includes(q)) ||
        e.particulars.toLowerCase().includes(q)
    );
  }, [currentVehicleEntries, searchQuery]);

  // Summary statistics for current vehicle
  const currentVehicleStats = useMemo(() => {
    return calculateFuelSummary(currentVehicleEntries);
  }, [currentVehicleEntries]);

  // Handle Form Submit (Add or Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedVehicle) {
      setFormError('Please select a vehicle first.');
      return;
    }
    if (!formDate.trim()) {
      setFormError('Please select a date.');
      return;
    }
    const litersNum = parseFloat(formLiters);
    if (isNaN(litersNum) || litersNum <= 0) {
      setFormError('Please enter a valid positive number for liters.');
      return;
    }
    const rateNum = parseFloat(formRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      setFormError('Please enter a valid rate per liter.');
      return;
    }
    const totalNum = parseFloat(formTotal) || Math.round(litersNum * rateNum * 100) / 100;

    setIsSaving(true);

    const payload = {
      vehicle_number: selectedVehicle.trim().toUpperCase(),
      entry_date: formDate.trim(),
      bill_number: formBillNumber.trim(),
      fuel_type: formParticulars,
      liters: litersNum,
      rate_per_liter: rateNum,
      total_amount: totalNum,
      bunk_name: formBunkName.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      const supabase = createClient();

      if (editingId) {
        // Edit existing entry
        updateStoredFuelEntry(editingId, {
          vehicleNumber: selectedVehicle.trim().toUpperCase(),
          date: formDate.trim(),
          billNumber: formBillNumber.trim(),
          particulars: formParticulars,
          liters: litersNum,
          ratePerLiter: rateNum,
          totalAmount: totalNum,
          bunkName: formBunkName.trim(),
        });

        await supabase.from('fuel_entries').update(payload).eq('id', editingId);
      } else {
        // Create new entry
        const createdLocal = addStoredFuelEntry({
          vehicleNumber: selectedVehicle.trim().toUpperCase(),
          date: formDate.trim(),
          billNumber: formBillNumber.trim(),
          particulars: formParticulars,
          liters: litersNum,
          ratePerLiter: rateNum,
          totalAmount: totalNum,
          bunkName: formBunkName.trim(),
        });

        await supabase.from('fuel_entries').insert([{ ...payload, id: createdLocal.id }]);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      // Reset form
      setEditingId(null);
      setFormBillNumber('');
      setFormLiters('');
      setFormRate('');
      setFormTotal('');
      setIsManualTotal(false);
      setFormBunkName('');
      setFormDate(getTodayDDMMYYYY());
    } catch (err) {
      console.error('Error saving fuel entry:', err);
      setFormError('Saved locally. Database sync will retry on connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (entry: FuelEntry) => {
    setEditingId(entry.id);
    setSelectedVehicle(entry.vehicleNumber);
    setFormDate(entry.date);
    setFormBillNumber(entry.billNumber);
    setFormParticulars(entry.particulars);
    setFormLiters(String(entry.liters));
    setFormRate(String(entry.ratePerLiter));
    setFormTotal(String(entry.totalAmount));
    setIsManualTotal(false);
    setFormBunkName(entry.bunkName || '');
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormBillNumber('');
    setFormLiters('');
    setFormRate('');
    setFormTotal('');
    setIsManualTotal(false);
    setFormBunkName('');
    setFormDate(getTodayDDMMYYYY());
    setFormError('');
  };

  const handleDeleteConfirm = async () => {
    if (!deletingEntry) return;
    const targetId = deletingEntry.id;

    deleteStoredFuelEntry(targetId);
    setFuelEntries((prev) => prev.filter((e) => e.id !== targetId));
    setDeletingEntry(null);

    try {
      const supabase = createClient();
      await supabase.from('fuel_entries').delete().eq('id', targetId);
    } catch (err) {
      console.error('Error deleting fuel entry from Supabase:', err);
    }
  };

  // Statement filtered entries
  const statementFilteredEntries = useMemo(() => {
    return filterFuelEntries(fuelEntries, selectedVehicle, statementFromDate, statementToDate);
  }, [fuelEntries, selectedVehicle, statementFromDate, statementToDate]);

  const statementStats = useMemo(() => {
    return calculateFuelSummary(statementFilteredEntries);
  }, [statementFilteredEntries]);

  // Print Fuel Statement to clean A4 PDF
  const handlePrintStatement = () => {
    if (isPrinting) return;
    setIsPrinting(true);

    const printEl = document.getElementById('fuelStatementPrintArea');
    if (!printEl) {
      setIsPrinting(false);
      window.print();
      return;
    }

    let printFrame = document.getElementById('aus_fuel_print_frame') as HTMLIFrameElement | null;
    if (printFrame) {
      try {
        printFrame.remove();
      } catch {}
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'aus_fuel_print_frame';
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
    <title>Fuel Statement - ${selectedVehicle}</title>
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
      .particulars-badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .badge-diesel { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
      .badge-petrol { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
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
    <div className="w-full space-y-6">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-zinc-100">
                Vehicle Fuel Management
              </h1>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Record bunk entries (diesel & petrol) per vehicle and export custom date-range PDF statements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => refreshFromSupabase()}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Refresh records"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatementFromDate('');
              setStatementToDate('');
              setIsStatementOpen(true);
            }}
            disabled={!selectedVehicle || currentVehicleEntries.length === 0}
            className="px-3.5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Generate Statement (PDF)</span>
          </button>
        </div>
      </div>

      {/* 1. Vehicle Selection Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" />
            <span>Select Vehicle to Manage Fuel</span>
          </label>
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            {vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'} registered
          </span>
        </div>

        {vehicles.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-gray-300 dark:border-zinc-800 text-center text-xs text-gray-500 dark:text-zinc-400">
            No vehicles registered yet. Please add a vehicle in the Vehicles module first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {vehicles.map((v) => {
              const isSelected = selectedVehicle === v.registrationNumber;
              const vehicleEntries = fuelEntries.filter((e) => e.vehicleNumber === v.registrationNumber);
              const stats = calculateFuelSummary(vehicleEntries);

              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setSelectedVehicle(v.registrationNumber);
                    setEditingId(null);
                  }}
                  className={`px-3.5 py-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white font-bold shadow-sm ring-2 ring-black/10 dark:ring-white/20'
                      : 'bg-gray-50 dark:bg-zinc-800/60 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 font-medium'
                  }`}
                >
                  <Truck className="w-4 h-4 shrink-0" />
                  <div className="text-left">
                    <span className="font-mono font-bold tracking-tight">{v.registrationNumber}</span>
                    {stats.entryCount > 0 ? (
                      <span className={`block text-[10px] ${isSelected ? 'text-white/80 dark:text-black/80' : 'text-gray-400 dark:text-zinc-500'}`}>
                        {stats.totalLiters}L • ₹{Math.round(stats.totalAmount).toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className={`block text-[10px] ${isSelected ? 'text-white/60 dark:text-black/60' : 'text-gray-400'}`}>
                        0 entries
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedVehicle && (
        <>
          {/* 2. Fuel Stats Summary Cards for Selected Vehicle */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Total Fuel Spent</span>
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-gray-900 dark:text-zinc-100 mt-1">
                ₹{Math.round(currentVehicleStats.totalAmount).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                For vehicle {selectedVehicle}
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500 flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Total Liters Filled</span>
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-gray-900 dark:text-zinc-100 mt-1">
                {currentVehicleStats.totalLiters.toLocaleString('en-IN')} L
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                Diesel & Petrol Combined
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500 flex items-center gap-1">
                <Fuel className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Average Rate / Liter</span>
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-gray-900 dark:text-zinc-100 mt-1">
                ₹{currentVehicleStats.averageRate.toFixed(2)}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                Weighted average price
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Total Bunk Bills</span>
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono text-gray-900 dark:text-zinc-100 mt-1">
                {currentVehicleStats.entryCount}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                Logged bunk receipts
              </p>
            </div>
          </div>

          {/* 3. Fuel Bunk Entry Form (Add / Edit) */}
          <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  {editingId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                    {editingId ? 'Edit Fuel Bunk Entry' : 'New Fuel Bunk Entry'} - {selectedVehicle}
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                    Enter receipt details provided by the petrol bunk. Completely independent from invoices.
                  </p>
                </div>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Fuel entry saved successfully!</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Date */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                    Date *
                  </label>
                  <CustomDatePicker
                    value={formDate}
                    onChange={(val) => setFormDate(val)}
                    placeholder="DD-MM-YYYY"
                  />
                </div>

                {/* 2. Bill Number */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                    Bunk Bill No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B-1049"
                    value={formBillNumber}
                    onChange={(e) => setFormBillNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 text-xs font-mono font-semibold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>

                {/* 3. Particulars (Petrol / Diesel) */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                    Particulars *
                  </label>
                  <div className="relative">
                    <select
                      value={formParticulars}
                      onChange={(e) => setFormParticulars(e.target.value as 'Diesel' | 'Petrol')}
                      className="w-full appearance-none px-3 py-2 pr-8 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 text-xs font-semibold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                    >
                      <option value="Diesel">Diesel</option>
                      <option value="Petrol">Petrol</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* 4. Total Liters */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                    Total Liters *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 150.00"
                    value={formLiters}
                    onChange={(e) => setFormLiters(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 text-xs font-mono font-bold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10"
                    required
                  />
                </div>

                {/* 5. Price / Rate per Liter */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                    Rate (₹/Liter) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 94.30"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 text-xs font-mono font-bold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10"
                    required
                  />
                </div>

                {/* 6. Total Amount (₹) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                      Total (₹) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManualTotal(!isManualTotal)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {isManualTotal ? 'Auto Calc' : 'Manual'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Auto total"
                    value={formTotal}
                    readOnly={!isManualTotal}
                    onChange={(e) => {
                      setIsManualTotal(true);
                      setFormTotal(e.target.value);
                    }}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-black focus:outline-none ${
                      isManualTotal
                        ? 'border-blue-400 bg-white dark:bg-zinc-800/80 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Bunk Name + Submit Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Petrol Bunk Name / Location (e.g. HP Bunk Dharapuram)"
                    value={formBunkName}
                    onChange={(e) => setFormBunkName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{editingId ? 'Update Fuel Entry' : 'Save Fuel Entry'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* 4. Fuel Entries Table for Selected Vehicle */}
          <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                  Bunk Fuel Entries ({displayEntries.length})
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                  All recorded bunk receipts for vehicle <span className="font-mono font-bold text-gray-700 dark:text-zinc-300">{selectedVehicle}</span>
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by bill #, bunk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-xs text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {displayEntries.length === 0 ? (
              <div className="p-12 text-center">
                <Fuel className="w-8 h-8 text-gray-300 dark:text-zinc-700 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-700 dark:text-zinc-300">No Fuel Entries Logged</p>
                <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1">
                  {searchQuery ? 'No records match your search filter.' : 'Use the form above to add the first fuel receipt for this vehicle.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-3">Bunk Bill #</th>
                      <th className="py-2.5 px-3">Particulars</th>
                      <th className="py-2.5 px-3 text-right">Liters</th>
                      <th className="py-2.5 px-3 text-right">Rate (₹/L)</th>
                      <th className="py-2.5 px-4 text-right">Total (₹)</th>
                      <th className="py-2.5 px-4">Bunk Name</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80">
                    {displayEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-zinc-100">
                          {entry.date}
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-700 dark:text-zinc-300 font-semibold">
                          {entry.billNumber || '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              entry.particulars === 'Diesel'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                            }`}
                          >
                            {entry.particulars}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100">
                          {entry.liters.toFixed(2)} L
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-gray-600 dark:text-zinc-400">
                          ₹{entry.ratePerLiter.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-gray-900 dark:text-zinc-100">
                          ₹{entry.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-gray-500 dark:text-zinc-400 text-[11px] truncate max-w-[180px]">
                          {entry.bunkName || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditClick(entry)}
                              title="Edit Entry"
                              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-blue-600 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingEntry(entry)}
                              title="Delete Entry"
                              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50/80 dark:bg-zinc-800/80 border-t-2 border-gray-300 dark:border-zinc-700 font-bold">
                    <tr>
                      <td colSpan={3} className="py-2.5 px-4 uppercase text-[10px] text-gray-600 dark:text-zinc-400">
                        Total for {selectedVehicle}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-900 dark:text-zinc-100 font-black">
                        {currentVehicleStats.totalLiters.toFixed(2)} L
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-600 dark:text-zinc-400">
                        Avg ₹{currentVehicleStats.averageRate.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-900 dark:text-zinc-100 font-black">
                        ₹{Math.round(currentVehicleStats.totalAmount).toLocaleString('en-IN')}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-zinc-100">Delete Fuel Entry?</h4>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {deletingEntry.date} • {deletingEntry.liters}L • ₹{deletingEntry.totalAmount}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 dark:text-zinc-300">
              Are you sure you want to delete this fuel bunk entry? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement / PDF Date Range Modal */}
      {isStatementOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-black text-white dark:bg-white dark:text-black flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Generate Fuel Statement (PDF)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Vehicle: <span className="font-mono font-bold text-gray-900 dark:text-zinc-100">{selectedVehicle}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsStatementOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Date Range Selection with Custom Calendar Picker */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Select Custom Date Range</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-700 dark:text-zinc-300">From Date</label>
                  <CustomDatePicker
                    value={statementFromDate}
                    onChange={(val) => setStatementFromDate(val)}
                    placeholder="DD-MM-YYYY (Start Date)"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-700 dark:text-zinc-300">To Date</label>
                  <CustomDatePicker
                    value={statementToDate}
                    onChange={(val) => setStatementToDate(val)}
                    placeholder="DD-MM-YYYY (End Date)"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-400 font-semibold mr-1">Quick Select:</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatementFromDate('');
                    setStatementToDate('');
                  }}
                  className="px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-800 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  All Entries
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                    setStatementFromDate(`01-${month}-${year}`);
                    setStatementToDate(`${String(lastDay).padStart(2, '0')}-${month}-${year}`);
                  }}
                  className="px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-800 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    now.setMonth(now.getMonth() - 1);
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                    setStatementFromDate(`01-${month}-${year}`);
                    setStatementToDate(`${String(lastDay).padStart(2, '0')}-${month}-${year}`);
                  }}
                  className="px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-800 text-[10px] hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  Last Month
                </button>
              </div>
            </div>

            {/* Filtered Statement Summary Preview */}
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 block">
                  Statement Period
                </span>
                <span className="font-mono font-semibold text-gray-800 dark:text-zinc-200">
                  {statementFromDate || 'Beginning'} &rarr; {statementToDate || 'Latest'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 block">
                  {statementStats.entryCount} Entries • {statementStats.totalLiters} L
                </span>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                  ₹{Math.round(statementStats.totalAmount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsStatementOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={statementStats.entryCount === 0 || isPrinting}
                onClick={handlePrintStatement}
                className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-40"
              >
                <Printer className="w-4 h-4" />
                <span>{isPrinting ? 'Preparing PDF...' : 'Print / Save as PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Statement Print Template (Targeted by iframe) */}
      <div id="fuelStatementPrintArea" style={{ display: 'none' }}>
        <div className="statement-container">
          <div className="header-title">
            <h1 className="company-name">AUS TRANSPORT</h1>
            <p className="report-title">VEHICLE FUEL CONSUMPTION &amp; BUNK BILL STATEMENT</p>
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Vehicle Registration No</span>
              <span className="meta-value">{selectedVehicle}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Report Period</span>
              <span className="meta-value">
                {statementFromDate || 'Start'} to {statementToDate || 'Current'}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Generated On</span>
              <span className="meta-value">{new Date().toLocaleString('en-IN')}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th className="text-center" style={{ width: '6%' }}>S.No</th>
                <th className="text-center" style={{ width: '14%' }}>Date</th>
                <th style={{ width: '16%' }}>Bunk Bill #</th>
                <th className="text-center" style={{ width: '14%' }}>Particulars</th>
                <th className="text-right" style={{ width: '14%' }}>Liters (L)</th>
                <th className="text-right" style={{ width: '14%' }}>Rate (₹/L)</th>
                <th className="text-right" style={{ width: '18%' }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {statementFilteredEntries.map((entry, idx) => (
                <tr key={entry.id}>
                  <td className="text-center font-mono">{idx + 1}</td>
                  <td className="text-center font-mono font-bold">{entry.date}</td>
                  <td className="font-mono">{entry.billNumber || '—'}</td>
                  <td className="text-center">
                    <span className={`particulars-badge ${entry.particulars === 'Diesel' ? 'badge-diesel' : 'badge-petrol'}`}>
                      {entry.particulars}
                    </span>
                  </td>
                  <td className="text-right font-mono font-bold">{entry.liters.toFixed(2)}</td>
                  <td className="text-right font-mono">{entry.ratePerLiter.toFixed(2)}</td>
                  <td className="text-right font-mono font-bold">
                    {entry.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={4} className="font-bold text-right" style={{ textTransform: 'uppercase' }}>
                  Grand Total
                </td>
                <td className="text-right font-mono font-bold">{statementStats.totalLiters.toFixed(2)} L</td>
                <td className="text-right font-mono">Avg ₹{statementStats.averageRate.toFixed(2)}</td>
                <td className="text-right font-mono font-bold">
                  ₹{statementStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="summary-box">
            <span><strong>Amount in Words: </strong></span>
            <span className="words-text">{numberToWords(statementStats.totalAmount)}</span>
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

