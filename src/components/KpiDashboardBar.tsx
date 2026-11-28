'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  SlidersHorizontal,
  X,
  Check,
  RotateCcw,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  Truck,
  Gauge,
  Calendar,
  RotateCcw as RotateIcon,
  TrendingUp,
  Users,
  Wallet,
  Fuel,
  Droplets,
  Building2,
  Wrench,
  ClipboardList,
  Receipt,
  CreditCard,
  Percent,
  CheckCircle2,
  Clock,
  FileText,
  Activity,
  Award,
} from 'lucide-react';
import {
  KpiCardDefinition,
  getStoredKpiConfig,
  saveStoredKpiConfig,
  resetStoredKpiConfig,
  KPI_CONFIG_CHANGE_EVENT,
} from '@/lib/kpiManager';

interface KpiDashboardBarProps {
  category: string;
  availableCards: KpiCardDefinition[];
  defaultKeys: string[];
}

const COLOR_MAP: Record<
  KpiCardDefinition['color'],
  { badge: string; text: string; darkBadge: string; darkText: string }
> = {
  blue: {
    badge: 'bg-blue-50 border-blue-200',
    text: 'text-blue-600',
    darkBadge: 'dark:bg-blue-950/60 dark:border-blue-900',
    darkText: 'dark:text-blue-400',
  },
  emerald: {
    badge: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-600',
    darkBadge: 'dark:bg-emerald-950/60 dark:border-emerald-900',
    darkText: 'dark:text-emerald-400',
  },
  amber: {
    badge: 'bg-amber-50 border-amber-200',
    text: 'text-amber-600',
    darkBadge: 'dark:bg-amber-950/60 dark:border-amber-900',
    darkText: 'dark:text-amber-400',
  },
  indigo: {
    badge: 'bg-indigo-50 border-indigo-200',
    text: 'text-indigo-600',
    darkBadge: 'dark:bg-indigo-950/60 dark:border-indigo-900',
    darkText: 'dark:text-indigo-400',
  },
  purple: {
    badge: 'bg-purple-50 border-purple-200',
    text: 'text-purple-600',
    darkBadge: 'dark:bg-purple-950/60 dark:border-purple-900',
    darkText: 'dark:text-purple-400',
  },
  rose: {
    badge: 'bg-rose-50 border-rose-200',
    text: 'text-rose-600',
    darkBadge: 'dark:bg-rose-950/60 dark:border-rose-900',
    darkText: 'dark:text-rose-400',
  },
  cyan: {
    badge: 'bg-cyan-50 border-cyan-200',
    text: 'text-cyan-600',
    darkBadge: 'dark:bg-cyan-950/60 dark:border-cyan-900',
    darkText: 'dark:text-cyan-400',
  },
  slate: {
    badge: 'bg-gray-100 border-gray-200',
    text: 'text-gray-700',
    darkBadge: 'dark:bg-zinc-800 dark:border-zinc-700',
    darkText: 'dark:text-zinc-300',
  },
};

const ICON_MAP: Record<KpiCardDefinition['icon'], React.ComponentType<{ className?: string }>> = {
  truck: Truck,
  gauge: Gauge,
  calendar: Calendar,
  rotate: RotateIcon,
  trending: TrendingUp,
  users: Users,
  wallet: Wallet,
  fuel: Fuel,
  droplets: Droplets,
  building: Building2,
  wrench: Wrench,
  clipboard: ClipboardList,
  receipt: Receipt,
  creditCard: CreditCard,
  percent: Percent,
  check: CheckCircle2,
  clock: Clock,
  fileText: FileText,
  activity: Activity,
  award: Award,
};

function renderKpiIcon(iconKey: KpiCardDefinition['icon'], className: string) {
  const IconComponent = ICON_MAP[iconKey] || Activity;
  return <IconComponent className={className} />;
}

