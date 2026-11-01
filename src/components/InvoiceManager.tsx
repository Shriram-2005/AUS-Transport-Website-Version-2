'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/dictionaries';
import {
  Plus,
  Printer,
  Save,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FileText,
  Truck,
  CheckCircle2,
  Loader2,
  MoreVertical,
  Pencil,
  Eye,
  Copy,
  Lock,
  Unlock,
  X,
  MapPin,
  Fuel,
  Badge,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Filter,
  Check,
  GripVertical,
  ChevronsLeftRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { CustomDatePicker } from './CustomDatePicker';
import { getStoredVehicles, saveStoredVehicles, updateVehicleKmFromBill, VEHICLES_CHANGE_EVENT, Vehicle } from '@/lib/vehicles';
import { getStoredDrivers, DRIVERS_CHANGE_EVENT, Driver } from '@/lib/drivers';
import { initializeIndianPlaces, searchIndianPlaces, IndianPlace } from '@/lib/indianPlaces';
import { getStoredInvoices, saveStoredInvoices, INVOICES_CHANGE_EVENT } from '@/lib/invoices';
import {
  TRIGGER_MANUAL_SAVE_EVENT,
  REFRESH_MODULE_EVENT,
  notifySaveStatus
} from '@/lib/headerEvents';

// ============================================================================
// DATA MODEL (Direct from reference-repo/assets/js/invoice.js)
// ============================================================================

export const CONSIGNEE_PRESETS = [
  {
    id: 'broiler_branch',
    label: 'Broiler Branch - Nilakkottai (Standard)',
    name: 'VENKATESHWARA HATCHERIES PVT LTD.',
    address: 'BROILER BRANCH, TN, KA, AP & KL',
    gst: '33AAACV7247H1ZB (Nilakkottai)',
  },
  {
    id: 'breeding_farm',
    label: 'Breeding Farm - Dindigul',
    name: 'VENKATESHWARA HATCHERIES PVT LTD.',
    address: 'BREEDING FARM, DINDUGUL DT. TN.',
    gst: '33AAACV7247H1ZB',
  },
  {
    id: 'feed_mill',
    label: 'Feed Mill Division - Palladam',
    name: 'VENKATESHWARA HATCHERIES PVT LTD.',
    address: 'FEED MILL DIVISION, PALLADAM, TIRUPPUR DT.',
    gst: '33AAACV7247H1ZB',
  },
  {
    id: 'commercial_div',
    label: 'Commercial Division - Hosur',
    name: 'VENKATESHWARA HATCHERIES PVT LTD.',
    address: 'COMMERCIAL DIVISION, HOSUR, KRISHNAGIRI DT.',
    gst: '33AAACV7247H1ZB',
  },
  {
    id: 'custom',
    label: 'Manual Override / Custom Details',
    name: '',
    address: '',
    gst: '',
  },
];

export const PARTICULARS_OPTIONS = [
  'CHICKS',
  'EGGS',
  'EGG SHELLS',
  'OTHER',
];

export interface TripItem {
  id: number;
  enabled: boolean;
  date: string;
  dcNo: number | string;
  particulars: string;
  itemName: string;
  itemQuantity: string;
  driverId?: string;
  driverName?: string;
  driverRate?: number;
  route: string;
  startingKm: number;
  closingKm: number;
  rate: number;
  tollEnabled: boolean;
  tollAmount: number;
}

export interface BillData {
  id?: string;
  billNumber: number | string;
  date: string;
  vehicleNumber: string;
  consigneePreset?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  consigneeGst?: string;
  consigneeOverride?: boolean;
  activeTrip: number;
  visibleTrips: number;
  trips: TripItem[];
  keralaRtoEnabled: boolean;
  keralaRtoMultiplier: number;
  keralaRtoAmount: number;
  dieselAvgRate: number;
  rupeesInWordsMode: 'auto' | 'manual';
  rupeesInWordsText: string;
  status: 'paid' | 'unpaid';
  locked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Convert numbers to words (identical to reference numberToWords)
function numberToWords(num: number): string {
  if (num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

  function convertBelow1000(n: number): string {
    if (n === 0) return '';
    else if (n < 10) return ones[n];
    else if (n < 20) return teens[n - 10];
    else if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    else return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertBelow1000(n % 100) : '');
  }

  let result = '';
  let scaleIndex = 0;

  while (num > 0) {
    if (num % 1000 !== 0) {
      result = convertBelow1000(num % 1000) + (scales[scaleIndex] ? ' ' + scales[scaleIndex] : '') + (result ? ' ' + result : '');
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return result.trim() + ' Only.';
}

function formatDateToDDMMYYYY(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDateForInput(ddmmyyyyStr?: string): string {
  if (!ddmmyyyyStr) return '';
  const parts = ddmmyyyyStr.split('-');
  if (parts.length !== 3) return ddmmyyyyStr;
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

const DEFAULT_BILLS: BillData[] = [
  {
    billNumber: 424,
    date: '07-10-2026',
    vehicleNumber: 'TN 99 E 8505',
    consigneePreset: 'broiler_branch',
    consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
    consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
    consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
    consigneeOverride: false,
    activeTrip: 1,
    visibleTrips: 2,
    trips: [
      { id: 1, enabled: true, date: '02-10-2026', dcNo: 67122, particulars: 'CHICKS - 19980', itemName: 'CHICKS', itemQuantity: '19980', driverId: '', driverName: '', route: 'Tiruchirappalli, Vellakovil', startingKm: 880040, closingKm: 880474, rate: 21.32, tollEnabled: true, tollAmount: 595 },
      { id: 2, enabled: true, date: '07-10-2026', dcNo: 67123, particulars: 'CHICKS - 20820', itemName: 'CHICKS', itemQuantity: '20820', driverId: '', driverName: '', route: 'Madurai, Vellakovil', startingKm: 880474, closingKm: 880861, rate: 21.32, tollEnabled: true, tollAmount: 820 },
      { id: 3, enabled: true, date: '09-10-2026', dcNo: 67124, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 4, enabled: true, date: '11-10-2026', dcNo: 67125, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 5, enabled: true, date: '12-10-2026', dcNo: 67126, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 6, enabled: true, date: '14-10-2026', dcNo: 67127, particulars: '', itemName: '', itemQuantity: '', driverId: '', driverName: '', route: '', startingKm: 880861, closingKm: 880861, rate: 21.32, tollEnabled: false, tollAmount: 0 },
    ],
    keralaRtoEnabled: false,
    keralaRtoMultiplier: 0,
    keralaRtoAmount: 0,
    dieselAvgRate: 0,
    rupeesInWordsMode: 'auto',
    rupeesInWordsText: 'Eighteen Thousand Nine Hundred Nineteen Only.',
    status: 'unpaid',
    locked: false,
    updatedAt: new Date().toISOString(),
  },
  {
    billNumber: 423,
    date: '30-09-2026',
    vehicleNumber: 'TN 99 E 8505',
    consigneePreset: 'broiler_branch',
    consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
    consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
    consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
    consigneeOverride: false,
    activeTrip: 1,
    visibleTrips: 3,
    trips: [
      { id: 1, enabled: true, date: '25-09-2026', dcNo: 66910, particulars: 'CHICKS - 18500', itemName: 'CHICKS', itemQuantity: '18500', route: 'Salem, Namakkal', startingKm: 878200, closingKm: 878850, rate: 21.32, tollEnabled: true, tollAmount: 640 },
      { id: 2, enabled: true, date: '28-09-2026', dcNo: 66911, particulars: 'CHICKS - 19200', itemName: 'CHICKS', itemQuantity: '19200', route: 'Erode, Tiruppur', startingKm: 878850, closingKm: 879480, rate: 21.32, tollEnabled: true, tollAmount: 420 },
      { id: 3, enabled: true, date: '30-09-2026', dcNo: 66912, particulars: 'CHICKS - 17800', itemName: 'CHICKS', itemQuantity: '17800', route: 'Palani, Pollachi', startingKm: 879480, closingKm: 880040, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 4, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 5, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 21.32, tollEnabled: false, tollAmount: 0 },
      { id: 6, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 21.32, tollEnabled: false, tollAmount: 0 },
    ],
    keralaRtoEnabled: false,
    keralaRtoMultiplier: 0,
    keralaRtoAmount: 0,
    dieselAvgRate: 93.38,
    rupeesInWordsMode: 'auto',
    rupeesInWordsText: 'Thirty Five Thousand Nine Hundred Forty Only.',
    status: 'unpaid',
    locked: false,
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    billNumber: 422,
    date: '22-09-2026',
    vehicleNumber: 'TN 76 AK 1094',
    consigneePreset: 'broiler_branch',
    consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
    consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
    consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
    consigneeOverride: false,
    activeTrip: 1,
    visibleTrips: 2,
    trips: [
      { id: 1, enabled: true, date: '18-09-2026', dcNo: 66750, particulars: 'CHICKS - 21000', itemName: 'CHICKS', itemQuantity: '21000', route: 'Pollachi, Palani', startingKm: 303980, closingKm: 304520, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 2, enabled: true, date: '21-09-2026', dcNo: 66751, particulars: 'CHICKS - 18000', itemName: 'CHICKS', itemQuantity: '18000', route: 'Salem, Namakkal', startingKm: 304520, closingKm: 305100, rate: 20.27, tollEnabled: true, tollAmount: 750 },
      { id: 3, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 4, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 5, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      { id: 6, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
    ],
    keralaRtoEnabled: false,
    keralaRtoMultiplier: 0,
    keralaRtoAmount: 0,
    dieselAvgRate: 93.38,
    rupeesInWordsMode: 'auto',
    rupeesInWordsText: 'Twenty Three Thousand Four Hundred Fifty One Only.',
    status: 'paid',
    locked: false,
    updatedAt: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
];

export function InvoiceManager() {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [bills, setBills] = useState<BillData[]>(() => {
    let initial: BillData[] = [];
    if (typeof window !== 'undefined') {
      initial = getStoredInvoices();
    }
    if (!initial || initial.length === 0) {
      initial = DEFAULT_BILLS;
    }
    return [...initial].sort((a, b) => {
      const numA = parseInt(String(a.billNumber).replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.billNumber).replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });
  });
  const [currentBill, setCurrentBill] = useState<BillData>(() => {
    if (typeof window !== 'undefined') {
      const stored = getStoredInvoices();
      if (stored.length > 0) return stored[0];
    }
    return DEFAULT_BILLS[0];
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'saved' | 'saving' | null>(null);
  const [fabOpen, setFabOpen] = useState(true);

  // Refs for seamless background auto-save and dirty-state tracking without typing interruption
  const currentBillRef = useRef<BillData>(currentBill);
  const isDirtyRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const isInitialLoadRef = useRef<boolean>(true);

  // Sync currentBill to ref and mark unsaved when user makes edits
  useEffect(() => {
    currentBillRef.current = currentBill;
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      notifySaveStatus('saved');
      return;
    }
    isDirtyRef.current = true;
    notifySaveStatus('unsaved');
  }, [currentBill]);

  // Open editor and push state to browser history
  const openEditor = useCallback((billToOpen?: BillData) => {
    if (billToOpen) {
      isInitialLoadRef.current = true;
      isDirtyRef.current = false;
      setCurrentBill(billToOpen);
      currentBillRef.current = billToOpen;
      notifySaveStatus('saved');
    }
    setView('editor');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'editor');
      if (billToOpen?.billNumber) url.searchParams.set('bill', String(billToOpen.billNumber));
      window.history.pushState(
        { subView: 'editor', bill: billToOpen?.billNumber },
        '',
        url.toString()
      );
    }
  }, []);

  // Close editor and push dashboard state
  const closeEditor = useCallback(() => {
    setView('dashboard');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('bill');
      window.history.pushState({ subView: 'dashboard' }, '', url.toString());
    }
  }, []);

  // Handle browser Back / Forward (popstate) between bills list and editor
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'editor') {
        setView('editor');
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const subView = e.state?.subView || params.get('view');
        if (subView === 'editor') {
          setView('editor');
        } else {
          setView('dashboard');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Vehicles state synced with Vehicles module
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([]);
  const [tripToDelete, setTripToDelete] = useState<number | null>(null);

  // Sync Vehicles from localStorage and custom events
  useEffect(() => {
    setAvailableVehicles(getStoredVehicles());
    const handleVehiclesUpdate = (e: CustomEvent<Vehicle[]>) => {
      if (e.detail) {
        setAvailableVehicles(e.detail);
      } else {
        setAvailableVehicles(getStoredVehicles());
      }
    };
    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    };
  }, []);

  // Sync Drivers from localStorage and custom events
  useEffect(() => {
    setAvailableDrivers(getStoredDrivers());
    const handleDriversUpdate = (e: CustomEvent<Driver[]>) => {
      if (e.detail) {
        setAvailableDrivers(e.detail);
      } else {
        setAvailableDrivers(getStoredDrivers());
      }
    };
    window.addEventListener(DRIVERS_CHANGE_EVENT as any, handleDriversUpdate);
    return () => {
      window.removeEventListener(DRIVERS_CHANGE_EVENT as any, handleDriversUpdate);
    };
  }, []);

  // Initialize all Indian places from GitHub repo and cache
  useEffect(() => {
    initializeIndianPlaces();
  }, []);

  // Prevent mouse wheel from scrolling and changing numbers when input[type="number"] is focused
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const active = document.activeElement as HTMLElement;
      if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'number') {
        active.blur();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lockFilter, setLockFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statsPeriod, setStatsPeriod] = useState('month');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<string>('bill_desc');

  // Dropdown menus
  const [activeMenuId, setActiveMenuId] = useState<string | number | null>(null);
  const [particularDropdownOpen, setParticularDropdownOpen] = useState(false);
  const [placeDropdownOpen, setPlaceDropdownOpen] = useState(false);
  const [placeSearchInput, setPlaceSearchInput] = useState('');
  const [placeResults, setPlaceResults] = useState<IndianPlace[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  // Elastic splitter resizer state
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(38);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(0.85);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isPrintingRef = useRef<boolean>(false);

  // Load persisted width from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('aus_invoice_splitter_width');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 20 && val <= 75) {
          setLeftPanelWidth(val);
        }
      }
    } catch {}
  }, []);

  // Handle elastic drag
  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!splitContainerRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const pct = (relativeX / rect.width) * 100;
      const clamped = Math.min(Math.max(pct, 20), 75);
      setLeftPanelWidth(clamped);
    };

    const onPointerUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        localStorage.setItem('aus_invoice_splitter_width', String(leftPanelWidth));
      } catch {}
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove);
    window.addEventListener('touchend', onPointerUp);

    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, leftPanelWidth]);

  // Total calculation (direct copy of reference calculateBillTotal)
  const calculateBillTotal = useCallback((bill: BillData): number => {
    let total = 0;
    for (let i = 1; i <= bill.visibleTrips; i++) {
      const trip = bill.trips[i - 1];
      if (trip) {
        const runningKm = trip.closingKm - trip.startingKm;
        total += runningKm * trip.rate;
        if (trip.tollEnabled) {
          total += Number(trip.tollAmount) || 0;
        }
      }
    }
    if (bill.keralaRtoEnabled && bill.keralaRtoMultiplier > 0) {
      total += bill.keralaRtoMultiplier * bill.keralaRtoAmount;
    }
    return Math.round(total);
  }, []);

  // Fetch invoices from Supabase database
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('bill_date', { ascending: false });

      if (!error && data && data.length > 0) {
        const loadedBills: BillData[] = data.map((item: any) => {
          if (item.raw_data && item.raw_data.trips) {
            return {
              ...item.raw_data,
              id: item.id,
              billNumber: item.bill_number,
              date: item.bill_date,
              vehicleNumber: item.vehicle_number,
              consigneeName: item.raw_data.consigneeName || item.consignee?.name || 'VENKATESHWARA HATCHERIES PVT LTD.',
              consigneeAddress: item.raw_data.consigneeAddress || item.consignee?.address || 'BROILER BRANCH, TN, KA, AP & KL',
              consigneeGst: item.raw_data.consigneeGst || item.consignee?.gst || '33AAACV7247H1ZB (Nilakkottai)',
              consigneePreset: item.raw_data.consigneePreset || item.consignee?.preset || 'broiler_branch',
              consigneeOverride: item.raw_data.consigneeOverride ?? item.consignee?.override ?? false,
              status: item.payment_status || item.raw_data.status || 'unpaid',
              locked: item.is_locked ?? item.raw_data.locked ?? false,
              updatedAt: item.updated_at || item.created_at,
            };
          }
          // Fallback mapper
          return {
            id: item.id,
            billNumber: item.bill_number,
            date: item.bill_date,
            vehicleNumber: item.vehicle_number,
            consigneePreset: item.consignee?.preset || 'broiler_branch',
            consigneeName: item.consignee?.name || 'VENKATESHWARA HATCHERIES PVT LTD.',
            consigneeAddress: item.consignee?.address || 'BROILER BRANCH, TN, KA, AP & KL',
            consigneeGst: item.consignee?.gst || '33AAACV7247H1ZB (Nilakkottai)',
            consigneeOverride: item.consignee?.override || false,
            activeTrip: 1,
            visibleTrips: item.trips?.length || 1,
            trips: (item.trips || []).map((t: any, idx: number) => ({
              id: idx + 1,
              enabled: true,
              date: t.date || item.bill_date,
              dcNo: t.dcNo || '',
              particulars: t.particulars || t.itemQuantity || '',
              itemName: t.itemName || t.itemType || 'CHICKS',
              itemQuantity: t.itemQuantity || t.quantity || '',
              driverId: t.driverId || '',
              driverName: t.driverName || '',
              driverRate: Number(t.driverRate) || 0,
              route: t.route || (t.places ? t.places.join(', ') : ''),
              startingKm: Number(t.startingKm) || 0,
              closingKm: Number(t.closingKm) || 0,
              rate: Number(t.rate) || 20.27,
              tollEnabled: t.tollEnabled ?? (Number(t.tollAmount || t.tollExpense) > 0),
              tollAmount: Number(t.tollAmount || t.tollExpense) || 0,
            })),
            keralaRtoEnabled: item.expenses?.hasRto ?? false,
            keralaRtoMultiplier: item.expenses?.rtoMultiplier ?? 0,
            keralaRtoAmount: item.expenses?.rtoExpense ?? 0,
            dieselAvgRate: item.expenses?.dieselAvgRate ?? 0,
            rupeesInWordsMode: 'auto',
            rupeesInWordsText: item.amount_in_words || '',
            status: item.payment_status === 'Paid' ? 'paid' : 'unpaid',
            locked: item.is_locked || false,
            updatedAt: item.updated_at || item.created_at,
          };
        });
        loadedBills.sort((a, b) => {
          const numA = parseInt(String(a.billNumber).replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(String(b.billNumber).replace(/\D/g, ''), 10) || 0;
          return numB - numA;
        });
        setBills(loadedBills);
        saveStoredInvoices(loadedBills);
      }
    } catch (err) {
      console.error('Error loading bills from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load from Supabase on mount
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Core save function: handles both manual and silent 5s background auto-save
  const saveBillAsync = useCallback(
    async (billToSave: BillData, isSilent: boolean = false) => {
      if (!billToSave || !billToSave.billNumber) return;
      if (!isSilent) {
        setSaving(true);
        setSaveIndicator('saving');
      }
      notifySaveStatus('saving');

      const total = calculateBillTotal(billToSave);
      const words =
        billToSave.rupeesInWordsMode === 'auto'
          ? numberToWords(total)
          : billToSave.rupeesInWordsText;

      const payload = {
        bill_number: String(billToSave.billNumber),
        bill_date: billToSave.date,
        vehicle_number: billToSave.vehicleNumber,
        consignor: {
          name: 'Venkateshwara Hatcheries Pvt Ltd.',
          address: 'Nellakottai Hatcheries, Dindugul DT. TN.',
          gst: '33AAACV7247H1ZB',
        },
        consignee: {
          name: billToSave.consigneeName || 'VENKATESHWARA HATCHERIES PVT LTD.',
          address: billToSave.consigneeAddress || 'BROILER BRANCH, TN, KA, AP & KL',
          gst: billToSave.consigneeGst || '33AAACV7247H1ZB (Nilakkottai)',
          preset: billToSave.consigneePreset || 'broiler_branch',
          override: billToSave.consigneeOverride || false,
        },
        trips: billToSave.trips.slice(0, billToSave.visibleTrips),
        expenses: {
          hasRto: billToSave.keralaRtoEnabled,
          rtoMultiplier: billToSave.keralaRtoMultiplier,
          rtoExpense: billToSave.keralaRtoAmount,
          dieselAvgRate: billToSave.dieselAvgRate,
        },
        net_amount: total,
        amount_in_words: words,
        bank_details: {
          bankName: 'HDFC BANK - DHARAPURAM',
          accountNo: '50200051395768',
          ifscCode: 'HDFC0002786',
        },
        payment_status: billToSave.status,
        is_locked: billToSave.locked || false,
        raw_data: {
          ...billToSave,
          net_amount: total,
          amount_in_words: words,
          updatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      try {
        const supabase = createClient();
        await supabase.from('invoices').upsert(payload, { onConflict: 'bill_number' });

        // Update state in background
        setBills((prev) => {
          const filtered = prev.filter((b) => String(b.billNumber) !== String(billToSave.billNumber));
          const updated = [{ ...billToSave, updatedAt: new Date().toISOString() }, ...filtered];
          saveStoredInvoices(updated);
          return updated;
        });

        // Update vehicle current KM with the highest closing KM in this bill
        if (billToSave.vehicleNumber) {
          const maxTripClosingKm = Math.max(
            0,
            ...billToSave.trips.slice(0, billToSave.visibleTrips).map((t) => Number(t.closingKm) || 0)
          );
          if (maxTripClosingKm > 0) {
            updateVehicleKmFromBill(billToSave.vehicleNumber, maxTripClosingKm);
          }
        }

        isDirtyRef.current = false;
        notifySaveStatus('saved', new Date().toISOString());
        if (!isSilent) {
          setSaveIndicator('saved');
          setTimeout(() => setSaveIndicator(null), 3000);
        }
      } catch (err) {
        console.error('Error saving invoice to Supabase:', err);
        // Local fallback
        setBills((prev) => {
          const filtered = prev.filter((b) => String(b.billNumber) !== String(billToSave.billNumber));
          const updated = [{ ...billToSave, updatedAt: new Date().toISOString() }, ...filtered];
          saveStoredInvoices(updated);
          return updated;
        });
        isDirtyRef.current = false;
        notifySaveStatus('saved', new Date().toISOString());
        if (!isSilent) {
          setSaveIndicator('saved');
          setTimeout(() => setSaveIndicator(null), 3000);
        }
      } finally {
        if (!isSilent) {
          setSaving(false);
        }
      }
    },
    [calculateBillTotal]
  );

  // Seamless 5-second background auto-save (executes quietly without losing focus or resetting caret)
  useEffect(() => {
    const autoSaveTimer = setInterval(() => {
      if (!isDirtyRef.current || isSavingRef.current) return;
      saveBillAsync(currentBillRef.current, true);
    }, 5000);

    return () => clearInterval(autoSaveTimer);
  }, [saveBillAsync]);

  // Listen for manual save and module refresh events from DashboardHeader
  useEffect(() => {
    const handleManualSave = () => {
      saveBillAsync(currentBillRef.current, false);
    };

    const handleRefresh = (e: Event) => {
      const custom = e as CustomEvent<{ module: string }>;
      if (!custom.detail || custom.detail.module === 'invoices' || custom.detail.module === 'overview') {
        fetchInvoices();
      }
    };

    window.addEventListener(TRIGGER_MANUAL_SAVE_EVENT, handleManualSave);
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleRefresh);

    return () => {
      window.removeEventListener(TRIGGER_MANUAL_SAVE_EVENT, handleManualSave);
      window.removeEventListener(REFRESH_MODULE_EVENT as any, handleRefresh);
    };
  }, [saveBillAsync, fetchInvoices]);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.bill-card-menu') && !(e.target as HTMLElement).closest('.context-menu')) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentTotal = useMemo(() => calculateBillTotal(currentBill), [currentBill]);

  // Sync words if in auto mode
  useEffect(() => {
    if (currentBill.rupeesInWordsMode === 'auto') {
      const words = numberToWords(currentTotal);
      if (words !== currentBill.rupeesInWordsText) {
        setCurrentBill((prev) => ({ ...prev, rupeesInWordsText: words }));
      }
    }
  }, [currentTotal, currentBill.rupeesInWordsMode]);

  // Progressive reveal search across all Indian places
  useEffect(() => {
    const trimmed = placeSearchInput.trim();
    if (!trimmed) {
      setPlaceResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    const results = searchIndianPlaces(trimmed, 15);
    setPlaceResults(results);
    setIsSearchingPlaces(false);
  }, [placeSearchInput]);

  // Filter and sort bills list for Dashboard
  const filteredBills = useMemo(() => {
    return bills
      .filter((bill) => {
        // Search across any details in the invoice bill page
        const search = searchTerm.toLowerCase().trim();
        if (search) {
          const totalAmount = calculateBillTotal(bill);
          const totalAmountStr = String(totalAmount);
          const formattedAmt = totalAmount.toLocaleString('en-IN');
          const paymentStr = bill.status === 'paid' ? 'received paid' : 'not received unpaid pending';
          const lockStr = bill.locked ? 'locked' : 'unlocked';

          const matchesMain =
            String(bill.billNumber).toLowerCase().includes(search) ||
            (bill.date && bill.date.toLowerCase().includes(search)) ||
            (bill.vehicleNumber && bill.vehicleNumber.toLowerCase().includes(search)) ||
            (bill.consigneeName && bill.consigneeName.toLowerCase().includes(search)) ||
            (bill.consigneeAddress && bill.consigneeAddress.toLowerCase().includes(search)) ||
            (bill.consigneeGst && bill.consigneeGst.toLowerCase().includes(search)) ||
            paymentStr.includes(search) ||
            lockStr.includes(search) ||
            totalAmountStr.includes(search) ||
            formattedAmt.toLowerCase().includes(search);

          const matchesTrips = bill.trips.slice(0, bill.visibleTrips).some((t) => {
            return (
              (t.driverName && t.driverName.toLowerCase().includes(search)) ||
              (t.route && t.route.toLowerCase().includes(search)) ||
              (t.particulars && t.particulars.toLowerCase().includes(search)) ||
              (t.dcNo && String(t.dcNo).toLowerCase().includes(search)) ||
              (t.itemName && t.itemName.toLowerCase().includes(search)) ||
              (t.itemQuantity && String(t.itemQuantity).toLowerCase().includes(search)) ||
              String(t.startingKm).includes(search) ||
              String(t.closingKm).includes(search) ||
              String(t.rate).includes(search) ||
              (t.tollAmount && String(t.tollAmount).includes(search))
            );
          });

          if (!matchesMain && !matchesTrips) return false;
        }

        // Status filter
        if (statusFilter && bill.status !== statusFilter) return false;

        // Lock filter
        if (lockFilter === 'locked' && !bill.locked) return false;
        if (lockFilter === 'unlocked' && bill.locked) return false;

        // Vehicle filter
        if (vehicleFilter && bill.vehicleNumber !== vehicleFilter) return false;

        // Driver filter
        if (driverFilter) {
          const hasDriver = bill.trips
            .slice(0, bill.visibleTrips)
            .some((t) => t.driverName?.toLowerCase() === driverFilter.toLowerCase());
          if (!hasDriver) return false;
        }

        // Month filter (format MM-YYYY)
        if (monthFilter && bill.date) {
          const parts = bill.date.split('-');
          if (parts.length === 3) {
            const billMonth = `${parts[1]}-${parts[2]}`;
            if (billMonth !== monthFilter) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Parse numerical bill numbers (e.g. 426, 425)
        const numA = parseInt(String(a.billNumber).replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.billNumber).replace(/\D/g, ''), 10) || 0;

        if (sortOrder === 'bill_asc') {
          return numA - numB;
        }
        if (sortOrder === 'amount_desc') {
          return calculateBillTotal(b) - calculateBillTotal(a);
        }
        if (sortOrder === 'amount_asc') {
          return calculateBillTotal(a) - calculateBillTotal(b);
        }
        if (sortOrder === 'date_desc') {
          return new Date(b.updatedAt || b.date).getTime() - new Date(a.updatedAt || a.date).getTime();
        }
        if (sortOrder === 'date_asc') {
          return new Date(a.updatedAt || a.date).getTime() - new Date(b.updatedAt || b.date).getTime();
        }

        // DEFAULT: Highest number 1st and lower number down (descending order)
        return numB - numA;
      });
  }, [
    bills,
    searchTerm,
    statusFilter,
    lockFilter,
    vehicleFilter,
    driverFilter,
    monthFilter,
    sortOrder,
    calculateBillTotal,
  ]);

  // Dictionary for strict i18n per instructions.md
  const dict = getDictionary('en');

  // Strict pagination per instructions.md (max 20 items per page)
  const ITEMS_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, lockFilter, vehicleFilter, driverFilter, monthFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / ITEMS_PER_PAGE));
  const paginatedBills = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBills.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBills, currentPage]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalBills = bills.length;
    let received = 0;
    let pending = 0;

    bills.forEach((b) => {
      const amt = calculateBillTotal(b);
      if (b.status === 'paid') received += amt;
      else pending += amt;
    });

    return { totalBills, received, pending };
  }, [bills, calculateBillTotal]);

  // Distinct vehicles for dropdown
  const vehicleOptions = useMemo(() => {
    return Array.from(new Set(bills.map((b) => b.vehicleNumber))).filter(Boolean);
  }, [bills]);

  // Distinct drivers for dropdown
  const driverOptions = useMemo(() => {
    const fromTrips = bills.flatMap((b) => b.trips.slice(0, b.visibleTrips).map((t) => t.driverName)).filter(Boolean);
    const fromAvailable = availableDrivers.map((d) => d.name).filter(Boolean);
    return Array.from(new Set([...fromTrips, ...fromAvailable])).sort();
  }, [bills, availableDrivers]);

  // Distinct months (e.g. "11-2026")
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    bills.forEach((b) => {
      if (b.date) {
        const parts = b.date.split('-');
        if (parts.length === 3) {
          months.add(`${parts[1]}-${parts[2]}`);
        }
      }
    });
    return Array.from(months).sort().reverse();
  }, [bills]);

  const formatMonthLabel = (m: string) => {
    const [mm, yyyy] = m.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(mm, 10) - 1;
    return `${monthNames[idx] || mm} ${yyyy}`;
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (statusFilter) count++;
    if (lockFilter) count++;
    if (vehicleFilter) count++;
    if (driverFilter) count++;
    if (monthFilter) count++;
    if (sortOrder !== 'bill_desc') count++;
    return count;
  }, [searchTerm, statusFilter, lockFilter, vehicleFilter, driverFilter, monthFilter, sortOrder]);

  const handleResetFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('');
    setLockFilter('');
    setDateFilter('');
    setVehicleFilter('');
    setDriverFilter('');
    setMonthFilter('');
    setSortOrder('bill_desc');
  }, []);

  // Dashboard actions
  const handleTogglePaymentStatus = async (billId: string | number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updatedBills = bills.map((b) => {
      if (b.id === billId || b.billNumber === billId) {
        const newStatus: 'paid' | 'unpaid' = b.status === 'paid' ? 'unpaid' : 'paid';
        // Auto-lock when marked as received
        const newLocked = newStatus === 'paid' ? true : b.locked;
        return { ...b, status: newStatus, locked: newLocked, updatedAt: new Date().toISOString() };
      }
      return b;
    });
    setBills(updatedBills);
    saveStoredInvoices(updatedBills);

    const target = updatedBills.find((b) => b.id === billId || b.billNumber === billId);
    if (target) {
      if (currentBill.billNumber === target.billNumber) setCurrentBill(target);
      try {
        const supabase = createClient();
        await supabase
          .from('invoices')
          .update({
            payment_status: target.status,
            is_locked: target.locked,
            updated_at: new Date().toISOString(),
          })
          .eq('bill_number', target.billNumber);
      } catch (err) {
        console.error('Error updating status in Supabase:', err);
      }
    }
    setActiveMenuId(null);
  };

  const handleToggleLock = async (billId: string | number) => {
    const updatedBills = bills.map((b) => {
      if (b.id === billId || b.billNumber === billId) {
        return { ...b, locked: !b.locked, updatedAt: new Date().toISOString() };
      }
      return b;
    });
    setBills(updatedBills);
    saveStoredInvoices(updatedBills);
    const target = updatedBills.find((b) => b.id === billId || b.billNumber === billId);
    if (target) {
      if (currentBill.billNumber === target.billNumber) setCurrentBill(target);
      try {
        const supabase = createClient();
        await supabase
          .from('invoices')
          .update({ is_locked: target.locked, updated_at: new Date().toISOString() })
          .eq('bill_number', target.billNumber);
      } catch (err) {
        console.error('Error updating lock state in Supabase:', err);
      }
    }
    setActiveMenuId(null);
  };

  const handleDeleteBill = async (billId: string | number) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;
    const target = bills.find((b) => b.id === billId || b.billNumber === billId);
    setBills((prev) => {
      const filtered = prev.filter((b) => b.id !== billId && b.billNumber !== billId);
      saveStoredInvoices(filtered);
      return filtered;
    });
    setActiveMenuId(null);

    if (target) {
      try {
        const supabase = createClient();
        await supabase.from('invoices').delete().eq('bill_number', String(target.billNumber));
        if (target.id) {
          await supabase.from('invoices').delete().eq('id', target.id);
        }
      } catch (err) {
        console.error('Error deleting bill from Supabase:', err);
      }
    }
  };

  const handleDuplicateBill = (bill: BillData) => {
    const nextBillNo =
      Math.max(
        424,
        ...bills.map((b) => parseInt(String(b.billNumber), 10)).filter((n) => !isNaN(n))
      ) + 1;

    const duplicated: BillData = {
      ...bill,
      id: undefined,
      billNumber: nextBillNo,
      date: formatDateToDDMMYYYY(new Date()),
      status: 'unpaid',
      locked: false,
      updatedAt: new Date().toISOString(),
    };

    openEditor(duplicated);
    setActiveMenuId(null);
  };

  const handleCreateNewBill = () => {
    const nextBillNo =
      Math.max(
        424,
        ...bills.map((b) => parseInt(String(b.billNumber), 10)).filter((n) => !isNaN(n))
      ) + 1;

    const newBill: BillData = {
      billNumber: nextBillNo,
      date: formatDateToDDMMYYYY(new Date()),
      vehicleNumber: currentBill.vehicleNumber || (availableVehicles[0]?.registrationNumber ?? 'TN 76 AK 1094'),
      consigneePreset: 'broiler_branch',
      consigneeName: 'VENKATESHWARA HATCHERIES PVT LTD.',
      consigneeAddress: 'BROILER BRANCH, TN, KA, AP & KL',
      consigneeGst: '33AAACV7247H1ZB (Nilakkottai)',
      consigneeOverride: false,
      activeTrip: 1,
      visibleTrips: 1,
      trips: [
        {
          id: 1,
          enabled: true,
          date: formatDateToDDMMYYYY(new Date()),
          dcNo: '',
          particulars: '',
          itemName: '',
          itemQuantity: '',
          driverId: '',
          driverName: '',
          route: '',
          startingKm: 300000,
          closingKm: 300000,
          rate: 20.27,
          tollEnabled: false,
          tollAmount: 0,
        },
        { id: 2, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
        { id: 3, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
        { id: 4, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
        { id: 5, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
        { id: 6, enabled: true, date: '', dcNo: '', particulars: '', itemName: '', itemQuantity: '', route: '', startingKm: 0, closingKm: 0, rate: 20.27, tollEnabled: false, tollAmount: 0 },
      ],
      keralaRtoEnabled: false,
      keralaRtoMultiplier: 0,
      keralaRtoAmount: 0,
      dieselAvgRate: 0,
      rupeesInWordsMode: 'auto',
      rupeesInWordsText: 'Zero Only.',
      status: 'unpaid',
      locked: false,
      updatedAt: new Date().toISOString(),
    };

    openEditor(newBill);
  };

  // Editor Actions (matching reference invoice.js)
  const activeTrip = currentBill.trips[currentBill.activeTrip - 1] || currentBill.trips[0];

  const updateActiveTripField = (field: keyof TripItem, value: any) => {
    const updatedTrips = [...currentBill.trips];
    const trip = { ...updatedTrips[currentBill.activeTrip - 1], [field]: value };

    if (field === 'startingKm' || field === 'closingKm' || field === 'rate' || field === 'dcNo') {
      const parsedNum = parseFloat(value) || 0;
      trip[field] = parsedNum;
      if (field === 'closingKm' && currentBill.vehicleNumber && parsedNum > 0) {
        updateVehicleKmFromBill(currentBill.vehicleNumber, parsedNum);
      }
    } else if (field === 'date') {
      trip[field] = value;
    } else if (field === 'itemQuantity') {
      trip[field] = value;
      if (trip.itemName) {
        trip.particulars = value ? `${trip.itemName} - ${value}` : trip.itemName;
      }
    }

    updatedTrips[currentBill.activeTrip - 1] = trip;
    setCurrentBill((prev) => ({ ...prev, trips: updatedTrips }));
  };

  const selectParticular = (item: string) => {
    const updatedTrips = [...currentBill.trips];
    const trip = { ...updatedTrips[currentBill.activeTrip - 1] };
    trip.itemName = item;
    trip.particulars = trip.itemQuantity ? `${item} - ${trip.itemQuantity}` : item;
    updatedTrips[currentBill.activeTrip - 1] = trip;
    setCurrentBill((prev) => ({ ...prev, trips: updatedTrips }));
    setParticularDropdownOpen(false);
  };

  const selectPlace = (place: string) => {
    const trimmed = place.trim();
    if (!trimmed) return;
    const currentRoute = activeTrip.route || '';
    const places = currentRoute
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (!places.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      places.push(trimmed);
      const newRoute = places.join(', ');
      updateActiveTripField('route', newRoute);
    }
    setPlaceSearchInput('');
    setPlaceDropdownOpen(false);
  };

  const removePlace = (placeToRemove: string) => {
    const currentRoute = activeTrip.route || '';
    const places = currentRoute
      .split(',')
      .map((p) => p.trim())
      .filter((p) => Boolean(p) && p !== placeToRemove);
    updateActiveTripField('route', places.join(', '));
  };

  const addTrip = () => {
    if (currentBill.visibleTrips < 6) {
      const nextVis = currentBill.visibleTrips + 1;
      const updatedTrips = [...currentBill.trips];
      const prevTrip = updatedTrips[currentBill.visibleTrips - 1];
      const nextStart = prevTrip ? prevTrip.closingKm : 300000;

      updatedTrips[nextVis - 1] = {
        ...updatedTrips[nextVis - 1],
        date: formatDateToDDMMYYYY(new Date()),
        dcNo: '',
        particulars: '',
        itemName: '',
        itemQuantity: '',
        route: '',
        startingKm: nextStart,
        closingKm: nextStart,
        rate: prevTrip ? prevTrip.rate : 20.27,
        tollEnabled: false,
        tollAmount: 0,
      };

      setCurrentBill((prev) => ({
        ...prev,
        visibleTrips: nextVis,
        activeTrip: nextVis,
        trips: updatedTrips,
      }));
    }
  };

  const handleConfirmDeleteTrip = (tripNumber: number) => {
    if (tripNumber <= 1 || currentBill.visibleTrips <= 1) return;
    const tripIdx = tripNumber - 1;
    const updatedTrips = [...currentBill.trips];
    updatedTrips.splice(tripIdx, 1);
    updatedTrips.push({
      id: 6,
      enabled: true,
      date: '',
      dcNo: '',
      particulars: '',
      itemName: '',
      itemQuantity: '',
      driverId: '',
      driverName: '',
      route: '',
      startingKm: 0,
      closingKm: 0,
      rate: 20.27,
      tollEnabled: false,
      tollAmount: 0,
    });
    const reindexed = updatedTrips.map((t, idx) => ({ ...t, id: idx + 1 }));
    const nextVis = currentBill.visibleTrips - 1;
    const nextActive = currentBill.activeTrip >= tripNumber
      ? Math.max(1, currentBill.activeTrip - 1)
      : currentBill.activeTrip;

    setCurrentBill((prev) => ({
      ...prev,
      visibleTrips: nextVis,
      activeTrip: Math.min(nextActive, nextVis),
      trips: reindexed,
    }));
  };

  const moveTrip = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentBill.visibleTrips) return;

    const updatedTrips = [...currentBill.trips];
    const temp = updatedTrips[index];
    updatedTrips[index] = updatedTrips[targetIndex];
    updatedTrips[targetIndex] = temp;

    const reindexed = updatedTrips.map((t, idx) => ({ ...t, id: idx + 1 }));

    setCurrentBill((prev) => ({
      ...prev,
      trips: reindexed,
      activeTrip: targetIndex + 1,
    }));
  };

  // Save to Supabase (direct match with reference saveBillToFirestore)
  const handleSaveBill = () => {
    saveBillAsync(currentBillRef.current, false);
  };

  const handlePrint = (billToPrint?: BillData | React.MouseEvent) => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    const isBill = billToPrint && 'billNumber' in billToPrint;
    const target = isBill ? (billToPrint as BillData) : currentBill;
    if (isBill) {
      setCurrentBill(billToPrint as BillData);
    }
    if (view !== 'editor') {
      setView('editor');
    }

    setTimeout(() => {
      const previewEl = document.getElementById('previewContent');
      if (!previewEl) {
        isPrintingRef.current = false;
        window.print();
        return;
      }

      // Check if an existing print frame exists
      let printFrame = document.getElementById('aus_invoice_print_frame') as HTMLIFrameElement | null;
      if (printFrame) {
        try {
          printFrame.remove();
        } catch {}
      }

      printFrame = document.createElement('iframe');
      printFrame.id = 'aus_invoice_print_frame';
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
        isPrintingRef.current = false;
        window.print();
        return;
      }

      const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((el) => el.outerHTML)
        .join('\n');

      frameDoc.open();
      frameDoc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Freight Bill - ${target.billNumber}</title>
    ${styleTags}
    <style>
      @page {
        size: A4 portrait;
        margin: 0 !important;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        overflow: hidden !important;
        font-family: Arial, Helvetica, sans-serif !important;
      }
      .a4-page {
        width: 210mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        padding: 12mm !important;
        box-sizing: border-box !important;
        box-shadow: none !important;
        border: none !important;
        background: #ffffff !important;
        color: #000000 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        overflow: hidden !important;
        page-break-inside: avoid !important;
        page-break-after: avoid !important;
        break-inside: avoid !important;
        break-after: avoid !important;
        transform: none !important;
      }
      .no-print {
        display: none !important;
      }
      table {
        border-collapse: collapse !important;
      }
      th, td {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .a4-page img[alt="watermark"] {
        opacity: 0.18 !important;
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #ffffff; color: #000000;">
    ${previewEl.outerHTML}
  </body>
</html>`);
      frameDoc.close();

      let hasTriggeredPrint = false;
      let fallbackTimer: NodeJS.Timeout | null = null;

      const doPrint = () => {
        if (hasTriggeredPrint) return;
        hasTriggeredPrint = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }

        setTimeout(() => {
          try {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          } catch {
            window.print();
          } finally {
            setTimeout(() => {
              try {
                printFrame?.remove();
              } catch {}
              isPrintingRef.current = false;
            }, 1000);
          }
        }, 150);
      };

      const imgs = Array.from(frameDoc.images);
      if (imgs.length === 0) {
        doPrint();
      } else {
        let loaded = 0;
        imgs.forEach((img) => {
          if (img.complete) {
            loaded++;
            if (loaded === imgs.length) doPrint();
          } else {
            img.onload = img.onerror = () => {
              loaded++;
              if (loaded === imgs.length) doPrint();
            };
          }
        });
        fallbackTimer = setTimeout(() => {
          if (!hasTriggeredPrint) doPrint();
        }, 500);
      }
    }, billToPrint || view !== 'editor' ? 150 : 50);
  };

  // Keyboard shortcut Ctrl+P / Cmd+P in editor view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (view === 'editor') {
          e.preventDefault();
          handlePrint();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, currentBill]);

  // Helper active trip calculations
  const activeRunningKm = Math.max(0, activeTrip.closingKm - activeTrip.startingKm);
  const activeAmount = activeRunningKm * activeTrip.rate;

  return (
    <div className="w-full">
      {/* Strict CSS port from reference-repo/assets/css/dashboard.css & invoice.css */}
      <style jsx global>{`
        /* EXACT MEDIA PRINT RULE: Guaranteed single page A4 output matching reference */
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            overflow: hidden !important;
          }
          .no-print, aside, nav, button {
            display: none !important;
          }
          .form-panel, .split-container > div:not(.preview-panel) {
            display: none !important;
          }
          .split-container {
            display: block !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: white !important;
          }
          .preview-panel {
            display: block !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: white !important;
          }
          .preview-scale-wrapper {
            display: block !important;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .a4-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 auto !important;
            padding: 12mm !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
            break-inside: avoid !important;
            break-after: avoid !important;
            transform: none !important;
          }
          .a4-page img[alt="watermark"] {
            opacity: 0.18 !important;
          }
        }

        /* EXACT A4 PAGE FROM REFERENCE REPO */
        .a4-page {
          width: 210mm;
          height: 297mm;
          min-height: 297mm;
          max-height: 297mm;
          background: white;
          color: black;
          margin: 0 auto;
          padding: 12mm;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
          position: relative;
          border: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }

        /* Split container with elastic resizer: Left scrollable, Right fixed */
        .split-container {
          display: flex;
          height: calc(100vh - 120px);
          max-height: calc(100vh - 120px);
          min-height: 600px;
          width: 100%;
          position: relative;
          overflow: hidden;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          background: #f9fafb;
        }
        .form-panel {
          height: 100%;
          max-height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 1.25rem;
          background: #f9fafb;
          border-right: 1px solid #e5e7eb;
          box-sizing: border-box;
          scrollbar-width: thin;
          overscroll-behavior: contain;
        }
        .preview-panel {
          height: 100%;
          max-height: 100%;
          position: sticky;
          top: 0;
          overflow-y: auto;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding: 1rem 1rem 3rem 1rem;
          background: #f3f4f6;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          box-sizing: border-box;
          scrollbar-width: thin;
          overscroll-behavior: contain;
        }

        /* Sleek scrollbars for independent panel scrolling */
        .form-panel::-webkit-scrollbar,
        .preview-panel::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .form-panel::-webkit-scrollbar-track,
        .preview-panel::-webkit-scrollbar-track {
          background: transparent;
        }
        .form-panel::-webkit-scrollbar-thumb,
        .preview-panel::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.5);
          border-radius: 9999px;
        }
        .form-panel::-webkit-scrollbar-thumb:hover,
        .preview-panel::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 0.8);
        }

        @media (max-width: 1024px) {
          .split-container {
            flex-direction: column !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            background: transparent !important;
          }
          .form-panel, .preview-panel {
            width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow-y: visible !important;
            border-right: none !important;
          }
        }

        /* Form sections from reference repo */
        .form-section {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .form-section h3 {
          font-weight: 700;
          font-size: 0.875rem;
          margin-bottom: 0.75rem;
          color: #1f2937;
        }
        .form-group {
          margin-bottom: 0.875rem;
        }
        .form-group label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.375rem;
          letter-spacing: 0.025em;
        }
        .form-group input,
        .form-group select,
        .form-group textarea,
        .form-panel input:not([type="checkbox"]):not([type="radio"]),
        .form-panel select,
        .form-panel textarea {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background-color: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
          line-height: 1.25rem;
          font-family: inherit;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
          transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out, background-color 0.15s ease-in-out;
        }
        .form-group input:hover,
        .form-group select:hover,
        .form-group textarea:hover,
        .form-panel input:hover:not([type="checkbox"]):not([type="radio"]),
        .form-panel select:hover,
        .form-panel textarea:hover {
          border-color: #9ca3af;
        }
        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus,
        .form-panel input:focus:not([type="checkbox"]):not([type="radio"]),
        .form-panel select:focus,
        .form-panel textarea:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
          background-color: #ffffff;
        }
        .form-group select,
        .form-panel select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          cursor: pointer;
          padding-right: 2.5rem;
        }
        .dropdown-menu-dark {
          border-radius: 0.75rem;
          margin-top: 0.375rem;
          box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
          border: 1.5px solid #e2e8f0;
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(8px);
          padding: 0.375rem;
        }
        .dropdown-item-dark {
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.125rem;
          transition: background-color 0.12s ease;
        }

        /* Trips tabs from reference repo */
        .trips-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 2px solid #e5e7eb;
          flex-wrap: wrap;
        }
        .trip-tab {
          padding: 0.75rem 1rem;
          background: white;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s ease;
          border-radius: 0.375rem 0.375rem 0 0;
        }
        .trip-tab:hover {
          background: #f9fafb;
          color: #374151;
        }
        .trip-tab.active {
          color: #1e40af;
          border-bottom-color: #3b82f6;
          background: white;
          font-weight: 600;
        }
        .trip-close-btn {
          background: #fee2e2;
          color: #dc2626;
          border: none;
          border-radius: 0.375rem;
          width: 1.75rem;
          height: 1.75rem;
          font-size: 1.25rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          font-weight: bold;
        }
        .trip-close-btn:hover {
          background: #fca5a5;
          color: #991b1b;
        }
        .trip-add-btn {
          background: #dbeafe !important;
          color: #0369a1 !important;
          border-bottom: 3px solid transparent !important;
          padding: 0.75rem 0.5rem !important;
        }
        .trip-details {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1rem;
        }
        .trip-toggle {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #f0f9ff;
          border-radius: 0.375rem;
        }

        /* Bill Details Grid Styling from reference repo */
        .bill-details-grid {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 0.25rem 1.5rem;
          width: 100%;
          line-height: 1.3;
        }
        .bill-details-grid .detail-row {
          display: contents;
        }
        .bill-details-grid .detail-label {
          color: #24262b;
          font-size: inherit;
          font-weight: 600;
          white-space: nowrap;
          text-align: left;
        }
        .bill-details-grid .detail-value {
          color: #000000;
          font-weight: 700;
          text-align: left;
          line-height: 1.3;
        }
        .invoice-header .bill-details-grid,
        header .bill-details-grid {
          grid-template-columns: auto 1fr;
          gap: 0.25rem 1.5rem;
          line-height: 1.3;
        }
        .invoice-header .bill-details-grid .detail-label,
        header .bill-details-grid .detail-label {
          color: #24262b;
          font-weight: 500;
        }
        .invoice-header .bill-details-grid .detail-value,
        header .bill-details-grid .detail-value {
          color: #000000;
          font-weight: 700;
          line-height: 1.3;
        }

        /* DASHBOARD CARDS & GRIDS: Exact 3 columns filling 100% of container width smoothly */
        .bills-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.5rem;
          align-items: stretch;
          width: 100%;
        }
        @media (max-width: 1024px) {
          .bills-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .bills-grid {
            grid-template-columns: repeat(1, minmax(0, 1fr));
          }
        }
        .bill-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          padding: 1.5rem;
          transition: all 0.2s ease;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          width: 100%;
        }
        .bill-card:hover {
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
          border-color: #bfdbfe;
        }
        .bill-card-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 1rem;
        }
        .bill-card-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #1f2937;
        }
        .bill-card-menu {
          background: none;
          border: none;
          color: #6b7280;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0.375rem;
          transition: all 0.15s ease;
        }
        .bill-card-menu:hover {
          background: #f3f4f6;
          color: #1f2937;
        }
        .bill-card-meta {
          display: grid;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .bill-card-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.875rem;
        }
        .bill-card-meta-label {
          color: #6b7280;
          font-weight: 500;
        }
        .bill-card-meta-value {
          color: #1f2937;
          font-weight: 600;
        }
        .bill-payment-status {
          display: inline-block;
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          transition: all 0.2s ease;
        }
        .bill-payment-status:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .bill-payment-status.status-paid {
          background: #d1fae5;
          color: #065f46;
        }
        .bill-payment-status.status-unpaid {
          background: #fee2e2;
          color: #7f1d1d;
        }
        .bill-card-footer {
          display: flex;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }
        .bill-card-btn {
          flex: 1;
          padding: 0.5rem;
          background: #f3f4f6;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        .bill-card-btn:hover {
          background: #e5e7eb;
        }
        .bill-card-btn.primary {
          background: #3b82f6;
          color: white;
        }
        .bill-card-btn.primary:hover {
          background: #2563eb;
        }
        .bill-card-btn:disabled,
        .bill-card.bill-locked .bill-card-btn.primary,
        .context-menu-item:disabled,
        .cursor-not-allowed,
        button:disabled {
          cursor: not-allowed !important;
          pointer-events: auto !important;
        }
        .bill-card.bill-locked .bill-card-btn.primary:hover {
          background: #9ca3af !important;
          cursor: not-allowed !important;
        }

        /* Context Menu */
        .context-menu {
          position: absolute;
          right: 1.5rem;
          top: 3.5rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          min-width: 160px;
          padding: 0.25rem 0;
        }
        .context-menu-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.5rem 1rem;
          background: none;
          border: none;
          text-align: left;
          cursor: pointer;
          font-size: 0.8125rem;
          color: #374151;
          transition: all 0.15s ease;
        }
        .context-menu-item:hover {
          background: #f3f4f6;
        }

        /* Stats Bar */
        .stats-bar {
          background: white;
          padding: 1.25rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        }
        .stat-card {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        }
        .stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: #111827;
        }

        /* Filters Bar */
        .filters-bar {
          background: white;
          padding: 1rem 1.25rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        }
        .view-btn {
          padding: 0.5rem 0.75rem;
          background: white;
          border: 1px solid #d1d5db;
          cursor: pointer;
          color: #6b7280;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .view-btn.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        /* Table View */
        .bills-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .bills-table th {
          background: #f9fafb;
          padding: 0.75rem 1rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #4b5563;
          border-bottom: 2px solid #e5e7eb;
          text-align: left;
        }
        .bills-table td {
          padding: 0.75rem 1rem;
          font-size: 0.8125rem;
          color: #1f2937;
          border-bottom: 1px solid #e5e7eb;
        }
        .bills-table tr:hover {
          background: #f9fafb;
        }

        /* Bill locked class */
        .bill-card.bill-locked {
          border-left: 4px solid #10b981;
          background: #f0fdf4;
        }

        /* Read-only input helper */
        .read-only-input {
          background-color: #f3f4f6 !important;
          color: #4b5563 !important;
          cursor: not-allowed;
        }

        /* =========================================================================
           DARK THEME SUPPORT (Comprehensive mode adaptation)
        ========================================================================= */
        :global(html.dark) .split-container {
          border-color: rgba(255, 255, 255, 0.1) !important;
          background: #09090b !important;
        }
        :global(html.dark) .form-panel {
          background: #09090b !important;
          border-right-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .preview-panel {
          background: #121214 !important;
        }
        :global(html.dark) .form-panel::-webkit-scrollbar-thumb,
        :global(html.dark) .preview-panel::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
        }
        :global(html.dark) .a4-page {
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
        }
        :global(html.dark) .form-section {
          background: #18181b !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .form-section h3 {
          color: #f4f4f5 !important;
        }
        :global(html.dark) .form-group label {
          color: #94a3b8 !important;
        }
        :global(html.dark) .form-group input,
        :global(html.dark) .form-group select,
        :global(html.dark) .form-group textarea,
        :global(html.dark) .form-panel input:not([type="checkbox"]):not([type="radio"]),
        :global(html.dark) .form-panel select,
        :global(html.dark) .form-panel textarea {
          background-color: #18181b !important;
          border: 1px solid #27272a !important;
          color: #f4f4f5 !important;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.4) !important;
        }
        :global(html.dark) .form-group input:hover,
        :global(html.dark) .form-group select:hover,
        :global(html.dark) .form-group textarea:hover,
        :global(html.dark) .form-panel input:hover:not([type="checkbox"]):not([type="radio"]),
        :global(html.dark) .form-panel select:hover,
        :global(html.dark) .form-panel textarea:hover {
          border-color: #3f3f46 !important;
        }
        :global(html.dark) .form-group input:focus,
        :global(html.dark) .form-group select:focus,
        :global(html.dark) .form-group textarea:focus,
        :global(html.dark) .form-panel input:focus:not([type="checkbox"]):not([type="radio"]),
        :global(html.dark) .form-panel select:focus,
        :global(html.dark) .form-panel textarea:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important;
          background-color: #18181b !important;
        }
        :global(html.dark) .form-group select,
        :global(html.dark) .form-panel select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          cursor: pointer;
        }
        :global(html.dark) .read-only-input {
          background-color: #18181b !important;
          color: #71717a !important;
          border-color: #27272a !important;
        }
        :global(html.dark) .dropdown-menu-dark {
          background: rgba(18, 18, 20, 0.98) !important;
          border-color: #27272a !important;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4) !important;
        }
        :global(html.dark) .trips-tabs {
          border-bottom-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .trip-tab {
          background: #18181b !important;
          color: #a1a1aa !important;
        }
        :global(html.dark) .trip-tab:hover {
          background: #27272a !important;
          color: #ffffff !important;
        }
        :global(html.dark) .trip-tab.active {
          background: #18181b !important;
          color: #ffffff !important;
          border-bottom-color: #ffffff !important;
        }
        :global(html.dark) .trip-add-btn {
          background: #1e3a8a !important;
          color: #bfdbfe !important;
        }
        :global(html.dark) .trip-details {
          background: #18181b !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .trip-toggle {
          background: rgba(255, 255, 255, 0.05) !important;
        }
        :global(html.dark) .trip-toggle label {
          color: #93c5fd !important;
        }
        :global(html.dark) .bill-card {
          background: #18181b !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .bill-card:hover {
          border-color: rgba(255, 255, 255, 0.3) !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
        }
        :global(html.dark) .bill-card.bill-locked {
          background: rgba(6, 78, 59, 0.25) !important;
          border-left: 4px solid #10b981 !important;
        }
        :global(html.dark) .bill-card-title {
          color: #ffffff !important;
        }
        :global(html.dark) .bill-card-menu {
          color: #a1a1aa !important;
        }
        :global(html.dark) .bill-card-menu:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          color: #ffffff !important;
        }
        :global(html.dark) .bill-card-meta-label {
          color: #71717a !important;
        }
        :global(html.dark) .bill-card-meta-value {
          color: #f4f4f5 !important;
        }
        :global(html.dark) .bill-payment-status.status-paid {
          background: rgba(16, 185, 129, 0.15) !important;
          color: #6ee7b7 !important;
          border: 1px solid rgba(16, 185, 129, 0.3) !important;
        }
        :global(html.dark) .bill-payment-status.status-unpaid {
          background: rgba(239, 68, 68, 0.15) !important;
          color: #fca5a5 !important;
          border: 1px solid rgba(239, 68, 68, 0.3) !important;
        }
        :global(html.dark) .bill-card-footer {
          border-top-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .bill-card-btn {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #f4f4f5 !important;
        }
        :global(html.dark) .bill-card-btn:hover {
          background: rgba(255, 255, 255, 0.15) !important;
        }
        :global(html.dark) .bill-card-btn.primary {
          background: #ffffff !important;
          color: #000000 !important;
        }
        :global(html.dark) .bill-card-btn.primary:hover {
          background: #e4e4e7 !important;
        }
        :global(html.dark) .bill-card-btn:disabled,
        :global(html.dark) .bill-card.bill-locked .bill-card-btn.primary,
        :global(html.dark) .context-menu-item:disabled,
        :global(html.dark) .cursor-not-allowed,
        :global(html.dark) button:disabled {
          cursor: not-allowed !important;
          pointer-events: auto !important;
        }
        :global(html.dark) .bill-card.bill-locked .bill-card-btn.primary:hover {
          background: #3f3f46 !important;
          cursor: not-allowed !important;
        }
        :global(html.dark) .context-menu {
          background: #18181b !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important;
        }
        :global(html.dark) .context-menu-item {
          color: #d4d4d8 !important;
        }
        :global(html.dark) .context-menu-item:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #ffffff !important;
        }
        :global(html.dark) .bills-table {
          background: #18181b !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .bills-table th {
          background: rgba(255, 255, 255, 0.04) !important;
          color: #a1a1aa !important;
          border-bottom-color: rgba(255, 255, 255, 0.1) !important;
        }
        :global(html.dark) .bills-table td {
          color: #f4f4f5 !important;
          border-bottom-color: rgba(255, 255, 255, 0.06) !important;
        }
        :global(html.dark) .bills-table tr:hover {
          background: rgba(255, 255, 255, 0.04) !important;
        }
      `}</style>

      {/* =========================================================================
          VIEW 1: DASHBOARD VIEW (Reference repo: pages/dashboard.html)
      ========================================================================= */}
      {view === 'dashboard' && (
        <div className="space-y-6">
          {/* Top Action Bar with Create New Bill */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-gray-200 dark:border-white/10">
            <div>
              <h2 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-gray-900 dark:text-white tracking-tight">Freight Bills</h2>
              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage and generate freight bills</p>
            </div>
            <button
              type="button"
              onClick={handleCreateNewBill}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-sm font-semibold rounded-lg shadow-sm hover:bg-neutral-800 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 text-white dark:text-black" />
              <span>Create New Bill</span>
            </button>
          </div>

          {/* STATS SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs">
              <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block">
                Total Bills
              </span>
              <span className="text-xl font-black text-gray-900 dark:text-white mt-1 block">
                {bills.length}
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-950/60 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Received (Paid)
              </span>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1 block">
                ₹ {stats.received.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-950/60 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                Pending (Unpaid)
              </span>
              <span className="text-xl font-black text-amber-700 dark:text-amber-400 mt-1 block">
                ₹ {stats.pending.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs">
              <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block">
                Filter Results
              </span>
              <span className="text-xl font-black text-gray-900 dark:text-white mt-1 block">
                {filteredBills.length}{' '}
                <span className="text-xs font-normal text-gray-500 dark:text-zinc-400">of {bills.length} bills</span>
              </span>
            </div>
          </div>

          {/* SEARCH & EXTENSIVE FILTERS BAR */}
          <div className="p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 shadow-xs space-y-3.5">
            {/* Top Row: Full Search Bar & View Mode Switcher */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search anything: Bill #, Vehicle, Driver, Place, Consignee, Amount, DC No..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs sm:text-sm font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    title="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View Mode Toggle: Cards vs Table */}
              <div className="inline-flex items-center self-end md:self-auto rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  title="Card View"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'card'
                      ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Table View"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>
            </div>

            {/* Bottom Row: Multi-Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-gray-100 dark:border-white/5">
              <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" />
                Filters:
              </span>

              {/* 1. Vehicle Filter */}
              <div className="relative">
                <select
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer"
                >
                  <option value="">All Vehicles ({bills.length})</option>
                  {vehicleOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              </div>

              {/* 2. Driver Filter */}
              <div className="relative">
                <select
                  value={driverFilter}
                  onChange={(e) => setDriverFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer"
                >
                  <option value="">All Drivers</option>
                  {driverOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              </div>

              {/* 3. Payment Status Filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer"
                >
                  <option value="">All Payments</option>
                  <option value="paid">Received (Paid)</option>
                  <option value="unpaid">Not Received (Pending)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              </div>

              {/* 4. Lock Status Filter */}
              <div className="relative">
                <select
                  value={lockFilter}
                  onChange={(e) => setLockFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer"
                >
                  <option value="">All Lock States</option>
                  <option value="locked">Locked</option>
                  <option value="unlocked">Unlocked</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              </div>

              {/* 5. Month Filter */}
              {monthOptions.length > 0 && (
                <div className="relative">
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">All Months</option>
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {formatMonthLabel(m)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
                </div>
              )}

              {/* 6. Sort Order: Highest Number 1st by Default */}
              <div className="relative ml-auto">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  aria-label="Sort Bills"
                  className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 cursor-pointer"
                >
                  <option value="bill_desc">Bill # (Highest 1st)</option>
                  <option value="bill_asc">Bill # (Lowest 1st)</option>
                  <option value="date_desc">Date (Newest 1st)</option>
                  <option value="date_asc">Date (Oldest 1st)</option>
                  <option value="amount_desc">Amount (Highest 1st)</option>
                  <option value="amount_asc">Amount (Lowest 1st)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              </div>

              {/* Reset Filters Button */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filters ({activeFilterCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Bills List / Cards Display */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading bills...</span>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-gray-300 dark:border-white/15 rounded-xl bg-white dark:bg-zinc-900/60">
              <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-gray-700 dark:text-gray-200">No bills found</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Try adjusting your filters or create a new bill.</p>
              <button
                type="button"
                onClick={handleCreateNewBill}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-black text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-xs font-semibold rounded-lg hover:bg-neutral-800 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Plus className="w-4 h-4 text-white dark:text-black" />
                <span>Create New Bill</span>
              </button>
            </div>
          ) : viewMode === 'card' ? (
            /* EXACT CARD VIEW FROM REFERENCE REPO (dashboard.js line 754) */
            <div className="bills-grid">
              {paginatedBills.map((bill) => {
                const totalAmount = calculateBillTotal(bill);
                const paymentStatus = bill.status === 'paid' ? 'Received' : 'Not Received';
                const statusClass = bill.status === 'paid' ? 'status-paid' : 'status-unpaid';
                const updatedDateStr = bill.updatedAt
                  ? new Date(bill.updatedAt).toLocaleDateString('en-IN')
                  : bill.date;

                return (
                  <div
                    key={bill.billNumber}
                    className={`bill-card flex flex-col justify-between h-full ${bill.locked ? 'bill-locked' : ''}`}
                  >
                    <div className="bill-card-header">
                      <div>
                        <div className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                          Bill Number
                        </div>
                        <div className="bill-card-title flex items-center gap-1.5">
                          <span>{bill.billNumber}</span>
                          {bill.locked && <Lock className="w-3.5 h-3.5 text-green-600 dark:text-green-400 inline-block" />}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-zinc-400 mt-2">{bill.vehicleNumber}</div>
                      </div>

                      {/* 3-dots Menu Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === bill.billNumber ? null : bill.billNumber);
                          }}
                          className="bill-card-menu"
                        >
                          ⋮
                        </button>

                        {/* EXACT CONTEXT MENU DROPDOWN (Reference dashboard.css / js) */}
                        {activeMenuId === bill.billNumber && (
                          <div className="context-menu">
                            <button
                              type="button"
                              disabled={bill.locked}
                              onClick={() => {
                                if (bill.locked) return;
                                openEditor(bill);
                                setActiveMenuId(null);
                              }}
                              title={bill.locked ? 'This bill is locked because it is received' : 'Edit Bill'}
                              className={`context-menu-item ${bill.locked ? 'opacity-50 cursor-not-allowed text-gray-400 dark:text-zinc-500' : ''}`}
                              style={bill.locked ? { cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>{bill.locked ? 'Edit (Locked)' : 'Edit'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openEditor(bill);
                                setActiveMenuId(null);
                              }}
                              className="context-menu-item"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                handlePrint(bill);
                              }}
                              className="context-menu-item"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateBill(bill)}
                              className="context-menu-item"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Duplicate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePaymentStatus(bill.billNumber)}
                              className="context-menu-item"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                              <span>{bill.status === 'paid' ? 'Mark as Not Received' : 'Mark as Received'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleLock(bill.billNumber)}
                              className="context-menu-item"
                            >
                              {bill.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              <span>{bill.locked ? 'Unlock Bill' : 'Lock Bill'}</span>
                            </button>
                            <div className="border-t border-gray-200 dark:border-white/10 my-1"></div>
                            <button
                              type="button"
                              onClick={() => handleDeleteBill(bill.billNumber)}
                              className="context-menu-item text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bill-card-meta">
                      <div className="bill-card-meta-row">
                        <span className="bill-card-meta-label">Date</span>
                        <span className="bill-card-meta-value">{bill.date || 'N/A'}</span>
                      </div>
                      <div className="bill-card-meta-row">
                        <span className="bill-card-meta-label">Trips</span>
                        <span className="bill-card-meta-value">{bill.visibleTrips}</span>
                      </div>
                      <div className="bill-card-meta-row">
                        <span className="bill-card-meta-label">Total Amount</span>
                        <span className="bill-card-meta-value text-green-600 dark:text-emerald-400 font-bold">
                          ₹ {totalAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="bill-card-meta-row">
                        <span className="bill-card-meta-label">Last Updated</span>
                        <span className="bill-card-meta-value text-gray-500 dark:text-zinc-400">{updatedDateStr}</span>
                      </div>
                      <div className="bill-card-meta-row">
                        <span className="bill-card-meta-label">Payment Status</span>
                        <span
                          className={`bill-payment-status ${statusClass} cursor-pointer`}
                          onClick={(e) => handleTogglePaymentStatus(bill.billNumber, e)}
                        >
                          {paymentStatus}
                        </span>
                      </div>
                      {bill.locked && (
                        <div className="bill-card-meta-row">
                          <span className="bill-card-meta-label text-green-600 dark:text-green-400 font-semibold">
                            Status
                          </span>
                          <span className="text-green-600 dark:text-green-400 font-semibold text-xs">Locked</span>
                        </div>
                      )}
                    </div>

                    <div className="bill-card-footer">
                      <button
                        type="button"
                        onClick={() => {
                          if (bill.locked) return;
                          openEditor(bill);
                        }}
                        disabled={bill.locked}
                        title={bill.locked ? 'This bill is locked because it is received' : 'Edit Bill'}
                        className={`bill-card-btn primary ${bill.locked ? 'opacity-60 cursor-not-allowed bg-gray-400 hover:bg-gray-400 dark:bg-zinc-700 dark:hover:bg-zinc-700' : ''}`}
                        style={bill.locked ? { cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                      >
                        {bill.locked ? <Lock className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        <span>{bill.locked ? 'Locked' : 'Edit'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(bill)}
                        className="bill-card-btn"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* EXACT TABLE VIEW FROM REFERENCE REPO (dashboard.js line 693) */
            <div className="overflow-x-auto">
              <table className="bills-table">
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Trips</th>
                    <th>Total Amount</th>
                    <th>Payment Status</th>
                    <th>Last Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBills.map((bill) => {
                    const totalAmount = calculateBillTotal(bill);
                    const paymentStatus = bill.status === 'paid' ? 'Received' : 'Not Received';
                    const statusClass = bill.status === 'paid' ? 'status-paid' : 'status-unpaid';
                    const updatedDateStr = bill.updatedAt
                      ? new Date(bill.updatedAt).toLocaleDateString('en-IN')
                      : bill.date;

                    return (
                      <tr key={bill.billNumber}>
                        <td className="font-bold">
                          {bill.billNumber}
                          {bill.locked && <Lock className="w-3 h-3 text-green-600 dark:text-green-400 inline ml-1" />}
                        </td>
                        <td>{bill.date || 'N/A'}</td>
                        <td>{bill.vehicleNumber}</td>
                        <td>{bill.visibleTrips} trips</td>
                        <td className="font-bold text-green-600 dark:text-emerald-400">₹ {totalAmount.toLocaleString('en-IN')}</td>
                        <td>
                          <span
                            className={`bill-payment-status ${statusClass} cursor-pointer`}
                            onClick={(e) => handleTogglePaymentStatus(bill.billNumber, e)}
                          >
                            {paymentStatus}
                          </span>
                        </td>
                        <td className="text-gray-500 dark:text-zinc-400 text-xs">{updatedDateStr}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            disabled={bill.locked}
                            onClick={() => {
                              if (bill.locked) return;
                              openEditor(bill);
                            }}
                            title={bill.locked ? 'This bill is locked because it is received' : 'Edit Bill'}
                            className={`p-1 rounded font-semibold text-xs mr-2 ${bill.locked ? 'opacity-50 text-gray-400 dark:text-zinc-600 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-blue-600 dark:text-blue-400 cursor-pointer'}`}
                            style={bill.locked ? { cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            {bill.locked ? 'Locked' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrint(bill)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-700 dark:text-gray-300 text-xs cursor-pointer"
                          >
                            Print
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls Bar per instructions.md (Max 20 items per page) */}
          {filteredBills.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200 dark:border-white/10">
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Showing <span className="font-semibold text-gray-900 dark:text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredBills.length)}
                </span>{' '}
                of <span className="font-semibold text-gray-900 dark:text-white">{filteredBills.length}</span> bills
              </div>

              {totalPages > 1 && (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-white/15 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[32px] h-8 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        currentPage === page
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'border border-gray-300 dark:border-white/15 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-white/15 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Floating Action Button for mobile on dashboard view */}
          <div className="sm:hidden fixed bottom-6 right-6 z-40">
            <button
              type="button"
              onClick={handleCreateNewBill}
              aria-label="Create New Bill"
              className="w-14 h-14 bg-black text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 rounded-full shadow-2xl flex items-center justify-center hover:bg-neutral-800 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-6 h-6 text-white dark:text-black" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: INVOICE CREATION & LIVE PREVIEW (Reference repo: pages/invoice.html)
      ========================================================================= */}
      {view === 'editor' && (
        <div className="w-full">
          {/* Top Back Navigation Bar */}
          <div className="mb-3 pb-2.5 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between no-print gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  window.history.back();
                } else {
                  closeEditor();
                }
              }}
              aria-label="Back to Freight Bills"
              title="Return to Freight Bills list"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-900 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Freight Bills</span>
            </button>
            <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium font-mono">
              Editing Freight Bill #{currentBill.billNumber}
            </span>
          </div>

          {/* Split Layout: Form Panel (Left) & Preview Panel (Right) */}
          <div ref={splitContainerRef} className="split-container relative">
            {/* LEFT FORM PANEL (lines 68-141) */}
            <div
              className="form-panel no-print"
              style={{
                width: `${leftPanelWidth}%`,
                flex: `0 0 ${leftPanelWidth}%`,
                maxWidth: `${leftPanelWidth}%`,
              }}
            >
              {/* =========================================================================
                  SECTION 1: NON-TRIP RELATED CONTENTS (Bill Logistics & Parties)
              ========================================================================= */}
              <div className="form-section border-b-2 border-gray-200 dark:border-zinc-800 pb-5 mb-5">
                {/* Section 1 Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-xs">
                      1
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white m-0">
                        Section 1: Non-Trip Related Contents
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-zinc-400 m-0">
                        Bill metadata, vehicle registration, and party details
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400">
                    Non-Trip Data
                  </span>
                </div>

                {/* 3 Columns: Bill No, Bill Date, Vehicle No */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {/* Bill No */}
                  <div className="form-group mb-0">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                      Bill No
                    </label>
                    <input
                      type="number"
                      value={currentBill.billNumber}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) =>
                        setCurrentBill({ ...currentBill, billNumber: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-bold font-mono shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  {/* Bill Date with CustomDatePicker */}
                  <div className="form-group mb-0">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                      Date (DD-MM-YYYY)
                    </label>
                    <CustomDatePicker
                      value={currentBill.date}
                      onChange={(newDate) => setCurrentBill({ ...currentBill, date: newDate })}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>

                  {/* Vehicle No - Strictly Dropdown, No Manual Entry */}
                  <div className="form-group mb-0">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                      Vehicle No
                    </label>
                    <div className="relative">
                      <select
                        value={currentBill.vehicleNumber}
                        onChange={(e) => setCurrentBill({ ...currentBill, vehicleNumber: e.target.value })}
                        className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-bold font-mono uppercase shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                      >
                        {availableVehicles.map((v) => (
                          <option key={v.id} value={v.registrationNumber}>
                            {v.registrationNumber} {v.model ? `(${v.model})` : ''}
                          </option>
                        ))}
                        {!availableVehicles.some((v) => v.registrationNumber === 'TN 76 AK 1094') && (
                          <option value="TN 76 AK 1094">TN 76 AK 1094 (Ashok Leyland 1618)</option>
                        )}
                        {!availableVehicles.some((v) => v.registrationNumber === 'TN 99 E 8505') && (
                          <option value="TN 99 E 8505">TN 99 E 8505 (Eicher Pro 3019)</option>
                        )}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 dark:text-zinc-500">
                        <ChevronDown className="w-4 h-4 stroke-[2.25]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Parties: Consignor (Fixed) and Consignee (Editable with Dropdown & Manual Override) */}
                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                  {/* CONSIGNOR (FROM) - Non-editable card */}
                  <div className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-900/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                        CONSIGNOR (FROM)
                      </span>
                      <span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 italic">
                        Standard Non-Editable
                      </span>
                    </div>
                    <p className="font-bold uppercase text-xs text-gray-900 dark:text-zinc-100">
                      VENKATESHWARA HATCHERIES PVT LTD.
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 uppercase font-medium mt-0.5">
                      NELLAKOTTAI HATCHERIES, DINDUGUL DT. TN.
                    </p>
                    <p className="text-[11px] font-mono font-medium text-gray-700 dark:text-zinc-300 mt-0.5">
                      GST: 33AAACV7247H1ZB
                    </p>
                  </div>

                  {/* CONSIGNEE (TO) - The only new editable entity in Section 1 */}
                  <div className="p-3.5 rounded-xl border-2 border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                          CONSIGNEE (TO)
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/80 dark:text-blue-200">
                          Editable
                        </span>
                      </div>

                      {/* Manual Override Checkbox Toggle */}
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(currentBill.consigneeOverride)}
                          onChange={(e) => {
                            const isOverride = e.target.checked;
                            setCurrentBill({
                              ...currentBill,
                              consigneeOverride: isOverride,
                              consigneePreset: isOverride ? 'custom' : (currentBill.consigneePreset || 'broiler_branch'),
                            });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Manual Override</span>
                      </label>
                    </div>

                    {/* Preset Dropdown */}
                    <div className="mb-2.5">
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-zinc-400 mb-1.5">
                        Select Consignee Preset:
                      </label>
                      <div className="relative">
                        <select
                          value={currentBill.consigneePreset || 'broiler_branch'}
                          onChange={(e) => {
                            const presetId = e.target.value;
                            const found = CONSIGNEE_PRESETS.find((p) => p.id === presetId);
                            if (found && presetId !== 'custom') {
                              setCurrentBill({
                                ...currentBill,
                                consigneePreset: presetId,
                                consigneeName: found.name,
                                consigneeAddress: found.address,
                                consigneeGst: found.gst,
                                consigneeOverride: false,
                              });
                            } else {
                              setCurrentBill({
                                ...currentBill,
                                consigneePreset: 'custom',
                                consigneeOverride: true,
                              });
                            }
                          }}
                          className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium shadow-xs hover:border-blue-300 dark:hover:border-blue-800 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                        >
                          {CONSIGNEE_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-blue-600 dark:text-blue-400">
                          <ChevronDown className="w-4 h-4 stroke-[2.25]" />
                        </div>
                      </div>
                    </div>

                    {/* When NOT in manual override mode: Clean preview card */}
                    {!currentBill.consigneeOverride && (
                      <div className="p-3 rounded-lg bg-white dark:bg-[#0c0c0e] border border-blue-100 dark:border-blue-900/40 text-xs shadow-sm">
                        <p className="font-bold uppercase text-gray-900 dark:text-zinc-100 text-[13px]">
                          {currentBill.consigneeName || 'VENKATESHWARA HATCHERIES PVT LTD.'}
                        </p>
                        <p className="text-gray-600 dark:text-zinc-400 uppercase font-medium mt-1">
                          {currentBill.consigneeAddress || 'BROILER BRANCH, TN, KA, AP & KL'}
                        </p>
                        <p className="text-gray-700 dark:text-zinc-300 font-mono font-medium mt-1">
                          GST: {currentBill.consigneeGst || '33AAACV7247H1ZB (Nilakkottai)'}
                        </p>
                      </div>
                    )}

                    {/* When IN manual override mode: Text editable inputs */}
                    {currentBill.consigneeOverride && (
                      <div className="space-y-3 mt-3 pt-3 border-t border-blue-200/80 dark:border-blue-900/50 animate-in fade-in duration-150">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 dark:text-zinc-300 mb-1">
                            Consignee Name:
                          </label>
                          <input
                            type="text"
                            value={currentBill.consigneeName ?? 'VENKATESHWARA HATCHERIES PVT LTD.'}
                            onChange={(e) =>
                              setCurrentBill({ ...currentBill, consigneeName: e.target.value.toUpperCase() })
                            }
                            placeholder="e.g. VENKATESHWARA HATCHERIES PVT LTD."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-bold uppercase shadow-xs hover:border-blue-400 dark:hover:border-blue-700 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 dark:text-zinc-300 mb-1">
                            Branch / Delivery Address:
                          </label>
                          <input
                            type="text"
                            value={currentBill.consigneeAddress ?? 'BROILER BRANCH, TN, KA, AP & KL'}
                            onChange={(e) =>
                              setCurrentBill({ ...currentBill, consigneeAddress: e.target.value.toUpperCase() })
                            }
                            placeholder="e.g. BROILER BRANCH, TN, KA, AP & KL"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium uppercase shadow-xs hover:border-blue-400 dark:hover:border-blue-700 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 dark:text-zinc-300 mb-1">
                            GST Number / Branch Code:
                          </label>
                          <input
                            type="text"
                            value={currentBill.consigneeGst ?? '33AAACV7247H1ZB (Nilakkottai)'}
                            onChange={(e) =>
                              setCurrentBill({ ...currentBill, consigneeGst: e.target.value })
                            }
                            placeholder="e.g. 33AAACV7247H1ZB (Nilakkottai)"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-mono font-medium shadow-xs hover:border-blue-400 dark:hover:border-blue-700 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 2: TRIP RELATED CONTENTS (Trips, DC, KMs, Toll, Charges)
              ========================================================================= */}
              <div className="form-section">
                {/* Section 2 Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-bold text-xs">
                      2
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white m-0">
                        Section 2: Trip Related Contents
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-zinc-400 m-0">
                        Trip records, route log, distance calculation, toll, and trip charges
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    Trips ({currentBill.visibleTrips}/6)
                  </span>
                </div>

                {/* Redesigned Trip Selector Tabs Bar */}
                <div className="p-2 rounded-xl bg-gray-100/90 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700/60 mb-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {currentBill.trips.slice(0, currentBill.visibleTrips).map((trip, idx) => {
                      const isCurrentActive = trip.id === currentBill.activeTrip;
                      const isTripOne = idx === 0;

                      return (
                        <div
                          key={trip.id}
                          className={`
                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all select-none
                            ${
                              isCurrentActive
                                ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-sm'
                                : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800/90 border border-gray-200 dark:border-zinc-700/60 font-medium'
                            }
                          `}
                        >
                          <button
                            type="button"
                            onClick={() => setCurrentBill({ ...currentBill, activeTrip: trip.id })}
                            className="cursor-pointer font-inherit flex items-center gap-1"
                          >
                            <span>Trip {idx + 1}</span>
                          </button>

                          {/* Trip 1 has greyed unaccessible X icon */}
                          {isTripOne ? (
                            <span
                              title="Trip 1 is required and cannot be removed"
                              className="text-gray-300 dark:text-zinc-600 opacity-40 cursor-not-allowed select-none p-0.5"
                              aria-disabled="true"
                            >
                              <X className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            /* Trips 2 to 6 have active X icon opening confirmation modal */
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTripToDelete(trip.id);
                              }}
                              title={`Delete Trip ${idx + 1}`}
                              className={`
                                p-0.5 rounded-full transition-colors cursor-pointer
                                ${
                                  isCurrentActive
                                    ? 'text-white/70 hover:text-white hover:bg-white/20 dark:text-black/70 dark:hover:text-black dark:hover:bg-black/10'
                                    : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                                }
                              `}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Trip Button capped strictly at 6 trips */}
                    {currentBill.visibleTrips < 6 ? (
                      <button
                        type="button"
                        onClick={addTrip}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all select-none cursor-pointer"
                        title="Add new trip (Max 6 trips)"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Trip</span>
                      </button>
                    ) : (
                      <span
                        className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 px-2.5 py-1 bg-gray-200/60 dark:bg-zinc-800/80 rounded-lg border border-gray-300/60 dark:border-zinc-700/60 select-none"
                        title="Maximum 6 trips limit reached"
                      >
                        Max 6 Trips
                      </span>
                    )}
                  </div>

                  {/* Trip Reordering Controls */}
                  {currentBill.visibleTrips > 1 && (
                    <div className="mt-2.5 pt-2 border-t border-gray-200/70 dark:border-zinc-700/60 flex items-center justify-between text-xs text-gray-500 dark:text-zinc-400">
                      <span className="font-medium text-[11px]">
                        Reorder Trip {currentBill.activeTrip}:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={currentBill.activeTrip <= 1}
                          onClick={() => moveTrip(currentBill.activeTrip - 1, 'left')}
                          className={`
                            inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all
                            ${
                              currentBill.activeTrip <= 1
                                ? 'opacity-40 cursor-not-allowed text-gray-400'
                                : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer'
                            }
                          `}
                          title="Move this trip earlier in sequence"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Move Earlier</span>
                        </button>

                        <button
                          type="button"
                          disabled={currentBill.activeTrip >= currentBill.visibleTrips}
                          onClick={() => moveTrip(currentBill.activeTrip - 1, 'right')}
                          className={`
                            inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all
                            ${
                              currentBill.activeTrip >= currentBill.visibleTrips
                                ? 'opacity-40 cursor-not-allowed text-gray-400'
                                : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer'
                            }
                          `}
                          title="Move this trip later in sequence"
                        >
                          <span>Move Later</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Trip Details with CustomDatePicker for Trip Date */}
                <div className="trip-details space-y-3">
                  <div className="form-group mb-0">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                      Date (DD-MM-YYYY)
                    </label>
                    <CustomDatePicker
                      value={activeTrip.date}
                      onChange={(newDate) => updateActiveTripField('date', newDate)}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>

                  <div className="form-group mb-0">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                      DC No
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 1024"
                      value={activeTrip.dcNo}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => updateActiveTripField('dcNo', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  {/* Particulars & Quantity in 2-Column Responsive Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Particulars - Only Dropdown (No button clicks) */}
                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Particulars
                      </label>
                      <div className="relative">
                        <select
                          value={
                            ['CHICKS', 'EGGS', 'EGG SHELLS'].includes(activeTrip.itemName || '')
                              ? activeTrip.itemName
                              : activeTrip.itemName
                              ? 'OTHER'
                              : ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'OTHER') {
                              selectParticular('OTHER');
                            } else {
                              selectParticular(val);
                            }
                          }}
                          className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                        >
                          <option value="">Select Particulars</option>
                          <option value="CHICKS">CHICKS</option>
                          <option value="EGGS">EGGS</option>
                          <option value="EGG SHELLS">EGG SHELLS</option>
                          <option value="OTHER">OTHER (Custom)</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 dark:text-zinc-500">
                          <ChevronDown className="w-4 h-4 stroke-[2.25]" />
                        </div>
                      </div>

                      {/* When OTHER is selected: show manual text entry */}
                      {(!['CHICKS', 'EGGS', 'EGG SHELLS', ''].includes(activeTrip.itemName || '') ||
                        activeTrip.itemName === 'OTHER') && (
                        <div className="mt-2 animate-in fade-in duration-150">
                          <label className="text-[11px] font-semibold text-gray-600 dark:text-zinc-400 mb-1 block">
                            Custom Particular Name:
                          </label>
                          <input
                            type="text"
                            placeholder="Type custom item (e.g. FEED, MANURE)"
                            value={activeTrip.itemName === 'OTHER' ? '' : activeTrip.itemName}
                            onChange={(e) => {
                              const customVal = e.target.value.toUpperCase();
                              updateActiveTripField('itemName', customVal || 'OTHER');
                            }}
                            className="w-full px-3.5 py-2 rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-semibold uppercase shadow-xs focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          />
                        </div>
                      )}
                    </div>

                    {/* Quantity - Disabled until Particulars is selected */}
                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Quantity
                      </label>
                      <input
                        type="number"
                        placeholder={
                          activeTrip.itemName && activeTrip.itemName.trim() !== ''
                            ? 'Enter quantity'
                            : 'Select particulars first'
                        }
                        value={activeTrip.itemQuantity || ''}
                        disabled={!activeTrip.itemName || activeTrip.itemName.trim() === ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => updateActiveTripField('itemQuantity', e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-all shadow-xs ${
                          !activeTrip.itemName || activeTrip.itemName.trim() === ''
                            ? 'bg-gray-100/70 dark:bg-zinc-900/40 border-dashed border-gray-300 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 cursor-not-allowed select-none'
                            : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                        }`}
                      />
                      {(!activeTrip.itemName || activeTrip.itemName.trim() === '') && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          Select a particular first to enter quantity.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Driver Dropdown - Dynamic from Drivers module, no hardcoded entries */}
                  <div className="form-group mb-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                        Driver
                      </label>
                      <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                        {availableDrivers.length} drivers available
                      </span>
                    </div>
                    <div className="relative">
                      <select
                        value={activeTrip.driverId || ''}
                        onChange={(e) => {
                          const sel = availableDrivers.find((d) => d.id === e.target.value);
                          updateActiveTripField('driverId', e.target.value);
                          updateActiveTripField('driverName', sel ? sel.name : '');
                          updateActiveTripField('driverRate', sel ? (sel.ratePerKm || 2.5) : 0);
                        }}
                        className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                      >
                        <option value="">Select driver</option>
                        {availableDrivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} {d.ratePerKm > 0 ? `(₹${d.ratePerKm.toFixed(2)}/km)` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 dark:text-zinc-500">
                        <ChevronDown className="w-4 h-4 stroke-[2.25]" />
                      </div>
                    </div>

                    {/* Driver Rate per KM (editable) & Trip Salary Live Display */}
                    {activeTrip.driverId && (
                      <div className="mt-2.5 p-2.5 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-700 dark:text-zinc-300">Rate (₹/KM):</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="2.50"
                            value={activeTrip.driverRate !== undefined ? activeTrip.driverRate : ''}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => updateActiveTripField('driverRate', parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-mono font-bold text-xs focus:outline-none focus:border-blue-600"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] sm:text-xs">
                          <span className="text-gray-500 dark:text-zinc-400">Driver Salary:</span>
                          <span className="font-bold text-blue-700 dark:text-blue-300">
                            {activeRunningKm} KM × ₹{Number(activeTrip.driverRate || 0).toFixed(2)} = ₹
                            {Math.round(activeRunningKm * (Number(activeTrip.driverRate) || 0)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Place Tags & Progressive Reveal Search across all India */}
                  <div className="form-group relative mb-0">
                    <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                      Place / Route (All India Search & Custom Entry)
                    </label>
                    {/* Selected place tags */}
                    <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
                      {(activeTrip.route || '')
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean)
                        .map((place) => (
                          <div
                            key={place}
                            className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-800 px-2.5 py-0.5 rounded-full text-xs font-semibold text-blue-900 dark:text-blue-300"
                          >
                            <span>{place}</span>
                            <button
                              type="button"
                              onClick={() => removePlace(place)}
                              className="text-blue-800 dark:text-blue-300 hover:text-blue-950 dark:hover:text-blue-100 font-bold ml-1 cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search any Indian city/town or type custom place & press Enter"
                        value={placeSearchInput}
                        onChange={(e) => {
                          setPlaceSearchInput(e.target.value);
                          setPlaceDropdownOpen(true);
                        }}
                        onFocus={() => {
                          if (placeSearchInput.trim()) setPlaceDropdownOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (placeSearchInput.trim()) {
                              selectPlace(placeSearchInput.trim());
                            }
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    {/* Progressive Reveal Places dropdown */}
                    {placeDropdownOpen && placeSearchInput.trim() && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 p-1.5 space-y-0.5">
                        {/* Always allow adding whatever user typed as a custom place */}
                        <div
                          onClick={() => selectPlace(placeSearchInput.trim())}
                          className="px-3 py-2 cursor-pointer bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold flex items-center justify-between transition-colors mb-1"
                        >
                          <span>+ Add &quot;{placeSearchInput.trim()}&quot; as custom place</span>
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-200/80 dark:bg-blue-800 text-blue-900 dark:text-blue-100 font-mono">
                            Press Enter
                          </span>
                        </div>

                        {placeResults.map((place) => (
                          <div
                            key={`${place.name}-${place.state || ''}`}
                            onClick={() => selectPlace(place.name)}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-xs font-semibold text-gray-900 dark:text-zinc-100 transition-colors flex items-center justify-between"
                          >
                            <span>{place.name}</span>
                            {place.state && (
                              <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-normal">
                                {place.state}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Starting & Closing KM in 2-Column Responsive Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Starting KM
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 300414"
                        value={activeTrip.startingKm}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => updateActiveTripField('startingKm', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Closing KM
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 301394"
                        value={activeTrip.closingKm}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => updateActiveTripField('closingKm', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>
                  </div>

                  {/* Running KM, Rate, and Amount in 3-Column Responsive Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="form-group mb-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                          Running KM
                        </label>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase">Auto</span>
                      </div>
                      <input
                        type="number"
                        value={activeRunningKm}
                        readOnly
                        className="w-full px-3.5 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-900/40 text-gray-700 dark:text-zinc-300 font-mono text-sm font-bold shadow-xs cursor-not-allowed select-none"
                      />
                    </div>

                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Rate (₹/KM)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="20.27"
                        value={activeTrip.rate}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => updateActiveTripField('rate', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    <div className="form-group mb-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                          Amount (₹)
                        </label>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase">Auto</span>
                      </div>
                      <input
                        type="number"
                        value={activeAmount.toFixed(2)}
                        readOnly
                        className="w-full px-3.5 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-900/40 text-gray-700 dark:text-zinc-300 font-mono text-sm font-bold shadow-xs cursor-not-allowed select-none"
                      />
                    </div>
                  </div>

                  {/* Toll Gate Toggle & Input (Always present, lightened font when disabled) */}
                  <div className="border-t border-gray-200 dark:border-zinc-800 pt-3 mt-4 transition-colors duration-200">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="tollToggleBtn"
                          className={`m-0 text-sm font-semibold transition-colors duration-200 cursor-pointer select-none ${
                            activeTrip.tollEnabled
                              ? 'text-gray-900 dark:text-zinc-100'
                              : 'text-gray-400 dark:text-zinc-500 font-normal'
                          }`}
                        >
                          Toll Expense
                        </label>
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded transition-colors duration-200 ${
                            activeTrip.tollEnabled
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'
                          }`}
                        >
                          {activeTrip.tollEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>

                      {/* Modern Toggle Switch Button */}
                      <button
                        type="button"
                        id="tollToggleBtn"
                        role="switch"
                        aria-checked={activeTrip.tollEnabled}
                        onClick={() => updateActiveTripField('tollEnabled', !activeTrip.tollEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 select-none ${
                          activeTrip.tollEnabled
                            ? 'bg-blue-600 dark:bg-blue-500'
                            : 'bg-gray-300 dark:bg-zinc-700'
                        }`}
                      >
                        <span className="sr-only">Toggle Toll Expense</span>
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            activeTrip.tollEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toll Amount Input */}
                    <div className="form-group mb-0">
                      <label
                        className={`text-xs mb-1.5 block transition-colors duration-200 ${
                          activeTrip.tollEnabled
                            ? 'text-gray-700 dark:text-zinc-300 font-semibold'
                            : 'text-gray-400 dark:text-zinc-500 font-normal'
                        }`}
                      >
                        Toll Amount (₹)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={activeTrip.tollAmount || ''}
                        disabled={!activeTrip.tollEnabled}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => updateActiveTripField('tollAmount', e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono font-semibold transition-all shadow-xs ${
                          activeTrip.tollEnabled
                            ? 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                            : 'bg-gray-50/80 dark:bg-zinc-900/40 border-dashed border-gray-200 dark:border-zinc-800/80 text-gray-400 dark:text-zinc-500 cursor-not-allowed select-none'
                        }`}
                      />
                      {!activeTrip.tollEnabled && (
                        <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500 italic">
                          Toll expense is toggled off for this trip. Turn on the toggle above to enter an amount.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* KERALA RTO SECTION with Identical Toggle Button Style */}
              <div className="form-section">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="keralaRtoToggleBtn"
                      className={`m-0 text-sm font-semibold transition-colors duration-200 cursor-pointer select-none flex items-center gap-1.5 ${
                        currentBill.keralaRtoEnabled
                          ? 'text-gray-900 dark:text-zinc-100'
                          : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                    >
                      <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Kerala RTO Checkpost</span>
                    </label>
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded transition-colors duration-200 ${
                        currentBill.keralaRtoEnabled
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'
                      }`}
                    >
                      {currentBill.keralaRtoEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  {/* Modern Toggle Switch Button (Identical to Toll Expense) */}
                  <button
                    type="button"
                    id="keralaRtoToggleBtn"
                    role="switch"
                    aria-checked={currentBill.keralaRtoEnabled}
                    onClick={() => {
                      const next = !currentBill.keralaRtoEnabled;
                      setCurrentBill({
                        ...currentBill,
                        keralaRtoEnabled: next,
                        keralaRtoMultiplier: next ? (currentBill.keralaRtoMultiplier || 1) : 0,
                      });
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 select-none ${
                      currentBill.keralaRtoEnabled
                        ? 'bg-blue-600 dark:bg-blue-500'
                        : 'bg-gray-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span className="sr-only">Toggle Kerala RTO Checkpost</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        currentBill.keralaRtoEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {!currentBill.keralaRtoEnabled && (
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500 italic">
                    Kerala RTO checkpost is toggled off for this bill. Turn on the toggle above to enter checkpost trips.
                  </p>
                )}

                {currentBill.keralaRtoEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Number of Trips
                      </label>
                      <div className="relative">
                        <select
                          value={currentBill.keralaRtoMultiplier || ''}
                          onChange={(e) => setCurrentBill({ ...currentBill, keralaRtoMultiplier: parseInt(e.target.value) || 0 })}
                          className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                        >
                          <option value="" disabled>Select</option>
                          <option value="1">1 Trip</option>
                          <option value="2">2 Trips</option>
                          <option value="3">3 Trips</option>
                          <option value="4">4 Trips</option>
                          <option value="5">5 Trips</option>
                          <option value="6">6 Trips</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 dark:text-zinc-500">
                          <ChevronDown className="w-4 h-4 stroke-[2.25]" />
                        </div>
                      </div>
                    </div>

                    <div className="form-group mb-0">
                      <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Rate per Trip (₹)
                      </label>
                      <input
                        type="number"
                        placeholder="Enter amount per trip"
                        value={currentBill.keralaRtoAmount}
                        disabled={!currentBill.keralaRtoMultiplier}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => setCurrentBill({ ...currentBill, keralaRtoAmount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* DIESEL AVERAGE RATE (lines 117-123) */}
              <div className="form-section">
                <h3 className="flex items-center gap-1.5">
                  <Fuel className="w-4 h-4 text-gray-700 dark:text-zinc-300 inline" />
                  <span>Diesel Average Rate</span>
                </h3>
                <div className="form-group mb-0">
                  <label className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                    Rate (₹ per liter)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="93.38"
                    value={currentBill.dieselAvgRate}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setCurrentBill({ ...currentBill, dieselAvgRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                </div>
              </div>

              {/* RUPEES IN WORDS (lines 126-139) */}
              <div className="form-section">
                <h3 className="flex items-center gap-1.5">
                  <span className="font-bold text-sm">Tt</span>
                  <span>Rupees in Words</span>
                </h3>
                <div className="flex gap-4 mb-2.5 items-center text-xs font-semibold">
                  <label className="flex items-center gap-1.5 text-gray-800 dark:text-zinc-200 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="wordsMode"
                      value="auto"
                      checked={currentBill.rupeesInWordsMode === 'auto'}
                      onChange={() => setCurrentBill({ ...currentBill, rupeesInWordsMode: 'auto' })}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Auto Generated</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-gray-800 dark:text-zinc-200 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="wordsMode"
                      value="manual"
                      checked={currentBill.rupeesInWordsMode === 'manual'}
                      onChange={() => setCurrentBill({ ...currentBill, rupeesInWordsMode: 'manual' })}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Manual Override</span>
                  </label>
                </div>
                <div className="form-group mb-0">
                  <textarea
                    rows={2}
                    value={currentBill.rupeesInWordsText}
                    disabled={currentBill.rupeesInWordsMode === 'auto'}
                    onChange={(e) => setCurrentBill({ ...currentBill, rupeesInWordsText: e.target.value })}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all shadow-xs ${
                      currentBill.rupeesInWordsMode === 'auto'
                        ? 'bg-gray-50/80 dark:bg-zinc-900/40 border-dashed border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 cursor-not-allowed select-none'
                        : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* DRAGGABLE ELASTIC SPLITTER GUTTER WITH PROMINENT VISUAL INDICATOR */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Drag to resize panels"
              aria-valuenow={Math.round(leftPanelWidth)}
              aria-valuemin={20}
              aria-valuemax={75}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  setLeftPanelWidth((w) => Math.max(20, w - 2));
                } else if (e.key === 'ArrowRight') {
                  setLeftPanelWidth((w) => Math.min(75, w + 2));
                }
              }}
              className={`no-print hidden lg:flex items-center justify-center relative cursor-col-resize select-none transition-colors z-30 group w-3 shrink-0 ${
                isDragging
                  ? 'bg-blue-600 shadow-sm'
                  : 'bg-gray-200 dark:bg-zinc-800 hover:bg-blue-400 dark:hover:bg-blue-500'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onTouchStart={() => setIsDragging(true)}
              onDoubleClick={() => {
                setLeftPanelWidth(38);
                try {
                  localStorage.setItem('aus_invoice_splitter_width', '38');
                } catch {}
              }}
              title="Drag to resize panels (Double-click to reset)"
              style={{ touchAction: 'none' }}
            >
              {/* Extended invisible touch/grab hitbox */}
              <div className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize" />

              {/* Central Draggable Visual Indicator Handle Capsule */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-7 h-24 rounded-full border-2 flex flex-col items-center justify-center gap-1.5 shadow-lg transition-all duration-150 z-40 pointer-events-none ${
                  isDragging
                    ? 'bg-blue-600 border-blue-500 text-white shadow-blue-500/40 ring-4 ring-blue-500/25 scale-105'
                    : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 group-hover:border-blue-500 dark:group-hover:border-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:shadow-xl group-hover:scale-105'
                }`}
              >
                <ChevronsLeftRight className="w-3.5 h-3.5 shrink-0" />
                <div className="flex flex-col gap-1 items-center">
                  <span className={`w-1 h-1 rounded-full ${isDragging ? 'bg-white' : 'bg-gray-400 dark:bg-zinc-500 group-hover:bg-blue-600 dark:group-hover:bg-blue-400'}`} />
                  <span className={`w-1 h-1 rounded-full ${isDragging ? 'bg-white' : 'bg-gray-400 dark:bg-zinc-500 group-hover:bg-blue-600 dark:group-hover:bg-blue-400'}`} />
                  <span className={`w-1 h-1 rounded-full ${isDragging ? 'bg-white' : 'bg-gray-400 dark:bg-zinc-500 group-hover:bg-blue-600 dark:group-hover:bg-blue-400'}`} />
                </div>
                <GripVertical className="w-3.5 h-3.5 shrink-0 opacity-70" />
              </div>

              {/* Hover Tooltip Pill */}
              <div className="absolute top-1/2 -translate-y-1/2 left-8 px-2.5 py-1.5 rounded-lg bg-gray-900/95 text-white dark:bg-zinc-800/95 dark:text-white text-[11px] font-medium shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 border border-white/10 flex items-center gap-1.5 translate-x-1 group-hover:translate-x-0">
                <ChevronsLeftRight className="w-3 h-3 text-blue-400" />
                <span>Drag to resize panels</span>
              </div>
            </div>

            {/* RIGHT PREVIEW PANEL (Reference repo: invoice.js lines 909-1027) */}
            <div
              className="preview-panel"
              style={{
                width: `calc(${100 - leftPanelWidth}% - 12px)`,
                flex: `1 1 calc(${100 - leftPanelWidth}% - 12px)`,
                maxWidth: `calc(${100 - leftPanelWidth}% - 12px)`,
              }}
            >
              {/* Zoom & Fit Control Toolbar (Sticky at top of Preview Panel) */}
              <div className="no-print sticky top-0 z-30 mb-3 px-3 py-1.5 rounded-full bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-sm flex items-center gap-2 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300 px-1 hidden sm:inline">
                  Invoice Preview
                </span>
                <div className="h-3.5 w-px bg-gray-200 dark:bg-white/10 hidden sm:block" />
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.max(0.5, Number((z - 0.05).toFixed(2))))}
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 cursor-pointer transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] font-medium text-gray-600 dark:text-gray-300 min-w-[38px] text-center">
                  {Math.round(previewZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.min(1.25, Number((z + 0.05).toFixed(2))))}
                  title="Zoom In"
                  aria-label="Zoom In"
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 cursor-pointer transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="h-3.5 w-px bg-gray-200 dark:bg-white/10" />
                <button
                  type="button"
                  onClick={() => setPreviewZoom(0.82)}
                  title="Fit to Screen"
                  className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 cursor-pointer transition-colors"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(1.0)}
                  title="Actual Size (100%)"
                  className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 cursor-pointer transition-colors"
                >
                  100%
                </button>
              </div>

              {/* Scaling container for A4 sheet */}
              <div
                className="preview-scale-wrapper transition-transform duration-100 origin-top flex flex-col items-center"
                style={{
                  transform: `scale(${previewZoom})`,
                  transformOrigin: 'top center',
                  marginBottom: previewZoom < 1 ? `calc(297mm * (${previewZoom} - 1))` : '0px',
                }}
              >
                <div className="a4-page text-[11px] leading-snug" id="previewContent">
                  {/* Watermark (direct match from reference-repo/assets/js/invoice.js line 915-917) */}
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
                    style={{ zIndex: 0 }}
                  >
                    <img
                      alt="watermark"
                      className="w-[100%] max-w-none opacity-[0.16] object-contain grayscale pointer-events-none select-none"
                      src="/images/watermark.png"
                    />
                  </div>

                  {/* 1. Religious Chants Banner */}
                  <div className="w-full flex items-center justify-between pb-1 relative shrink-0" style={{ zIndex: 10 }}>
                    <span className="text-[8px] font-bold text-black uppercase tracking-wider">
                      SRI PERIYASAMY THUNAI
                    </span>
                    <img alt="icon" className="w-4 h-4 object-contain opacity-95" src="/images/swastika.png" />
                    <span className="text-[8px] font-bold text-black uppercase tracking-wider">
                      SRI PERIYAKALIAMMAN THUNAI
                    </span>
                  </div>

                  {/* 2. Header: Company Info & Freight Bill Box */}
                  <div
                    className="invoice-header flex justify-between items-start pb-3 border-b-2 border-black relative mb-3"
                    style={{ zIndex: 10, flexShrink: 0 }}
                  >
                    <div className="flex-1 pr-4">
                      <h1 className="text-2xl font-black tracking-tight uppercase mb-1 text-black">
                        A U S TRANSPORT
                      </h1>
                      <div className="text-[9px] text-gray-800 space-y-0.5 font-medium leading-tight">
                        <p>No. 1/2 PERIYAR NAGAR, MEENACHIPURAM, KOLINJIWADI (PO),</p>
                        <p>DHARAPURAM - 638673. TIRUPPUR (DT), TAMILNADU. STATE CODE - 33</p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1 shrink-0">
                      <div className="border-2 border-black px-3 py-1 font-black uppercase tracking-wider text-[10px] mb-1 text-black bg-white">
                        FREIGHT BILL
                      </div>
                      <div className="bill-details-grid text-[9px] leading-tight">
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">PAN NO:</span>
                          <span className="detail-value font-bold text-black">ASEPA4112B</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">GST NO:</span>
                          <span className="detail-value font-bold text-black">33ASEPA4112B1ZU</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">EMAIL ID:</span>
                          <span className="detail-value font-bold text-black">austransportdpm@gmail.com</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">CONTACT:</span>
                          <span className="detail-value font-bold text-black">+91 9486773152, +91 8453335911</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Logistics Details: 3 Columns */}
                  <div
                    className="grid grid-cols-3 border-b-2 pb-3 gap-6 border-black relative mb-2.5"
                    style={{ zIndex: 10, flexShrink: 0 }}
                  >
                    <div>
                      <span className="block text-[8px] font-bold text-black uppercase tracking-wider mb-1">
                        BILL DETAILS
                      </span>
                      <div className="bill-details-grid text-[9px] leading-tight">
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">Bill No:</span>
                          <span className="detail-value font-bold text-black">{currentBill.billNumber}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">Date:</span>
                          <span className="detail-value font-bold text-black">{currentBill.date}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label font-bold text-black">Vehicle No:</span>
                          <span className="detail-value font-bold uppercase text-black">
                            {currentBill.vehicleNumber}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-black uppercase tracking-wider mb-1">
                        CONSIGNOR (FROM)
                      </span>
                      <p className="font-bold uppercase leading-tight text-black text-[10px]">
                        VENKATESHWARA HATCHERIES PVT LTD.
                      </p>
                      <p className="text-[9px] text-gray-800 mt-0.5 uppercase leading-tight font-medium">
                        NELLAKOTTAI HATCHERIES, DINDUGUL DT. TN.
                      </p>
                      <p className="text-[9px] font-bold mt-0.5 text-black">GST: 33AAACV7247H1ZB</p>
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-black uppercase tracking-wider mb-1">
                        CONSIGNEE (TO)
                      </span>
                      <p className="font-bold uppercase leading-tight text-black text-[10px]">
                        {currentBill.consigneeName || 'VENKATESHWARA HATCHERIES PVT LTD.'}
                      </p>
                      <p className="text-[9px] text-gray-800 mt-0.5 uppercase leading-tight font-medium">
                        {currentBill.consigneeAddress || 'BROILER BRANCH, TN, KA, AP & KL'}
                      </p>
                      <p className="text-[9px] font-bold mt-0.5 text-black">
                        {currentBill.consigneeGst
                          ? (currentBill.consigneeGst.startsWith('GST:') ? currentBill.consigneeGst : `GST: ${currentBill.consigneeGst}`)
                          : 'GST: 33AAACV7247H1ZB (Nilakkottai)'}
                      </p>
                    </div>
                  </div>

                  {/* 4. Main Trips Table */}
                  <div
                    className="relative"
                    style={{ zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                  >
                    <table
                      className="w-full text-left table-fixed"
                      style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}
                    >
                      <colgroup>
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '11%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '12%' }}
                          >
                            DATE
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '10%' }}
                          >
                            DC NO
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black"
                            style={{ width: '22%' }}
                          >
                            PARTICULARS / ROUTE
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '13%' }}
                          >
                            STARTING KM
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '13%' }}
                          >
                            CLOSING KM
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '10%' }}
                          >
                            RUNNING KM
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '9%' }}
                          >
                            RATE
                          </th>
                          <th
                            className="border border-black p-1 text-[8px] font-bold uppercase tracking-wider text-center bg-white text-black whitespace-nowrap"
                            style={{ width: '11%' }}
                          >
                            AMOUNT (₹)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-[10px]">
                        {currentBill.trips.slice(0, currentBill.visibleTrips).map((trip) => {
                          const runningKm = trip.closingKm - trip.startingKm;
                          const amount = runningKm * trip.rate;
                          const isTollActive = Boolean(trip.tollEnabled && Number(trip.tollAmount) > 0);

                          return (
                            <React.Fragment key={trip.id}>
                              <tr
                                style={{
                                  height: '58px',
                                  backgroundColor: 'transparent',
                                }}
                              >
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 font-medium text-center">{trip.date}</td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 font-medium text-slate-900 text-[10px] font-mono text-center">
                                  {trip.dcNo}
                                </td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5">
                                  <div className="font-bold uppercase text-black leading-tight text-[10px]">
                                    {trip.particulars}
                                  </div>
                                  {trip.route ? (
                                    <div className="italic text-[9px] text-gray-700 mt-1 leading-snug break-words max-w-[200px]">
                                      {trip.route}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 text-right font-mono">
                                  {trip.startingKm}
                                </td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 text-right font-mono">
                                  {trip.closingKm}
                                </td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 text-right font-bold text-black">
                                  {runningKm}
                                </td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 text-right font-bold text-slate-900">
                                  {trip.rate.toFixed(2)}
                                </td>
                                <td className="p-1.5 align-top pt-1.5 pb-2.5 text-right font-bold text-black">
                                  {amount.toLocaleString('en-IN', {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                              </tr>

                              <tr
                                className="border-t border-b border-[#e5e7eb]"
                                style={{
                                  height: '24px',
                                  backgroundColor: 'transparent',
                                  borderTop: '1px solid #e5e7eb',
                                  borderBottom: '1px solid #e5e7eb',
                                }}
                              >
                                <td
                                  className={`p-1.5 text-right text-[8px] uppercase tracking-wider ${
                                    isTollActive
                                      ? 'font-bold text-slate-700'
                                      : 'font-medium text-gray-400'
                                  }`}
                                  style={{
                                    borderTop: '1px solid #e5e7eb',
                                    borderBottom: '1px solid #e5e7eb',
                                    color: isTollActive ? '#334155' : '#9ca3af',
                                  }}
                                  colSpan={7}
                                >
                                  TOLL GATE EXPENSE
                                </td>
                                <td
                                  className={`p-1.5 text-right text-[10px] font-mono ${
                                    isTollActive ? 'font-bold text-black' : 'font-normal text-gray-400'
                                  }`}
                                  style={{
                                    borderTop: '1px solid #e5e7eb',
                                    borderBottom: '1px solid #e5e7eb',
                                    color: isTollActive ? '#000000' : '#9ca3af',
                                  }}
                                >
                                  {isTollActive
                                    ? Number(trip.tollAmount).toLocaleString('en-IN')
                                    : '0'}
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 5. Additional Expense Rows */}
                  <div className="relative" style={{ zIndex: 10, flexShrink: 0, marginTop: '0.5rem' }}>
                    <table className="w-full text-left table-fixed" style={{ borderCollapse: 'collapse' }}>
                      <tbody className="text-[10px]">
                        {currentBill.keralaRtoEnabled && currentBill.keralaRtoMultiplier > 0 && (
                          <tr
                            className="border-t border-b border-[#e5e7eb]"
                            style={{
                              height: '22px',
                              backgroundColor: 'transparent',
                              borderTop: '1px solid #e5e7eb',
                              borderBottom: '1px solid #e5e7eb',
                            }}
                          >
                            <td
                              className="p-1 text-right text-[8px] uppercase tracking-wider text-slate-700"
                              style={{
                                borderTop: '1px solid #e5e7eb',
                                borderBottom: '1px solid #e5e7eb',
                              }}
                              colSpan={7}
                            >
                              KERALA RTO CHECKPOST EXPENSE ({currentBill.keralaRtoMultiplier} TRIPS @ ₹{currentBill.keralaRtoAmount})
                            </td>
                            <td
                              className="p-1 text-right font-bold text-[10px] font-mono text-black"
                              style={{
                                borderTop: '1px solid #e5e7eb',
                                borderBottom: '1px solid #e5e7eb',
                              }}
                            >
                              {(currentBill.keralaRtoMultiplier * currentBill.keralaRtoAmount).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        )}

                        <tr
                          className="border-t border-b border-[#e5e7eb]"
                          style={{
                            height: '22px',
                            borderTop: '1px solid #e5e7eb',
                            borderBottom: '1px solid #e5e7eb',
                          }}
                        >
                          <td
                            className="p-1 text-right text-[8px] uppercase tracking-wider text-slate-800"
                            style={{
                              borderTop: '1px solid #e5e7eb',
                              borderBottom: '1px solid #e5e7eb',
                            }}
                            colSpan={7}
                          >
                            DIESEL AVG RATE
                          </td>
                          <td
                            className="p-1 text-right font-bold text-[10px] font-mono uppercase tracking-tight text-black"
                            style={{
                              borderTop: '1px solid #e5e7eb',
                              borderBottom: '1px solid #e5e7eb',
                            }}
                          >
                            ₹ {currentBill.dieselAvgRate ? currentBill.dieselAvgRate.toFixed(2) : '0.00'}
                          </td>
                        </tr>
                        <tr style={{ height: '18px' }}>
                          <td className="border-none" colSpan={8}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 6. Bottom Summary: Words & Net Amount */}
                  <div className="mt-auto pt-1 relative" style={{ zIndex: 10, flexShrink: 0 }}>
                    <div className="flex justify-between items-end mb-4">
                      <div className="w-1/2 space-y-2">
                        <div className="border-l-2 border-black pl-3">
                          <span className="block text-[7px] font-bold uppercase tracking-wider mb-0.5 text-slate-700">
                            Rupees in words
                          </span>
                          <p className="font-bold italic uppercase leading-tight text-xs text-black">
                            {currentBill.rupeesInWordsText}
                          </p>
                        </div>
                      </div>
                      <div className="w-1/4 border-2 border-black px-2.5 py-1.5 text-right bg-white">
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-700">
                          Net Payable Amount
                        </span>
                        <span className="text-base font-black text-black">
                          ₹{' '}
                          {currentTotal.toLocaleString('en-IN', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* 7. Bank Remittance Details & Signature Footer */}
                    <div className="invoice-footer border-t-2 border-black flex justify-between items-end pt-2">
                      <div className="text-[8px] text-gray-500 uppercase leading-relaxed">
                        <div className="flex flex-col gap-1">
                          <span className="block text-[8px] font-bold uppercase tracking-widest mb-1 text-black">
                            Bank Remittance Details
                          </span>
                          <div className="p-3 border-black border-l-2">
                            <p className="font-black uppercase text-[12px] mb-1 text-black">
                              HDFC BANK - DHARAPURAM
                            </p>
                            <div className="grid grid-cols-[auto,1fr] gap-x-3 text-[10px] relative text-black" style={{ zIndex: 10 }}>
                              <span className="uppercase font-bold text-slate-700">A/c No:</span>
                              <span className="font-mono font-bold tracking-wider text-black">
                                50200051395768
                              </span>
                              <span className="uppercase font-bold text-slate-700">IFSC Code:</span>
                              <span className="font-mono font-bold tracking-wider text-black">
                                HDFC0002786
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="mb-2 flex items-end justify-center h-6">
                          <div className="w-48 border-b border-gray-400"></div>
                        </div>
                        <p className="font-black uppercase text-[11px] text-black">For A U S Transport</p>
                        <p className="text-[8px] text-slate-700 uppercase tracking-widest mt-1 font-bold">
                          Authorized Signatory / Proprietor
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Floating FABs in Vertical Stack when Clicked */}
          <div className="no-print fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 select-none">
            {fabOpen && (
              <div className="flex flex-col items-end gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
                {/* 1. TOP FAB: Save the invoice */}
                <div className="flex items-center gap-2.5">
                  <span className="bg-black text-white dark:bg-white dark:text-black text-xs font-semibold px-2.5 py-1 rounded-md shadow-md whitespace-nowrap">
                    {saving ? 'Saving...' : saveIndicator === 'saved' ? 'Saved' : 'Save Bill'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveBill}
                    disabled={saving}
                    aria-label="Save Bill"
                    className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 ${
                      saveIndicator === 'saved'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200'
                    }`}
                  >
                    {saving ? (
                      <Loader2 className="w-5 h-5 animate-spin text-white dark:text-black" />
                    ) : saveIndicator === 'saved' ? (
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    ) : (
                      <Save className="w-5 h-5 text-white dark:text-black" />
                    )}
                  </button>
                </div>

                {/* 2. MIDDLE FAB: Prints */}
                <div className="flex items-center gap-2.5">
                  <span className="bg-black text-white dark:bg-white dark:text-black text-xs font-semibold px-2.5 py-1 rounded-md shadow-md whitespace-nowrap">
                    Print Bill
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePrint()}
                    aria-label="Print Bill"
                    className="w-12 h-12 rounded-full bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shadow-lg flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95"
                  >
                    <Printer className="w-5 h-5 text-white dark:text-black" />
                  </button>
                </div>

                {/* 3. BOTTOM FAB: Takes to the invoice page */}
                <div className="flex items-center gap-2.5">
                  <span className="bg-black text-white dark:bg-white dark:text-black text-xs font-semibold px-2.5 py-1 rounded-md shadow-md whitespace-nowrap">
                    Back to Invoices
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.history.length > 1) {
                        window.history.back();
                      } else {
                        closeEditor();
                      }
                    }}
                    aria-label="Back to Invoices"
                    className="w-12 h-12 rounded-full bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shadow-lg flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95"
                  >
                    <ArrowLeft className="w-5 h-5 text-white dark:text-black" />
                  </button>
                </div>
              </div>
            )}

            {/* Trigger Button: Click to toggle the 3 vertical FABs */}
            <button
              type="button"
              onClick={() => setFabOpen((prev) => !prev)}
              aria-label="Toggle Actions Menu"
              className="w-14 h-14 rounded-full bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shadow-2xl flex items-center justify-center active:scale-95 transition-all duration-200 cursor-pointer"
            >
              {fabOpen ? (
                <X className="w-6 h-6 text-white dark:text-black" />
              ) : (
                <Plus className="w-6 h-6 text-white dark:text-black" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* TRIP DELETE WARNING CONFIRMATION MODAL */}
      {tripToDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 max-w-md w-full shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Do you want to delete Trip {tripToDelete}?
            </h3>

            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
              Are you sure you want to delete Trip {tripToDelete}? This action cannot be undone and will remove all entered particulars, route places, and odometer readings for this trip.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setTripToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                No, Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleConfirmDeleteTrip(tripToDelete);
                  setTripToDelete(null);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                Yes, Delete Trip {tripToDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
