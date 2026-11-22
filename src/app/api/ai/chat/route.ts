import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  callGemini,
  AUS_ASSISTANT_SYSTEM_PROMPT,
  extractBillUpdateAction,
} from '@/lib/geminiAssistant';
import {
  verifyAdminPassword,
  grantEditSession,
  isEditSessionValid,
  getSessionRemainingSeconds,
} from '@/lib/aiAuth';

/**
 * Formats a single bill with deep operational details and summary blockquote
 */
function formatSingleBillResponse(b: any) {
  const trips = b.trips || [];
  const firstTrip = trips[0] || {};
  const raw = b.raw_data || {};
  const distance =
    firstTrip.closingKm && firstTrip.startingKm
      ? Math.max(0, Number(firstTrip.closingKm) - Number(firstTrip.startingKm))
      : 0;

  const statusUpper = (b.payment_status || 'unpaid').toUpperCase();
  const isPaid = statusUpper === 'PAID';

  let text = `### Bill #${b.bill_number} Overview\n\n`;
  text += `> Comprehensive billing details for vehicle **${b.vehicle_number || 'N/A'}**.\n\n`;
  text += `| Detail | Value |\n`;
  text += `| :--- | :--- |\n`;
  text += `| **Bill Number** | #${b.bill_number} |\n`;
  text += `| **Vehicle** | ${b.vehicle_number || 'N/A'} |\n`;
  text += `| **Final Net Amount** | ₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')} |\n`;
  text += `| **Payment Status** | ${isPaid ? '`PAID`' : '`PENDING`'} |\n`;
  text += `| **Assigned Driver** | ${firstTrip.driver || raw.driverName || 'Not Assigned'} |\n`;
  text += `| **Branch / Place** | ${raw.place || 'Not Assigned'} |\n`;
  text += `| **Trip Distance** | ${distance > 0 ? `${distance.toLocaleString('en-IN')} KM (${firstTrip.startingKm} → ${firstTrip.closingKm})` : '0 KM'} |\n`;
  if (firstTrip.freightRate) text += `| **Freight Total** | ₹ ${Number(firstTrip.freightRate).toLocaleString('en-IN')} |\n`;
  if (firstTrip.advanceAmount) text += `| **Advance Paid** | ₹ ${Number(firstTrip.advanceAmount).toLocaleString('en-IN')} |\n`;
  if (firstTrip.diesel) text += `| **Diesel Deduction** | ₹ ${Number(firstTrip.diesel).toLocaleString('en-IN')} |\n`;
  text += `| **Bill Date** | ${b.bill_date || 'N/A'} |\n\n`;
  text += `*Note: Read-Only mode is active. To modify this bill, unlock edit mode with your Supabase login password.*`;
  return text;
}

/**
 * Formats bills in a clean structured Markdown table
 */
function formatBillsTable(bills: any[]) {
  if (!bills || bills.length === 0) {
    return 'No bills were found in the database.';
  }

  let text = '### Invoices & Billing Overview\n\n';
  text += '> Showing latest invoices recorded in the system. Read-only mode active.\n\n';
  text += '| Bill # | Vehicle | Final Net | Status | Branch | Distance | Date |\n';
  text += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

  bills.slice(0, 8).forEach((b: any) => {
    const trips = b.trips || [];
    const firstTrip = trips[0] || {};
    const raw = b.raw_data || {};
    const distance =
      firstTrip.closingKm && firstTrip.startingKm
        ? Math.max(0, Number(firstTrip.closingKm) - Number(firstTrip.startingKm))
        : 0;
    const isPaid = (b.payment_status || 'unpaid').toUpperCase() === 'PAID';

    text += `| **#${b.bill_number}** | ${b.vehicle_number || '-'} | **₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}** | ${isPaid ? '`PAID`' : '`PENDING`'} | ${raw.place || '-'} | ${distance > 0 ? `${distance.toLocaleString('en-IN')} KM` : '-'} | ${b.bill_date || '-'} |\n`;
  });

  text += '\n*To edit any invoice, unlock edit mode with your Supabase login password.*';
  return text;
}

/**
 * Formats pending unpaid bills in a Markdown table
 */
