'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/DashboardHeader';
import { InvoiceManager } from '@/components/InvoiceManager';
import { VehicleManager } from '@/components/VehicleManager';
import { DriverManager } from '@/components/DriverManager';
import { FuelManager } from '@/components/FuelManager';
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
  | 'documents';

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
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        {/* Mobile Backdrop Overlay (Active only on small screens < md) */}
        {menuOpen && (
          <div
            className="fixed inset-0 top-[65px] bg-black/40 dark:bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity cursor-pointer no-print print:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Responsive Sidebar: Icon Rail when closed on desktop, expands on toggle, full overlay drawer on mobile */}
        <aside
          className={`
            no-print print:hidden
            fixed md:sticky top-[65px] bottom-0 left-0 z-30
            md:h-[calc(100vh-65px)] bg-white dark:bg-black
            border-r border-black/10 dark:border-white/10
            transition-all duration-300 ease-in-out flex flex-col justify-between shrink-0 pointer-events-auto
            ${
              menuOpen
                ? 'translate-x-0 w-72 md:w-64 shadow-2xl md:shadow-none'
                : 'max-md:-translate-x-full max-md:pointer-events-none w-72 md:w-[72px]'
            }
          `}
        >
          {/* Sidebar Navigation Content */}
          <div className="p-4 space-y-1.5 flex-1 overflow-y-auto overflow-x-hidden">
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
                      e.stopPropagation();
                      navigateToTab(item.id);
                      if (isMobile) setMenuOpen(false);
                    }}
                    className={`
                      h-10 rounded-xl text-sm font-semibold transition-all cursor-pointer select-none flex items-center relative z-10 pointer-events-auto
                      ${
                        menuOpen
                          ? 'w-full px-2.5 gap-3 justify-start text-left'
                          : 'w-10 justify-center'
                      }
                      ${
                        isActive
                          ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm'
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
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto min-w-0 print:p-0 print:m-0 print:overflow-visible print:h-auto">
          {activeTab === 'invoices' ? (
            <InvoiceManager />
          ) : activeTab === 'vehicles' ? (
            <VehicleManager />
          ) : activeTab === 'drivers' ? (
            <DriverManager />
          ) : activeTab === 'fuel' ? (
            <FuelManager />
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
