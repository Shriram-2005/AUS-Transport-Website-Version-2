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
  ChevronDown,
  Building2,
  GripVertical,
  ArrowUpDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Gauge,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  FuelEntry,
  getStoredFuelEntries,
  saveStoredFuelEntries,
  addStoredFuelEntry,
  updateStoredFuelEntry,
  deleteStoredFuelEntry,
  getStoredBunkNames,
  saveStoredBunkNames,
  addStoredBunkName,
  filterFuelEntries,
  calculateFuelSummary,
  calculateVehicleMileageStats,
  numberToWords,
  parseDateToTimestamp,
  FUEL_ENTRIES_CHANGE_EVENT,
  FUEL_BUNKS_CHANGE_EVENT
} from '@/lib/fuel';
import { BillData, getStoredInvoices, INVOICES_CHANGE_EVENT } from '@/lib/invoices';
import { Vehicle, getStoredVehicles, VEHICLES_CHANGE_EVENT } from '@/lib/vehicles';
import { CustomDatePicker } from './CustomDatePicker';
import { KpiDashboardBar } from './KpiDashboardBar';
import { KpiCardDefinition } from '@/lib/kpiManager';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';
import {
  applyCardOrder,
  saveStoredCardOrder,
  resetStoredCardOrder,
  moveItemInArray,
  getStoredCardOrder,
  CARD_ORDER_CHANGE_EVENT,
} from '@/lib/cardOrder';

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
  const [bills, setBills] = useState<BillData[]>([]);
  const [bunkList, setBunkList] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Mileage table period filters
  const [mileagePeriod, setMileagePeriod] = useState<'all' | 'month' | '3months' | 'custom'>('all');
  const [mileageFromDate, setMileageFromDate] = useState<string>('');
  const [mileageToDate, setMileageToDate] = useState<string>('');

  // Card reordering state
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [cardOrderVersion, setCardOrderVersion] = useState(0);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FuelEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<FuelEntry | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<string | null>(null);
  const [statementVehicle, setStatementVehicle] = useState<string | null>(null);

  // Dynamic floating 3-dot action menu for entries
  interface FuelMenuPosition {
    top: number;
    left: number;
    openUpward: boolean;
    entry: FuelEntry;
  }
  const [activeEntryMenu, setActiveEntryMenu] = useState<FuelMenuPosition | null>(null);

  // Auto-dismiss floating menu on window resize or container scroll
  useEffect(() => {
    if (!activeEntryMenu) return;
    const handleDismiss = () => setActiveEntryMenu(null);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [activeEntryMenu]);

  // Form states
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formDate, setFormDate] = useState<string>(getTodayDDMMYYYY());
  const [formBillNumber, setFormBillNumber] = useState('');
  const [formParticulars, setFormParticulars] = useState<'Diesel' | 'Petrol'>('Diesel');
  const [formLiters, setFormLiters] = useState<string>('');
  const [formRate, setFormRate] = useState<string>(''); // No pre-existing price by default
  const [formTotal, setFormTotal] = useState<string>('');
  const [isManualTotal, setIsManualTotal] = useState(false);
  const [formBunkName, setFormBunkName] = useState('');
  const [isAddingNewBunk, setIsAddingNewBunk] = useState(false);
  const [newBunkInput, setNewBunkInput] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Statement PDF generation states
  const [statementFromDate, setStatementFromDate] = useState<string>('');
  const [statementToDate, setStatementToDate] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Load vehicles, fuel entries, invoices, and bunks on mount
  useEffect(() => {
    setVehicles(getStoredVehicles());
    setFuelEntries(getStoredFuelEntries());
    setBills(getStoredInvoices());
    setBunkList(getStoredBunkNames());

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

    const handleInvoicesUpdate = (e: CustomEvent<BillData[]>) => {
      if (e.detail) {
        setBills(e.detail);
      } else {
        setBills(getStoredInvoices());
      }
    };

    const handleBunksUpdate = (e: CustomEvent<string[]>) => {
      if (e.detail) {
        setBunkList(e.detail);
      } else {
        setBunkList(getStoredBunkNames());
      }
    };

    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    window.addEventListener(FUEL_ENTRIES_CHANGE_EVENT as any, handleFuelUpdate);
    window.addEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);
    window.addEventListener(FUEL_BUNKS_CHANGE_EVENT as any, handleBunksUpdate);

    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
      window.removeEventListener(FUEL_ENTRIES_CHANGE_EVENT as any, handleFuelUpdate);
      window.removeEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);
      window.removeEventListener(FUEL_BUNKS_CHANGE_EVENT as any, handleBunksUpdate);
    };
  }, []);

  // Sync latest from Supabase (both fuel_entries and master fuel_bunks)
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

      // 2. Sync master bunks
      try {
        const { data: bData } = await supabase
          .from('fuel_bunks')
          .select('name')
          .order('name', { ascending: true });

        if (bData && bData.length > 0) {
          const remoteBunks = bData.map((b: any) => String(b.name).trim()).filter(Boolean);
          const merged = Array.from(new Set([...getStoredBunkNames(), ...remoteBunks]));
          setBunkList(merged);
          saveStoredBunkNames(merged);
        }
      } catch (bErr) {
        console.warn('Could not sync fuel_bunks from Supabase:', bErr);
      }

      // 3. Sync fuel entries
      const { data: fData, error: fErr } = await supabase
        .from('fuel_entries')
        .select('*')
        .order('entry_date', { ascending: false });

      if (!fErr && fData && fData.length > 0) {
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

        // Merge any bunks present in entries
        const entryBunks = loaded
          .map((e) => (e.bunkName || '').trim())
          .filter((b): b is string => Boolean(b));
        if (entryBunks.length > 0) {
          const mergedBunks = Array.from(new Set([...getStoredBunkNames(), ...entryBunks]));
          setBunkList(mergedBunks);
          saveStoredBunkNames(mergedBunks);
        }
      } else if (!fErr && fData && fData.length === 0) {
        // If Supabase table is newly created, push any existing local entries up
        const local = getStoredFuelEntries();
        if (local.length > 0) {
          for (const item of local) {
            await supabase.from('fuel_entries').insert([{
              id: item.id,
              vehicle_number: item.vehicleNumber,
              entry_date: item.date,
              bill_number: item.billNumber,
              fuel_type: item.particulars,
              liters: item.liters,
              rate_per_liter: item.ratePerLiter,
              total_amount: item.totalAmount,
              bunk_name: item.bunkName || '',
            }]);
          }
        }
      }
      // 4. Sync invoices for mileage calculation
      try {
        const { data: iData, error: iErr } = await supabase.from('invoices').select('*');
        if (!iErr && iData) {
          setBills(
            iData.map((item: any) => {
              if (item.raw_data && item.raw_data.trips) {
                return {
                  ...item.raw_data,
                  id: item.id,
                  billNumber: item.bill_number,
                  date: item.bill_date,
                  vehicleNumber: item.vehicle_number,
                  status: item.payment_status || item.raw_data.status || 'unpaid',
                };
              }
              return {
                id: item.id,
                billNumber: item.bill_number,
                date: item.bill_date,
                vehicleNumber: item.vehicle_number,
                activeTrip: 1,
                visibleTrips: 1,
                trips: item.trips || [],
                keralaRtoEnabled: false,
                keralaRtoMultiplier: 0,
                keralaRtoAmount: 0,
                dieselAvgRate: 0,
                rupeesInWordsMode: 'auto',
                rupeesInWordsText: '',
                status: 'unpaid',
              };
            })
          );
        }
      } catch (iSyncErr) {
        console.warn('Could not sync invoices for mileage calculation:', iSyncErr);
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
    const handleModuleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'fuel' || e.detail.module === 'all') {
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
      if (!target.closest('.fuel-action-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Listen for card order changes from other components or tabs
  useEffect(() => {
    const handleOrderChange = (e: any) => {
      if (!e.detail || e.detail.category === 'fuel') {
        setCardOrderVersion((v) => v + 1);
      }
    };
    window.addEventListener(CARD_ORDER_CHANGE_EVENT as any, handleOrderChange);
    return () => window.removeEventListener(CARD_ORDER_CHANGE_EVENT as any, handleOrderChange);
  }, []);

  // Reorder card handlers
  const handleMoveCard = (vehicleReg: string, direction: 'up' | 'down') => {
    const currentOrdered = applyCardOrder(vehicles, (v) => v.registrationNumber, 'fuel');
    const index = currentOrdered.findIndex(
      (v) => v.registrationNumber.toLowerCase() === vehicleReg.toLowerCase()
    );
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrdered.length) return;

    const reordered = moveItemInArray(currentOrdered, index, targetIndex);
    const newOrder = reordered.map((v) => v.registrationNumber);
    saveStoredCardOrder('fuel', newOrder);
    setCardOrderVersion((v) => v + 1);
  };

  const handleReorderCards = (sourceReg: string, targetReg: string) => {
    const currentOrdered = applyCardOrder(vehicles, (v) => v.registrationNumber, 'fuel');
    const fromIndex = currentOrdered.findIndex(
      (v) => v.registrationNumber.toLowerCase() === sourceReg.toLowerCase()
    );
    const toIndex = currentOrdered.findIndex(
      (v) => v.registrationNumber.toLowerCase() === targetReg.toLowerCase()
    );
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const reordered = moveItemInArray(currentOrdered, fromIndex, toIndex);
    const newOrder = reordered.map((v) => v.registrationNumber);
    saveStoredCardOrder('fuel', newOrder);
    setCardOrderVersion((v) => v + 1);
  };

  const handleResetCardOrder = () => {
    resetStoredCardOrder('fuel');
    setCardOrderVersion((v) => v + 1);
  };

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

  // Filter vehicles by search query and apply custom card order
  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = !q ? vehicles : vehicles.filter((v) => v.registrationNumber.toLowerCase().includes(q));
    return applyCardOrder(list, (v) => v.registrationNumber, 'fuel');
  }, [vehicles, searchQuery, cardOrderVersion]);

  // Apply period preset for Mileage table
  const applyMileagePeriod = useCallback((period: 'all' | 'month' | '3months' | 'custom') => {
    setMileagePeriod(period);
    const today = new Date();
    const formatDDMMYYYY = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const todayStr = formatDDMMYYYY(today);

    if (period === 'all') {
      setMileageFromDate('');
      setMileageToDate('');
    } else if (period === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setMileageFromDate(formatDDMMYYYY(startOfMonth));
      setMileageToDate(todayStr);
    } else if (period === '3months') {
      const past = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      setMileageFromDate(formatDDMMYYYY(past));
      setMileageToDate(todayStr);
    }
  }, []);

  // Compute mileage stats per available vehicle
  const mileageStats = useMemo(() => {
    return calculateVehicleMileageStats(
      filteredVehicles,
      bills,
      fuelEntries,
      mileageFromDate,
      mileageToDate
    );
  }, [filteredVehicles, bills, fuelEntries, mileageFromDate, mileageToDate]);

  const mileageTotals = useMemo(() => {
    let totalKm = 0;
    let totalLiters = 0;
    let totalFuelCost = 0;
    let totalTrips = 0;
    let totalFuelReceipts = 0;

    for (const s of mileageStats) {
      totalKm += s.totalKm;
      totalLiters += s.totalLiters;
      totalFuelCost += s.totalFuelCost;
      totalTrips += s.tripCount;
      totalFuelReceipts += s.fuelEntriesCount;
    }

    const avgMileage = totalKm > 0 && totalLiters > 0 ? Math.round((totalKm / totalLiters) * 100) / 100 : 0;
    const avgCostPerKm = totalKm > 0 && totalFuelCost > 0 ? Math.round((totalFuelCost / totalKm) * 100) / 100 : 0;

    return {
      totalKm,
      totalLiters: Math.round(totalLiters * 100) / 100,
      totalFuelCost: Math.round(totalFuelCost * 100) / 100,
      totalTrips,
      totalFuelReceipts,
      avgMileage,
      avgCostPerKm,
    };
  }, [mileageStats]);

  // Open Add Fuel Entry modal (optionally preselecting a vehicle)
  // Ensures Price Per Liter starts completely blank with no pre-existing rate
  const handleOpenAddModal = (vehicleNumber?: string) => {
    const defaultVeh = vehicleNumber || (vehicles.length > 0 ? vehicles[0].registrationNumber : '');
    setFormVehicleNumber(defaultVeh);
    setFormDate(getTodayDDMMYYYY());
    setFormBillNumber('');
    setFormParticulars('Diesel');
    setFormLiters('');
    setFormRate(''); // Strictly empty: no pre-existing rate
    setFormTotal('');
    setIsManualTotal(false);
    setFormBunkName('');
    setIsAddingNewBunk(false);
    setNewBunkInput('');
    setFormError('');
    setIsAddModalOpen(true);
    setActiveMenuId(null);
  };

  // Toggle 3-dot entry menu with dynamic viewport space detection
  const handleToggleEntryMenu = (e: React.MouseEvent<HTMLButtonElement>, entry: FuelEntry) => {
    e.stopPropagation();
    if (activeEntryMenu && activeEntryMenu.entry.id === entry.id) {
      setActiveEntryMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 90;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    let top = openUpward ? rect.top - menuHeight - 4 : rect.bottom + 4;
    if (top < 10) top = 10;
    if (top + menuHeight > window.innerHeight - 10) {
      top = window.innerHeight - menuHeight - 10;
    }

    let left = rect.right - menuWidth;
    if (left < 10) {
      left = Math.max(10, rect.left);
    }
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }

    setActiveEntryMenu({
      top,
      left,
      openUpward,
      entry,
    });
  };

  // Open Edit Fuel Entry modal
  const handleOpenEditModal = (entry: FuelEntry) => {
    setEditingEntry(entry);
    setFormVehicleNumber(entry.vehicleNumber);
    setFormDate(entry.date);
    setFormBillNumber(entry.billNumber);
    setFormParticulars(entry.particulars);
    setFormLiters(entry.liters > 0 ? String(entry.liters) : '');
    setFormRate(entry.ratePerLiter > 0 ? String(entry.ratePerLiter) : '');
    setFormTotal(entry.totalAmount > 0 ? String(entry.totalAmount) : '');
    setIsManualTotal(false);
    setFormBunkName(entry.bunkName || '');
    setIsAddingNewBunk(false);
    setNewBunkInput('');
    setFormError('');
    setActiveMenuId(null);
  };

  // Save a newly added bunk station into master list and Supabase
  const handleSaveNewBunk = async () => {
    const clean = newBunkInput.trim();
    if (!clean) return;

    const updated = addStoredBunkName(clean);
    setBunkList(updated);
    setFormBunkName(clean);
    setIsAddingNewBunk(false);
    setNewBunkInput('');

    try {
      const supabase = createClient();
      await supabase.from('fuel_bunks').upsert({ name: clean }, { onConflict: 'name' });
    } catch (err) {
      console.warn('Could not save new bunk to Supabase:', err);
    }
  };

  // Submit Fuel Entry Form (Add or Edit) with Supabase sync
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

    const cleanBunk = formBunkName.trim();

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
          bunkName: cleanBunk,
        });

        const { error: updateErr } = await supabase
          .from('fuel_entries')
          .update({
            vehicle_number: cleanVehicle,
            entry_date: formDate.trim(),
            bill_number: formBillNumber.trim(),
            fuel_type: formParticulars,
            liters: litersNum,
            rate_per_liter: rateNum,
            total_amount: totalNum,
            bunk_name: cleanBunk,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEntry.id);

        if (updateErr) {
          console.warn('Supabase fuel_entries update error:', updateErr.message);
        }

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
          bunkName: cleanBunk,
        });

        const { error: insertErr } = await supabase
          .from('fuel_entries')
          .insert([{
            id: created.id,
            vehicle_number: cleanVehicle,
            entry_date: formDate.trim(),
            bill_number: formBillNumber.trim(),
            fuel_type: formParticulars,
            liters: litersNum,
            rate_per_liter: rateNum,
            total_amount: totalNum,
            bunk_name: cleanBunk,
          }]);

        if (insertErr) {
          console.warn('Supabase fuel_entries insert error:', insertErr.message);
        }

        setIsAddModalOpen(false);
      }

      // If a new bunk name was typed directly, save to master bunks
      if (cleanBunk) {
        const updatedBunks = addStoredBunkName(cleanBunk);
        setBunkList(updatedBunks);
        try {
          await supabase.from('fuel_bunks').upsert({ name: cleanBunk }, { onConflict: 'name' });
        } catch {
          // ignore duplicate
        }
      }
    } catch (err) {
      console.error('Error saving fuel entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete fuel entry with Supabase sync
  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    const targetId = deletingEntry.id;

    deleteStoredFuelEntry(targetId);
    setFuelEntries((prev) => prev.filter((e) => e.id !== targetId));
    setDeletingEntry(null);

    try {
      const supabase = createClient();
      const { error: deleteErr } = await supabase.from('fuel_entries').delete().eq('id', targetId);
      if (deleteErr) {
        console.warn('Supabase fuel_entries delete error:', deleteErr.message);
      }
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

    const printEl = document.getElementById('aus_fuel_statement_print_root');
    if (!printEl) {
      setIsPrinting(false);
      return;
    }

    let printFrame = document.getElementById('aus_fuel_print_frame') as HTMLIFrameElement | null;
    if (printFrame) {
      printFrame.remove();
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

  // Pure Database KPI Cards for Fuel Management
  const fuelCards = useMemo<KpiCardDefinition[]>(() => {
    const summary = calculateFuelSummary(fuelEntries);
    const uniqueVehiclesFueled = new Set(fuelEntries.map((e) => e.vehicleNumber).filter(Boolean)).size;

    let thisMonthAmount = 0;
    let thisMonthLiters = 0;
    let dieselLiters = 0;
    let dieselAmount = 0;
    const vehicleSpendMap: Record<string, number> = {};

    const now = new Date();
    const currentMonthNum = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = String(now.getFullYear());
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthName = `${monthNames[now.getMonth()]} ${currentYear}`;

    fuelEntries.forEach((e) => {
      const amount = Number(e.totalAmount) || 0;
      const liters = Number(e.liters) || 0;

      if (e.particulars === 'Diesel') {
        dieselLiters += liters;
        dieselAmount += amount;
      }

      if (e.vehicleNumber) {
        const vReg = e.vehicleNumber.trim().toUpperCase();
        vehicleSpendMap[vReg] = (vehicleSpendMap[vReg] || 0) + amount;
      }

      if (e.date) {
        const parts = e.date.split('-');
        if (parts.length === 3) {
          const isMatch =
            (parts[1] === currentMonthNum && parts[2] === currentYear) ||
            (parts[0] === currentYear && parts[1] === currentMonthNum);
          if (isMatch) {
            thisMonthAmount += amount;
            thisMonthLiters += liters;
          }
        }
      }
    });

    let topVehicleFuelReg = '';
    let topVehicleFuelSpend = 0;
    Object.entries(vehicleSpendMap).forEach(([reg, spend]) => {
      if (spend > topVehicleFuelSpend) {
        topVehicleFuelSpend = spend;
        topVehicleFuelReg = reg;
      }
    });

    return [
      {
        key: 'total_fuel_expense',
        title: 'Total Fuel Expense',
        value: `Rs.${Math.round(summary.totalAmount).toLocaleString('en-IN')}`,
        subtitle: `Across ${summary.entryCount} logged fuel receipts`,
        icon: 'fuel',
        color: 'amber',
        description: 'Total spend across all fuel receipts',
      },
      {
        key: 'total_liters',
        title: 'Fuel Dispensed',
        value: `${summary.totalLiters.toFixed(2)} L`,
        subtitle: `Supplied to ${uniqueVehiclesFueled} fleet vehicles`,
        icon: 'droplets',
        color: 'blue',
        description: 'Total volume of fuel filled across all vehicles',
      },
      {
        key: 'avg_fuel_rate',
        title: 'Avg Fuel Rate',
        value: `Rs.${summary.averageRate.toFixed(2)} / L`,
        subtitle: 'Weighted fleet average rate',
        icon: 'percent',
        color: 'emerald',
        description: 'Overall weighted average fuel price per liter',
      },
      {
        key: 'this_month_fuel',
        title: 'This Month Fuel',
        value: `Rs.${Math.round(thisMonthAmount).toLocaleString('en-IN')}`,
        subtitle: `${thisMonthLiters.toFixed(2)} L in ${currentMonthName}`,
        icon: 'calendar',
        color: 'purple',
        description: 'Fuel expenditure logged in current calendar month',
      },
      {
        key: 'receipt_count',
        title: 'Total Fuel Receipts',
        value: `${summary.entryCount} Receipts`,
        subtitle: 'Logged across all bunks',
        icon: 'receipt',
        color: 'indigo',
        description: 'Total number of individual fuel fill slips',
      },
      {
        key: 'vehicles_fueled',
        title: 'Vehicles Fueled',
        value: `${uniqueVehiclesFueled} Vehicles`,
        subtitle: 'Active fleet units with fuel bills',
        icon: 'truck',
        color: 'cyan',
        description: 'Distinct fleet vehicles with fuel records',
      },
      {
        key: 'diesel_liters',
        title: 'Diesel Volume',
        value: `${dieselLiters.toFixed(2)} L`,
        subtitle: `Rs.${Math.round(dieselAmount).toLocaleString('en-IN')} spend`,
        icon: 'fuel',
        color: 'rose',
        description: 'Total diesel volume consumed across fleet',
      },
      {
        key: 'top_fuel_vehicle',
        title: 'Top Fuel Consumer',
        value: topVehicleFuelReg || 'None',
        subtitle: topVehicleFuelSpend > 0 ? `Rs.${Math.round(topVehicleFuelSpend).toLocaleString('en-IN')} spend` : 'No fuel entries',
        icon: 'award',
        color: 'slate',
        description: 'Vehicle with highest cumulative fuel expense',
      },
    ];
  }, [fuelEntries]);

  const defaultFuelKeys = ['total_fuel_expense', 'total_liters', 'avg_fuel_rate', 'this_month_fuel'];

  return (
    <div className="space-y-6">
      {/* Top Header: Matching VehicleManager & DriverManager with clear prominent font sizing */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Fuel className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <span>Fuel Management</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Log bunk bills, track diesel and petrol consumption per vehicle, and export custom date-range statements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Reorder Cards Toggle Button */}
          <button
            type="button"
            onClick={() => setIsReorderMode((prev) => !prev)}
            title="Toggle card reordering"
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              isReorderMode
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-xs'
                : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <ArrowUpDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{isReorderMode ? 'Done Reordering' : 'Reorder Cards'}</span>
          </button>

          {/* Reset Order Button */}
          {getStoredCardOrder('fuel').length > 0 && (
            <button
              type="button"
              onClick={handleResetCardOrder}
              title="Reset to default registration order"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-950/40 border border-transparent transition-all cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {/* Search Box */}
          <div className="relative w-48 sm:w-60">
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vehicle number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 text-xs sm:text-sm font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
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

          {/* Add Fuel Entry Button */}
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Fuel Entry</span>
          </button>
        </div>
      </div>

      {/* Pure Database-Backed Dynamic KPI Dashboard Bar */}
      <KpiDashboardBar
        category="fuel"
        availableCards={fuelCards}
        defaultKeys={defaultFuelKeys}
      />

      {/* Reordering Instructions Banner */}
      {isReorderMode && (
        <div className="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300 text-xs flex items-center justify-between animate-in fade-in duration-100">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4" />
            <span>Reorder Mode: Drag cards or use the arrow buttons to arrange vehicles in your preferred order.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsReorderMode(false)}
            className="font-bold underline hover:no-underline cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {/* Vehicles Fuel Grid: 2-Column Responsive Cards matching VehicleManager & DriverManager */}
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
          {filteredVehicles.map((vehicle, index) => {
            const vehicleEntries = fuelEntries
              .filter((e) => e.vehicleNumber === vehicle.registrationNumber)
              .sort((a, b) => {
                const diff = parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date);
                if (diff !== 0) return diff;
                return (parseDateToTimestamp(b.createdAt) || 0) - (parseDateToTimestamp(a.createdAt) || 0);
              });

            const stats = calculateFuelSummary(vehicleEntries);
            const recentEntries = vehicleEntries.slice(0, 4);

            return (
              <div
                key={vehicle.id}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', vehicle.registrationNumber);
                  setDraggedCardId(vehicle.registrationNumber);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedCardId && draggedCardId !== vehicle.registrationNumber) {
                    setDragOverCardId(vehicle.registrationNumber);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverCardId === vehicle.registrationNumber) {
                    setDragOverCardId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData('text/plain') || draggedCardId;
                  const targetId = vehicle.registrationNumber;
                  if (sourceId && targetId && sourceId !== targetId) {
                    handleReorderCards(sourceId, targetId);
                  }
                  setDraggedCardId(null);
                  setDragOverCardId(null);
                }}
                className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between relative group ${
                  draggedCardId === vehicle.registrationNumber
                    ? 'opacity-40 border-blue-400 scale-[0.99]'
                    : dragOverCardId === vehicle.registrationNumber
                    ? 'border-blue-500 ring-2 ring-blue-500/40 scale-[1.01]'
                    : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Top Section: Vehicle Number, Fuel Cost, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Vehicle Number */}
                  <div className="space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Vehicle Number
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 shrink-0" title="Drag to reorder card">
                        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 dark:text-zinc-600 dark:group-hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0" />
                        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                          <Truck className="w-5 h-5" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
                          {vehicle.registrationNumber}
                        </h3>
                        <p className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400">
                          {stats.totalLiters > 0 ? `Avg: Rs.${stats.averageRate.toFixed(2)} / L` : 'No fuel logged'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Total Fuel Cost Summary */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Total Fuel Cost
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-2xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                        Rs.{Math.round(stats.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="text-xs font-mono font-medium text-gray-500 dark:text-zinc-400">
                      {stats.totalLiters.toFixed(2)} L ({stats.entryCount} {stats.entryCount === 1 ? 'bill' : 'bills'})
                    </p>
                  </div>

                  {/* 3. Action Menu & Quick Reorder Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isReorderMode && (
                      <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl border border-gray-200 dark:border-zinc-700">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCard(vehicle.registrationNumber, 'up');
                          }}
                          title="Move earlier (left / up)"
                          className="p-1 rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-zinc-400 px-1">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          disabled={index === filteredVehicles.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCard(vehicle.registrationNumber, 'down');
                          }}
                          title="Move later (right / down)"
                          className="p-1 rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

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
                        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                          {/* Add Fuel Entry Option */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddModal(vehicle.registrationNumber)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                          >
                            <Plus className="w-4 h-4 text-blue-600" />
                            <span>Add Fuel Entry</span>
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
                            <span>View All Bunk Bills ({stats.entryCount})</span>
                          </button>

                          {/* Reorder Card Position */}
                          <div className="pt-1 mt-1 border-t border-gray-100 dark:border-zinc-800">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveCard(vehicle.registrationNumber, 'up');
                                setActiveMenuId(null);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="w-4 h-4 text-blue-600" />
                              <span>Move Earlier (Left / Up)</span>
                            </button>
                            <button
                              type="button"
                              disabled={index === filteredVehicles.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveCard(vehicle.registrationNumber, 'down');
                                setActiveMenuId(null);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="w-4 h-4 text-blue-600" />
                              <span>Move Later (Right / Down)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Nested Table: Recent Fuel Entries */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-zinc-300">
                      <Droplets className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Recent Bunk Receipts</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stats.entryCount > 4 && (
                        <button
                          type="button"
                          onClick={() => setHistoryVehicle(vehicle.registrationNumber)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          View all ({stats.entryCount})
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
                          <th className="py-2.5 px-2.5 text-center font-semibold">Fuel</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Liters</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Total (Rs)</th>
                          <th className="py-2.5 px-2 text-center font-semibold w-10">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                        {recentEntries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-3 px-3 text-center text-xs text-gray-400 dark:text-zinc-500 italic">
                              No fuel entries recorded yet
                            </td>
                          </tr>
                        ) : (
                          recentEntries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-amber-50/20 dark:hover:bg-amber-950/10 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-medium text-gray-800 dark:text-zinc-200 text-xs">
                                <div>{entry.date}</div>
                                {entry.bunkName && (
                                  <div className="text-[11px] text-gray-500 dark:text-zinc-400 font-sans truncate max-w-[120px]">
                                    {entry.bunkName}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-gray-600 dark:text-zinc-400 text-xs font-semibold">
                                {entry.billNumber || '-'}
                              </td>
                              <td className="py-2.5 px-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                    entry.particulars === 'Diesel'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                  }`}
                                >
                                  {entry.particulars}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium text-gray-700 dark:text-zinc-300 text-xs">
                                {entry.liters.toFixed(2)} L
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">
                                Rs.{Math.round(entry.totalAmount).toLocaleString('en-IN')}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleEntryMenu(e, entry)}
                                  title="Fuel Entry Options"
                                  className={`p-1 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center ${
                                    activeEntryMenu?.entry.id === entry.id
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-200/70 dark:hover:bg-zinc-700/60'
                                  }`}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
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
          SEPARATE VEHICLE MILEAGE & FUEL EFFICIENCY TABLE
      ========================================================================= */}
      {filteredVehicles.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight">
                  Vehicle Mileage &amp; Fuel Efficiency
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Calculated from invoice trip kilometers divided by fuel consumed (KM/L) for available vehicles
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'all', label: 'All Time' },
                { id: 'month', label: 'This Month' },
                { id: '3months', label: '3 Months' },
                { id: 'custom', label: 'Custom Range' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyMileagePeriod(p.id as 'all' | 'month' | '3months' | 'custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    mileagePeriod === p.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {mileagePeriod === 'custom' && (
            <div className="px-4 sm:px-5 py-3 bg-gray-50/70 dark:bg-zinc-800/30 border-b border-gray-200 dark:border-zinc-800 flex flex-wrap items-center gap-3">
              <div className="w-44">
                <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">From Date</label>
                <CustomDatePicker value={mileageFromDate} onChange={(val) => setMileageFromDate(val)} placeholder="Start Date" />
              </div>
              <div className="w-44">
                <label className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 mb-1 block">To Date</label>
                <CustomDatePicker value={mileageToDate} onChange={(val) => setMileageToDate(val)} placeholder="End Date" />
              </div>
              {(mileageFromDate || mileageToDate) && (
                <button
                  type="button"
                  onClick={() => applyMileagePeriod('all')}
                  className="mt-4 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-50/80 dark:bg-zinc-800/60">
                  <th className="py-3 px-4 text-left">Vehicle</th>
                  <th className="py-3 px-3 text-center">Trips</th>
                  <th className="py-3 px-3 text-right">Total KM Ran</th>
                  <th className="py-3 px-3 text-right">Fuel Consumed</th>
                  <th className="py-3 px-3 text-right">Total Fuel Cost</th>
                  <th className="py-3 px-3 text-right">Mileage (KM/L)</th>
                  <th className="py-3 px-4 text-right">Cost / KM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {mileageStats.map((stat) => (
                  <tr
                    key={stat.vehicleNumber}
                    className="hover:bg-gray-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs sm:text-sm">
                            {stat.vehicleNumber}
                          </div>
                          {stat.model && (
                            <div className="text-[11px] text-gray-500 dark:text-zinc-400">
                              {stat.model}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-gray-700 dark:text-zinc-300">
                      {stat.tripCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                      {stat.totalKm.toLocaleString('en-IN')} KM
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gray-700 dark:text-zinc-300 whitespace-nowrap">
                      <div>{stat.totalLiters.toFixed(2)} L</div>
                      <div className="text-[10px] text-gray-400 dark:text-zinc-500">
                        {stat.fuelEntriesCount} {stat.fuelEntriesCount === 1 ? 'receipt' : 'receipts'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                      Rs.{Math.round(stat.totalFuelCost).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {stat.mileageKmPerLiter > 0 ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs ${
                            stat.mileageKmPerLiter >= 4
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60'
                          }`}
                        >
                          {stat.mileageKmPerLiter.toFixed(2)} KM/L
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-zinc-500 italic">
                          {stat.totalKm === 0 && stat.totalLiters === 0
                            ? 'No data'
                            : stat.totalKm === 0
                            ? 'No KM data'
                            : 'No fuel data'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-700 dark:text-zinc-300 whitespace-nowrap">
                      {stat.costPerKm > 0 ? `Rs.${stat.costPerKm.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/70 font-bold text-xs">
                  <td className="py-3 px-4 text-gray-900 dark:text-zinc-100 uppercase tracking-wider">
                    Fleet Summary ({mileageStats.length} {mileageStats.length === 1 ? 'Vehicle' : 'Vehicles'})
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-gray-900 dark:text-zinc-100">
                    {mileageTotals.totalTrips}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                    {mileageTotals.totalKm.toLocaleString('en-IN')} KM
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                    {mileageTotals.totalLiters.toFixed(2)} L
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                    Rs.{Math.round(mileageTotals.totalFuelCost).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    {mileageTotals.avgMileage > 0 ? `${mileageTotals.avgMileage.toFixed(2)} KM/L` : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                    {mileageTotals.avgCostPerKm > 0 ? `Rs.${mileageTotals.avgCostPerKm.toFixed(2)}` : '-'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          ADD / EDIT FUEL ENTRY MODAL
      ========================================================================= */}
      {(isAddModalOpen || editingEntry) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    {editingEntry ? 'Edit Fuel Entry' : 'Add New Fuel Entry'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Record fuel bunk receipt linked to vehicle
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
                    Date *
                  </label>
                  <CustomDatePicker
                    value={formDate}
                    onChange={(val) => setFormDate(val)}
                    placeholder="DD-MM-YYYY"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
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

              {/* 3-Column: Particulars, Liters, Price per Liter */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
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
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Total Liters *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formLiters}
                    onChange={(e) => setFormLiters(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Price (Rs/L) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* Total Amount & Bunk Station Selection/Creation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-bold text-gray-800 dark:text-zinc-200">
                      Total Amount (Rs) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManualTotal(!isManualTotal)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {isManualTotal ? 'Auto Calc' : 'Override'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
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

                {/* Bunk Station Selector with Add New Option */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <span>Bunk Station</span>
                    </label>
                    {!isAddingNewBunk ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingNewBunk(true);
                          setNewBunkInput('');
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add New Bunk</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAddingNewBunk(false)}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {!isAddingNewBunk ? (
                    <div className="relative">
                      <select
                        value={formBunkName}
                        onChange={(e) => {
                          if (e.target.value === '__add_new__') {
                            setIsAddingNewBunk(true);
                            setNewBunkInput('');
                          } else {
                            setFormBunkName(e.target.value);
                          }
                        }}
                        className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                      >
                        <option value="">Select Bunk Station (Optional)</option>
                        {bunkList.map((bunk) => (
                          <option key={bunk} value={bunk}>
                            {bunk}
                          </option>
                        ))}
                        <option value="__add_new__">+ Add New Bunk Station...</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Enter bunk name (e.g. HP Bunk Dharapuram)"
                        value={newBunkInput}
                        onChange={(e) => setNewBunkInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNewBunk();
                          }
                        }}
                        autoFocus
                        className="flex-1 px-3.5 py-2 rounded-xl border border-blue-400 dark:border-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                      />
                      <button
                        type="button"
                        onClick={handleSaveNewBunk}
                        disabled={!newBunkInput.trim()}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        Save Bunk
                      </button>
                    </div>
                  )}
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
                  {isSaving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Add Fuel Entry'}
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
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
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
                    <th className="py-3 px-3.5 text-center">Particulars</th>
                    <th className="py-3 px-3.5 text-right">Liters</th>
                    <th className="py-3 px-3.5 text-right">Rate (Rs/L)</th>
                    <th className="py-3 px-3.5 text-right">Total (Rs)</th>
                    <th className="py-3 px-3.5">Bunk Station</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80">
                  {fuelEntries
                    .filter((e) => e.vehicleNumber === historyVehicle)
                    .sort((a, b) => {
                      const diff = parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date);
                      if (diff !== 0) return diff;
                      return (parseDateToTimestamp(b.createdAt) || 0) - (parseDateToTimestamp(a.createdAt) || 0);
                    })
                    .map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                        <td className="py-3 px-3.5 font-mono font-medium text-gray-900 dark:text-zinc-100">
                          {entry.date}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-gray-700 dark:text-zinc-300 font-semibold">
                          {entry.billNumber || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                              entry.particulars === 'Diesel'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}
                          >
                            {entry.particulars}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-gray-900 dark:text-zinc-100">
                          {entry.liters.toFixed(2)} L
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-gray-600 dark:text-zinc-400">
                          Rs.{entry.ratePerLiter.toFixed(2)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-black text-gray-900 dark:text-zinc-100">
                          Rs.{entry.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 dark:text-zinc-300 truncate max-w-[150px]">
                          {entry.bunkName || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => handleToggleEntryMenu(e, entry)}
                            title="Fuel Entry Options"
                            className={`p-1.5 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center ${
                              activeEntryMenu?.entry.id === entry.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
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
                    Generate Fuel Statement
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Export printable PDF fuel report for {statementVehicle}
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
                  <span className="text-gray-600 dark:text-zinc-400">Matching Receipts:</span>
                  <span className="font-bold text-gray-900 dark:text-zinc-100">{statementStats.entryCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Total Fuel Dispensed:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-zinc-100">{statementStats.totalLiters.toFixed(2)} Liters</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Total Cost:</span>
                  <span className="font-mono font-black text-indigo-700 dark:text-indigo-400 text-sm">
                    Rs.{statementStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  disabled={statementStats.entryCount === 0 || isPrinting}
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

      {/* Dynamic Floating 3-Dot Entry Menu (Fixed overlay, Z-[9999], never clipped or behind anything) */}
      {activeEntryMenu !== null && (
        <>
          <div
            className="fixed inset-0 z-[9998] cursor-default bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setActiveEntryMenu(null);
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${activeEntryMenu.top}px`,
              left: `${activeEntryMenu.left}px`,
              zIndex: 9999,
            }}
            className={`w-40 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl py-1 text-xs text-gray-800 dark:text-zinc-200 animate-in fade-in duration-100 text-left font-normal select-none ${
              activeEntryMenu.openUpward ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                const entry = activeEntryMenu.entry;
                setActiveEntryMenu(null);
                handleOpenEditModal(entry);
                setHistoryVehicle(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 text-gray-700 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer font-medium"
            >
              <Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <span>Edit Entry</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const entry = activeEntryMenu.entry;
                setActiveEntryMenu(null);
                setDeletingEntry(entry);
                setHistoryVehicle(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors cursor-pointer font-medium"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span>Delete Entry</span>
            </button>
          </div>
        </>
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
                  Delete Fuel Entry?
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 text-xs space-y-1">
              <div><strong className="text-gray-700 dark:text-zinc-300">Vehicle:</strong> {deletingEntry.vehicleNumber}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Date:</strong> {deletingEntry.date}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Bill #:</strong> {deletingEntry.billNumber || '-'}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Particulars:</strong> {deletingEntry.particulars} ({deletingEntry.liters} L @ Rs.{deletingEntry.ratePerLiter})</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Total:</strong> Rs.{deletingEntry.totalAmount.toLocaleString('en-IN')}</div>
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
        <div id="aus_fuel_statement_print_root" className="statement-container">
          <div className="header-title">
            <div className="company-name">AUS TRANSPORT</div>
            <div className="report-title">VEHICLE FUEL CONSUMPTION STATEMENT</div>
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
                <th style={{ width: '15%' }}>Bill #</th>
                <th style={{ width: '17%' }}>Bunk Station</th>
                <th className="text-center" style={{ width: '12%' }}>Fuel</th>
                <th className="text-right" style={{ width: '12%' }}>Liters (L)</th>
                <th className="text-right" style={{ width: '12%' }}>Rate (Rs/L)</th>
                <th className="text-right" style={{ width: '14%' }}>Amount (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {statementFilteredEntries.map((entry, idx) => (
                <tr key={entry.id}>
                  <td className="text-center font-mono">{idx + 1}</td>
                  <td className="text-center font-mono font-bold">{entry.date}</td>
                  <td className="font-mono">{entry.billNumber || '-'}</td>
                  <td>{entry.bunkName || '-'}</td>
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
                <td colSpan={5} className="font-bold text-right" style={{ textTransform: 'uppercase' }}>
                  Grand Total
                </td>
                <td className="text-right font-mono font-bold">{statementStats.totalLiters.toFixed(2)} L</td>
                <td className="text-right font-mono">Avg Rs.{statementStats.averageRate.toFixed(2)}</td>
                <td className="text-right font-mono font-bold">
                  Rs.{statementStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
