'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Printer,
  AlertTriangle,
  Truck,
  ExternalLink,
  ChevronDown,
  Building2,
  Receipt,
  CreditCard
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  ExpenseEntry,
  getStoredExpenses,
  saveStoredExpenses,
  addStoredExpense,
  updateStoredExpense,
  deleteStoredExpense,
  getStoredExpenseCategories,
  addStoredExpenseCategory,
  filterExpenses,
  calculateExpenseSummary,
  numberToWords,
  PAYMENT_MODES,
  EXPENSES_CHANGE_EVENT
} from '@/lib/expenses';
import { Vehicle, getStoredVehicles, VEHICLES_CHANGE_EVENT } from '@/lib/vehicles';
import { CustomDatePicker } from './CustomDatePicker';
import { REFRESH_MODULE_EVENT } from '@/lib/headerEvents';

function getTodayDDMMYYYY(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function ExpenseManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<ExpenseEntry | null>(null);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [statementTarget, setStatementTarget] = useState<string | null>(null);

  // Form states
  const [formVehicleNumber, setFormVehicleNumber] = useState('GENERAL');
  const [formDate, setFormDate] = useState<string>(getTodayDDMMYYYY());
  const [formVoucherNumber, setFormVoucherNumber] = useState('');
  const [formCategory, setFormCategory] = useState<string>('FASTag & Highway Toll');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPaymentMode, setFormPaymentMode] = useState<ExpenseEntry['paymentMode']>('Cash');
  const [formPaidTo, setFormPaidTo] = useState('');
  const [formAmount, setFormAmount] = useState<string>(''); // No pre-filled price by default
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Statement PDF generation states
  const [statementFromDate, setStatementFromDate] = useState<string>('');
  const [statementToDate, setStatementToDate] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Load initial vehicles, expenses, and categories on mount
  useEffect(() => {
    setVehicles(getStoredVehicles());
    setExpenses(getStoredExpenses());
    setCategoriesList(getStoredExpenseCategories());

    const handleVehiclesUpdate = (e: CustomEvent<Vehicle[]>) => {
      if (e.detail) {
        setVehicles(e.detail);
      } else {
        setVehicles(getStoredVehicles());
      }
    };

    const handleExpensesUpdate = (e: CustomEvent<ExpenseEntry[]>) => {
      if (e.detail) {
        setExpenses(e.detail);
      } else {
        setExpenses(getStoredExpenses());
      }
    };

    window.addEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
    window.addEventListener(EXPENSES_CHANGE_EVENT as any, handleExpensesUpdate);

    return () => {
      window.removeEventListener(VEHICLES_CHANGE_EVENT as any, handleVehiclesUpdate);
      window.removeEventListener(EXPENSES_CHANGE_EVENT as any, handleExpensesUpdate);
    };
  }, []);

  // Sync latest from Supabase
  const refreshFromSupabase = useCallback(async () => {
    try {
      const supabase = createClient();

      // 1. Sync vehicles
      const { data: vData } = await supabase.from('vehicles').select('*');
      if (vData && vData.length > 0) {
        const loadedVehicles: Vehicle[] = vData.map((v: any) => ({
          id: v.id,
          registrationNumber: (v.registration_number || '').trim().toUpperCase(),
          currentKm: Number(v.current_km) || 0,
          status: v.status || 'active',
          model: v.model || '',
        }));
        setVehicles(loadedVehicles);
      }

      // 2. Sync expenses
      const { data: eData, error: eErr } = await supabase
        .from('expense_entries')
        .select('*')
        .order('entry_date', { ascending: false });

      if (!eErr && eData && eData.length > 0) {
        const loaded: ExpenseEntry[] = eData.map((e: any) => ({
          id: e.id,
          vehicleNumber: (e.vehicle_number || 'GENERAL').trim().toUpperCase(),
          date: e.entry_date || '',
          voucherNumber: e.voucher_number || '',
          category: e.category || 'FASTag & Highway Toll',
          description: e.description || '',
          amount: Number(e.amount) || 0,
          paymentMode: e.payment_mode || 'Cash',
          paidTo: e.paid_to || '',
          createdAt: e.created_at,
          updatedAt: e.updated_at,
        }));
        setExpenses(loaded);
        saveStoredExpenses(loaded);

        const distinctCats = loaded
          .map((item) => (item.category || '').trim())
          .filter(Boolean);
        if (distinctCats.length > 0) {
          const merged = Array.from(new Set([...getStoredExpenseCategories(), ...distinctCats]));
          setCategoriesList(merged);
        }
      } else if (!eErr && eData && eData.length === 0) {
        // If Supabase table is empty but client has local entries, seed Supabase
        const local = getStoredExpenses();
        if (local.length > 0) {
          for (const item of local) {
            await supabase.from('expense_entries').insert([{
              id: item.id,
              vehicle_number: item.vehicleNumber,
              entry_date: item.date,
              voucher_number: item.voucherNumber,
              category: item.category,
              description: item.description,
              amount: item.amount,
              payment_mode: item.paymentMode,
              paid_to: item.paidTo || '',
            }]);
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing expenses from Supabase:', err);
    }
  }, []);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // Listen for refresh module event from DashboardHeader
  useEffect(() => {
    const handleModuleRefresh = (e: any) => {
      if (!e.detail || e.detail.module === 'expenses' || e.detail.module === 'all') {
        refreshFromSupabase();
      }
    };
    window.addEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
    return () => window.removeEventListener(REFRESH_MODULE_EVENT as any, handleModuleRefresh);
  }, [refreshFromSupabase]);

  // Close 3-dot dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.expense-action-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Accounts list: All vehicles + 'GENERAL' (Office & General Fleet)
  const accountsList = useMemo(() => {
    const list: { id: string; label: string; isGeneral: boolean }[] = [
      { id: 'GENERAL', label: 'Office & General Fleet Overheads', isGeneral: true },
      ...vehicles.map((v) => ({
        id: v.registrationNumber,
        label: v.registrationNumber,
        isGeneral: false,
      })),
    ];

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => a.label.toLowerCase().includes(q));
  }, [vehicles, searchQuery]);

  // Open Add Expense modal
  const handleOpenAddModal = (targetAccount?: string) => {
    setFormVehicleNumber(targetAccount || (vehicles.length > 0 ? vehicles[0].registrationNumber : 'GENERAL'));
    setFormDate(getTodayDDMMYYYY());
    setFormVoucherNumber('');
    setFormCategory('FASTag & Highway Toll');
    setIsAddingNewCategory(false);
    setNewCategoryInput('');
    setFormDescription('');
    setFormPaymentMode('Cash');
    setFormPaidTo('');
    setFormAmount(''); // Strictly empty: no pre-existing price
    setFormError('');
    setIsAddModalOpen(true);
    setActiveMenuId(null);
  };

  // Open Edit Expense modal
  const handleOpenEditModal = (entry: ExpenseEntry) => {
    setEditingEntry(entry);
    setFormVehicleNumber(entry.vehicleNumber);
    setFormDate(entry.date);
    setFormVoucherNumber(entry.voucherNumber);
    setFormCategory(entry.category);
    setIsAddingNewCategory(false);
    setNewCategoryInput('');
    setFormDescription(entry.description);
    setFormPaymentMode(entry.paymentMode);
    setFormPaidTo(entry.paidTo || '');
    setFormAmount(entry.amount > 0 ? String(entry.amount) : '');
    setFormError('');
    setActiveMenuId(null);
  };

  // Save new custom category
  const handleSaveNewCategory = () => {
    const clean = newCategoryInput.trim();
    if (!clean) return;
    const updated = addStoredExpenseCategory(clean);
    setCategoriesList(updated);
    setFormCategory(clean);
    setIsAddingNewCategory(false);
    setNewCategoryInput('');
  };

  // Submit Expense Form (Add or Edit) with Supabase sync
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanVehicle = (formVehicleNumber || 'GENERAL').trim().toUpperCase();
    if (!formDate.trim()) {
      setFormError('Please select an expense date.');
      return;
    }
    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid expense amount.');
      return;
    }

    const cleanCat = formCategory.trim() || 'Other Miscellaneous Expense';
    const cleanDesc = formDescription.trim();
    const cleanPaidTo = formPaidTo.trim();

    setIsSaving(true);

    try {
      const supabase = createClient();

      if (editingEntry) {
        updateStoredExpense(editingEntry.id, {
          vehicleNumber: cleanVehicle,
          date: formDate.trim(),
          voucherNumber: formVoucherNumber.trim(),
          category: cleanCat,
          description: cleanDesc,
          amount: amountNum,
          paymentMode: formPaymentMode,
          paidTo: cleanPaidTo,
        });

        const { error: updateErr } = await supabase
          .from('expense_entries')
          .update({
            vehicle_number: cleanVehicle,
            entry_date: formDate.trim(),
            voucher_number: formVoucherNumber.trim(),
            category: cleanCat,
            description: cleanDesc,
            amount: amountNum,
            payment_mode: formPaymentMode,
            paid_to: cleanPaidTo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEntry.id);

        if (updateErr) {
          console.warn('Supabase expense_entries update error:', updateErr.message);
        }

        setEditingEntry(null);
      } else {
        const created = addStoredExpense({
          vehicleNumber: cleanVehicle,
          date: formDate.trim(),
          voucherNumber: formVoucherNumber.trim(),
          category: cleanCat,
          description: cleanDesc,
          amount: amountNum,
          paymentMode: formPaymentMode,
          paidTo: cleanPaidTo,
        });

        const { error: insertErr } = await supabase
          .from('expense_entries')
          .insert([{
            id: created.id,
            vehicle_number: cleanVehicle,
            entry_date: formDate.trim(),
            voucher_number: formVoucherNumber.trim(),
            category: cleanCat,
            description: cleanDesc,
            amount: amountNum,
            payment_mode: formPaymentMode,
            paid_to: cleanPaidTo,
          }]);

        if (insertErr) {
          console.warn('Supabase expense_entries insert error:', insertErr.message);
        }

        setIsAddModalOpen(false);
      }

      if (cleanCat) {
        setCategoriesList(addStoredExpenseCategory(cleanCat));
      }
    } catch (err) {
      console.error('Error saving expense entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete expense entry with Supabase sync
  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    const targetId = deletingEntry.id;

    deleteStoredExpense(targetId);
    setExpenses((prev) => prev.filter((e) => e.id !== targetId));
    setDeletingEntry(null);

    try {
      const supabase = createClient();
      const { error: deleteErr } = await supabase.from('expense_entries').delete().eq('id', targetId);
      if (deleteErr) {
        console.warn('Supabase expense_entries delete error:', deleteErr.message);
      }
    } catch (err) {
      console.error('Error deleting expense entry from Supabase:', err);
    }
  };

  // Statement filtered entries for PDF print
  const statementFilteredEntries = useMemo(() => {
    if (!statementTarget) return [];
    return filterExpenses(expenses, statementTarget, statementFromDate, statementToDate);
  }, [expenses, statementTarget, statementFromDate, statementToDate]);

  const statementStats = useMemo(() => {
    return calculateExpenseSummary(statementFilteredEntries);
  }, [statementFilteredEntries]);

  // Open Statement Modal for a vehicle / account
  const handleOpenStatement = (target: string) => {
    setStatementTarget(target);
    setStatementFromDate('');
    setStatementToDate('');
    setActiveMenuId(null);
  };

  // Trigger print via hidden iframe for crisp A4 PDF generation
  const handlePrintStatement = () => {
    if (!statementTarget) return;
    setIsPrinting(true);

    const printEl = document.getElementById('aus_expense_statement_print_root');
    if (!printEl) {
      setIsPrinting(false);
      return;
    }

    let printFrame = document.getElementById('aus_expense_print_frame') as HTMLIFrameElement | null;
    if (printFrame) {
      printFrame.remove();
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'aus_expense_print_frame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    printFrame.style.visibility = 'hidden';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (!frameDoc) {
      setIsPrinting(false);
      window.print();
      return;
    }

    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Expense Statement - ${statementTarget}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm 10mm;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #111827;
        background: #fff;
        line-height: 1.4;
        font-size: 11px;
      }
      .statement-container {
        width: 100%;
        max-width: 100%;
      }
      .header-title {
        text-align: center;
        border-bottom: 2px solid #000;
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .company-name {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .report-title {
        font-size: 13px;
        font-weight: 700;
        color: #374151;
        margin-top: 2px;
      }
      .meta-grid {
        display: flex;
        justify-content: space-between;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 14px;
        font-size: 11px;
      }
      .meta-item {
        display: flex;
        flex-direction: column;
      }
      .meta-label {
        font-size: 9px;
        text-transform: uppercase;
        color: #6b7280;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .meta-value {
        font-size: 12px;
        font-weight: 700;
        color: #111827;
        font-family: monospace;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
      }
      th {
        background: #f3f4f6;
        border: 1px solid #000;
        padding: 6px 8px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: left;
      }
      td {
        border: 1px solid #d1d5db;
        padding: 5px 8px;
        font-size: 10px;
      }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .font-mono { font-family: monospace; }
      .font-bold { font-weight: 700; }
      .totals-row td {
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        font-weight: 800;
        background: #f9fafb;
        font-size: 11px;
      }
      .summary-box {
        margin-top: 10px;
        padding: 8px 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.5;
      }
      .words-text {
        font-weight: 700;
        font-style: italic;
        color: #1f2937;
      }
      .signature-row {
        display: flex;
        justify-content: space-between;
        margin-top: 45px;
        padding-top: 8px;
      }
      .signature-line {
        border-top: 1px dashed #4b5563;
        width: 180px;
        text-align: center;
        font-size: 10px;
        font-weight: 600;
        color: #4b5563;
        padding-top: 4px;
      }
    </style>
  </head>
  <body>
    ${printEl.innerHTML}
  </body>
</html>`);
    frameDoc.close();

    setTimeout(() => {
      try {
        printFrame?.contentWindow?.focus();
        printFrame?.contentWindow?.print();
      } catch (err) {
        console.error('Print error:', err);
      } finally {
        setIsPrinting(false);
      }
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Top Header: Matching Vehicle, Driver, Fuel, and Maintenance Managers */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Wallet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Expenses Management</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Track fleet tolls, vehicle insurance, road taxes, driver daily batas, yard overheads, and print expense statements
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative w-52 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vehicle or expense..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 text-sm font-medium focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Add Expense Entry Button */}
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Dual-Column Responsive Cards matching VehicleManager & MaintenanceManager */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accountsList.map((account) => {
          const accountEntries = expenses
            .filter((e) => e.vehicleNumber === account.id)
            .sort((a, b) => {
              const parseD = (s: string) => {
                const parts = s.split('-');
                if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
                return new Date(s).getTime() || 0;
              };
              return parseD(b.date) - parseD(a.date);
            });

          const stats = calculateExpenseSummary(accountEntries);
          const recentEntries = accountEntries.slice(0, 4);

          return (
            <div
              key={account.id}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-gray-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between relative group"
            >
              {/* Top Section: Vehicle / Account Name, Expense Cost, and 3-Dot Menu */}
              <div className="flex items-center justify-between">
                {/* 1. Account Name */}
                <div className="space-y-1">
                  <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                    {account.isGeneral ? 'General Account' : 'Vehicle Number'}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      account.isGeneral
                        ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400'
                        : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400'
                    }`}>
                      {account.isGeneral ? <Building2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold font-mono text-gray-900 dark:text-zinc-100 tracking-tight">
                        {account.id}
                      </h3>
                      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                        {stats.expenseCount > 0 ? `Last: ${stats.lastExpenseDate}` : 'No expenses logged'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Total Expense Cost Summary */}
                <div className="text-right pr-3 space-y-1">
                  <span className="text-xs uppercase font-bold tracking-wider text-gray-400 dark:text-zinc-500">
                    Total Expenses
                  </span>
                  <div className="flex items-baseline justify-end gap-1 font-mono">
                    <span className="text-2xl font-black text-gray-900 dark:text-zinc-100 tracking-tight">
                      Rs.{Math.round(stats.totalAmount).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs font-mono font-medium text-gray-500 dark:text-zinc-400">
                    {stats.expenseCount} {stats.expenseCount === 1 ? 'voucher' : 'vouchers'}
                  </p>
                </div>

                {/* 3. 3-Dot Menu Options */}
                <div className="relative expense-action-menu shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === account.id ? null : account.id);
                    }}
                    title="Expense Operations"
                    className="w-9 h-9 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/80 hover:bg-gray-100 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {activeMenuId === account.id && (
                    <div className="absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                      {/* Add Expense Option */}
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(account.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                      >
                        <Plus className="w-4 h-4 text-blue-600" />
                        <span>Add Expense Entry</span>
                      </button>

                      {/* Generate Statement Option */}
                      <button
                        type="button"
                        onClick={() => handleOpenStatement(account.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer text-left"
                      >
                        <Printer className="w-4 h-4 text-indigo-600" />
                        <span>Generate Statement (PDF)</span>
                      </button>

                      {/* View All History Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryTarget(account.id);
                          setActiveMenuId(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer text-left"
                      >
                        <ExternalLink className="w-4 h-4 text-gray-500" />
                        <span>View All Vouchers ({stats.expenseCount})</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Nested Table: Recent Expenses */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-zinc-300">
                    <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Recent Expense Vouchers</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {stats.expenseCount > 4 && (
                      <button
                        type="button"
                        onClick={() => setHistoryTarget(account.id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                      >
                        View all ({stats.expenseCount})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenAddModal(account.id)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/30">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200/80 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 bg-gray-100/70 dark:bg-zinc-800/60">
                        <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                        <th className="py-2.5 px-2.5 text-left font-semibold">Ref #</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Category / Details</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Amount (Rs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                      {recentEntries.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 px-3 text-center text-xs text-gray-400 dark:text-zinc-500 italic">
                            No expenses recorded yet
                          </td>
                        </tr>
                      ) : (
                        recentEntries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-medium text-gray-800 dark:text-zinc-200 text-xs">
                              <div>{entry.date}</div>
                              {entry.paidTo && (
                                <div className="text-[11px] text-gray-500 dark:text-zinc-400 font-sans truncate max-w-[120px]">
                                  {entry.paidTo}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2.5 font-mono text-gray-600 dark:text-zinc-400 text-xs font-semibold">
                              {entry.voucherNumber || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-left">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 mb-0.5">
                                {entry.category}
                              </span>
                              {entry.description && (
                                <div className="text-[11px] text-gray-600 dark:text-zinc-400 truncate max-w-[190px]">
                                  {entry.description}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 dark:text-zinc-100 text-xs">
                              Rs.{Math.round(entry.amount).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================================
          ADD / EDIT EXPENSE MODAL
      ========================================================================= */}
      {(isAddModalOpen || editingEntry) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    {editingEntry ? 'Edit Expense Entry' : 'Add New Expense Entry'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Record operational tolls, permits, taxes, and yard overheads
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingEntry(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Account / Vehicle Selection */}
              <div>
                <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                  Assign to Vehicle or General Account *
                </label>
                <div className="relative">
                  <select
                    value={formVehicleNumber}
                    onChange={(e) => setFormVehicleNumber(e.target.value)}
                    required
                    className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                  >
                    <option value="GENERAL">Office & General Fleet Overheads (No Vehicle)</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.registrationNumber}>
                        Vehicle: {v.registrationNumber}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* 2-Column: Date & Voucher Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Expense Date *
                  </label>
                  <CustomDatePicker
                    value={formDate}
                    onChange={(val) => setFormDate(val)}
                    placeholder="DD-MM-YYYY"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Voucher / Ref Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VCH-5021"
                    value={formVoucherNumber}
                    onChange={(e) => setFormVoucherNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* Expense Category with Option to Add Custom */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200">
                    Expense Category *
                  </label>
                  {!isAddingNewCategory ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewCategory(true);
                        setNewCategoryInput('');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Category</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCategory(false)}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {!isAddingNewCategory ? (
                  <div className="relative">
                    <select
                      value={formCategory}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsAddingNewCategory(true);
                          setNewCategoryInput('');
                        } else {
                          setFormCategory(e.target.value);
                        }
                      }}
                      className="w-full appearance-none px-3.5 py-2.5 pr-10 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                    >
                      {categoriesList.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__add_new__">+ Add New Expense Category...</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter new expense category name..."
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNewCategory();
                        }
                      }}
                      autoFocus
                      className="flex-1 px-3.5 py-2 rounded-xl border border-blue-400 dark:border-blue-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                    <button
                      type="button"
                      onClick={handleSaveNewCategory}
                      disabled={!newCategoryInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      Save Category
                    </button>
                  </div>
                )}
              </div>

              {/* 2-Column: Payment Mode & Paid To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Payment Mode
                  </label>
                  <div className="relative">
                    <select
                      value={formPaymentMode}
                      onChange={(e) => setFormPaymentMode(e.target.value as ExpenseEntry['paymentMode'])}
                      className="w-full appearance-none px-3.5 py-2.5 pr-8 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
                    >
                      {PAYMENT_MODES.map((pm) => (
                        <option key={pm} value={pm}>{pm}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    Paid To / Vendor / Recipient
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. NHAI Toll Plaza / ICICI Lombard"
                    value={formPaidTo}
                    onChange={(e) => setFormPaidTo(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* Description / Remarks */}
              <div>
                <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                  Remarks / Description (Manual Entry)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Toll recharge via FASTag wallet, 4 toll plazas crossed on Salem-Chennai route"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm font-medium focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              {/* Total Amount (Rs) */}
              <div>
                <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                  Total Amount (Rs) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 font-mono text-sm font-black focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingEntry(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW ALL EXPENSES HISTORY MODAL
      ========================================================================= */}
      {historyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full shadow-2xl p-6 relative my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    Expense History - {historyTarget}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    All recorded operational vouchers and overheads
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenStatement(historyTarget);
                    setHistoryTarget(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Statement PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryTarget(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Table of all entries for this vehicle / target */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100/80 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5">Date</th>
                    <th className="py-3 px-3.5">Ref #</th>
                    <th className="py-3 px-3.5">Category</th>
                    <th className="py-3 px-3.5">Description</th>
                    <th className="py-3 px-3.5">Paid To</th>
                    <th className="py-3 px-3.5">Mode</th>
                    <th className="py-3 px-3.5 text-right">Amount (Rs)</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80">
                  {expenses
                    .filter((e) => e.vehicleNumber === historyTarget)
                    .map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                        <td className="py-3 px-3.5 font-mono font-medium text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          {entry.date}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-gray-700 dark:text-zinc-300 font-semibold whitespace-nowrap">
                          {entry.voucherNumber || '-'}
                        </td>
                        <td className="py-3 px-3.5 font-semibold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                          {entry.category}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 dark:text-zinc-300 max-w-[200px]">
                          {entry.description || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 dark:text-zinc-300 whitespace-nowrap">
                          {entry.paidTo || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 dark:text-zinc-300 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 dark:bg-zinc-800">
                            {entry.paymentMode}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-black text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          Rs.{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenEditModal(entry);
                                setHistoryTarget(null);
                              }}
                              className="p-1.5 rounded text-gray-500 hover:text-blue-600 cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingEntry(entry);
                                setHistoryTarget(null);
                              }}
                              className="p-1.5 rounded text-gray-500 hover:text-red-600 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATEMENT (PDF) GENERATOR MODAL
      ========================================================================= */}
      {statementTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                    Generate Expense Statement
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Export printable PDF expense report for {statementTarget}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatementTarget(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Quick Date Presets */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Preset:</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatementFromDate('');
                    setStatementToDate('');
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  All Dates
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const firstDay = `01-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                    setStatementFromDate(firstDay);
                    setStatementToDate(getTodayDDMMYYYY());
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const lastMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                    const lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
                    const fromStr = `01-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-${lastMonthDate.getFullYear()}`;
                    const toStr = `${String(lastMonthEnd.getDate()).padStart(2, '0')}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${lastMonthEnd.getFullYear()}`;
                    setStatementFromDate(fromStr);
                    setStatementToDate(toStr);
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 cursor-pointer"
                >
                  Last Month
                </button>
              </div>

              {/* Custom Date Range Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    From Date
                  </label>
                  <CustomDatePicker
                    value={statementFromDate}
                    onChange={(val) => setStatementFromDate(val)}
                    placeholder="All dates"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-800 dark:text-zinc-200 mb-1.5 block">
                    To Date
                  </label>
                  <CustomDatePicker
                    value={statementToDate}
                    onChange={(val) => setStatementToDate(val)}
                    placeholder="Today"
                  />
                </div>
              </div>

              {/* Summary of Matching Entries */}
              <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Total Vouchers:</span>
                  <span className="font-bold text-gray-900 dark:text-zinc-100">{statementStats.expenseCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-zinc-400">Total Expenditure:</span>
                  <span className="font-mono font-black text-indigo-700 dark:text-indigo-400 text-sm">
                    Rs.{statementStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setStatementTarget(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  disabled={statementStats.expenseCount === 0 || isPrinting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'Preparing PDF...' : 'Print / Save Statement (PDF)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION MODAL
      ========================================================================= */}
      {deletingEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-center justify-center text-red-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  Delete Expense Entry?
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 text-xs space-y-1">
              <div><strong className="text-gray-700 dark:text-zinc-300">Account / Vehicle:</strong> {deletingEntry.vehicleNumber}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Date:</strong> {deletingEntry.date}</div>
              <div><strong className="text-gray-700 dark:text-zinc-300">Category:</strong> {deletingEntry.category}</div>
              {deletingEntry.description && <div><strong className="text-gray-700 dark:text-zinc-300">Details:</strong> {deletingEntry.description}</div>}
              <div><strong className="text-gray-700 dark:text-zinc-300">Total:</strong> Rs.{deletingEntry.amount.toLocaleString('en-IN')}</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          HIDDEN PRINT CONTAINER FOR CRISP A4 PDF GENERATION
      ========================================================================= */}
      <div style={{ display: 'none' }}>
        <div id="aus_expense_statement_print_root" className="statement-container">
          <div className="header-title">
            <div className="company-name">AUS TRANSPORT</div>
            <div className="report-title">FLEET & BUSINESS EXPENSE STATEMENT</div>
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Assigned Account / Vehicle</span>
              <span className="meta-value">{statementTarget}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Report Period</span>
              <span className="meta-value">
                {statementFromDate || 'Start'} to {statementToDate || 'Current'}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Generated On</span>
              <span className="meta-value">{new Date().toLocaleString('en-IN')}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th className="text-center" style={{ width: '5%' }}>S.No</th>
                <th className="text-center" style={{ width: '13%' }}>Date</th>
                <th style={{ width: '13%' }}>Ref #</th>
                <th style={{ width: '20%' }}>Category</th>
                <th style={{ width: '17%' }}>Description</th>
                <th style={{ width: '14%' }}>Paid To</th>
                <th className="text-center" style={{ width: '8%' }}>Mode</th>
                <th className="text-right" style={{ width: '10%' }}>Amount (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {statementFilteredEntries.map((entry, idx) => (
                <tr key={entry.id}>
                  <td className="text-center font-mono">{idx + 1}</td>
                  <td className="text-center font-mono font-bold">{entry.date}</td>
                  <td className="font-mono">{entry.voucherNumber || '-'}</td>
                  <td className="font-bold">{entry.category}</td>
                  <td>{entry.description || '-'}</td>
                  <td>{entry.paidTo || '-'}</td>
                  <td className="text-center">{entry.paymentMode}</td>
                  <td className="text-right font-mono font-bold">
                    {entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td colSpan={7} className="font-bold text-right" style={{ textTransform: 'uppercase' }}>
                  Grand Total
                </td>
                <td className="text-right font-mono font-bold">
                  Rs.{statementStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="summary-box">
            <span><strong>Amount in Words: </strong></span>
            <span className="words-text">{numberToWords(statementStats.totalAmount)}</span>
          </div>

          <div className="signature-row">
            <div className="signature-line">Prepared / Verified By</div>
            <div className="signature-line">Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

