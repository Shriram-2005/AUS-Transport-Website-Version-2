// Vehicle management store with dynamic LocalStorage persistence, live sync, and Supabase capability

export interface Vehicle {
  id: string;
  registrationNumber: string;
  currentKm: number;
  // Optional aliases for backward compatibility
  model?: string;
  odometerReading?: number;
  status?: 'active' | 'maintenance' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

export const INITIAL_VEHICLES: Vehicle[] = [];

const VEHICLES_STORAGE_KEY = 'aus_transport_vehicles_v2';
export const VEHICLES_CHANGE_EVENT = 'aus_vehicles_changed';

/**
 * Normalizes vehicle object ensuring registrationNumber and currentKm are valid.
 */
function normalizeVehicle(v: any): Vehicle {
  const km = typeof v.currentKm === 'number' 
    ? v.currentKm 
    : (typeof v.odometerReading === 'number' ? v.odometerReading : 0);

  return {
    id: v.id || `veh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    registrationNumber: (v.registrationNumber || '').trim().toUpperCase(),
    currentKm: km,
    odometerReading: km,
    model: v.model || '',
    status: v.status || 'active',
    createdAt: v.createdAt || new Date().toISOString(),
    updatedAt: v.updatedAt || new Date().toISOString(),
  };
}

export function getStoredVehicles(): Vehicle[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VEHICLES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeVehicle);
    }

    return [];
  } catch (err) {
    console.error('Error reading vehicles from localStorage:', err);
    return [];
  }
}

export function saveStoredVehicles(vehicles: Vehicle[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = vehicles.map(normalizeVehicle);
    localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(VEHICLES_CHANGE_EVENT, { detail: normalized }));
  } catch (err) {
    console.error('Error saving vehicles to localStorage:', err);
  }
}

export function addStoredVehicle(data: { registrationNumber: string; currentKm: number }): Vehicle {
  const vehicles = getStoredVehicles();
  const cleanReg = data.registrationNumber.trim().toUpperCase();
  const existing = vehicles.find((v) => v.registrationNumber === cleanReg);

  if (existing) {
    existing.currentKm = data.currentKm;
    existing.odometerReading = data.currentKm;
    existing.updatedAt = new Date().toISOString();
    saveStoredVehicles(vehicles);
    return existing;
  }

  const newVehicle: Vehicle = {
    id: `veh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    registrationNumber: cleanReg,
    currentKm: Number(data.currentKm) || 0,
    odometerReading: Number(data.currentKm) || 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updated = [newVehicle, ...vehicles];
  saveStoredVehicles(updated);
  return newVehicle;
}

export function updateStoredVehicle(id: string, updates: Partial<Vehicle>): void {
  const vehicles = getStoredVehicles();
  const updated = vehicles.map((v) => {
    if (v.id === id) {
      const nextKm = updates.currentKm !== undefined ? Number(updates.currentKm) : v.currentKm;
      return {
        ...v,
        ...updates,
        registrationNumber: updates.registrationNumber ? updates.registrationNumber.trim().toUpperCase() : v.registrationNumber,
        currentKm: nextKm,
        odometerReading: nextKm,
        updatedAt: new Date().toISOString(),
      };
    }
    return v;
  });
  saveStoredVehicles(updated);
}

export function deleteStoredVehicle(id: string): void {
  const vehicles = getStoredVehicles();
  const updated = vehicles.filter((v) => v.id !== id);
  saveStoredVehicles(updated);
}

/**
 * Automatically updates vehicle currentKm when bill kms are entered.
 * If closingKm is greater than or equal to currentKm, updates currentKm and notifies listeners.
 */
export function updateVehicleKmFromBill(vehicleNumber: string, closingKm: number): boolean {
  if (!vehicleNumber || !closingKm || isNaN(closingKm)) return false;
  const cleanReg = vehicleNumber.trim().toUpperCase();
  const numKm = Number(closingKm);
  if (numKm <= 0) return false;

  const vehicles = getStoredVehicles();
  let updatedAny = false;

  const updated = vehicles.map((v) => {
    if (v.registrationNumber.toUpperCase() === cleanReg) {
      if (numKm > v.currentKm) {
        updatedAny = true;
        return {
          ...v,
          currentKm: numKm,
          odometerReading: numKm,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return v;
  });

  if (updatedAny) {
    saveStoredVehicles(updated);
    return true;
  }

  return false;
}
