// Pure Database-Backed KPI Card Manager
// Manages visible keys, card order, and operations for each category

export interface KpiCardDefinition {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  icon: 'truck' | 'gauge' | 'calendar' | 'rotate' | 'trending' | 'users' | 'wallet' | 'fuel' | 'droplets' | 'building' | 'wrench' | 'clipboard' | 'receipt' | 'creditCard' | 'percent' | 'check' | 'clock' | 'fileText' | 'activity' | 'award';
  color: 'blue' | 'emerald' | 'amber' | 'indigo' | 'purple' | 'rose' | 'cyan' | 'slate';
  description?: string;
}

export interface CategoryKpiConfig {
  visibleKeys: string[];
}

export const KPI_CONFIG_CHANGE_EVENT = 'aus_kpi_config_changed';

function getStorageKey(category: string): string {
  return `aus_kpi_config_${category.toLowerCase()}`;
}

export function getStoredKpiConfig(category: string, defaultKeys: string[]): CategoryKpiConfig {
  if (typeof window === 'undefined') return { visibleKeys: defaultKeys };
  try {
    const raw = localStorage.getItem(getStorageKey(category));
    if (!raw) return { visibleKeys: defaultKeys };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.visibleKeys) && parsed.visibleKeys.length > 0) {
      return parsed;
    }
    return { visibleKeys: defaultKeys };
  } catch {
    return { visibleKeys: defaultKeys };
  }
}

export function saveStoredKpiConfig(category: string, config: CategoryKpiConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(category), JSON.stringify(config));
    window.dispatchEvent(
      new CustomEvent(KPI_CONFIG_CHANGE_EVENT, {
        detail: { category: category.toLowerCase(), config },
      })
    );
  } catch (err) {
    console.error('Error saving KPI config:', err);
  }
}

export function resetStoredKpiConfig(category: string, defaultKeys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(category));
    window.dispatchEvent(
      new CustomEvent(KPI_CONFIG_CHANGE_EVENT, {
        detail: { category: category.toLowerCase(), config: { visibleKeys: defaultKeys } },
      })
    );
  } catch (err) {
    console.error('Error resetting KPI config:', err);
  }
}
