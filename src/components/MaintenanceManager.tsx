'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Printer,
  AlertTriangle,
  Truck,
  Droplets,
  ExternalLink,
  ChevronDown,
  Building2,
  Calendar,
  Gauge,
  ClipboardList
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  MaintenanceEntry,
  getStoredMaintenanceEntries,
  saveStoredMaintenanceEntries,
  addStoredMaintenanceEntry,
  updateStoredMaintenanceEntry,
  deleteStoredMaintenanceEntry,
  getStoredCategories,
  addStoredCategory,
  getStoredWorkshops,
  addStoredWorkshop,
  filterMaintenanceEntries,
  calculateMaintenanceSummary,
  numberToWords,
  MAINTENANCE_ENTRIES_CHANGE_EVENT
} from '@/lib/maintenance';
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

export function MaintenanceManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [workshopsList, setWorkshopsList] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MaintenanceEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<MaintenanceEntry | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<string | null>(null);
  const [statementVehicle, setStatementVehicle] = useState<string | null>(null);

  // Form states
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formDate, setFormDate] = useState<string>(getTodayDDMMYYYY());
  const [formBillNumber, setFormBillNumber] = useState('');
  const [formCategory, setFormCategory] = useState<string>('Engine Oil & Filter Change');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState<string>(''); // No pre-filled price by default
  const [formWorkshop, setFormWorkshop] = useState('');
  const [isAddingNewWorkshop, setIsAddingNewWorkshop] = useState(false);
  const [newWorkshopInput, setNewWorkshopInput] = useState('');
  const [formOdometer, setFormOdometer] = useState<string>('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Statement PDF generation states
  const [statementFromDate, setStatementFromDate] = useState<string>('');
  const [statementToDate, setStatementToDate] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Load initial vehicles, maintenance entries, categories, and workshops on mount
  useEffect(() => {
    setVehicles(getStoredVehicles());
    setMaintenanceEntries(getStoredMaintenanceEntries());
    setCategoriesList(getStoredCategories());
    setWorkshopsList(getStoredWorkshops());

    const handleVehiclesUpdate = (e: CustomEvent<Vehicle[]>) => {
      if (e.detail) {
        setVehicles(e.detail);
      } else {
        setVehicles(getStoredVehicles());
      }
    };

    const handleMaintenanceUpdate = (e: CustomEvent<MaintenanceEntry[]>) => {
      if (e.detail) {
        setMaintenanceEntries(e.detail);
      } else {
        setMaintenanceEntries(getStoredMaintenanceEntries());
      }
    };

    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    window.addEventListener(MAINTENANCE_ENTRIES_CHANGE_EVENT as any, handleMaintenanceUpdate);

    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
      window.removeEventListener(MAINTENANCE_ENTRIES_CHANGE_EVENT as any, handleMaintenanceUpdate);
    };
  }, []);

  // Sync latest from Supabase
  const refreshFromSupabase = useCallback(async () => {
    try {
      const supabase = createClient();

      // 1. Sync vehicles
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

      // 2. Sync maintenance entries
      const { data: mData, error: mErr } = await supabase
        .from('maintenance_entries')
        .select('*')
        .order('entry_date', { ascending: false });

      if (!mErr && mData && mData.length > 0) {
        const loaded: MaintenanceEntry[] = mData.map((m: any) => ({
          id: m.id,
          vehicleNumber: (m.vehicle_number || '').trim().toUpperCase(),
          date: m.entry_date || '',
          billNumber: m.bill_number || '',
          category: m.category || 'General Routine Maintenance',
          description: m.description || '',
          amount: Number(m.amount) || 0,
          workshopName: m.workshop_name || '',
          odometerKm: m.odometer_km ? Number(m.odometer_km) : undefined,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        }));
        setMaintenanceEntries(loaded);
        saveStoredMaintenanceEntries(loaded);

        // Gather any distinct workshops and categories
        const distinctWorkshops = loaded
          .map((e) => (e.workshopName || '').trim())
          .filter(Boolean);
        if (distinctWorkshops.length > 0) {
          const merged = Array.from(new Set([...getStoredWorkshops(), ...distinctWorkshops]));
          setWorkshopsList(merged);
        }

        const distinctCats = loaded
          .map((e) => (e.category || '').trim())
          .filter(Boolean);
        if (distinctCats.length > 0) {
          const mergedCats = Array.from(new Set([...getStoredCategories(), ...distinctCats]));
          setCategoriesList(mergedCats);
        }
      } else if (!mErr && mData && mData.length === 0) {
        // If Supabase table is empty but client has local entries, seed Supabase
        const local = getStoredMaintenanceEntries();
        if (local.length > 0) {
          for (const item of local) {
            await supabase.from('maintenance_entries').insert([{
              id: item.id,
              vehicle_number: item.vehicleNumber,
              entry_date: item.date,
              bill_number: item.billNumber,
              category: item.category,
              description: item.description,
              amount: item.amount,
              workshop_name: item.workshopName || '',
              odometer_km: item.odometerKm || 0,
            }]);
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing maintenance entries from Supabase:', err);
    }
  }, []);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for refresh module event from DashboardHeader
  useEffect(() => {
    const handleModuleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'maintenance' || e.detail.module === 'all') {
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
      if (!target.closest('.maintenance-action-menu')) {
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

  // Open Add Maintenance Entry modal (optionally preselecting a vehicle)
  // Ensures Price starts completely blank with no pre-existing rate
  const handleOpenAddModal = (vehicleNumber?: string) => {
    const defaultVeh = vehicleNumber || (vehicles.length > 0 ? vehicles[0].registrationNumber : '');
    setFormVehicleNumber(defaultVeh);
    setFormDate(getTodayDDMMYYYY());
    setFormBillNumber('');
    setFormCategory('Engine Oil & Filter Change');
    setIsAddingNewCategory(false);
    setNewCategoryInput('');
    setFormDescription('');
    setFormAmount(''); // Strictly empty: no pre-existing price
    setFormWorkshop('');
    setIsAddingNewWorkshop(false);
    setNewWorkshopInput('');
    setFormOdometer('');
    setFormError('');
    setIsAddModalOpen(true);
    setActiveMenuId(null);
  };

  // Open Edit Maintenance Entry modal
  const handleOpenEditModal = (entry: MaintenanceEntry) => {
    setEditingEntry(entry);
    setFormVehicleNumber(entry.vehicleNumber);
    setFormDate(entry.date);
    setFormBillNumber(entry.billNumber);
    setFormCategory(entry.category);
    setIsAddingNewCategory(false);
    setNewCategoryInput('');
    setFormDescription(entry.description);
    setFormAmount(entry.amount > 0 ? String(entry.amount) : '');
    setFormWorkshop(entry.workshopName || '');
    setIsAddingNewWorkshop(false);
    setNewWorkshopInput('');
    setFormOdometer(entry.odometerKm ? String(entry.odometerKm) : '');
    setFormError('');
    setActiveMenuId(null);
  };

  // Save new custom category
  const handleSaveNewCategory = () => {
    const clean = newCategoryInput.trim();
    if (!clean) return;
    const updated = addStoredCategory(clean);
    setCategoriesList(updated);
    setFormCategory(clean);
    setIsAddingNewCategory(false);
    setNewCategoryInput('');
  };

  // Save new workshop
  const handleSaveNewWorkshop = () => {
    const clean = newWorkshopInput.trim();
    if (!clean) return;
    const updated = addStoredWorkshop(clean);
    setWorkshopsList(updated);
    setFormWorkshop(clean);
    setIsAddingNewWorkshop(false);
    setNewWorkshopInput('');
  };

  // Submit Maintenance Entry Form (Add or Edit) with Supabase sync
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanVehicle = formVehicleNumber.trim().toUpperCase();
    if (!cleanVehicle) {
      setFormError('Please select or enter a vehicle registration number.');
      return;
    }
    if (!formDate.trim()) {
      setFormError('Please select a service date.');
      return;
    }
    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid repair / service cost amount.');
      return;
    }

    const odoNum = formOdometer.trim() ? parseFloat(formOdometer) : undefined;
    const cleanCat = formCategory.trim() || 'General Routine Maintenance';
    const cleanDesc = formDescription.trim();
    const cleanWorkshop = formWorkshop.trim();

    setIsSaving(true);

    try {
      const supabase = createClient();

      if (editingEntry) {
        updateStoredMaintenanceEntry(editingEntry.id, {
          vehicleNumber: cleanVehicle,
          date: formDate.trim(),
          billNumber: formBillNumber.trim(),
          category: cleanCat,
          description: cleanDesc,
          amount: amountNum,
          workshopName: cleanWorkshop,
          odometerKm: odoNum,
        });

        const { error: updateErr } = await supabase
          .from('maintenance_entries')
          .update({
            vehicle_number: cleanVehicle,
            entry_date: formDate.trim(),
            bill_number: formBillNumber.trim(),
            category: cleanCat,
            description: cleanDesc,
            amount: amountNum,
            workshop_name: cleanWorkshop,
            odometer_km: odoNum || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEntry.id);

        if (updateErr) {
          console.warn('Supabase maintenance_entries update error:', updateErr.message);
        }

        setEditingEntry(null);
      } else {
        const created = addStoredMaintenanceEntry({
          vehicleNumber: cleanVehicle,
          date: formDate.trim(),
          billNumber: formBillNumber.trim(),
          category: cleanCat,
          description: cleanDesc,
          amount: amountNum,
          workshopName: cleanWorkshop,
          odometerKm: odoNum,
        });

        const { error: insertErr } = await supabase
          .from('maintenance_entries')
          .insert([{
            id: created.id,
            vehicle_number: cleanVehicle,
            entry_date: formDate.trim(),
            bill_number: formBillNumber.trim(),
            category: cleanCat,
            description: cleanDesc,
            amount: amountNum,
            workshop_name: cleanWorkshop,
            odometer_km: odoNum || 0,
          }]);

        if (insertErr) {
          console.warn('Supabase maintenance_entries insert error:', insertErr.message);
        }

        setIsAddModalOpen(false);
      }

      if (cleanWorkshop) {
        setWorkshopsList(addStoredWorkshop(cleanWorkshop));
      }
      if (cleanCat) {
        setCategoriesList(addStoredCategory(cleanCat));
      }
    } catch (err) {
      console.error('Error saving maintenance entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete maintenance entry with Supabase sync
  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    const targetId = deletingEntry.id;

    deleteStoredMaintenanceEntry(targetId);
    setMaintenanceEntries((prev) => prev.filter((e) => e.id !== targetId));
    setDeletingEntry(null);

    try {
      const supabase = createClient();
      const { error: deleteErr } = await supabase.from('maintenance_entries').delete().eq('id', targetId);
      if (deleteErr) {
        console.warn('Supabase maintenance_entries delete error:', deleteErr.message);
      }
    } catch (err) {
      console.error('Error deleting maintenance entry from Supabase:', err);
    }
  };

  // Statement filtered entries for PDF print
  const statementFilteredEntries = useMemo(() => {
    if (!statementVehicle) return [];
    return filterMaintenanceEntries(maintenanceEntries, statementVehicle, statementFromDate, statementToDate);
  }, [maintenanceEntries, statementVehicle, statementFromDate, statementToDate]);

  const statementStats = useMemo(() => {
    return calculateMaintenanceSummary(statementFilteredEntries);
  }, [statementFilteredEntries]);

  // Open Statement Modal for a vehicle
  const handleOpenStatement = (vehicleNumber: string) => {
    setStatementVehicle(vehicleNumber);
    setStatementFromDate('');
    setStatementToDate('');
    setActiveMenuId(null);
  };

  // Trigger print via hidden iframe for crisp A4 PDF generation
  const handlePrintStatement = () => {
    if (!statementVehicle) return;
    setIsPrinting(true);

    const printEl = document.getElementById('aus_maintenance_statement_print_root');
    if (!printEl) {
      setIsPrinting(false);
      return;
    }

    let printFrame = document.getElementById('aus_maintenance_print_frame') as HTMLIFrameElement | null;
    if (printFrame) {
      printFrame.remove();
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'aus_maintenance_print_frame';
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
    <title>Maintenance Statement - ${statementVehicle}</title>
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
      .category-tag {
        font-weight: 700;
        color: #1e3a8a;
      }
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
      {/* Top Header: Matching Vehicle, Driver, and Fuel Managers */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Repair & Maintenance</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Track vehicle servicing, spare parts replacement, workshop bills, and export maintenance statements
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

          {/* Add Repair Entry Button */}
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Repair Entry</span>
          </button>
        </div>
      </div>

      {/* Vehicles Maintenance Grid: 2-Column Responsive Cards matching VehicleManager & FuelManager */}
      {filteredVehicles.length === 0 ? (
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
          {filteredVehicles.map((vehicle) => {
            const vehicleEntries = maintenanceEntries
              .filter((e) => e.vehicleNumber === vehicle.registrationNumber)
              .sort((a, b) => {
                const parseD = (s: string) => {
                  const parts = s.split('-');
                  if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
                  return new Date(s).getTime() || 0;
                };
                return parseD(b.date) - parseD(a.date);
              });

            const stats = calculateMaintenanceSummary(vehicleEntries);
            const recentEntries = vehicleEntries.slice(0, 4);

            return (
              <div
                key={vehicle.id}
                className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between relative group"
              >
                {/* Top Section: Vehicle Number, Repair Cost, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Vehicle Number */}
                  <div className="space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Vehicle Number
                    </span>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
                          {vehicle.registrationNumber}
                        </h3>
                        <p className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {stats.serviceCount > 0 ? `Last: ${stats.lastServiceDate}` : 'No repairs logged'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Total Repair Cost Summary */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Total Repair Cost
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-2xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                        Rs.{Math.round(stats.totalCost).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="text-xs font-mono font-medium text-gray-500 dark:text-zinc-400">
                      {stats.serviceCount} {stats.serviceCount === 1 ? 'service job' : 'service jobs'}
                    </p>
                  </div>

                  {/* 3. 3-Dot Menu Options */}
                  <div className="relative maintenance-action-menu shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === vehicle.id ? null : vehicle.id);
                      }}
                      title="Maintenance Operations"
                      className="w-9 h-9 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-gray-100 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === vehicle.id && (
                      <div className="absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                        {/* Add Repair Entry Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenAddModal(vehicle.registrationNumber)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Plus className="w-4 h-4 text-blue-600" />
                          <span>Add Repair Entry</span>
                        </button>

                        {/* Generate Statement Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenStatement(vehicle.registrationNumber)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Printer className="w-4 h-4 text-indigo-600" />
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
                          <ExternalLink className="w-4 h-4 text-gray-500" />
                          <span>View All Repairs ({stats.serviceCount})</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Nested Table: Recent Maintenance Entries */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-zinc-300">
                      <ClipboardList className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Recent Repair & Service Jobs</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stats.serviceCount > 4 && (
                        <button
                          type="button"
                          onClick={() => setHistoryVehicle(vehicle.registrationNumber)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          View all ({stats.serviceCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(vehicle.registrationNumber)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200/80 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-100/70 dark:bg-zinc-800/60">
                          <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                          <th className="py-2.5 px-2.5 text-left font-semibold">Bill #</th>
                          <th className="py-2.5 px-3 text-left font-semibold">Repair Work Done</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Amount (Rs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                        {recentEntries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-3 px-3 text-center text-xs text-gray-400 dark:text-zinc-500 italic">
                              No repair entries recorded yet
                            </td>
                          </tr>
                        ) : (
                          recentEntries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-medium text-gray-800 dark:text-zinc-200 text-xs">
                                <div>{entry.date}</div>
                                {entry.workshopName && (
                                  <div className="text-[11px] text-gray-500 dark:text-zinc-400 font-sans truncate max-w-[120px]">
                                    {entry.workshopName}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-gray-600 dark:text-zinc-400 text-xs font-semibold">
                                {entry.billNumber || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-left">
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 mb-0.5">
                                  {entry.category}
                                </span>
                                {entry.description && (
                                  <div className="text-[11px] text-gray-600 dark:text-zinc-400 truncate max-w-[190px]">
                                    {entry.description}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">
                                Rs.{Math.round(entry.amount).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          ))
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
          ADD / EDIT MAINTENANCE ENTRY MODAL
      ========================================================================= */}
      {(isAddModalOpen || editingEntry) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    {editingEntry ? 'Edit Repair Entry' : 'Add New Repair Entry'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Record repair, spare parts, and servicing bills linked to vehicle
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingEntry(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Vehicle Selection */}
              <div>
                <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Service Date *
                  </label>
                  <CustomDatePicker
                    value={formDate}
                    onChange={(val) => setFormDate(val)}
                    placeholder="DD-MM-YYYY"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Bill / Job Slip Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. REP-8941"
                    value={formBillNumber}
                    onChange={(e) => setFormBillNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* Repair Category with Option to Add Custom */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200">
                    Repair / Service Category *
                  </label>
                  {!isAddingNewCategory ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewCategory(true);
                        setNewCategoryInput('');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Category</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCategory(false)}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {!isAddingNewCategory ? (
                  <div className="relative">
                    <select
                      value={formCategory}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsAddingNewCategory(true);
                          setNewCategoryInput('');
                        } else {
                          setFormCategory(e.target.value);
                        }
                      }}
                      className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                    >
                      {categoriesList.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__add_new__">+ Add New Service Category...</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter new service category name..."
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNewCategory();
                        }
                      }}
                      autoFocus
                      className="flex-1 px-3.5 py-2 rounded-xl border border-blue-400 dark:border-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                    <button
                      type="button"
                      onClick={handleSaveNewCategory}
                      disabled={!newCategoryInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      Save Category
                    </button>
                  </div>
                )}
              </div>

              {/* Manual Entry: Work Description & Spare Parts */}
              <div>
                <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                  Work Description / Spares Replaced (Manual Entry)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Replaced 2 front tyre tubes, oil filter, mobile grease, propeller shaft cross change"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-medium focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              {/* Workshop / Garage Selector with Add Option */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span>Workshop / Garage Name</span>
                  </label>
                  {!isAddingNewWorkshop ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewWorkshop(true);
                        setNewWorkshopInput('');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add New Workshop</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingNewWorkshop(false)}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {!isAddingNewWorkshop ? (
                  <div className="relative">
                    <select
                      value={formWorkshop}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsAddingNewWorkshop(true);
                          setNewWorkshopInput('');
                        } else {
                          setFormWorkshop(e.target.value);
                        }
                      }}
                      className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                    >
                      <option value="">Select Workshop (Optional)</option>
                      {workshopsList.map((ws) => (
                        <option key={ws} value={ws}>
                          {ws}
                        </option>
                      ))}
                      <option value="__add_new__">+ Add New Workshop...</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter garage / workshop name..."
                      value={newWorkshopInput}
                      onChange={(e) => setNewWorkshopInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNewWorkshop();
                        }
                      }}
                      autoFocus
                      className="flex-1 px-3.5 py-2 rounded-xl border border-blue-400 dark:border-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                    <button
                      type="button"
                      onClick={handleSaveNewWorkshop}
                      disabled={!newWorkshopInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      Save Workshop
                    </button>
                  </div>
                )}
              </div>

              {/* 2-Column: Price (Amount) & Odometer Reading */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Total Repair Cost (Rs) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-black focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Odometer KM (Optional)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 142500"
                    value={formOdometer}
                    onChange={(e) => setFormOdometer(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingEntry(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Add Repair Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW ALL REPAIR HISTORY MODAL FOR A VEHICLE
      ========================================================================= */}
      {historyVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full shadow-2xl p-6 relative my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    Repair & Maintenance History - {historyVehicle}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    All recorded servicing, spare parts, and workshop records
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Statement PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryVehicle(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Table of all entries for this vehicle */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100/80 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5">Date</th>
                    <th className="py-3 px-3.5">Bill #</th>
                    <th className="py-3 px-3.5">Service Category</th>
                    <th className="py-3 px-3.5">Description / Spares</th>
                    <th className="py-3 px-3.5">Workshop</th>
                    <th className="py-3 px-3.5 text-right">Odo KM</th>
                    <th className="py-3 px-3.5 text-right">Amount (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80">
                  {maintenanceEntries
                    .filter((e) => e.vehicleNumber === historyVehicle)
                    .map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                        <td className="py-3 px-3.5 font-mono font-medium text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          {entry.date}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-gray-700 dark:text-zinc-300 font-semibold whitespace-nowrap">
                          {entry.billNumber || '-'}
                        </td>
                        <td className="py-3 px-3.5 font-semibold text-blue-700 dark:text-blue-400">
                          {entry.category}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 dark:text-zinc-300 max-w-[200px]">
                          {entry.description || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 dark:text-zinc-300 whitespace-nowrap">
                          {entry.workshopName || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-gray-600 dark:text-zinc-400 whitespace-nowrap">
                          {entry.odometerKm ? `${entry.odometerKm.toLocaleString('en-IN')} KM` : '-'}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-black text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          Rs.{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenEditModal(entry);
                                setHistoryVehicle(null);
                              }}
                              className="p-1.5 rounded text-gray-500 hover:text-blue-600 cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingEntry(entry);
                                setHistoryVehicle(null);
                              }}
                              className="p-1.5 rounded text-gray-500 hover:text-red-600 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
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
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATEMENT (PDF) GENERATOR MODAL
      ========================================================================= */}
      {statementVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    Generate Maintenance Statement
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Export printable PDF maintenance report for {statementVehicle}
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
              {/* Quick Date Presets */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Preset:</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatementFromDate('');
                    setStatementToDate('');
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  All Dates
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const firstDay = `01-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                    setStatementFromDate(firstDay);
                    setStatementToDate(getTodayDDMMYYYY());
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const lastMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                    const lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
                    const fromStr = `01-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-${lastMonthDate.getFullYear()}`;
                    const toStr = `${String(lastMonthEnd.getDate()).padStart(2, '0')}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${lastMonthEnd.getFullYear()}`;
                    setStatementFromDate(fromStr);
                    setStatementToDate(toStr);
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  Last Month
                </button>
              </div>

              {/* Custom Date Range Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    From Date
                  </label>
                  <CustomDatePicker
                    value={statementFromDate}
                    onChange={(val) => setStatementFromDate(val)}
                    placeholder="All dates"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    To Date
                  </label>
                  <CustomDatePicker
                    value={statementToDate}
                    onChange={(val) => setStatementToDate(val)}
                    placeholder="Today"
                  />
                </div>
              </div>

              {/* Summary of Matching Entries */}
              <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Total Repair Jobs:</span>
                  <span className="font-bold text-gray-900 dark:text-zinc-100">{statementStats.serviceCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Total Repair Expenditure:</span>
                  <span className="font-mono font-black text-indigo-700 dark:text-indigo-400 text-sm">
                    Rs.{statementStats.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  disabled={statementStats.serviceCount === 0 || isPrinting}
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
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
      {deletingEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-center justify-center text-red-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Delete Repair Entry?
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 text-xs space-y-1">
              <div><strong className="text-gray-700 dark:text-zinc-300">Vehicle:</strong> {deletingEntry.vehicleNumber}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Date:</strong> {deletingEntry.date}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Category:</strong> {deletingEntry.category}</div>
              {deletingEntry.description && <div><strong className="text-gray-700 dark:text-zinc-300">Details:</strong> {deletingEntry.description}</div>}
              <div><strong className="text-gray-700 dark:text-zinc-300">Total:</strong> Rs.{deletingEntry.amount.toLocaleString('en-IN')}</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          HIDDEN PRINT CONTAINER FOR CRISP A4 PDF GENERATION
      ========================================================================= */}
      <div style={{ display: 'none' }}>
        <div id="aus_maintenance_statement_print_root" className="statement-container">
          <div className="header-title">
            <div className="company-name">AUS TRANSPORT</div>
            <div className="report-title">VEHICLE REPAIR & MAINTENANCE STATEMENT</div>
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
                <th className="text-center" style={{ width: '5%' }}>S.No</th>
                <th className="text-center" style={{ width: '13%' }}>Date</th>
                <th style={{ width: '13%' }}>Bill #</th>
                <th style={{ width: '17%' }}>Workshop</th>
                <th style={{ width: '22%' }}>Service Category</th>
                <th style={{ width: '16%' }}>Details / Spares</th>
                <th className="text-right" style={{ width: '14%' }}>Amount (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {statementFilteredEntries.map((entry, idx) => (
                <tr key={entry.id}>
                  <td className="text-center font-mono">{idx + 1}</td>
                  <td className="text-center font-mono font-bold">{entry.date}</td>
                  <td className="font-mono">{entry.billNumber || '-'}</td>
                  <td>{entry.workshopName || '-'}</td>
                  <td className="category-tag font-bold">{entry.category}</td>
                  <td>{entry.description || '-'}</td>
                  <td className="text-right font-mono font-bold">
                    {entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={6} className="font-bold text-right" style={{ textTransform: 'uppercase' }}>
                  Grand Total
                </td>
                <td className="text-right font-mono font-bold">
                  Rs.{statementStats.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="summary-box">
            <span><strong>Amount in Words: </strong></span>
            <span className="words-text">{numberToWords(statementStats.totalCost)}</span>
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
