'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Truck,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Gauge,
  Trash2,
  X,
  Check,
  AlertTriangle,
  RotateCcw,
  Calendar
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Vehicle,
  getStoredVehicles,
  saveStoredVehicles,
  addStoredVehicle,
  updateStoredVehicle,
  deleteStoredVehicle,
  VEHICLES_CHANGE_EVENT
} from '@/lib/vehicles';
import {
  BillData,
  getStoredInvoices,
  calculateVehicleMonthlyKm,
  INVOICES_CHANGE_EVENT
} from '@/lib/invoices';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

export function VehicleManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bills, setBills] = useState<BillData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [quickKmVehicle, setQuickKmVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);

  // Form states
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formCurrentKm, setFormCurrentKm] = useState<string>('');
  const [quickKmValue, setQuickKmValue] = useState<string>('');

  const menuRef = useRef<HTMLDivElement>(null);

  // Load vehicles and invoices from localStorage on mount & listen to changes
  useEffect(() => {
    setVehicles(getStoredVehicles());
    setBills(getStoredInvoices());

    const handleVehiclesUpdate = (e: CustomEvent<Vehicle[]>) => {
      if (e.detail) {
        setVehicles(e.detail);
      }
    };

    const handleInvoicesUpdate = (e: CustomEvent<BillData[]>) => {
      if (e.detail) {
        setBills(e.detail);
      } else {
        setBills(getStoredInvoices());
      }
    };

    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    window.addEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);

    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
      window.removeEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);
    };
  }, []);

  // Fetch latest vehicles & invoices directly from Supabase database
  const refreshFromSupabase = useCallback(async () => {
    try {
      const supabase = createClient();
      // Sync vehicles from Supabase
      const { data: vData, error: vErr } = await supabase.from('vehicles').select('*');
      if (!vErr && vData && vData.length > 0) {
        const loadedVehicles: Vehicle[] = vData.map((v: any) => ({
          id: v.id,
          registrationNumber: v.registration_number,
          currentKm: Number(v.current_km) || 0,
          initialKm: Number(v.initial_km) || Number(v.current_km) || 0,
          model: v.model || '',
          updatedAt: v.updated_at || v.created_at || new Date().toISOString(),
        }));
        setVehicles(loadedVehicles);
        saveStoredVehicles(loadedVehicles);
      }

      // Sync invoices from Supabase
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('bill_date', { ascending: false });

      if (!error && data && data.length > 0) {
        const loaded: BillData[] = data.map((item: any) => {
          if (item.raw_data && item.raw_data.trips) {
            return {
              ...item.raw_data,
              billNumber: item.bill_number,
              date: item.bill_date,
              vehicleNumber: item.vehicle_number,
            };
          }
          return {
            billNumber: item.bill_number,
            date: item.bill_date,
            vehicleNumber: item.vehicle_number,
            activeTrip: 1,
            visibleTrips: item.trips?.length || 1,
            trips: (item.trips || []).map((t: any, idx: number) => ({
              id: idx + 1,
              enabled: true,
              date: t.date || item.bill_date,
              dcNo: t.dcNo || '',
              particulars: t.particulars || '',
              itemName: t.itemName || 'CHICKS',
              itemQuantity: t.itemQuantity || '',
              route: t.route || '',
              startingKm: Number(t.startingKm) || 0,
              closingKm: Number(t.closingKm) || 0,
              rate: Number(t.rate) || 20.27,
              tollEnabled: false,
              tollAmount: 0,
            })),
            keralaRtoEnabled: false,
            keralaRtoMultiplier: 0,
            keralaRtoAmount: 0,
            dieselAvgRate: 0,
            rupeesInWordsMode: 'auto',
            rupeesInWordsText: '',
            status: 'unpaid',
          };
        });
        setBills(loaded);
      }
    } catch (err) {
      console.error('Error refreshing vehicles from Supabase:', err);
    }
  }, []);

  // Sync on mount
  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for dedicated module refresh trigger from DashboardHeader
  useEffect(() => {
    const handleModuleRefresh = (e: Event) => {
      const custom = e as CustomEvent<{ module: string }>;
      if (!custom.detail || custom.detail.module === 'vehicles' || custom.detail.module === 'overview' || custom.detail.module === 'all') {
        refreshFromSupabase();
      }
    };

    window.addEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
    return () => {
      window.removeEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
    };
  }, [refreshFromSupabase]);

  // Close 3-dot menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.vehicle-action-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filtered vehicles by search query
  const filteredVehicles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((v) =>
      v.registrationNumber.toLowerCase().includes(query)
    );
  }, [vehicles, searchQuery]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setFormVehicleNumber('');
    setFormCurrentKm('');
    setIsAddModalOpen(true);
    setActiveMenuId(null);
  };

  // Submit Add Vehicle
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReg = formVehicleNumber.trim().toUpperCase();
    if (!cleanReg) return;
    const km = parseFloat(formCurrentKm) || 0;

    const newV = addStoredVehicle({
      registrationNumber: cleanReg,
      currentKm: km,
    });
    setVehicles((prev) => [newV, ...prev.filter((v) => v.registrationNumber !== cleanReg)]);
    setIsAddModalOpen(false);

    try {
      const supabase = createClient();
      await supabase.from('vehicles').upsert(
        { registration_number: cleanReg, current_km: km, updated_at: new Date().toISOString() },
        { onConflict: 'registration_number' }
      );
    } catch (err) {
      console.error('Error saving vehicle to Supabase:', err);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormVehicleNumber(vehicle.registrationNumber);
    setFormCurrentKm(String(vehicle.currentKm || 0));
    setActiveMenuId(null);
  };

  // Submit Edit Vehicle
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;
    const cleanReg = formVehicleNumber.trim().toUpperCase();
    if (!cleanReg) return;
    const km = parseFloat(formCurrentKm) || 0;

    updateStoredVehicle(editingVehicle.id, {
      registrationNumber: cleanReg,
      currentKm: km,
    });
    setVehicles((prev) =>
      prev.map((v) => (v.id === editingVehicle.id ? { ...v, registrationNumber: cleanReg, currentKm: km } : v))
    );
    setEditingVehicle(null);

    try {
      const supabase = createClient();
      await supabase.from('vehicles').upsert(
        { registration_number: cleanReg, current_km: km, updated_at: new Date().toISOString() },
        { onConflict: 'registration_number' }
      );
    } catch (err) {
      console.error('Error updating vehicle in Supabase:', err);
    }
  };

  // Open Quick KM Modal
  const handleOpenQuickKm = (vehicle: Vehicle) => {
    setQuickKmVehicle(vehicle);
    setQuickKmValue(String(vehicle.currentKm || 0));
    setActiveMenuId(null);
  };

  // Submit Quick KM
  const handleSaveQuickKm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickKmVehicle) return;
    const km = parseFloat(quickKmValue) || 0;
    const targetReg = quickKmVehicle.registrationNumber;

    updateStoredVehicle(quickKmVehicle.id, {
      currentKm: km,
    });
    setVehicles((prev) =>
      prev.map((v) => (v.id === quickKmVehicle.id ? { ...v, currentKm: km } : v))
    );
    setQuickKmVehicle(null);

    try {
      const supabase = createClient();
      await supabase.from('vehicles').upsert(
        { registration_number: targetReg, current_km: km, updated_at: new Date().toISOString() },
        { onConflict: 'registration_number' }
      );
    } catch (err) {
      console.error('Error updating vehicle km in Supabase:', err);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingVehicle) return;
    const target = deletingVehicle;
    deleteStoredVehicle(target.id);
    setVehicles((prev) => prev.filter((v) => v.id !== target.id));
    setDeletingVehicle(null);

    try {
      const supabase = createClient();
      await supabase.from('vehicles').delete().eq('registration_number', target.registrationNumber);
    } catch (err) {
      console.error('Error deleting vehicle from Supabase:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Vehicles</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
            Fleet vehicle numbers and live odometer readings automatically synced with entered bills
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add Vehicle Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      {/* Vehicles Grid - Strictly displaying Vehicle Number, Current KM, and 3-dot Menu */}
      {filteredVehicles.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Truck className="w-10 h-10 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-1">
            No Vehicles Found
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
            {searchQuery ? `No vehicles matched "${searchQuery}"` : 'Get started by adding your first vehicle'}
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredVehicles.map((vehicle) => {
            const monthlyStats = calculateVehicleMonthlyKm(vehicle.registrationNumber, bills);
            const totalRecordedKm = monthlyStats.reduce((acc, curr) => acc + curr.totalKm, 0);

            return (
              <div
                key={vehicle.id}
                className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between relative group"
              >
                {/* Top Section: Vehicle Number, Current KM, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Vehicle Number */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Vehicle Number
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                      <h3 className="text-lg font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
                        {vehicle.registrationNumber}
                      </h3>
                    </div>
                  </div>

                  {/* 2. Current KM */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Current KM
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                        {Number(vehicle.currentKm || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                        KM
                      </span>
                    </div>
                  </div>

                  {/* 3. 3-Dot Menu Options */}
                  <div className="relative vehicle-action-menu shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === vehicle.id ? null : vehicle.id);
                      }}
                      title="Vehicle Operations"
                      className="w-9 h-9 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-gray-100 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === vehicle.id && (
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                        {/* Edit Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(vehicle)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit Vehicle</span>
                        </button>

                        {/* Quick Update KM Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenQuickKm(vehicle)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Gauge className="w-3.5 h-3.5" />
                          <span>Update Current KM</span>
                        </button>

                        {/* Reset KM Option */}
                        <button
                          type="button"
                          onClick={() => {
                            updateStoredVehicle(vehicle.id, { currentKm: 0 });
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset KM to 0</span>
                        </button>

                        <div className="border-t border-gray-100 dark:border-zinc-800 my-1" />

                        {/* Delete Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingVehicle(vehicle);
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Vehicle</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2-Column Table: Month and Total KMs Ran */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-zinc-300">
                      <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Monthly Running KM</span>
                    </div>
                    {totalRecordedKm > 0 && (
                      <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400">
                        Total: {totalRecordedKm.toLocaleString('en-IN')} KM
                      </span>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200/80 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-100/70 dark:bg-zinc-800/60">
                          <th className="py-2.5 px-3.5 text-left font-semibold">Month</th>
                          <th className="py-2.5 px-3.5 text-right font-semibold">Total KMs Ran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                        {monthlyStats.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="py-3 px-3.5 text-center text-[11px] text-gray-400 dark:text-zinc-500 italic">
                              No trips recorded in invoices yet
                            </td>
                          </tr>
                        ) : (
                          monthlyStats.map((stat) => (
                            <tr key={stat.monthKey} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">
                              <td className="py-2.5 px-3.5 font-medium text-gray-800 dark:text-zinc-200">
                                {stat.monthLabel}
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-bold text-gray-900 dark:text-zinc-100">
                                {stat.totalKm.toLocaleString('en-IN')}{' '}
                                <span className="text-[10px] font-semibold text-gray-500 dark:text-zinc-400">KM</span>
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
          ADD VEHICLE MODAL
      ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Add New Vehicle</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TN 76 AK 1094"
                  value={formVehicleNumber}
                  onChange={(e) => setFormVehicleNumber(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold uppercase focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Initial Current KM
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 372353"
                  value={formCurrentKm}
                  onChange={(e) => setFormCurrentKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Add Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT VEHICLE MODAL
      ========================================================================= */}
      {editingVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Edit Vehicle</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingVehicle(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  required
                  value={formVehicleNumber}
                  onChange={(e) => setFormVehicleNumber(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold uppercase focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  Current KM
                </label>
                <input
                  type="number"
                  required
                  value={formCurrentKm}
                  onChange={(e) => setFormCurrentKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingVehicle(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          QUICK UPDATE KM MODAL
      ========================================================================= */}
      {quickKmVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Update Current KM</span>
              </h3>
              <button
                type="button"
                onClick={() => setQuickKmVehicle(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickKm} className="space-y-4">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700/60 text-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500 block mb-0.5">
                  Vehicle
                </span>
                <span className="font-mono font-extrabold text-base text-gray-900 dark:text-zinc-100">
                  {quickKmVehicle.registrationNumber}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                  New Current KM Reading
                </label>
                <input
                  type="number"
                  autoFocus
                  required
                  placeholder="Enter odometer reading"
                  value={quickKmValue}
                  onChange={(e) => setQuickKmValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-base font-bold text-center focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setQuickKmVehicle(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Update KM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
      {deletingVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full shadow-2xl p-6 relative text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-1">
              Delete Vehicle?
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
              Are you sure you want to delete vehicle <span className="font-mono font-bold text-gray-900 dark:text-zinc-100">{deletingVehicle.registrationNumber}</span>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingVehicle(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Delete Vehicle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