function formatPendingBillsTable(bills: any[]) {
  const pending = (bills || []).filter((b: any) => (b.payment_status || 'unpaid').toLowerCase() !== 'paid');
  if (pending.length === 0) {
    return '### Pending Bills Awaiting Payment\n\n> All bills in your database are currently marked as `PAID`. Outstanding receivable balance is ₹ 0.';
  }

  let totalOutstanding = 0;
  let text = `### Pending Bills Awaiting Payment (${pending.length})\n\n`;
  text += '> These invoices are currently unpaid and awaiting customer clearance.\n\n';
  text += '| Bill # | Vehicle | Outstanding Amount | Branch | Bill Date | Status |\n';
  text += '| :--- | :--- | :--- | :--- | :--- | :--- |\n';

  pending.slice(0, 10).forEach((b: any) => {
    const raw = b.raw_data || {};
    const amt = Math.round(Number(b.net_amount) || 0);
    totalOutstanding += amt;
    text += `| **#${b.bill_number}** | ${b.vehicle_number || '-'} | **₹ ${amt.toLocaleString('en-IN')}** | ${raw.place || '-'} | ${b.bill_date || '-'} | \`PENDING\` |\n`;
  });

  text += `\n> **Total Outstanding Receivables:** ₹ ${totalOutstanding.toLocaleString('en-IN')}`;
  return text;
}

/**
 * Formats fleet vehicles in a Markdown table
 */
function formatFleetTable(vehicles: any[]) {
  if (!vehicles || vehicles.length === 0) {
    return 'No vehicles found in the fleet database.';
  }

  let text = `### Active Fleet Vehicles (${vehicles.length})\n\n`;
  text += '> Live odometer tracking and active truck status.\n\n';
  text += '| Registration Number | Current Odometer KM | Status |\n';
  text += '| :--- | :--- | :--- |\n';

  vehicles.slice(0, 12).forEach((v: any) => {
    text += `| **${v.registration_number}** | ${Number(v.current_km || 0).toLocaleString('en-IN')} KM | \`ACTIVE\` |\n`;
  });

  return text;
}

/**
 * Formats fuel records in a Markdown table
 */
function formatFuelTable(fuelEntries: any[]) {
  if (!fuelEntries || fuelEntries.length === 0) {
    return '### Fuel Management Log\n\n> No fuel records have been logged yet.';
  }

  let totalCost = 0;
  let totalLiters = 0;
  let text = `### Fuel Management & Bunk Logs\n\n`;
  text += '> Diesel & fuel refills recorded across partner and regional bunks.\n\n';
  text += '| Vehicle | Bunk / Station | Type | Liters | Rate/L | Total Cost | Date |\n';
  text += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

  fuelEntries.slice(0, 10).forEach((f: any) => {
    const cost = Number(f.total_amount) || 0;
    const ltr = Number(f.liters) || 0;
    totalCost += cost;
    totalLiters += ltr;
    text += `| **${f.vehicle_number}** | ${f.bunk_name || 'Bunk'} | ${f.fuel_type || 'Diesel'} | ${ltr.toFixed(1)} L | ₹ ${Number(f.rate_per_liter || 0).toFixed(2)} | **₹ ${Math.round(cost).toLocaleString('en-IN')}** | ${f.entry_date || '-'} |\n`;
  });

  text += `\n> **Recent Summary:** ${totalLiters.toFixed(1)} Liters filled totaling **₹ ${Math.round(totalCost).toLocaleString('en-IN')}**`;
  return text;
}

/**
 * Formats maintenance records in a Markdown table
 */
function formatMaintenanceTable(maintEntries: any[]) {
  if (!maintEntries || maintEntries.length === 0) {
    return '### Repairs & Maintenance Log\n\n> No maintenance entries recorded yet.';
  }

  let totalMaintCost = 0;
  let text = `### Vehicle Repairs & Maintenance Log\n\n`;
  text += '> Workshop services, component replacements, and routine overhauls.\n\n';
  text += '| Vehicle | Service Category | Workshop | Cost | Odometer | Date | Description |\n';
  text += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

  maintEntries.slice(0, 10).forEach((m: any) => {
    const cost = Number(m.amount) || 0;
    totalMaintCost += cost;
    text += `| **${m.vehicle_number}** | ${m.category || 'General'} | ${m.workshop_name || '-'} | **₹ ${Math.round(cost).toLocaleString('en-IN')}** | ${m.odometer_km ? `${Number(m.odometer_km).toLocaleString('en-IN')} KM` : '-'} | ${m.entry_date || '-'} | ${m.description || '-'} |\n`;
  });

  text += `\n> **Total Maintenance Spend (Recent):** ₹ ${Math.round(totalMaintCost).toLocaleString('en-IN')}`;
  return text;
}

