'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Tag,
  Target,
  Star,
  Gauge,
  Wallet,
  Receipt,
  Truck,
  Users,
  Activity,
  Sparkles,
} from 'lucide-react';
import {
  CustomKpi,
  getStoredCustomKpis,
  addStoredCustomKpi,
  updateStoredCustomKpi,
  deleteStoredCustomKpi,
  CUSTOM_KPIS_CHANGE_EVENT,
} from '@/lib/customKpis';

interface CustomKpiSectionProps {
  category: string;
}

const COLOR_MAP: Record<
  CustomKpi['color'],
  { badge: string; text: string; darkBadge: string; darkText: string; border: string }
> = {
  blue: {
    badge: 'bg-blue-50 border-blue-200',
    text: 'text-blue-600',
    darkBadge: 'dark:bg-blue-950/60 dark:border-blue-900',
    darkText: 'dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-900',
  },
  emerald: {
    badge: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-600',
    darkBadge: 'dark:bg-emerald-950/60 dark:border-emerald-900',
    darkText: 'dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-900',
  },
  amber: {
    badge: 'bg-amber-50 border-amber-200',
    text: 'text-amber-600',
    darkBadge: 'dark:bg-amber-950/60 dark:border-amber-900',
    darkText: 'dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-900',
  },
  indigo: {
    badge: 'bg-indigo-50 border-indigo-200',
    text: 'text-indigo-600',
    darkBadge: 'dark:bg-indigo-950/60 dark:border-indigo-900',
    darkText: 'dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-900',
  },
  purple: {
    badge: 'bg-purple-50 border-purple-200',
    text: 'text-purple-600',
    darkBadge: 'dark:bg-purple-950/60 dark:border-purple-900',
    darkText: 'dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-900',
  },
  rose: {
    badge: 'bg-rose-50 border-rose-200',
    text: 'text-rose-600',
    darkBadge: 'dark:bg-rose-950/60 dark:border-rose-900',
    darkText: 'dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-900',
  },
  cyan: {
    badge: 'bg-cyan-50 border-cyan-200',
    text: 'text-cyan-600',
    darkBadge: 'dark:bg-cyan-950/60 dark:border-cyan-900',
    darkText: 'dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-900',
  },
};

const ICON_OPTIONS: Array<{ key: CustomKpi['icon']; label: string; component: React.ComponentType<{ className?: string }> }> = [
  { key: 'target', label: 'Target', component: Target },
  { key: 'tag', label: 'Tag', component: Tag },
  { key: 'star', label: 'Star', component: Star },
  { key: 'gauge', label: 'Gauge', component: Gauge },
  { key: 'wallet', label: 'Wallet', component: Wallet },
  { key: 'receipt', label: 'Receipt', component: Receipt },
  { key: 'truck', label: 'Truck', component: Truck },
  { key: 'users', label: 'Users', component: Users },
  { key: 'activity', label: 'Activity', component: Activity },
];

function renderIcon(iconKey: CustomKpi['icon'], className: string) {
  const match = ICON_OPTIONS.find((o) => o.key === iconKey);
  const IconComp = match ? match.component : Star;
  return <IconComp className={className} />;
}