export function KpiDashboardBar({ category, availableCards, defaultKeys }: KpiDashboardBarProps) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(defaultKeys);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isAddDropdownOpen, setIsAddDropdownOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  // Drag and drop states
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const addDropdownRef = useRef<HTMLDivElement>(null);

  // Load config on mount & listen for changes
  useEffect(() => {
    const config = getStoredKpiConfig(category, defaultKeys);
    setVisibleKeys(config.visibleKeys);

    const handleConfigChange = (e: any) => {
      if (!e.detail || e.detail.category === category.toLowerCase()) {
        const updated = getStoredKpiConfig(category, defaultKeys);
        setVisibleKeys(updated.visibleKeys);
      }
    };
    window.addEventListener(KPI_CONFIG_CHANGE_EVENT as any, handleConfigChange);
    return () => window.removeEventListener(KPI_CONFIG_CHANGE_EVENT as any, handleConfigChange);
  }, [category, defaultKeys]);

  // Close Add dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setIsAddDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Map of available card definitions
  const availableMap = useMemo(() => {
    const map = new Map<string, KpiCardDefinition>();
    availableCards.forEach((c) => map.set(c.key, c));
    return map;
  }, [availableCards]);

  // Active cards in current user-defined order
  const activeCards = useMemo(() => {
    return visibleKeys
      .map((key) => availableMap.get(key))
      .filter((card): card is KpiCardDefinition => Boolean(card));
  }, [visibleKeys, availableMap]);

  // Inactive (hidden) cards available for addition
  const inactiveCards = useMemo(() => {
    return availableCards.filter((c) => !visibleKeys.includes(c.key));
  }, [availableCards, visibleKeys]);

  const updateVisibleKeys = (newKeys: string[]) => {
    setVisibleKeys(newKeys);
    saveStoredKpiConfig(category, { visibleKeys: newKeys });
  };

  const handleToggleCard = (key: string) => {
    if (visibleKeys.includes(key)) {
      if (visibleKeys.length <= 1) return; // Keep at least one card
      updateVisibleKeys(visibleKeys.filter((k) => k !== key));
    } else {
      updateVisibleKeys([...visibleKeys, key]);
    }
  };

  const handleAddCard = (key: string) => {
    if (!visibleKeys.includes(key)) {
      updateVisibleKeys([...visibleKeys, key]);
    }
    setIsAddDropdownOpen(false);
  };

  const handleRemoveCard = (key: string) => {
    if (visibleKeys.length <= 1) return;
    updateVisibleKeys(visibleKeys.filter((k) => k !== key));
  };

  const handleMoveCard = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= visibleKeys.length) return;
    const copy = [...visibleKeys];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    updateVisibleKeys(copy);
  };

  const handleResetToDefaults = () => {
    resetStoredKpiConfig(category, defaultKeys);
    setVisibleKeys(defaultKeys);
    setIsReorderMode(false);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    setDraggedKey(key);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (draggedKey && draggedKey !== key) {
      setDragOverKey(key);
    }
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = e.dataTransfer.getData('text/plain') || draggedKey;
    if (sourceKey && targetKey && sourceKey !== targetKey) {
      const fromIndex = visibleKeys.indexOf(sourceKey);
      const toIndex = visibleKeys.indexOf(targetKey);
      if (fromIndex !== -1 && toIndex !== -1) {
        const copy = [...visibleKeys];
        const [moved] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, moved);
        updateVisibleKeys(copy);
      }
    }
    setDraggedKey(null);
    setDragOverKey(null);
  };

  // Filtered available cards for customize modal
  const filteredModalCards = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    if (!q) return availableCards;
    return availableCards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [availableCards, modalSearch]);

  return (
    <div className="space-y-3">
      {/* KPI Controls Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
            Metrics Overview ({activeCards.length} active)
          </span>
          {isReorderMode && (
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold text-[10px] animate-pulse">
              Reorder Mode Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Add Metric Dropdown */}
          {inactiveCards.length > 0 && (
            <div className="relative" ref={addDropdownRef}>
              <button
                type="button"
                onClick={() => setIsAddDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold text-xs transition-all cursor-pointer shadow-2xs"
                title="Add a database metric card"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>Add Metric ({inactiveCards.length})</span>
              </button>

              {isAddDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-40 p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 border-b border-gray-100 dark:border-zinc-800">
                    Available Database Metrics
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {inactiveCards.map((card) => {
                      const theme = COLOR_MAP[card.color] || COLOR_MAP.blue;
                      return (
                        <button
                          key={card.key}
                          type="button"
                          onClick={() => handleAddCard(card.key)}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/60 text-left transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${theme.badge} ${theme.text} ${theme.darkBadge} ${theme.darkText}`}
                            >
                              {renderKpiIcon(card.icon, 'w-3 h-3')}
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate">
                                {card.title}
                              </p>
                              <p className="text-[10px] font-mono font-semibold text-gray-500 dark:text-zinc-400">
                                {card.value}
                              </p>
                            </div>
                          </div>
                          <Plus className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reorder Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsReorderMode((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-semibold text-xs transition-all cursor-pointer shadow-2xs ${
              isReorderMode
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
            title="Toggle card reordering"
          >
            <GripVertical className="w-3.5 h-3.5" />
            <span>{isReorderMode ? 'Done Reordering' : 'Reorder'}</span>
          </button>

          {/* Customize KPIs Modal Button */}
          <button
            type="button"
            onClick={() => setIsCustomizeOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold text-xs transition-all cursor-pointer shadow-2xs"
            title="Customize and choose cards"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
            <span>Customize</span>
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
        {activeCards.map((card, index) => {
          const theme = COLOR_MAP[card.color] || COLOR_MAP.blue;
          const isFirst = index === 0;
          const isLast = index === activeCards.length - 1;

          return (
            <div
              key={card.key}
              draggable={isReorderMode}
              onDragStart={(e) => handleDragStart(e, card.key)}
              onDragOver={(e) => handleDragOver(e, card.key)}
              onDrop={(e) => handleDrop(e, card.key)}
              onDragLeave={() => {
                if (dragOverKey === card.key) setDragOverKey(null);
              }}
              className={`p-4 rounded-2xl bg-white dark:bg-zinc-900 border shadow-2xs space-y-2 transition-all relative group flex flex-col justify-between ${
                draggedKey === card.key
                  ? 'opacity-30 border-blue-400 scale-95'
                  : dragOverKey === card.key
                  ? 'border-blue-500 ring-2 ring-blue-500/40 scale-[1.02]'
                  : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
              }`}
            >
              {/* Top Row: Title, Grip / Reorder, Icon */}
              <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
                <div className="flex items-center gap-1.5 truncate pr-1">
                  {isReorderMode && (
                    <GripVertical className="w-3.5 h-3.5 text-gray-400 cursor-grab active:cursor-grabbing shrink-0" />
                  )}
                  <span className="text-[11px] uppercase font-bold tracking-wider truncate">
                    {card.title}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Remove Card Button on hover */}
                  {activeCards.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCard(card.key)}
                      title="Hide this metric"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-opacity cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${theme.badge} ${theme.text} ${theme.darkBadge} ${theme.darkText}`}
                  >
                    {renderKpiIcon(card.icon, 'w-4 h-4')}
                  </div>
                </div>
              </div>

              {/* Bottom: Big Value & Subtitle */}
              <div>
                <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight truncate">
                  {card.value}
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold mt-0.5 truncate">
                  {card.subtitle}
                </p>
              </div>

              {/* Quick Move Arrows when in reorder mode */}
              {isReorderMode && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-zinc-800/80 mt-1">
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => handleMoveCard(index, 'left')}
                    className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                    title="Move left"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono text-gray-400 font-bold">
                    #{index + 1}
                  </span>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => handleMoveCard(index, 'right')}
                    className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                    title="Move right"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Customize KPIs Modal */}
      {isCustomizeOpen && (
        <div
          className="fixed inset-0 !m-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100"
          onClick={() => setIsCustomizeOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                    Customize Metric Cards
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Select pure database metrics to display and manage their order
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomizeOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter */}
            <div className="p-3.5 border-b border-gray-100 dark:border-zinc-800">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter available metrics..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 text-xs font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
                />
              </div>
            </div>

            {/* Metrics List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredModalCards.map((card) => {
                const isSelected = visibleKeys.includes(card.key);
                const theme = COLOR_MAP[card.color] || COLOR_MAP.blue;
                const orderIndex = visibleKeys.indexOf(card.key);

                return (
                  <div
                    key={card.key}
                    onClick={() => handleToggleCard(card.key)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                        : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate pr-2">
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300 dark:border-zinc-700'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>

                      <div
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${theme.badge} ${theme.text} ${theme.darkBadge} ${theme.darkText}`}
                      >
                        {renderKpiIcon(card.icon, 'w-4 h-4')}
                      </div>

                      <div className="truncate">
                        <p className="text-xs font-bold text-gray-900 dark:text-zinc-100 truncate">
                          {card.title}
                        </p>
                        <p className="text-[11px] font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {card.value}{' '}
                          <span className="text-[10px] font-sans text-gray-500 dark:text-zinc-400 font-normal">
                            - {card.subtitle}
                          </span>
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={orderIndex === 0}
                          onClick={() => handleMoveCard(orderIndex, 'left')}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                          title="Move earlier"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={orderIndex === visibleKeys.length - 1}
                          onClick={() => handleMoveCard(orderIndex, 'right')}
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                          title="Move later"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Defaults</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCustomizeOpen(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Done ({visibleKeys.length} active)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

