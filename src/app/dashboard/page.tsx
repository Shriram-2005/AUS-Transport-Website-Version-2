'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { InvoiceManager } from '@/components/InvoiceManager';
import { VehicleManager } from '@/components/VehicleManager';
import { DriverManager } from '@/components/DriverManager';
import { FuelManager } from '@/components/FuelManager';
import { MaintenanceManager } from '@/components/MaintenanceManager';
import { ExpenseManager } from '@/components/ExpenseManager';
import { ProfitAndLossManager } from '@/components/ProfitAndLossManager';
import { OverviewManager } from '@/components/OverviewManager';
import { MasterTripSheetManager } from '@/components/MasterTripSheetManager';
import { DocumentsManager } from '@/components/DocumentsManager';
import { getDictionary } from '@/i18n/dictionaries';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Truck,
  Users,
  Fuel,
  Wrench,
  Receipt,
  Wallet,
  TrendingUp,
  FileText,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';

type NavTabId =
  | 'overview'
  | 'vehicles'
  | 'drivers'
  | 'fuel'
  | 'maintenance'
  | 'invoices'
  | 'expenses'
  | 'profitAndLoss'
  | 'documents'
  | 'tripSheet';

const VALID_TABS: NavTabId[] = [
  'overview',
  'vehicles',
  'drivers',
  'fuel',
  'maintenance',
  'invoices',
  'expenses',
  'profitAndLoss',
  'documents',
  'tripSheet',
];

