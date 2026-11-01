'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { getDictionary } from '@/i18n/dictionaries';
import {
  Menu,
  X,
  LogOut,
  User,
  ShieldCheck,
  RefreshCw,
  Database,
  CheckCircle2,
  Clock,
  Save,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { checkDbConnection } from '@/lib/supabase/dbHealth';
import {
  SAVE_STATUS_EVENT,
  SaveStatus,
  SaveStatusDetail,
  triggerManualSave,
  triggerModuleRefresh
} from '@/lib/headerEvents';

interface DashboardHeaderProps {
  onToggleSidebar: () => void;
  isOpen?: boolean;
  userEmail: string | null;
  onLogout: () => void;
  activeTab?: string;
  activeTabLabel?: string;
}

export function DashboardHeader({
  onToggleSidebar,
  isOpen = false,
  userEmail,
  onLogout,
  activeTab = 'invoices',
  activeTabLabel = 'Invoices',
}: DashboardHeaderProps) {
  const dict = getDictionary('en');

  // DB Connection status (reflecting ONLY the Supabase database)
  const [dbStatus, setDbStatus] = useState<'checking' | 'active' | 'offline'>('checking');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-save and manual save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Check DB connection status
  const verifyDb = useCallback(async () => {
    try {
      const isOk = await checkDbConnection();
      setDbStatus(isOk ? 'active' : 'offline');
    } catch {
      setDbStatus('offline');
    }
  }, []);

  useEffect(() => {
    verifyDb();

    // Re-check periodically every 12 seconds
    const interval = setInterval(verifyDb, 12000);

    // Also re-check when network changes or tab gains focus
    const handleOnline = () => verifyDb();
    const handleOffline = () => setDbStatus('offline');
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') verifyDb();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [verifyDb]);

  // Listen for save status updates from modules (e.g. InvoiceManager auto-save)
  useEffect(() => {
    const handleStatus = (e: Event) => {
      const custom = e as CustomEvent<SaveStatusDetail>;
      if (custom.detail) {
        setSaveStatus(custom.detail.status);
        if (custom.detail.status === 'saved' && custom.detail.lastSavedAt) {
          try {
            const timeStr = new Date(custom.detail.lastSavedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            setLastSavedTime(timeStr);
          } catch {
            setLastSavedTime('');
          }
        }
      }
    };

    window.addEventListener(SAVE_STATUS_EVENT, handleStatus);
    return () => {
      window.removeEventListener(SAVE_STATUS_EVENT, handleStatus);
    };
  }, []);

  // Handle module refresh click
  const handleRefreshClick = () => {
    setIsRefreshing(true);
    triggerModuleRefresh(activeTab);
    // Also re-verify DB connection on refresh
    verifyDb();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 850);
  };

  // Handle manual save click
  const handleManualSaveClick = () => {
    setSaveStatus('saving');
    triggerManualSave();
  };

  return (
    <header className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-black/10 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-md sticky top-0 z-50 transition-colors duration-200 no-print print:hidden gap-2">
      {/* Left side: Hamburger button + Back Button + AUS Transport Brand */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isOpen ? dict.dashboard?.menuCloseAria : dict.dashboard?.menuOpenAria}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200 cursor-pointer flex items-center justify-center select-none"
        >
          {isOpen ? (
            <X className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200" />
          ) : (
            <Menu className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200" />
          )}
        </button>

        {/* Dedicated Back Button to return to where user came from */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = '/dashboard';
            }
          }}
          aria-label="Back to previous page"
          title="Go back to where you came from"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer text-xs font-semibold select-none active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <Link
          href="/dashboard"
          className="font-bold text-base sm:text-xl tracking-tight text-black dark:text-white select-none no-underline truncate"
        >
          {dict.brand.name}
        </Link>
      </div>

      {/* Center / Action Section: Refresh Sub-category + DB Connection + Auto-Save & Manual Save */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap justify-end md:justify-center">
        {/* DB Connection Status (Strictly Supabase Database Status) */}
        <button
          type="button"
          onClick={verifyDb}
          title={
            dbStatus === 'active'
              ? 'Database Connection Active (Supabase) - Click to verify'
              : dbStatus === 'offline'
              ? 'Database Offline - Click to reconnect'
              : 'Checking database connection...'
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold select-none transition-all cursor-pointer ${
            dbStatus === 'active'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
              : dbStatus === 'offline'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20'
              : 'bg-black/5 dark:bg-white/5 border-black/15 dark:border-white/15 text-black/60 dark:text-white/60'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {dbStatus === 'active' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                dbStatus === 'active'
                  ? 'bg-emerald-500'
                  : dbStatus === 'offline'
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
              }`}
            />
          </span>
          <Database className="w-3.5 h-3.5 opacity-80" />
          <span className="hidden sm:inline">
            {dbStatus === 'active' ? 'DB Active' : dbStatus === 'offline' ? 'DB Offline' : 'Checking DB...'}
          </span>
          <span className="sm:hidden">
            {dbStatus === 'active' ? 'DB' : dbStatus === 'offline' ? 'Offline' : '...'}
          </span>
        </button>

        {/* Dedicated Sub-category Refresh Page Button */}
        <button
          type="button"
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          title={`Reload and fetch latest data for ${activeTabLabel} from database`}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white text-xs font-semibold transition-all cursor-pointer select-none active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-black dark:text-white' : 'text-black/70 dark:text-white/70'}`} />
          <span className="hidden sm:inline">Refresh {activeTabLabel} Page</span>
          <span className="sm:hidden">Refresh</span>
        </button>

        {/* Save Status Indicator */}
        <div
          title={
            saveStatus === 'saved'
              ? lastSavedTime ? `All changes saved at ${lastSavedTime}` : 'All changes saved to database'
              : saveStatus === 'saving'
              ? 'Auto-saving changes to database...'
              : 'Unsaved edits present'
          }
          className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors select-none ${
            saveStatus === 'saved'
              ? 'bg-black/[0.02] dark:bg-white/[0.03] border-black/10 dark:border-white/10 text-black/70 dark:text-white/70'
              : saveStatus === 'saving'
              ? 'bg-blue-500/10 border-blue-500/25 text-blue-700 dark:text-blue-400'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400'
          }`}
        >
          {saveStatus === 'saved' && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Saved</span>
              {lastSavedTime && (
                <span className="text-[10px] opacity-60 font-mono ml-0.5">{lastSavedTime}</span>
              )}
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'unsaved' && (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Unsaved</span>
            </>
          )}
        </div>

        {/* Manual Save Button */}
        <button
          type="button"
          onClick={handleManualSaveClick}
          disabled={saveStatus === 'saving'}
          title="Manually save all current changes to database immediately"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 active:scale-95 text-xs font-semibold transition-all cursor-pointer select-none disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      </div>

      {/* Right side: Profile, Theme Toggle & Logout */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Profile Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03]">
          <div className="w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs select-none">
            {userEmail ? userEmail.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
          </div>
          <div className="hidden lg:flex flex-col text-left pr-1 leading-tight">
            <span className="text-xs font-semibold truncate max-w-[130px] text-black dark:text-white">
              {userEmail || dict.dashboard?.profile}
            </span>
            <span className="text-[10px] text-black/50 dark:text-white/50 flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5 text-black dark:text-white" />
              {dict.dashboard?.roleAdmin}
            </span>
          </div>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Logout Button */}
        <button
          type="button"
          onClick={onLogout}
          aria-label={dict.dashboard?.logoutAria}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-xs font-semibold"
        >
          <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">{dict.dashboard?.logout}</span>
        </button>
      </div>
    </header>
  );
}

