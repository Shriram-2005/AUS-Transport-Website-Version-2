'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface CustomDatePickerProps {
  value: string; // Accepts 'DD-MM-YYYY' or 'YYYY-MM-DD'
  onChange: (value: string) => void; // Always returns 'DD-MM-YYYY'
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Helper to parse 'DD-MM-YYYY' or 'YYYY-MM-DD' into Date
function parseDateString(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Check if DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m - 1) {
      return date;
    }
  }

  // Check if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m - 1) {
      return date;
    }
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function CustomDatePicker({
  value,
  onChange,
  placeholder = 'DD-MM-YYYY',
  disabled = false,
  className = '',
  id,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = parseDateString(value);

  // View state for calendar (month and year)
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate || new Date());

  // Update viewDate when value changes externally
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [value]);

  // Handle click outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Calendar calculations
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(currentYear, currentMonth, day);
    onChange(formatDate(newDate));
    setIsOpen(false);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    setViewDate(today);
    onChange(formatDate(today));
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  const isToday = (day: number) => {
    const now = new Date();
    return (
      now.getDate() === day &&
      now.getMonth() === currentMonth &&
      now.getFullYear() === currentYear
    );
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === currentMonth &&
      selectedDate.getFullYear() === currentYear
    );
  };

  const displayValue = selectedDate ? formatDate(selectedDate) : (value || '');

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Proper Text & Calendar Input Box */}
      <div className="relative w-full">
        <input
          id={id}
          type="text"
          value={displayValue}
          disabled={disabled}
          placeholder={placeholder}
          onClick={() => !disabled && setIsOpen(true)}
          onChange={(e) => {
            const rawVal = e.target.value;
            onChange(rawVal);
            const parsed = parseDateString(rawVal);
            if (parsed) {
              setViewDate(parsed);
            }
          }}
          className={`
            w-full px-3.5 py-2.5 pr-14 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm font-bold font-mono shadow-xs hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer
            ${disabled ? 'bg-gray-100/70 dark:bg-zinc-900/40 border-dashed border-gray-300 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 cursor-not-allowed select-none' : ''}
          `}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
          {displayValue && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              title="Clear date"
              className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) setIsOpen((prev) => !prev);
            }}
            title="Open calendar"
            className="p-1 text-gray-400 hover:text-blue-600 dark:text-zinc-500 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Popover Calendar Dropdown */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Date Picker Calendar"
          className="
            absolute z-50 mt-1.5 w-72 p-3 rounded-xl shadow-2xl border
            bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800
            text-gray-900 dark:text-zinc-100
            animate-in fade-in-0 zoom-in-95 duration-150
            left-0
          "
        >
          {/* Header Controls */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-1 rounded-md text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-sm font-semibold tracking-tight">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="p-1 rounded-md text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {DAYS_OF_WEEK.map((d) => (
              <span
                key={d}
                className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 py-1"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Days from previous month */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => {
              const dayNum = daysInPrevMonth - firstDayOfMonth + i + 1;
              return (
                <div
                  key={`prev-${i}`}
                  className="h-8 flex items-center justify-center text-xs text-gray-300 dark:text-zinc-600 select-none"
                >
                  {dayNum}
                </div>
              );
            })}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const selected = isSelected(dayNum);
              const today = isToday(dayNum);

              return (
                <button
                  key={`cur-${dayNum}`}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`
                    h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition-all select-none cursor-pointer
                    ${
                      selected
                        ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-sm'
                        : today
                        ? 'border border-black dark:border-white font-semibold text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800'
                        : 'text-gray-800 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800'
                    }
                  `}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Bottom Bar: Today & Clear */}
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-2 mt-2 text-xs">
            <button
              type="button"
              onClick={handleToday}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
