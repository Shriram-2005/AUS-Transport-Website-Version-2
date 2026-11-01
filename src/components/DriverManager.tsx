'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Calendar,
  Wallet,
  X,
  Gauge,
  User,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import {
  Driver,
  getStoredDrivers,
  saveStoredDrivers,
  addStoredDriver,
  updateStoredDriver,
  deleteStoredDriver,
  calculateDriverMonthlyStats,
  calculateDriverTotalStats,
  DRIVERS_CHANGE_EVENT
} from '@/lib/drivers';
import {
  BillData,
  getStoredInvoices,
  INVOICES_CHANGE_EVENT
} from '@/lib/invoices';
import { createClient } from '@/lib/supabase/client';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

export function DriverManager() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [bills, setBills] = useState<BillData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [quickRateDriver, setQuickRateDriver] = useState<Driver | null>(null);
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);

  // Form states
  const [formDriverName, setFormDriverName] = useState('');
  const [formRatePerKm, setFormRatePerKm] = useState<string>('2.50');
  const [quickRateValue, setQuickRateValue] = useState<string>('');

  // Load drivers & invoices on mount and listen to changes
  useEffect(() => {
    setDrivers(getStoredDrivers());
    setBills(getStoredInvoices());

    const handleDriversUpdate = (e: CustomEvent<Driver[]>) => {
      if (e.detail) {
        setDrivers(e.detail);
      } else {
        setDrivers(getStoredDrivers());
      }
    };

    const handleInvoicesUpdate = (e: CustomEvent<BillData[]>) => {
      if (e.detail) {
        setBills(e.detail);
      } else {
        setBills(getStoredInvoices());
      }
    };

    window.addEventListener(DRIVERS_CHANGE_EVENT as any, handleDriversUpdate);
    window.addEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);

    return () => {
      window.removeEventListener(DRIVERS_CHANGE_EVENT as any, handleDriversUpdate);
      window.removeEventListener(INVOICES_CHANGE_EVENT as any, handleInvoicesUpdate);
    };
  }, []);

  // Fetch latest drivers & invoices directly from Supabase database
  const refreshFromSupabase = useCallback(async () => {
    try {
      const supabase = createClient();
      // Sync drivers from Supabase
      const { data: dData, error: dErr } = await supabase.from('drivers').select('*');
      if (!dErr && dData && dData.length > 0) {
        const loadedDrivers: Driver[] = dData.map((d: any) => ({
          id: d.id,
          name: d.name,
          phone: d.phone || '',
          licenseNumber: d.license_number || '',
          ratePerKm: Number(d.rate_per_km) || 2.5,
          status: (d.status === 'inactive' || d.active === false) ? 'inactive' : 'active',
          joinedDate: d.joined_date || d.created_at || new Date().toISOString(),
        }));
        setDrivers(loadedDrivers);
        saveStoredDrivers(loadedDrivers);
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
              driverId: t.driverId || '',
              driverName: t.driverName || '',
              driverRate: Number(t.driverRate) || 0,
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
      console.error('Error refreshing drivers from Supabase:', err);
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
      if (!custom.detail || custom.detail.module === 'drivers' || custom.detail.module === 'overview' || custom.detail.module === 'all') {
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
      if (!target.closest('.driver-action-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filtered drivers by search query
  const filteredDrivers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, searchQuery]);

  // Open Add Driver Modal
  const handleOpenAddModal = () => {
    setFormDriverName('');
    setFormRatePerKm('2.50');
    setIsAddModalOpen(true);
    setActiveMenuId(null);
  };

  // Submit Add Driver
  const handleAddDriver = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formDriverName.trim();
    if (!cleanName) return;

    addStoredDriver({
      name: cleanName,
      ratePerKm: parseFloat(formRatePerKm) || 2.50,
      status: 'active',
    });

    setIsAddModalOpen(false);
    setFormDriverName('');
    setFormRatePerKm('2.50');
  };

  // Open Edit Modal
  const handleOpenEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setFormDriverName(driver.name);
    setFormRatePerKm(String(driver.ratePerKm || 2.50));
    setActiveMenuId(null);
  };

  // Submit Edit Driver
  const handleEditDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    const cleanName = formDriverName.trim();
    if (!cleanName) return;

    updateStoredDriver(editingDriver.id, {
      name: cleanName,
      ratePerKm: parseFloat(formRatePerKm) || 2.50,
    });

    setEditingDriver(null);
    setFormDriverName('');
    setFormRatePerKm('2.50');
  };

  // Open Quick Rate Update Modal
  const handleOpenQuickRate = (driver: Driver) => {
    setQuickRateDriver(driver);
    setQuickRateValue(String(driver.ratePerKm || 2.50));
    setActiveMenuId(null);
  };

  // Submit Quick Rate Update
  const handleQuickRateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRateDriver) return;

    const rateNum = parseFloat(quickRateValue) || 0;
    updateStoredDriver(quickRateDriver.id, {
      ratePerKm: rateNum,
    });

    setQuickRateDriver(null);
    setQuickRateValue('');
  };

  // Confirm Delete Driver
  const handleConfirmDelete = () => {
    if (deletingDriver) {
      deleteStoredDriver(deletingDriver.id);
      setDeletingDriver(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.5rem,3vw,2.25rem)] font-bold tracking-tight text-gray-900 dark:text-white">
            Drivers Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Manage drivers, kilometer rates, and live trip salary calculations from invoices.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search driver name..."
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

          {/* Add Driver Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Driver</span>
          </button>
        </div>
      </div>

      {/* Drivers Grid */}
      {filteredDrivers.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-1">
            No Drivers Found
          </h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
            {searchQuery ? `No drivers matched "${searchQuery}"` : 'Get started by adding your first driver.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Driver</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDrivers.map((driver) => {
            const monthlyStats = calculateDriverMonthlyStats(driver, bills);
            const totalStats = calculateDriverTotalStats(driver, bills);

            return (
              <div
                key={driver.id}
                className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between relative group"
              >
                {/* Top Section: Driver Name, Rate, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Driver Name */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Driver Name
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight">
                          {driver.name}
                        </h3>
                        <p className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          Rate: ₹{Number(driver.ratePerKm || 0).toFixed(2)} / KM
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Total KMs & Salary Summary */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Total Salary
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                        ₹{Math.round(totalStats.totalSalary).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono font-medium text-gray-500 dark:text-zinc-400">
                      {totalStats.totalKm.toLocaleString('en-IN')} KM ({totalStats.tripCount} {totalStats.tripCount === 1 ? 'trip' : 'trips'})
                    </p>
                  </div>

                  {/* 3. 3-Dot Menu Options */}
                  <div className="relative driver-action-menu shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === driver.id ? null : driver.id);
                      }}
                      title="Driver Operations"
                      className="w-9 h-9 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-gray-100 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === driver.id && (
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                        {/* Edit Driver Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(driver)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit Driver & Rate</span>
                        </button>

                        {/* Quick Update Rate Option */}
                        <button
                          type="button"
                          onClick={() => handleOpenQuickRate(driver)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Gauge className="w-3.5 h-3.5" />
                          <span>Quick Change Rate</span>
                        </button>

                        <div className="border-t border-gray-100 dark:border-zinc-800 my-1" />

                        {/* Delete Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingDriver(driver);
                            setActiveMenuId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Driver</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Monthly Running KM & Salary Table */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-zinc-300">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Monthly Trip Salary Breakdown</span>
                    </div>
                    {totalStats.totalKm > 0 && (
                      <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400">
                        {totalStats.totalKm.toLocaleString('en-IN')} KM driven
                      </span>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200/80 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-100/70 dark:bg-zinc-800/60">
                          <th className="py-2.5 px-3.5 text-left font-semibold">Month</th>
                          <th className="py-2.5 px-3.5 text-center font-semibold">KMs Driven</th>
                          <th className="py-2.5 px-3.5 text-right font-semibold">Salary Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                        {monthlyStats.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-3 px-3.5 text-center text-[11px] text-gray-400 dark:text-zinc-500 italic">
                              No trips recorded for this driver yet
                            </td>
                          </tr>
                        ) : (
                          monthlyStats.map((stat) => (
                            <tr key={stat.monthKey} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors">
                              <td className="py-2.5 px-3.5 font-medium text-gray-800 dark:text-zinc-200">
                                {stat.monthLabel}
                              </td>
                              <td className="py-2.5 px-3.5 text-center font-mono font-medium text-gray-700 dark:text-zinc-300">
                                {stat.totalKm.toLocaleString('en-IN')} KM
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                ₹{Math.round(stat.totalSalary).toLocaleString('en-IN')}
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
          ADD DRIVER MODAL
      ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Add New Driver
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDriver} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Driver Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. M. Selvam"
                  value={formDriverName}
                  onChange={(e) => setFormDriverName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Rate per KM (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="2.50"
                  value={formRatePerKm}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setFormRatePerKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1">
                  Salary will be calculated as: Total KMs Driven × Rate. Can be adjusted per trip.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  Save Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT DRIVER MODAL
      ========================================================================= */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Pencil className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Edit Driver Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingDriver(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditDriver} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Driver Name *
                </label>
                <input
                  type="text"
                  required
                  value={formDriverName}
                  onChange={(e) => setFormDriverName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5">
                  Rate per KM (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formRatePerKm}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setFormRatePerKm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingDriver(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  Update Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          QUICK RATE UPDATE MODAL
      ========================================================================= */}
      {quickRateDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Gauge className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Update Rate (₹/KM)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickRateDriver(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-zinc-400">
              Set new default per kilometer rate for <span className="font-bold text-gray-900 dark:text-zinc-100">{quickRateDriver.name}</span>:
            </p>

            <form onSubmit={handleQuickRateSubmit} className="space-y-4">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-gray-500">₹</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="2.50"
                  value={quickRateValue}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setQuickRateValue(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickRateDriver(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  Save Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
      {deletingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Delete Driver?
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-zinc-100">{deletingDriver.name}</span>? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDriver(null)}
                className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