export default function DashboardPage() {
  const router = useRouter();
  const dict = getDictionary('en');

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTabState] = useState<NavTabId>('overview');

  // Navigate to tab and push to browser history so back button returns to previous page
  const navigateToTab = useCallback((tabId: NavTabId, replace: boolean = false) => {
    setActiveTabState(tabId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      url.searchParams.delete('view');
      url.searchParams.delete('bill');
      if (replace) {
        window.history.replaceState({ tab: tabId }, '', url.toString());
      } else {
        window.history.pushState({ tab: tabId }, '', url.toString());
      }
    }
  }, []);

  // Initialize active tab from URL query params and handle browser Back/Forward (popstate)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as NavTabId;
      if (tabParam && VALID_TABS.includes(tabParam)) {
        setActiveTabState(tabParam);
        window.history.replaceState({ tab: tabParam }, '', window.location.href);
      } else {
        window.history.replaceState({ tab: 'overview' }, '', window.location.href);
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const tabParam = (e.state?.tab || params.get('tab')) as NavTabId;
        if (tabParam && VALID_TABS.includes(tabParam)) {
          setActiveTabState(tabParam);
        } else {
          setActiveTabState('overview');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser()
        .then(({ data: { user } }) => {
          if (!user) {
            router.push('/login');
          } else {
            setUserEmail(user.email ?? null);
            setLoading(false);
          }
        })
        .catch(() => {
          router.push('/login');
          setLoading(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          router.push('/login');
        } else {
          setUserEmail(session.user.email ?? null);
          setLoading(false);
        }
      });

      return () => subscription.unsubscribe();
    } catch {
      router.push('/login');
      setLoading(false);
    }
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { id: 'overview' as const, label: dict.dashboard?.nav?.overview ?? 'Overview', icon: LayoutDashboard },
    { id: 'vehicles' as const, label: dict.dashboard?.nav?.vehicles ?? 'Vehicles', icon: Truck },
    { id: 'drivers' as const, label: dict.dashboard?.nav?.drivers ?? 'Drivers', icon: Users },
    { id: 'fuel' as const, label: dict.dashboard?.nav?.fuel ?? 'Fuel', icon: Fuel },
    { id: 'maintenance' as const, label: dict.dashboard?.nav?.maintenance ?? 'Repair & Maintenance', icon: Wrench },
    { id: 'invoices' as const, label: dict.dashboard?.nav?.invoices ?? 'Invoices', icon: Receipt },
    { id: 'expenses' as const, label: dict.dashboard?.nav?.expenses ?? 'Expenses', icon: Wallet },
    { id: 'profitAndLoss' as const, label: dict.dashboard?.nav?.profitAndLoss ?? 'Profit & Loss', icon: TrendingUp },
    { id: 'documents' as const, label: dict.dashboard?.nav?.documents ?? 'Documents', icon: FileText },
    { id: 'tripSheet' as const, label: 'Master Trip Sheet', icon: FileSpreadsheet },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black text-black dark:text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white" />
          <span className="text-sm font-medium text-black/60 dark:text-white/60">
            {dict.dashboard?.loading ?? 'Loading dashboard...'}
          </span>
        </div>
      </div>
    );
  }

  const handleToggle = () => {
    setMenuOpen((prev) => !prev);
  };

  const activeItem = navItems.find((item) => item.id === activeTab) ?? navItems[0];
  const ActiveIcon = activeItem.icon;
  const currentTabLabel = activeItem.label;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-black text-black dark:text-white transition-colors duration-200 print:min-h-0 print:h-auto print:bg-white print:text-black print:block">
      {/* Top Header across all displays with single responsive toggle morphing Menu -> X */}
      <DashboardHeader
        onToggleSidebar={handleToggle}
        isOpen={menuOpen}
        userEmail={userEmail}
        onLogout={handleLogout}
        activeTab={activeTab}
        activeTabLabel={currentTabLabel}
      />

      <div className="flex-1 flex relative print:block print:h-auto print:overflow-visible">
        {/* Mobile & Tablet Backdrop Overlay (Active only on screens < lg) */}
        {menuOpen && (
          <div
            className="fixed inset-0 top-14 sm:top-16 bg-black/50 dark:bg-black/70 backdrop-blur-xs z-40 lg:hidden transition-opacity cursor-pointer no-print print:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Responsive Sidebar:
            - Mobile & Tablet (< lg): Slide-in Drawer at z-50 (HIGHER than backdrop z-40 so items are 100% selectable!)
            - Desktop (>= lg): Sticky sidebar rail (w-[72px]) expanding to full width (w-64)
        */}
        <aside
          className={`
            no-print print:hidden
            fixed lg:sticky top-14 sm:top-16 bottom-0 left-0 z-50
            h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] bg-white dark:bg-black
            border-r border-black/10 dark:border-white/10
            transition-all duration-300 ease-in-out flex flex-col justify-between shrink-0 pointer-events-auto
            ${
              menuOpen
                ? 'translate-x-0 w-72 lg:w-64 shadow-2xl lg:shadow-none'
                : 'max-lg:-translate-x-full max-lg:pointer-events-none w-72 lg:w-[72px]'
            }
          `}
        >
          {/* Sidebar Navigation Content */}
          <div className="p-3 sm:p-4 space-y-1.5 flex-1 overflow-y-auto overflow-x-hidden">
            {/* Navigation items aligned in the exact same vertical column */}
            <nav className="space-y-1.5 flex flex-col">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigateToTab(item.id);
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setMenuOpen(false);
                      }
                    }}
                    className={`
                      h-10 rounded-xl text-sm font-semibold transition-all cursor-pointer select-none flex items-center relative z-10 pointer-events-auto touch-manipulation active:scale-[0.98]
                      ${
                        menuOpen
                          ? 'w-full px-3 gap-3 justify-start text-left'
                          : 'w-10 justify-center'
                      }
                      ${
                        isActive
                          ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm font-bold'
                          : 'text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {menuOpen && <span className="truncate flex-1">{item.label}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer when expanded */}
          {menuOpen && (
            <div className="p-4 border-t border-black/10 dark:border-white/10 text-xs text-black/50 dark:text-white/50 truncate animate-in fade-in duration-200">
              <p className="font-semibold text-black/80 dark:text-white/80">{dict.brand.name}</p>
              <p className="text-[11px] truncate">{dict.dashboard?.consoleSubtitle ?? 'Admin Console'}</p>
            </div>
          )}
        </aside>

        {/* Dashboard Main Workspace */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto min-w-0 print:p-0 print:m-0 print:overflow-visible print:h-auto">
          {activeTab === 'invoices' ? (
            <InvoiceManager />
          ) : activeTab === 'vehicles' ? (
            <VehicleManager />
          ) : activeTab === 'drivers' ? (
            <DriverManager />
          ) : activeTab === 'fuel' ? (
            <FuelManager />
          ) : activeTab === 'maintenance' ? (
            <MaintenanceManager />
          ) : activeTab === 'expenses' ? (
            <ExpenseManager />
          ) : activeTab === 'profitAndLoss' ? (
            <ProfitAndLossManager />
          ) : activeTab === 'tripSheet' ? (
            <MasterTripSheetManager />
          ) : activeTab === 'documents' ? (
            <DocumentsManager />
          ) : activeTab === 'overview' ? (
            <OverviewManager onNavigate={(tab) => navigateToTab(tab as any)} />
          ) : (
            <>
              {/* Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-[clamp(1.5rem,3vw,2.25rem)] font-bold tracking-tight">
                    {currentTabLabel}
                  </h1>
                  <p className="text-sm text-black/60 dark:text-white/60 mt-1">
                    {dict.dashboard?.roleAdmin ?? 'Administrator'}
                  </p>
                </div>
              </div>

              {/* Active Module View */}
              <div className="mt-8 p-6 sm:p-8 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-2">
                  <ActiveIcon className="w-6 h-6 text-black dark:text-white shrink-0" />
                  <h2 className="text-xl font-bold tracking-tight text-black dark:text-white">
                    {currentTabLabel}
                  </h2>
                </div>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {dict.dashboard?.sectionReady ?? 'Module active and ready for data integration.'}
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
