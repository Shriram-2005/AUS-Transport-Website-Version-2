// Custom KPI Store for User-Created KPI Cards across all modules
export interface CustomKpi {
  id: string;
  category: string; // 'vehicles' | 'drivers' | 'fuel' | 'maintenance' | 'expenses' | 'invoices'
  title: string;
  value: string;
  subtitle?: string;
  color: 'blue' | 'emerald' | 'amber' | 'indigo' | 'purple' | 'rose' | 'cyan';
  icon: 'tag' | 'target' | 'star' | 'gauge' | 'wallet' | 'receipt' | 'truck' | 'users' | 'activity';
  createdAt?: string;
}

export const CUSTOM_KPIS_CHANGE_EVENT = 'aus_custom_kpis_changed';

function getStorageKey(category: string): string {
  return `aus_custom_kpis_${category.toLowerCase()}`;
}

export function getStoredCustomKpis(category: string): CustomKpi[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(category));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredCustomKpis(category: string, kpis: CustomKpi[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(category), JSON.stringify(kpis));
    window.dispatchEvent(
      new CustomEvent(CUSTOM_KPIS_CHANGE_EVENT, {
        detail: { category: category.toLowerCase(), kpis },
      })
    );
  } catch (err) {
    console.error('Error saving custom KPIs:', err);
  }
}

export function addStoredCustomKpi(
  category: string,
  item: Omit<CustomKpi, 'id' | 'category' | 'createdAt'>
): CustomKpi {
  const current = getStoredCustomKpis(category);
  const newKpi: CustomKpi = {
    ...item,
    id: `kpi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    category: category.toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  const updated = [...current, newKpi];
  saveStoredCustomKpis(category, updated);
  return newKpi;
}

export function updateStoredCustomKpi(
  category: string,
  id: string,
  updates: Partial<Omit<CustomKpi, 'id' | 'category'>>
): void {
  const current = getStoredCustomKpis(category);
  const updated = current.map((k) => (k.id === id ? { ...k, ...updates } : k));
  saveStoredCustomKpis(category, updated);
}

export function deleteStoredCustomKpi(category: string, id: string): void {
  const current = getStoredCustomKpis(category);
  const updated = current.filter((k) => k.id !== id);
  saveStoredCustomKpis(category, updated);
}
