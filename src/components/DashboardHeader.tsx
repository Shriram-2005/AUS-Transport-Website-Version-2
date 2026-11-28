'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ArrowLeft,
  MoreVertical
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

  // Small-display 3-dot overflow menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [mobileMenuOpen]);

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
    <header className="w-full min-h-14 sm:min-h-16 py-1.5 flex flex-wrap items-center justify-between px-2.5 sm:px-4 md:px-6 border-b border-black/10 dark:border-white/10 bg-white/95 dark:bg-black/95 backdrop-blur-md sticky top-0 z-[60] transition-colors duration-200 no-print print:hidden gap-1.5 sm:gap-2.5">
      {/* Left side: Hamburger button + Back Button + AUS Transport Brand */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isOpen ? dict.dashboard?.menuCloseAria : dict.dashboard?.menuOpenAria}
          title={isOpen ? 'Close menu' : 'Open navigation menu'}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center select-none touch-manipulation shrink-0"
        >
          {isOpen ? (
            <X className="w-5 h-5 transition-transform duration-200" />
          ) : (
            <Menu className="w-5 h-5 transition-transform duration-200" />
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
          className="inline-flex items-center justify-center gap-1.5 w-9 h-9 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer text-xs font-semibold select-none active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">Back</span>
        </button>

        <Link
          href="/dashboard"
          className="font-bold text-[clamp(0.9rem,1.8vw,1.25rem)] tracking-tight text-black dark:text-white select-none no-underline truncate max-w-[110px] sm:max-w-[200px] md:max-w-none shrink-0"
        >
          {dict.brand.name}
        </Link>
      </div>

      {/* Center / Action Section: Refresh Sub-category + DB Connection + Auto-Save & Manual Save */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
          className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-semibold select-none transition-all cursor-pointer shrink-0 ${
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
          <Database className="w-3.5 h-3.5 opacity-80 shrink-0" />
          <span className="hidden sm:inline">
            {dbStatus === 'active' ? 'DB Active' : dbStatus === 'offline' ? 'DB Offline' : 'Checking...'}
          </span>
          <span className="sm:hidden text-[11px] font-bold">
            {dbStatus === 'active' ? 'DB' : dbStatus === 'offline' ? 'Offline' : '...'}
          </span>
        </button>

        {/* Dedicated Sub-category Refresh Page Button (Desktop/Tablet md+) */}
        <button
          type="button"
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          title={`Reload and fetch latest data for ${activeTabLabel} from database`}
          className="hidden md:inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin text-black dark:text-white' : 'text-black/70 dark:text-white/70'}`} />
          <span>Refresh {activeTabLabel} Page</span>
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
          className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors select-none shrink-0 ${
            saveStatus === 'saved'
              ? 'bg-black/[0.02] dark:bg-white/[0.03] border-black/10 dark:border-white/10 text-black/70 dark:text-white/70'
              : saveStatus === 'saving'
              ? 'bg-blue-500/10 border-blue-500/25 text-blue-700 dark:text-blue-400'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400'
          }`}
        >
          {saveStatus === 'saved' && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Saved</span>
              {lastSavedTime && (
                <span className="text-[10px] opacity-60 font-mono ml-0.5">{lastSavedTime}</span>
              )}
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <Clock className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'unsaved' && (
            <>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
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
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 active:scale-95 text-xs font-semibold transition-all cursor-pointer select-none disabled:opacity-50 shrink-0"
        >
          <Save className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>

      {/* Right side: Desktop Profile, Theme Toggle & Logout + Mobile 3-Dot Menu */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Profile Pill (md+) */}
        <div className="hidden md:flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-full border border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.03] shrink-0">
          <div className="w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs select-none shrink-0">
            {userEmail ? userEmail.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
          </div>
          <div className="hidden xl:flex flex-col text-left pr-1 leading-tight">
            <span className="text-xs font-semibold truncate max-w-[120px] text-black dark:text-white">
              {userEmail || dict.dashboard?.profile}
            </span>
            <span className="text-[10px] text-black/50 dark:text-white/50 flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5 text-black dark:text-white" />
              {dict.dashboard?.roleAdmin}
            </span>
          </div>
        </div>

        {/* Theme Toggle (md+) */}
        <div className="hidden md:block">
          <ThemeToggle />
        </div>

        {/* Logout Button (md+) */}
        <button
          type="button"
          onClick={onLogout}
          aria-label={dict.dashboard?.logoutAria}
          title="Log out of AUS Transport Console"
          className="hidden md:inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer text-xs font-semibold shrink-0"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>{dict.dashboard?.logout}</span>
        </button>

        {/* Small Display 3-Dot Overflow Menu (< md) */}
        <div className="relative md:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="More header options"
            title="More options"
            className="w-9 h-9 rounded-xl border border-black/15 dark:border-white/15 text-black dark:text-white bg-transparent hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-900 shadow-2xl p-2 space-y-1.5 z-[75] animate-in fade-in zoom-in-95 duration-150">
              {/* Profile Summary */}
              <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
                <div className="w-8 h-8 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-xs shrink-0">
                  {userEmail ? userEmail.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-black dark:text-white truncate">
                    {userEmail || dict.dashboard?.profile}
                  </p>
                  <p className="text-[10px] text-black/55 dark:text-white/55 flex items-center gap-1">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    <span>{dict.dashboard?.roleAdmin}</span>
                  </p>
                </div>
              </div>

              {/* Save Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-black/75 dark:text-white/75 border border-black/10 dark:border-white/10">
                <span className="font-semibold">Status</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {saveStatus === 'saved' && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{lastSavedTime ? `Saved ${lastSavedTime}` : 'Saved'}</span>
                    </>
                  )}
                  {saveStatus === 'saving' && (
                    <>
                      <Clock className="w-3.5 h-3.5 animate-spin text-blue-500" />
                      <span>Saving...</span>
                    </>
                  )}
                  {saveStatus === 'unsaved' && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      <span>Unsaved</span>
                    </>
                  )}
                </span>
              </div>

              {/* Refresh Page */}
              <button
                type="button"
                onClick={() => {
                  handleRefreshClick();
                  setMobileMenuOpen(false);
                }}
                disabled={isRefreshing}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-left"
              >
                <RefreshCw className={`w-4 h-4 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="truncate">Refresh {activeTabLabel}</span>
              </button>

              {/* Theme Toggle */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10">
                <span className="text-xs font-semibold text-black dark:text-white">Appearance</span>
                <ThemeToggle />
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer text-left border-t border-black/10 dark:border-white/10 mt-1 pt-2.5"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{dict.dashboard?.logout}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

