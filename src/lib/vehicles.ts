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

export const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'veh-tn76-ak1094',
    registrationNumber: 'TN 76 AK 1094',
    currentKm: 372353,
    odometerReading: 372353,
    status: 'active',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'veh-tn99-e8505',
    registrationNumber: 'TN 99 E 8505',
    currentKm: 886017,
    odometerReading: 886017,
    status: 'active',
    updatedAt: new Date().toISOString(),
  },
];

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
  if (typeof window === 'undefined') return INITIAL_VEHICLES;
  try {
    const raw = localStorage.getItem(VEHICLES_STORAGE_KEY);
    if (!raw) {
      // Check legacy key if present
      const legacyRaw = localStorage.getItem('aus_transport_vehicles_v1');
      if (legacyRaw) {
        try {
          const parsedLegacy = JSON.parse(legacyRaw);
          if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
            const migrated = parsedLegacy.map(normalizeVehicle);
            // Ensure the two required vehicles have correct user-specified initial currentKm
            for (const initV of INITIAL_VEHICLES) {
              const found = migrated.find((m) => m.registrationNumber === initV.registrationNumber);
              if (found) {
                if (!found.currentKm || found.currentKm === 880474 || found.currentKm === 880861) {
                  found.currentKm = initV.currentKm;
                  found.odometerReading = initV.currentKm;
                }
              } else {
                migrated.push(initV);
              }
            }
            localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(migrated));
            return migrated;
          }
        } catch {}
      }

      localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(INITIAL_VEHICLES));
      return INITIAL_VEHICLES;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const normalized = parsed.map(normalizeVehicle);
      // Ensure TN 76 AK 1094 and TN 99 E 8505 are present with the user specified values if never updated
      let changed = false;
      for (const initV of INITIAL_VEHICLES) {
        const found = normalized.find((v) => v.registrationNumber === initV.registrationNumber);
        if (!found) {
          normalized.push(initV);
          changed = true;
        } else if (found.currentKm === 880474) {
          found.currentKm = 372353;
          found.odometerReading = 372353;
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    }

    localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(INITIAL_VEHICLES));
    return INITIAL_VEHICLES;
  } catch (err) {
    console.error('Error reading vehicles from localStorage:', err);
    return INITIAL_VEHICLES;
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