/**
 * Formats fleet expenses in a Markdown table
 */
function formatExpensesTable(expEntries: any[]) {
  if (!expEntries || expEntries.length === 0) {
    return '### Fleet & Business Expenses\n\n> No expenses have been recorded yet.';
  }

  let totalExp = 0;
  let text = `### Fleet & Business Expenses\n\n`;
  text += '> Categorized operational expenditure including FASTag, highway tolls, and allowances.\n\n';
  text += '| Category | Vehicle | Amount | Payment Mode | Paid To | Date | Description |\n';
  text += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

  expEntries.slice(0, 10).forEach((e: any) => {
    const amt = Number(e.amount) || 0;
    totalExp += amt;
    text += `| **${e.category}** | ${e.vehicle_number || 'General'} | **₹ ${Math.round(amt).toLocaleString('en-IN')}** | ${e.payment_mode || 'Cash'} | ${e.paid_to || '-'} | ${e.entry_date || '-'} | ${e.description || '-'} |\n`;
  });

  text += `\n> **Total Recent Expenses:** ₹ ${Math.round(totalExp).toLocaleString('en-IN')}`;
  return text;
}

/**
 * Formats drivers directory in a Markdown table
 */
function formatDriversTable(drivers: any[]) {
  if (!drivers || drivers.length === 0) {
    return '### Drivers Directory\n\n> No drivers recorded in system.';
  }

  let text = `### Registered Drivers Directory (${drivers.length})\n\n`;
  text += '> Active fleet drivers, mobile contact, and compensation rates.\n\n';
  text += '| Driver Name | Mobile Number | Rate / KM | Status | License |\n';
  text += '| :--- | :--- | :--- | :--- | :--- |\n';

  drivers.slice(0, 12).forEach((d: any) => {
    text += `| **${d.name}** | ${d.phone || '-'} | ₹ ${Number(d.rate_per_km || 2.5).toFixed(2)}/km | \`${(d.status || 'active').toUpperCase()}\` | ${d.license_number || '-'} |\n`;
  });

  return text;
}

/**
 * Formats profit & loss overview in a Markdown table
 */
