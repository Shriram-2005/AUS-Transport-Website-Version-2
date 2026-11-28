'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Pencil, Trash2, X, Plus } from 'lucide-react';

interface EditableSelectDropdownProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  title?: string;
  placeholder?: string;
  addPlaceholder?: string;
  icon?: React.ReactNode;
  allowClear?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right';
  className?: string;
  onAddOption?: (newValue: string) => void;
  onEditOption?: (oldValue: string, newValue: string) => void;
  onDeleteOption?: (targetValue: string) => void;
  extraOption?: {
    label: string;
    isSelected: boolean;
    onSelect: () => void;
  };
}

export function EditableSelectDropdown({
  value,
  options,
  onChange,
  title = 'Select Option',
  placeholder = 'Select...',
  addPlaceholder = 'Add new option...',
  icon,
  allowClear = false,
  disabled = false,
  align = 'left',
  className = '',
  onAddOption,
  onEditOption,
  onDeleteOption,
  extraOption,
}: EditableSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newInput, setNewInput] = useState('');
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingOpt(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handleAdd = () => {
    const clean = newInput.trim();
    if (!clean || !onAddOption) return;
    onAddOption(clean);
    onChange(clean);
    setNewInput('');
  };

  const handleSaveEdit = (oldVal: string) => {
    const clean = editValue.trim();
    if (!clean || !onEditOption) {
      setEditingOpt(null);
      return;
    }
    onEditOption(oldVal, clean);
    if (value.toLowerCase() === oldVal.toLowerCase()) {
      onChange(clean);
    }
    setEditingOpt(null);
  };

  const displayLabel = value ? value : extraOption?.isSelected ? extraOption.label : placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-between gap-2 transition-all shadow-xs ${
          disabled
            ? 'bg-gray-100 dark:bg-zinc-800/60 border-gray-200 dark:border-zinc-800 text-gray-400 cursor-not-allowed'
            : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {icon && <span className="shrink-0 text-blue-600 dark:text-blue-400">{icon}</span>}
          <span className={`truncate ${!value && !extraOption?.isSelected ? 'text-gray-400 dark:text-zinc-500 font-medium' : ''}`}>
            {displayLabel}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 w-full min-w-[260px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl z-50 p-2.5 text-xs box-border`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-gray-100 dark:border-zinc-800 px-1">
            <span className="font-bold text-gray-800 dark:text-zinc-200 text-xs">{title}</span>
            {allowClear && value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="text-[11px] font-semibold text-red-500 hover:text-red-700 hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
            {options.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-gray-400 dark:text-zinc-500 italic">
                No options available. Add one below.
              </div>
            ) : (
              options.map((opt) => {
                const isSelected = value.toLowerCase() === opt.toLowerCase();
                const isEditing = editingOpt === opt;

                if (isEditing) {
                  return (
                    <div
                      key={opt}
                      className="flex items-center gap-1 px-1.5 py-1 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                    >
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveEdit(opt);
                          } else if (e.key === 'Escape') {
                            setEditingOpt(null);
                          }
                        }}
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(opt)}
                        title="Save"
                        className="p-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOpt(null)}
                        title="Cancel"
                        className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={opt}
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                        : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {icon && (
                        <span className={`shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                          {icon}
                        </span>
                      )}
                      <span className="truncate">{opt}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                      {onEditOption && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingOpt(opt);
                            setEditValue(opt);
                          }}
                          title={`Edit "${opt}"`}
                          className="opacity-100 p-1 text-gray-500 hover:text-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {onDeleteOption && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteOption(opt);
                            if (isSelected) {
                              onChange('');
                            }
                          }}
                          title={`Delete "${opt}"`}
                          className="opacity-100 p-1 text-gray-500 hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-950/50 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {extraOption && (
              <div
                onClick={() => {
                  extraOption.onSelect();
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition-colors border-t border-gray-100 dark:border-zinc-800 mt-1 pt-2 ${
                  extraOption.isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                    : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300'
                }`}
              >
                <span>{extraOption.label}</span>
                {extraOption.isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
              </div>
            )}
          </div>

          {/* Add New Footer */}
          {onAddOption && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-zinc-800 flex items-center gap-1.5">
              <input
                type="text"
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder={addPlaceholder}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newInput.trim()}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