export function CustomKpiCards({ category }: CustomKpiSectionProps) {
  const [kpis, setKpis] = useState<CustomKpi[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<CustomKpi | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formColor, setFormColor] = useState<CustomKpi['color']>('blue');
  const [formIcon, setFormIcon] = useState<CustomKpi['icon']>('target');

  const loadKpis = () => {
    setKpis(getStoredCustomKpis(category));
  };

  useEffect(() => {
    loadKpis();
    const handleUpdate = (e: any) => {
      if (!e.detail || e.detail.category === category.toLowerCase()) {
        loadKpis();
      }
    };
    window.addEventListener(CUSTOM_KPIS_CHANGE_EVENT as any, handleUpdate);
    return () => window.removeEventListener(CUSTOM_KPIS_CHANGE_EVENT as any, handleUpdate);
  }, [category]);

  const handleOpenAdd = () => {
    setEditingKpi(null);
    setFormTitle('');
    setFormValue('');
    setFormSubtitle('');
    setFormColor('blue');
    setFormIcon('target');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (kpi: CustomKpi) => {
    setEditingKpi(kpi);
    setFormTitle(kpi.title);
    setFormValue(kpi.value);
    setFormSubtitle(kpi.subtitle || '');
    setFormColor(kpi.color);
    setFormIcon(kpi.icon);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    const cleanValue = formValue.trim();
    if (!cleanTitle || !cleanValue) return;

    if (editingKpi) {
      updateStoredCustomKpi(category, editingKpi.id, {
        title: cleanTitle,
        value: cleanValue,
        subtitle: formSubtitle.trim(),
        color: formColor,
        icon: formIcon,
      });
    } else {
      addStoredCustomKpi(category, {
        title: cleanTitle,
        value: cleanValue,
        subtitle: formSubtitle.trim(),
        color: formColor,
        icon: formIcon,
      });
    }
    loadKpis();
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteStoredCustomKpi(category, id);
    loadKpis();
  };

  return (
    <>
      {/* Custom KPI Cards rendered inline */}
      {kpis.map((kpi) => {
        const theme = COLOR_MAP[kpi.color] || COLOR_MAP.blue;
        return (
          <div
            key={kpi.id}
            className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs space-y-2 hover:border-gray-300 dark:hover:border-zinc-700 transition-all relative group"
          >
            <div className="flex items-center justify-between text-gray-500 dark:text-zinc-400">
              <span className="text-[11px] uppercase font-bold tracking-wider truncate pr-2">
                {kpi.title}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Actions on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(kpi)}
                    title="Edit Custom KPI"
                    className="p-1 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(kpi.id)}
                    title="Delete Custom KPI"
                    className="p-1 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${theme.badge} ${theme.text} ${theme.darkBadge} ${theme.darkText}`}
                >
                  {renderIcon(kpi.icon, 'w-4 h-4')}
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-black font-mono text-gray-900 dark:text-zinc-100 tracking-tight truncate">
                {kpi.value}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold mt-0.5 truncate">
                {kpi.subtitle || 'Custom metric'}
              </p>
            </div>
          </div>
        );
      })}

      {/* Button to Add Custom KPI */}
      <button
        type="button"
        onClick={handleOpenAdd}
        title="Create a custom KPI card for this page"
        className="p-4 rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-900/40 hover:bg-gray-100/70 dark:hover:bg-zinc-800/50 hover:border-blue-400 dark:hover:border-blue-600 text-gray-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[92px] group"
      >
        <div className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 group-hover:border-blue-300 dark:group-hover:border-blue-700 flex items-center justify-center transition-colors">
          <Plus className="w-4 h-4 text-gray-500 group-hover:text-blue-600 dark:text-zinc-400 dark:group-hover:text-blue-400" />
        </div>
        <span className="text-xs font-bold tracking-tight">Add Custom KPI</span>
      </button>

      {/* Custom KPI Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  {editingKpi ? 'Edit Custom KPI' : 'Add Custom KPI Card'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  KPI Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Budget, Toll Buffer, Target Trips"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Metric Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rs. 50,000 or 4.5 KM/L or 100%"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-bold font-mono focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Subtitle / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. November 2026 allocation target"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Color Accent
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {(['blue', 'emerald', 'amber', 'indigo', 'purple', 'rose', 'cyan'] as const).map(
                    (c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setFormColor(c)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold capitalize transition-all cursor-pointer ${
                          formColor === c
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent shadow-xs'
                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-200'
                        }`}
                      >
                        {c}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Card Icon
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {ICON_OPTIONS.map((opt) => {
                    const Comp = opt.component;
                    return (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() => setFormIcon(opt.key)}
                        title={opt.label}
                        className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                          formIcon === opt.key
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <Comp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  {editingKpi ? 'Save Changes' : 'Create KPI Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
