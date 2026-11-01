// Header coordination events for auto-save, refresh, and DB health status

export const REFRESH_MODULE_EVENT = 'aus_refresh_module';
export const TRIGGER_MANUAL_SAVE_EVENT = 'aus_trigger_manual_save';
export const SAVE_STATUS_EVENT = 'aus_save_status';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface SaveStatusDetail {
  status: SaveStatus;
  lastSavedAt?: string;
}

export function notifySaveStatus(status: SaveStatus, lastSavedAt?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SaveStatusDetail>(SAVE_STATUS_EVENT, {
      detail: { status, lastSavedAt: lastSavedAt || new Date().toISOString() },
    })
  );
}

export function triggerManualSave() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TRIGGER_MANUAL_SAVE_EVENT));
}

export function triggerModuleRefresh(moduleName: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(REFRESH_MODULE_EVENT, { detail: { module: moduleName } })
  );
}
