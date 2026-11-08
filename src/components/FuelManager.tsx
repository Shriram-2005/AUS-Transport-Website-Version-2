'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Fuel,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Check,
  Calendar,
  Printer,
  FileText,
  AlertTriangle,
  RotateCcw,
  Truck,
  Droplets,
  ExternalLink,
  ChevronDown
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
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FuelEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<FuelEntry | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<string | null>(null);
  const [statementVehicle, setStatementVehicle] = useState<string | null>(null);

  // Form states
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
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

  // Statement PDF generation states
  const [statementFromDate, setStatementFromDate] = useState<string>('');
  const [statementToDate, setStatementToDate] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Load vehicles and fuel entries on mount & listen to updates
  useEffect(() => {
    setVehicles(getStoredVehicles());
    setFuelEntries(getStoredFuelEntries());

    const handleVehiclesUpdate = (e: CustomEvent<Vehicle[]>) => {
      if (e.detail) {
        setVehicles(e.detail);
      } else {
        setVehicles(getStoredVehicles());
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
  }, []);

  // Sync latest from Supabase
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
  }, []);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for refresh module event from DashboardHeader
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

  // Close 3-dot action menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.fuel-action-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Auto calculate total amount when liters or rate changes in form
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

  // Filter vehicles by search query
  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => v.registrationNumber.toLowerCase().includes(q));
  }, [vehicles, searchQuery]);

  // Open Add Fuel Entry modal (optionally preselecting a vehicle)
  const handleOpenAddModal = (vehicleNumber?: string) => {
    const defaultVeh = vehicleNumber || (vehicles.length > 0 ? vehicles[0].registrationNumber : '');
    setFormVehicleNumber(defaultVeh);
    setFormDate(getTodayDDMMYYYY());
    setFormBillNumber('');
    setFormParticulars('Diesel');
    setFormLiters('');
    setFormRate('94.20');
    setFormTotal('');
    setIsManualTotal(false);
    setFormBunkName('');
    setFormError('');
    setIsAddModalOpen(true);
    setActiveMenuId(null);
  };

  // Open Edit Fuel Entry modal
  const handleOpenEditModal = (entry: FuelEntry) => {
    setEditingEntry(entry);
    setFormVehicleNumber(entry.vehicleNumber);
    setFormDate(entry.date);
    setFormBillNumber(entry.billNumber);
    setFormParticulars(entry.particulars);
    setFormLiters(String(entry.liters));
    setFormRate(String(entry.ratePerLiter));
    setFormTotal(String(entry.totalAmount));
    setIsManualTotal(false);
    setFormBunkName(entry.bunkName || '');
    setFormError('');
    setActiveMenuId(null);
  };

  // Submit Fuel Entry Form (Add or Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanVehicle = formVehicleNumber.trim().toUpperCase();
    if (!cleanVehicle) {
      setFormError('Please select or enter a vehicle registration number.');
      return;
    }
    if (!formDate.trim()) {
      setFormError('Please select an entry date.');
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
      vehicle_number: cleanVehicle,
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

      if (editingEntry) {
        updateStoredFuelEntry(editingEntry.id, {
          vehicleNumber: cleanVehicle,
          date: formDate.trim(),
          billNumber: formBillNumber.trim(),
          particulars: formParticulars,
          liters: litersNum,
          ratePerLiter: rateNum,
          totalAmount: totalNum,
          bunkName: formBunkName.trim(),
        });

        await supabase.from('fuel_entries').update(payload).eq('id', editingEntry.id);
        setEditingEntry(null);
      } else {
        const created = addStoredFuelEntry({
          vehicleNumber: cleanVehicle,
          date: formDate.trim(),
          billNumber: formBillNumber.trim(),
          particulars: formParticulars,
          liters: litersNum,
          ratePerLiter: rateNum,
          totalAmount: totalNum,
          bunkName: formBunkName.trim(),
        });

        await supabase.from('fuel_entries').insert([{ ...payload, id: created.id }]);
        setIsAddModalOpen(false);
      }
    } catch (err) {
      console.error('Error saving fuel entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete fuel entry
  const handleConfirmDelete = async () => {
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

  // Statement filtered entries for PDF print
  const statementFilteredEntries = useMemo(() => {
    if (!statementVehicle) return [];
    return filterFuelEntries(fuelEntries, statementVehicle, statementFromDate, statementToDate);
  }, [fuelEntries, statementVehicle, statementFromDate, statementToDate]);

  const statementStats = useMemo(() => {
    return calculateFuelSummary(statementFilteredEntries);
  }, [statementFilteredEntries]);

  // Open Statement PDF generator for vehicle
  const handleOpenStatement = (vehicleNumber: string) => {
    setStatementVehicle(vehicleNumber);
    setStatementFromDate('');
    setStatementToDate('');
    setActiveMenuId(null);
  };

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
    <title>Fuel Statement - ${statementVehicle}</title>
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
    <div className="space-y-6">
      {/* Top Header: Matching VehicleManager & DriverManager exactly */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
            <Fuel className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span>Fuel Management</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
            Log bunk bills, track diesel and petrol consumption per vehicle, and export custom date-range statements
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search Box */}
          <div className="relative w-48 sm:w-60">
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vehicle number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add Fuel Entry Button */}
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Fuel Entry</span>
          </button>
        </div>
      </div>

      {/* Vehicles Fuel Grid: 2-Column Responsive Cards matching VehicleManager & DriverManager */}
      {filteredVehicles.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Truck className="w-10 h-10 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-1">
            No Vehicles Found
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
            {searchQuery ? `No vehicles matched "${searchQuery}"` : 'Please register vehicles in the Vehicles module first.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredVehicles.map((vehicle) => {
            const vehicleEntries = fuelEntries
              .filter((e) => e.vehicleNumber === vehicle.registrationNumber)
              .sort((a, b) => {
                const parseD = (s: string) => {
                  const parts = s.split('-');
                  if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
                  return new Date(s).getTime() || 0;
                };
                return parseD(b.date) - parseD(a.date);
              });

            const stats = calculateFuelSummary(vehicleEntries);
            const recentEntries = vehicleEntries.slice(0, 4);

            return (
              <div
                key={vehicle.id}
                className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between relative group"
              >
                {/* Top Section: Vehicle Number, Fuel Cost, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Vehicle Number */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Vehicle Number
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
                          {vehicle.registrationNumber}
                        </h3>
                        <p className="text-[11px] font-mono font-semibold text-amber-700 dark:text-amber-400">
                          {stats.totalLiters > 0 ? `Avg: ₹${stats.averageRate.toFixed(2)} / L` : 'No fuel logged'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Total Fuel Cost Summary */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Total Fuel Cost
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                        ₹{Math.round(stats.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono font-medium text-gray-500 dark:text-zinc-400">
                      {stats.totalLiters.toFixed(2)} L ({stats.entryCount} {stats.entryCount === 1 ? 'bill' : 'bills'})
                    </p>
                  </div>

                  {/* 3. 3-Dot Menu Options */}
                  <div className="relative fuel-action-menu shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === vehicle.id ? null : vehicle.id);
                      }}
                      title="Fuel Operations"
                      className="w-9 h-9 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-gray-100 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === vehicle.id && (
                      <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                        {/* Add Fuel Entry Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenAddModal(vehicle.registrationNumber)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Fuel Entry</span>
                        </button>

                        {/* Generate Statement Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenStatement(vehicle.registrationNumber)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Generate Statement (PDF)</span>
                        </button>

                        {/* View All History Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryVehicle(vehicle.registrationNumber);
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>View All Bunk Bills ({stats.entryCount})</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Nested Table: Recent Fuel Entries */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-zinc-300">
                      <Droplets className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Recent Bunk Receipts</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stats.entryCount > 4 && (
                        <button
                          type="button"
                          onClick={() => setHistoryVehicle(vehicle.registrationNumber)}
                          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          View all ({stats.entryCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(vehicle.registrationNumber)}
                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200/80 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-100/70 dark:bg-zinc-800/60">
                          <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                          <th className="py-2.5 px-2.5 text-left font-semibold">Bill #</th>
                          <th className="py-2.5 px-2.5 text-center font-semibold">Fuel</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Liters</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                        {recentEntries.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-3 px-3 text-center text-[11px] text-gray-400 dark:text-zinc-500 italic">
                              No fuel entries recorded yet
                            </td>
                          </tr>
                        ) : (
                          recentEntries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-amber-50/20 dark:hover:bg-amber-950/10 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-medium text-gray-800 dark:text-zinc-200 text-[11px]">
                                {entry.date}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-gray-600 dark:text-zinc-400 text-[11px]">
                                {entry.billNumber || '—'}
                              </td>
                              <td className="py-2.5 px-2.5 text-center">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    entry.particulars === 'Diesel'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                  }`}
                                >
                                  {entry.particulars}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium text-gray-700 dark:text-zinc-300 text-[11px]">
                                {entry.liters.toFixed(2)} L
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 text-[11px]">
                                ₹{Math.round(entry.totalAmount).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Card Footer Quick Link: Statement Generator */}
                  {stats.entryCount > 0 && (
                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <span className="text-gray-400 dark:text-zinc-500">
                        Total {stats.entryCount} bills logged
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenStatement(vehicle.registrationNumber)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-black dark:hover:text-white cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Print Statement</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          ADD / EDIT FUEL ENTRY MODAL (Matching VehicleManager & DriverManager)
      ========================================================================= */}
      {(isAddModalOpen || editingEntry) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative my-8">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                <Fuel className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{editingEntry ? 'Edit Fuel Bunk Entry' : 'Add New Fuel Entry'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingEntry(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Vehicle Selection */}
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Select Vehicle *
                </label>
                <div className="relative">
                  <select
                    value={formVehicleNumber}
                    onChange={(e) => setFormVehicleNumber(e.target.value)}
                    required
                    className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                  >
                    <option value="" disabled>Select vehicle</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.registrationNumber}>
                        {v.registrationNumber}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* 2-Column: Date & Bill Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Date *
                  </label>
                  <CustomDatePicker
                    value={formDate}
                    onChange={(val) => setFormDate(val)}
                    placeholder="DD-MM-YYYY"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Bunk Bill Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B-10492"
                    value={formBillNumber}
                    onChange={(e) => setFormBillNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* 3-Column: Particulars, Liters, Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Particulars *
                  </label>
                  <div className="relative">
                    <select
                      value={formParticulars}
                      onChange={(e) => setFormParticulars(e.target.value as 'Diesel' | 'Petrol')}
                      className="w-full appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                    >
                      <option value="Diesel">Diesel</option>
                      <option value="Petrol">Petrol</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Total Liters *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 150.00"
                    value={formLiters}
                    onChange={(e) => setFormLiters(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Price (₹/Liter) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 94.20"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* 2-Column: Total Amount & Bunk Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                      Total Amount (₹) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManualTotal(!isManualTotal)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {isManualTotal ? 'Auto Calc' : 'Override'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Total amount"
                    value={formTotal}
                    readOnly={!isManualTotal}
                    onChange={(e) => {
                      setIsManualTotal(true);
                      setFormTotal(e.target.value);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl border font-mono text-sm font-black focus:outline-none ${
                      isManualTotal
                        ? 'border-blue-400 bg-white dark:bg-zinc-800 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Bunk Name / Station (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HP Bunk Dharapuram"
                    value={formBunkName}
                    onChange={(e) => setFormBunkName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingEntry(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Add Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW ALL BUNK BILLS HISTORY DRAWER / MODAL FOR A VEHICLE
      ========================================================================= */}
      {historyVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full shadow-2xl p-6 relative my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600">
                  <Fuel className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Bunk Bill History - {historyVehicle}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    All recorded fuel purchases for this vehicle
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenStatement(historyVehicle);
                    setHistoryVehicle(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Statement PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryVehicle(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Table of all entries for this vehicle */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100/80 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Bill #</th>
                    <th className="py-2.5 px-3 text-center">Particulars</th>
                    <th className="py-2.5 px-3 text-right">Liters</th>
                    <th className="py-2.5 px-3 text-right">Rate (₹/L)</th>
                    <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    <th className="py-2.5 px-3">Bunk Station</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80">
                  {fuelEntries
                    .filter((e) => e.vehicleNumber === historyVehicle)
                    .map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                        <td className="py-2.5 px-3 font-mono font-medium text-gray-900 dark:text-zinc-100">
                          {entry.date}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-zinc-300 font-semibold">
                          {entry.billNumber || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              entry.particulars === 'Diesel'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}
                          >
                            {entry.particulars}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100">
                          {entry.liters.toFixed(2)} L
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-600 dark:text-zinc-400">
                          ₹{entry.ratePerLiter.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-gray-900 dark:text-zinc-100">
                          ₹{entry.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 dark:text-zinc-400 truncate max-w-[150px]">
                          {entry.bunkName || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenEditModal(entry);
                                setHistoryVehicle(null);
                              }}
                              className="p-1 rounded text-gray-500 hover:text-blue-600 cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingEntry(entry);
                                setHistoryVehicle(null);
                              }}
                              className="p-1 rounded text-gray-500 hover:text-red-600 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setHistoryVehicle(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-zinc-800 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
      {deletingEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-zinc-100">Delete Fuel Entry?</h4>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {deletingEntry.vehicleNumber} • {deletingEntry.date} • {deletingEntry.liters}L
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 dark:text-zinc-300">
              Are you sure you want to delete this fuel bunk receipt? This action will permanently remove it from records.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATEMENT / PDF DATE RANGE MODAL
      ========================================================================= */}
      {statementVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full shadow-2xl p-6 relative my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Fuel Statement (PDF) - {statementVehicle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatementVehicle(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 block">
                Filter by Custom Date Range
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-zinc-400 block">From Date</span>
                  <CustomDatePicker
                    value={statementFromDate}
                    onChange={(val) => setStatementFromDate(val)}
                    placeholder="DD-MM-YYYY (Start Date)"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-zinc-400 block">To Date</span>
                  <CustomDatePicker
                    value={statementToDate}
                    onChange={(val) => setStatementToDate(val)}
                    placeholder="DD-MM-YYYY (End Date)"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-400 font-semibold mr-1">Presets:</span>
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

            {/* Filter Summary */}
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 block">
                  Report Scope
                </span>
                <span className="font-mono font-bold text-gray-900 dark:text-zinc-100">
                  {statementFromDate || 'Beginning'} &rarr; {statementToDate || 'Latest'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 block">
                  {statementStats.entryCount} Bills • {statementStats.totalLiters.toFixed(2)} L
                </span>
                <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                  ₹{Math.round(statementStats.totalAmount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setStatementVehicle(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={statementStats.entryCount === 0 || isPrinting}
                onClick={handlePrintStatement}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isPrinting ? 'Preparing...' : 'Print / Save PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          HIDDEN PRINT TEMPLATE FOR A4 STATEMENT PDF (Targeted by iframe)
      ========================================================================= */}
      <div id="fuelStatementPrintArea" style={{ display: 'none' }}>
        <div className="statement-container">
          <div className="header-title">
            <h1 className="company-name">AUS TRANSPORT</h1>
            <p className="report-title">VEHICLE FUEL CONSUMPTION &amp; BUNK BILL STATEMENT</p>
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Vehicle Registration No</span>
              <span className="meta-value">{statementVehicle}</span>
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