function formatPnlTable(pnlRows: any[]) {
  if (!pnlRows || pnlRows.length === 0) {
    return '### Profit & Loss Fleet Summary\n\n> Profit and loss calculations will be available as freight revenue and expenses are logged.';
  }

  let netTotalProfit = 0;
  let text = `### Fleet Profit & Loss Overview\n\n`;
  text += '> Net operating profitability per vehicle (Revenue minus Fuel, Maintenance, and Expenses).\n\n';
  text += '| Vehicle | Freight Revenue | Fuel Cost | Maintenance | Expenses | Net Profit |\n';
  text += '| :--- | :--- | :--- | :--- | :--- | :--- |\n';

  pnlRows.slice(0, 10).forEach((p: any) => {
    const rev = Number(p.total_revenue) || 0;
    const fuel = Number(p.total_fuel) || 0;
    const maint = Number(p.total_maintenance) || 0;
    const exp = Number(p.total_expenses) || 0;
    const profit = Number(p.net_profit) || 0;
    netTotalProfit += profit;

    const profitColor = profit >= 0 ? `**₹ ${Math.round(profit).toLocaleString('en-IN')}**` : `*(₹ ${Math.abs(Math.round(profit)).toLocaleString('en-IN')})*`;
    text += `| **${p.registration_number}** | ₹ ${Math.round(rev).toLocaleString('en-IN')} | ₹ ${Math.round(fuel).toLocaleString('en-IN')} | ₹ ${Math.round(maint).toLocaleString('en-IN')} | ₹ ${Math.round(exp).toLocaleString('en-IN')} | ${profitColor} |\n`;
  });

  text += `\n> **Combined Fleet Operating Profit:** ₹ ${Math.round(netTotalProfit).toLocaleString('en-IN')}`;
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId = 'web_default', passwordAttempt } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const trimmedMsg = message.trim();
    const isCurrentlyAuthorized = isEditSessionValid(sessionId);
    let remainingSeconds = getSessionRemainingSeconds(sessionId);

    // 1. Password Verification Attempt
    if (passwordAttempt || trimmedMsg.startsWith('/unlock ') || trimmedMsg.startsWith('/password ')) {
      const pwd = passwordAttempt || trimmedMsg.replace(/^\/(?:unlock|password)\s+/, '');
      const isValid = await verifyAdminPassword(pwd);

      if (isValid) {
        grantEditSession(sessionId);
        return NextResponse.json({
          text: '### Edit Mode Unlocked Successfully\n\n> You have been granted a strict **5-minute session** to update records across all categories.\n\nAfter 5 minutes, it will automatically return to Read-Only mode.\n\n*What would you like to update?*',
          isEditAuthorized: true,
          remainingSeconds: 300,
        });
      } else {
        return NextResponse.json({
          text: '### Incorrect Password\n\n> Please enter the exact password you use to log in to the Supabase admin dashboard (`austransportpm@gmail.com`).',
          isEditAuthorized: false,
          remainingSeconds: 0,
        });
      }
    }

    // 2. Fetch live database records across ALL 7 categories safely
    let recentInvoices: any[] = [];
    let vehicles: any[] = [];
    let drivers: any[] = [];
    let fuelEntries: any[] = [];
    let maintenanceEntries: any[] = [];
    let expenseEntries: any[] = [];
    let pnlSummary: any[] = [];

    const supabase = createClient();
    try {
      const results = await Promise.allSettled([
        supabase
          .from('invoices')
          .select('id, bill_number, bill_date, vehicle_number, net_amount, payment_status, raw_data, trips')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('vehicles')
          .select('registration_number, current_km')
          .order('current_km', { ascending: false })
          .limit(30),
        supabase
          .from('drivers')
          .select('name, phone, rate_per_km, status, license_number')
          .order('name', { ascending: true })
          .limit(30),
        supabase
          .from('fuel_entries')
          .select('vehicle_number, entry_date, bunk_name, fuel_type, liters, rate_per_liter, total_amount')
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('maintenance_entries')
          .select('vehicle_number, entry_date, category, description, amount, workshop_name, odometer_km')
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('expense_entries')
          .select('vehicle_number, entry_date, category, description, amount, payment_mode, paid_to')
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('vehicle_profit_and_loss_summary')
          .select('*')
          .limit(30),
      ]);

      if (results[0].status === 'fulfilled') recentInvoices = results[0].value?.data || [];
      if (results[1].status === 'fulfilled') vehicles = results[1].value?.data || [];
      if (results[2].status === 'fulfilled') drivers = results[2].value?.data || [];
      if (results[3].status === 'fulfilled') fuelEntries = results[3].value?.data || [];
      if (results[4].status === 'fulfilled') maintenanceEntries = results[4].value?.data || [];
      if (results[5].status === 'fulfilled') expenseEntries = results[5].value?.data || [];
      if (results[6].status === 'fulfilled') pnlSummary = results[6].value?.data || [];
    } catch (dbErr) {
      console.warn('Database query error in AI chat:', dbErr);
    }

    // Check if message is an edit/write attempt
    const lower = trimmedMsg.toLowerCase();
    const isEditIntent =
      lower.includes('update') ||
      lower.includes('edit') ||
      lower.includes('change') ||
      lower.includes('modify') ||
      lower.includes('fill') ||
      lower.includes('assign') ||
      lower.includes('set branch') ||
      lower.includes('mark paid') ||
      lower.includes('add fuel') ||
      lower.includes('add expense') ||
      lower.includes('delete');

    // 3. Strict Security Check: Block edits if not authorized with 5-minute session
    if (isEditIntent && !isCurrentlyAuthorized) {
      return NextResponse.json({
        text: '### Edit Mode Locked (Read-Only Mode Active)\n\n> The AI Assistant has full read access across all categories by default to keep company records safe.\n\nTo make edits or update bills, you must enter your Supabase login password. Once verified, you will have a strict **5-minute timer** to make your changes.\n\n*Please click "Unlock Edit Mode" or reply with `/unlock <password>`.*',
        requiresAuth: true,
        isEditAuthorized: false,
        remainingSeconds: 0,
      });
    }

    // 4. Handle Read-Only Inquiries across ALL Categories
    if (!isEditIntent) {
      // Specific bill lookup: e.g. "bill 437", "437", "check bill 438"
      const specificBillMatch =
        trimmedMsg.match(/(?:bill|invoice)\s*#?\s*(\d+)/i) ||
        (trimmedMsg.length <= 6 && trimmedMsg.match(/^#?(\d{1,6})$/));

      if (specificBillMatch) {
        const targetNum = specificBillMatch[1];
        const matchingBill = (recentInvoices || []).find(
          (b: any) => String(b.bill_number) === targetNum
        );
        if (matchingBill) {
          return NextResponse.json({
            text: formatSingleBillResponse(matchingBill),
            isEditAuthorized: isCurrentlyAuthorized,
            remainingSeconds,
          });
        }

        const { data: directBills } = await supabase
          .from('invoices')
          .select('id, bill_number, bill_date, vehicle_number, net_amount, payment_status, raw_data, trips')
          .eq('bill_number', targetNum)
          .limit(1);

        if (directBills && directBills.length > 0) {
          return NextResponse.json({
            text: formatSingleBillResponse(directBills[0]),
            isEditAuthorized: isCurrentlyAuthorized,
            remainingSeconds,
          });
        }
      }

      // Fuel queries
      if (lower.includes('fuel') || lower.includes('diesel') || lower.includes('bunk') || lower.includes('petrol')) {
        return NextResponse.json({
          text: formatFuelTable(fuelEntries || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Maintenance queries
      if (
        lower.includes('maintenance') ||
        lower.includes('service') ||
        lower.includes('repair') ||
        lower.includes('workshop') ||
        lower.includes('garage')
      ) {
        return NextResponse.json({
          text: formatMaintenanceTable(maintenanceEntries || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Expenses queries
      if (
        lower.includes('expense') ||
        lower.includes('fastag') ||
        lower.includes('toll') ||
        lower.includes('expenditure') ||
        lower.includes('loading') ||
        lower.includes('unloading')
      ) {
        return NextResponse.json({
          text: formatExpensesTable(expenseEntries || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Profit & Loss queries
      if (
        lower.includes('profit') ||
        lower.includes('pnl') ||
        lower.includes('revenue') ||
        lower.includes('margin') ||
        lower.includes('loss')
      ) {
        return NextResponse.json({
          text: formatPnlTable(pnlSummary || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Drivers queries
      if (lower.includes('driver') || lower.includes('salary') || lower.includes('salaries')) {
        return NextResponse.json({
          text: formatDriversTable(drivers || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Pending Bills queries
      if (lower.includes('pending') || lower.includes('unpaid')) {
        return NextResponse.json({
          text: formatPendingBillsTable(recentInvoices || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Fleet Vehicles queries
      if (lower.includes('fleet') || lower.includes('vehicle') || lower.includes('odometer') || lower.includes('truck')) {
        return NextResponse.json({
          text: formatFleetTable(vehicles || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      // Invoices / Bills queries
      if (
        lower.includes('recent') ||
        lower.includes('bill number') ||
        lower.includes('final price') ||
        lower.includes('status') ||
        lower.includes('bills') ||
        lower.includes('invoices')
      ) {
        return NextResponse.json({
          text: formatBillsTable(recentInvoices || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }
    }

    // 5. Authorized Edit Flow or General Intelligence using Gemini across ALL Categories
    const billsContextSummary = (recentInvoices || []).map((inv: any) => {
      const trips = inv.trips || [];
      const firstTrip = trips[0] || {};
      const raw = inv.raw_data || {};
      return {
        billNumber: inv.bill_number,
        date: inv.bill_date,
        vehicleNumber: inv.vehicle_number,
        netAmount: inv.net_amount,
        status: inv.payment_status,
        place: raw.place || '',
        tdsRate: raw.tdsRate ?? 1,
        driver: firstTrip.driver || raw.driverName || '',
        startingKm: firstTrip.startingKm || 0,
        closingKm: firstTrip.closingKm || 0,
        tripCount: trips.length,
      };
    });

    const contextPayload = `
COMPLETE DATABASE STATE ACROSS ALL CATEGORIES:

1. Invoices & Billing (Recent):
${JSON.stringify(billsContextSummary, null, 2)}

2. Active Fleet Vehicles:
${JSON.stringify(vehicles || [], null, 2)}

3. Registered Drivers:
${JSON.stringify(drivers || [], null, 2)}

4. Fuel Management Entries:
${JSON.stringify(fuelEntries || [], null, 2)}

5. Repairs & Maintenance Entries:
${JSON.stringify(maintenanceEntries || [], null, 2)}

6. Fleet & Business Expenses:
${JSON.stringify(expenseEntries || [], null, 2)}

7. Profit & Loss Summaries:
${JSON.stringify(pnlSummary || [], null, 2)}

USER INSTRUCTION (${isCurrentlyAuthorized ? 'EDIT AUTHORIZED' : 'READ-ONLY INQUIRY'}):
${message}
`;

    let aiText = '';
    let updateAction: any = null;

    try {
      aiText = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);
      updateAction = extractBillUpdateAction(aiText);
    } catch (geminiErr: any) {
      console.warn('Gemini API call timed out or failed, falling back to local database synthesizer:', geminiErr?.message);
      // Fallback regex matching for updates if model is unavailable
      const billMatch = message.match(/(?:bill|invoice)\s*#?\s*(\d+)/i);
      if (billMatch) {
        const billNum = billMatch[1];
        const kmCloseMatch = message.match(/closing\s*(?:km)?\s*[:=]?\s*(\d+)/i);
        const kmStartMatch = message.match(/starting\s*(?:km)?\s*[:=]?\s*(\d+)/i);
        const freightMatch = message.match(/freight\s*(?:rate|amount)?\s*[:=]?\s*(\d+)/i);
        const advanceMatch = message.match(/advance\s*[:=]?\s*(\d+)/i);
        const driverMatch = message.match(/driver\s*[:=]?\s*([a-zA-Z]+)/i);
        const branchMatch = message.match(/(?:branch|place)\s*[:=]?\s*([a-zA-Z\s]+)/i);

        updateAction = {
          action: 'update_bill',
          billNumber: billNum,
          closingKm: kmCloseMatch ? Number(kmCloseMatch[1]) : undefined,
          startingKm: kmStartMatch ? Number(kmStartMatch[1]) : undefined,
          freightRate: freightMatch ? Number(freightMatch[1]) : undefined,
          advanceAmount: advanceMatch ? Number(advanceMatch[1]) : undefined,
          driverName: driverMatch ? driverMatch[1].trim() : undefined,
          branchName: branchMatch ? branchMatch[1].trim() : undefined,
        };
      }

      if (!aiText && !updateAction) {
        if (lower.includes('pending') || lower.includes('unpaid')) {
          aiText = formatPendingBillsTable(recentInvoices || []);
        } else if (lower.includes('fuel') || lower.includes('diesel') || lower.includes('bunk')) {
          aiText = formatFuelTable(fuelEntries || []);
        } else if (lower.includes('maintenance') || lower.includes('service') || lower.includes('repair')) {
          aiText = formatMaintenanceTable(maintenanceEntries || []);
        } else if (lower.includes('expense') || lower.includes('toll') || lower.includes('fastag')) {
          aiText = formatExpensesTable(expenseEntries || []);
        } else if (lower.includes('driver')) {
          aiText = formatDriversTable(drivers || []);
        } else if (lower.includes('profit') || lower.includes('pnl') || lower.includes('margin') || lower.includes('loss')) {
          aiText = formatPnlTable(pnlSummary || []);
        } else if (lower.includes('fleet') || lower.includes('vehicle') || lower.includes('truck') || lower.includes('odometer')) {
          aiText = formatFleetTable(vehicles || []);
        } else {
          aiText = formatBillsTable(recentInvoices || []);
        }
      }
    }

    let updatedBillResult: any = null;

    if (isCurrentlyAuthorized && updateAction && updateAction.billNumber) {
      const targetBillNumber = String(updateAction.billNumber);
      const { data: existingRows } = await supabase
        .from('invoices')
        .select('*')
        .eq('bill_number', targetBillNumber)
        .limit(1);

      const existingInvoice = existingRows?.[0];

      if (existingInvoice) {
        const raw = existingInvoice.raw_data || {};
        const trips = Array.isArray(existingInvoice.trips) ? [...existingInvoice.trips] : [];
        const firstTrip = trips[0] || {};

        if (updateAction.startingKm !== undefined) firstTrip.startingKm = Number(updateAction.startingKm);
        if (updateAction.closingKm !== undefined) firstTrip.closingKm = Number(updateAction.closingKm);
        if (updateAction.freightRate !== undefined) firstTrip.freightRate = Number(updateAction.freightRate);
        if (updateAction.advanceAmount !== undefined) firstTrip.advanceAmount = Number(updateAction.advanceAmount);
        if (updateAction.dieselCut !== undefined) firstTrip.diesel = Number(updateAction.dieselCut);
        if (updateAction.driverName) firstTrip.driver = updateAction.driverName;
        trips[0] = firstTrip;

        const starting = Number(firstTrip.startingKm) || 0;
        const closing = Number(firstTrip.closingKm) || 0;
        const runningDistance = Math.max(0, closing - starting);
        const freight = Number(firstTrip.freightRate) || 0;
        const advance = Number(firstTrip.advanceAmount) || 0;
        const diesel = Number(firstTrip.diesel) || 0;
        const otherDeductions = Number(updateAction.otherDeductions) || 0;
        const netAmount = Math.max(0, freight - advance - diesel - otherDeductions);

        const newPlace = updateAction.branchName || raw.place || '';
        const newTdsRate = updateAction.tdsRate !== undefined ? Number(updateAction.tdsRate) : (raw.tdsRate ?? 1);
        const newStatus = updateAction.paymentStatus || existingInvoice.payment_status || 'unpaid';
        const newVehicle = updateAction.vehicleNumber || existingInvoice.vehicle_number;

        const updatedRaw = {
          ...raw,
          place: newPlace,
          tdsRate: newTdsRate,
          vehicleNumber: newVehicle,
          status: newStatus,
          trips,
          netAmount,
        };

        await supabase
          .from('invoices')
          .update({
            vehicle_number: newVehicle,
            trips,
            net_amount: netAmount,
            payment_status: newStatus,
            raw_data: updatedRaw,
            updated_at: new Date().toISOString(),
          })
          .eq('bill_number', targetBillNumber);

        updatedBillResult = {
          billNumber: targetBillNumber,
          vehicleNumber: newVehicle,
          place: newPlace,
          tdsRate: newTdsRate,
          netAmount,
          status: newStatus,
          trips,
          runningDistance,
        };

        aiText = `### Bill #${targetBillNumber} Updated Successfully\n\n> Changes have been saved to Supabase and are live on the dashboard.\n\n| Field | Value |\n| :--- | :--- |\n| **Vehicle** | ${newVehicle} |\n| **Driver** | ${firstTrip.driver || 'None'} |\n| **Trip Distance** | ${runningDistance.toLocaleString('en-IN')} KM |\n| **Final Net Amount** | ₹ ${Math.round(netAmount).toLocaleString('en-IN')} |\n| **Branch / Place** | ${newPlace || 'Not assigned'} |\n| **Payment Status** | \`${newStatus.toUpperCase()}\` |`;
      } else {
        aiText = `### Bill Not Found\n\n> Could not find **Bill #${targetBillNumber}** in the database. Please verify the bill number.`;
      }
    }

    const cleanDisplayResponse = (aiText || '').replace(/```json[\s\S]*?```/g, '').trim();

    return NextResponse.json({
      text: cleanDisplayResponse || aiText || formatBillsTable(recentInvoices || []),
      action: updateAction,
      updatedBill: updatedBillResult,
      isEditAuthorized: isCurrentlyAuthorized,
      remainingSeconds,
    });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    const msg = err?.message || 'The AI service is temporarily busy.';
    let guidance = `> ${msg}\n\nYou can query any category directly: **invoices**, **pending payments**, **fuel logs**, **maintenance**, **expenses**, **drivers**, or **profit & loss**.`;
    if (msg.includes('Permission denied') || msg.includes('service')) {
      guidance = `> Google Cloud reported: *Permission denied on the service.*\n\n**To resolve:** In Google Cloud Console or Google AI Studio (https://aistudio.google.com/app/apikey), ensure the **Generative Language API** is enabled for your key, or generate a free key from Google AI Studio and save it as \`GEMINI_API_KEY\` in your Vercel Environment Variables.\n\n*Direct database queries remain fully operational across all categories.*`;
    }
    return NextResponse.json({
      text: `### System Notice\n\n${guidance}`,
      isEditAuthorized: false,
      remainingSeconds: 0,
    });
  }
}
