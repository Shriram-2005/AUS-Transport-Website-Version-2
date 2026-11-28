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
  Calendar,
  GripVertical,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
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
  parseMonthFromDate,
  INVOICES_CHANGE_EVENT
} from '@/lib/invoices';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';
import {
  applyCardOrder,
  saveStoredCardOrder,
  resetStoredCardOrder,
  moveItemInArray,
  getStoredCardOrder,
  CARD_ORDER_CHANGE_EVENT,
} from '@/lib/cardOrder';
import { KpiDashboardBar } from './KpiDashboardBar';
import { KpiCardDefinition } from '@/lib/kpiManager';

export function VehicleManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bills, setBills] = useState<BillData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Card reordering state
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [cardOrderVersion, setCardOrderVersion] = useState(0);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

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

  // Listen for card order changes from other components or tabs
  useEffect(() => {
    const handleOrderChange = (e: any) => {
      if (!e.detail || e.detail.category === 'vehicles') {
        setCardOrderVersion((v) => v + 1);
      }
    };
    window.addEventListener(CARD_ORDER_CHANGE_EVENT as any, handleOrderChange);
    return () => window.removeEventListener(CARD_ORDER_CHANGE_EVENT as any, handleOrderChange);
  }, []);

  // Reorder card handlers
  const handleMoveCard = (vehicleReg: string, direction: 'up' | 'down') => {
    const currentOrdered = applyCardOrder(vehicles, (v) => v.registrationNumber, 'vehicles');
    const index = currentOrdered.findIndex(
      (v) => v.registrationNumber.toLowerCase() === vehicleReg.toLowerCase()
    );
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrdered.length) return;

    const reordered = moveItemInArray(currentOrdered, index, targetIndex);
    const newOrder = reordered.map((v) => v.registrationNumber);
    saveStoredCardOrder('vehicles', newOrder);
    setCardOrderVersion((v) => v + 1);
  };

  const handleReorderCards = (sourceReg: string, targetReg: string) => {
    const currentOrdered = applyCardOrder(vehicles, (v) => v.registrationNumber, 'vehicles');
    const fromIndex = currentOrdered.findIndex(
      (v) => v.registrationNumber.toLowerCase() === sourceReg.toLowerCase()
    );
    const toIndex = currentOrdered.findIndex(
      (v) => v.registrationNumber.toLowerCase() === targetReg.toLowerCase()
    );
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const reordered = moveItemInArray(currentOrdered, fromIndex, toIndex);
    const newOrder = reordered.map((v) => v.registrationNumber);
    saveStoredCardOrder('vehicles', newOrder);
    setCardOrderVersion((v) => v + 1);
  };

  const handleResetCardOrder = () => {
    resetStoredCardOrder('vehicles');
    setCardOrderVersion((v) => v + 1);
  };

  // Pure Database KPI Cards for Vehicles
  const vehicleCards = useMemo<KpiCardDefinition[]>(() => {
    const totalVehicles = vehicles.length;
    let totalFleetKm = 0;
    let totalTrips = 0;
    let thisMonthKm = 0;
    let thisMonthTrips = 0;
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const vehicleKmMap: Record<string, number> = {};

    bills.forEach((b) => {
      const parsedMonth = parseMonthFromDate(b.date);
      const isCurrentMonth = parsedMonth?.key === currentMonthKey;

      const visibleTrips = b.visibleTrips ?? b.trips?.length ?? 0;
      const trips = (b.trips || []).slice(0, visibleTrips);
      trips.forEach((t) => {
        if (t.enabled !== false) {
          const closing = Number(t.closingKm) || 0;
          const starting = Number(t.startingKm) || 0;
          const runningKm = Math.max(0, closing - starting);
          if (runningKm > 0) {
            totalFleetKm += runningKm;
            totalTrips += 1;
            const reg = (b.vehicleNumber || 'Unknown').trim().toUpperCase();
            vehicleKmMap[reg] = (vehicleKmMap[reg] || 0) + runningKm;
            if (isCurrentMonth) {
              thisMonthKm += runningKm;
              thisMonthTrips += 1;
            }
          }
        }
      });
    });

    const avgKmPerVehicle = totalVehicles > 0 ? Math.round(totalFleetKm / totalVehicles) : 0;
    const totalOdometer = vehicles.reduce((sum, v) => sum + (Number(v.currentKm) || 0), 0);

    let topVehicleReg = '';
    let topVehicleKm = 0;
    Object.entries(vehicleKmMap).forEach(([reg, km]) => {
      if (km > topVehicleKm) {
        topVehicleKm = km;
        topVehicleReg = reg;
      }
    });

    return [
      {
        key: 'total_fleet',
        title: 'Total Fleet',
        value: `${totalVehicles} ${totalVehicles === 1 ? 'Vehicle' : 'Vehicles'}`,
        subtitle: 'Active registered fleet units',
        icon: 'truck',
        color: 'blue',
        description: 'Total registered fleet vehicles in database',
      },
      {
        key: 'running_km',
        title: 'Running Distance',
        value: `${totalFleetKm.toLocaleString('en-IN')} KM`,
        subtitle: 'Total trip distance logged',
        icon: 'gauge',
        color: 'emerald',
        description: 'Cumulative trip distance run across all vehicles',
      },
      {
        key: 'completed_trips',
        title: 'Completed Trips',
        value: `${totalTrips.toLocaleString('en-IN')} ${totalTrips === 1 ? 'Trip' : 'Trips'}`,
        subtitle: 'Across all fleet vehicles',
        icon: 'calendar',
        color: 'indigo',
        description: 'Total freight trips recorded across all bills',
      },
      {
        key: 'avg_km_per_vehicle',
        title: 'Avg KM / Vehicle',
        value: `${avgKmPerVehicle.toLocaleString('en-IN')} KM`,
        subtitle: `Combined: ${totalOdometer.toLocaleString('en-IN')} KM`,
        icon: 'rotate',
        color: 'amber',
        description: 'Average distance logged per registered vehicle',
      },
      {
        key: 'total_odometer',
        title: 'Fleet Odometer',
        value: `${totalOdometer.toLocaleString('en-IN')} KM`,
        subtitle: 'Combined current odometer sum',
        icon: 'activity',
        color: 'purple',
        description: 'Sum of live odometer readings across all vehicles',
      },
      {
        key: 'this_month_km',
        title: 'This Month KM',
        value: `${thisMonthKm.toLocaleString('en-IN')} KM`,
        subtitle: `${thisMonthTrips} trips in current month`,
        icon: 'trending',
        color: 'cyan',
        description: 'Distance logged during current calendar month',
      },
      {
        key: 'top_vehicle',
        title: 'Top Vehicle',
        value: topVehicleReg || 'None',
        subtitle: topVehicleKm > 0 ? `${topVehicleKm.toLocaleString('en-IN')} KM logged` : 'No trip records',
        icon: 'award',
        color: 'rose',
        description: 'Vehicle with highest running distance in bills',
      },
    ];
  }, [vehicles, bills]);

  const defaultVehicleKeys = ['total_fleet', 'running_km', 'completed_trips', 'avg_km_per_vehicle'];

  // Filtered vehicles by search query and user-defined card order
  const filteredVehicles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = !query
      ? vehicles
      : vehicles.filter((v) => v.registrationNumber.toLowerCase().includes(query));
    return applyCardOrder(list, (v) => v.registrationNumber, 'vehicles');
  }, [vehicles, searchQuery, cardOrderVersion]);

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
    <div className="space-y-6">
      {/* Top Header: Matching Fuel, Maintenance, and Expense Managers */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-[clamp(1.15rem,2.2vw,1.5rem)] font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <span>Vehicles Management</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Fleet vehicle numbers and live odometer readings automatically synced with entered bills
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Reorder Cards Toggle Button */}
          <button
            type="button"
            onClick={() => setIsReorderMode((prev) => !prev)}
            title="Toggle vehicle card reordering"
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              isReorderMode
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-xs'
                : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{isReorderMode ? 'Done Reordering' : 'Reorder Cards'}</span>
          </button>

          {/* Reset Order Button */}
          {getStoredCardOrder('vehicles').length > 0 && (
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
          <div className="relative w-full sm:w-60">
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

          {/* Add Vehicle Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      {/* Pure Database-Backed Dynamic KPI Dashboard Bar */}
      <KpiDashboardBar
        category="vehicles"
        availableCards={vehicleCards}
        defaultKeys={defaultVehicleKeys}
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

      {/* Vehicles Grid - Strictly displaying Vehicle Number, Current KM, and 3-dot Menu */}
      {filteredVehicles.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Truck className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-1">
            No Vehicles Found
          </h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
            {searchQuery ? `No vehicles matched "${searchQuery}"` : 'Get started by adding your first vehicle.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredVehicles.map((vehicle, index) => {
            const monthlyStats = calculateVehicleMonthlyKm(vehicle.registrationNumber, bills);
            const totalRecordedKm = monthlyStats.reduce((acc, curr) => acc + curr.totalKm, 0);

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
                className={`bg-white dark:bg-zinc-900 border rounded-2xl p-3.5 sm:p-5 shadow-xs transition-all flex flex-col justify-between relative group min-w-0 ${
                  draggedCardId === vehicle.registrationNumber
                    ? 'opacity-40 border-blue-400 scale-[0.99]'
                    : dragOverCardId === vehicle.registrationNumber
                    ? 'border-blue-500 ring-2 ring-blue-500/40 scale-[1.01]'
                    : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Top Section: Vehicle Number, Current KM, and 3-Dot Menu */}
                <div className="flex items-center justify-between">
                  {/* 1. Vehicle Number */}
                  <div className="space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Vehicle Number
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 shrink-0" title="Drag to reorder card">
                        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 dark:text-zinc-600 dark:group-hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0" />
                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                          <Truck className="w-5 h-5" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-[clamp(1rem,1.8vw,1.25rem)] font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight truncate">
                          {vehicle.registrationNumber}
                        </h3>
                        <p className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {totalRecordedKm > 0 ? `${totalRecordedKm.toLocaleString('en-IN')} KM logged` : 'Fleet Vehicle'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Current KM */}
                  <div className="text-right pr-3 space-y-1">
                    <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                      Current KM
                    </span>
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-[clamp(1.15rem,2vw,1.5rem)] font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                        {Number(vehicle.currentKm || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                        KM
                      </span>
                    </div>
                    <p className="text-xs font-mono font-medium text-gray-500 dark:text-zinc-400">
                      Odometer Reading
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
                              <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
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
                              <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                              <span>Move Later (Right / Down)</span>
                            </button>
                          </div>

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

                  <div className="overflow-x-auto rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
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
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[80] p-4 animate-in fade-in duration-150">
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
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[80] p-4 animate-in fade-in duration-150">
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
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[80] p-4 animate-in fade-in duration-150">
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
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[80] p-4 animate-in fade-in duration-150">
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
