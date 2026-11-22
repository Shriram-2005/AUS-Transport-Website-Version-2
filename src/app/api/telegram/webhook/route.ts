import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  callGemini,
  AUS_ASSISTANT_SYSTEM_PROMPT,
  extractBillUpdateAction,
  getTelegramToken,
} from '@/lib/geminiAssistant';
import {
  verifyAdminPassword,
  grantEditSession,
  isEditSessionValid,
  getSessionRemainingSeconds,
} from '@/lib/aiAuth';

const fullKeyboard = {
  keyboard: [
    [{ text: '[Invoices]' }, { text: '[Pending Bills]' }],
    [{ text: '[Fleet KMs]' }, { text: '[Fuel Records]' }],
    [{ text: '[Maintenance]' }, { text: '[Expenses]' }],
    [{ text: '[Drivers]' }, { text: '[Profit & Loss]' }],
    [{ text: '[Unlock Edit Mode]' }, { text: '[Help]' }],
  ],
  resize_keyboard: true,
};

async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any) {
  try {
    const token = getTelegramToken();
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Error sending Telegram message:', err);
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  try {
    const token = getTelegramToken();
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  } catch (err) {
    console.error('Error answering callback query:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // 1. Handle Inline Button Callbacks
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = String(cb.message?.chat?.id);
      const data = cb.data || '';

      await answerCallbackQuery(cb.id, 'Data retrieved');

      if (data.startsWith('bill_')) {
        const billNumber = data.replace('bill_', '');
        const supabase = createClient();
        const { data: rows } = await supabase
          .from('invoices')
          .select('*')
          .eq('bill_number', billNumber)
          .limit(1);

        const inv = rows?.[0];
        if (inv) {
          const raw = inv.raw_data || {};
          const trips = inv.trips || [];
          const trip = trips[0] || {};
          const isAuthed = isEditSessionValid(chatId);
          const remaining = getSessionRemainingSeconds(chatId);
          const distance =
            trip.closingKm && trip.startingKm
              ? Math.max(0, Number(trip.closingKm) - Number(trip.startingKm))
              : 0;

          const msg = `
<b>Bill Details #${inv.bill_number}</b>
<blockquote>Vehicle: ${inv.vehicle_number || 'N/A'} • Status: ${(inv.payment_status || 'unpaid').toUpperCase()}</blockquote>

<pre>
METRIC          VALUE
---------------------------------------
Bill Number     #${inv.bill_number}
Vehicle Plate   ${inv.vehicle_number || 'N/A'}
Final Net       Rs. ${Math.round(Number(inv.net_amount) || 0).toLocaleString('en-IN')}
Payment Status  ${(inv.payment_status || 'unpaid').toUpperCase()}
Branch / Place  ${raw.place || 'Not Assigned'}
Bill Date       ${inv.bill_date || 'N/A'}
Trip Distance   ${distance > 0 ? `${distance.toLocaleString('en-IN')} KM` : '0 KM'}
Driver Name     ${trip.driver || raw.driverName || 'None'}
Freight Total   Rs. ${Number(trip.freightRate || 0).toLocaleString('en-IN')}
Advance Paid    Rs. ${Number(trip.advanceAmount || 0).toLocaleString('en-IN')}
Diesel Cut      Rs. ${Number(trip.diesel || 0).toLocaleString('en-IN')}
</pre>

${
  isAuthed
    ? `<i>Edit Mode Active (${Math.floor(remaining / 60)}m ${remaining % 60}s remaining). Reply with changes to update.</i>`
    : `<i>Read-Only Mode. To make changes to this bill, send <code>/unlock YOUR_PASSWORD</code>.</i>`
}
`;
          await sendTelegramMessage(chatId, msg, fullKeyboard);
          return NextResponse.json({ ok: true });
        }
      }
    }

    // 2. Handle Text Messages
    const message = update.message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const lower = text.toLowerCase();
    const supabase = createClient();

    // Check Password Unlock Attempt: /unlock <password> or button
    if (text === '[Unlock Edit Mode]' || text === 'Unlock Edit Mode' || text === '/unlock') {
      const isAuthed = isEditSessionValid(chatId);
      const remaining = getSessionRemainingSeconds(chatId);
      if (isAuthed) {
        await sendTelegramMessage(
          chatId,
          `<b>Edit Mode is Already Active</b>\n\nYou have <b>${Math.floor(remaining / 60)}m ${remaining % 60}s</b> remaining.\n\nReply with your changes to update records.`,
          fullKeyboard
        );
        return NextResponse.json({ ok: true });
      }
      const askPwd = `
<b>Authentication Required for Edits</b>
<blockquote>All categories are read-only by default to prevent accidental data changes.</blockquote>

To unlock edit privileges for <b>5 minutes</b>, reply with:
<code>/unlock YOUR_SUPABASE_PASSWORD</code>

<i>Use the same password you use to log in to the Supabase admin dashboard.</i>
`;
      await sendTelegramMessage(chatId, askPwd, fullKeyboard);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/unlock ') || text.startsWith('/password ')) {
      const pwd = text.replace(/^\/(?:unlock|password)\s+/, '').trim();
      const isValid = await verifyAdminPassword(pwd);

      if (isValid) {
        grantEditSession(chatId);
        const unlockMsg = `
<b>Edit Mode Unlocked</b>
<blockquote>Strict 5-minute window active. You can now modify bills, trips, drivers, and branches.</blockquote>

After 5 minutes, it will automatically return to Read-Only mode.

<b>Example Update Command:</b>
<code>Update bill 439: driver Murugan, closing km 45800, freight 16000, branch Nilakottai</code>
`;
        await sendTelegramMessage(chatId, unlockMsg, fullKeyboard);
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegramMessage(
          chatId,
          '<b>Incorrect Password.</b>\nPlease enter the same password you use to log in to the Supabase admin dashboard (`austransportpm@gmail.com`).',
          fullKeyboard
        );
        return NextResponse.json({ ok: true });
      }
    }

    // Command: /start or /help or button
    if (
      text === '/start' ||
      text === '/help' ||
      text === '[Help]' ||
      text === 'Help' ||
      text === 'Help & Commands'
    ) {
      const welcome = `
<b>AUS Transport Assistant</b>
<blockquote>Comprehensive fleet management and live database intelligence. Read-Only mode active.</blockquote>

<b>Available Categories (Tap buttons below or type commands):</b>
• <b>Invoices:</b> Recent bills, final prices and payment status
• <b>Pending Bills:</b> All unpaid receivables
• <b>Fleet KMs:</b> Active trucks and current odometer readings
• <b>Fuel Records:</b> Diesel logs, bunk receipts, and total spend
• <b>Maintenance:</b> Workshop repairs, service categories and costs
• <b>Expenses:</b> Tolls, FASTag, driver bata, loading charges
• <b>Drivers:</b> Driver directory, contact numbers and km rates
• <b>Profit & Loss:</b> Revenue vs. fuel and operating profit
• <b>Unlock Edit Mode:</b> Enter password for 5-minute editing

<i>You can also ask naturally in English, e.g. "What is the price of bill 437?" or "How much diesel did we fill this week?"</i>
`;
      await sendTelegramMessage(chatId, welcome, fullKeyboard);
      return NextResponse.json({ ok: true });
    }

    // Friendly Greetings
    const isGreeting =
      lower === 'hello' ||
      lower === 'hi' ||
      lower === 'hey' ||
      lower === 'vanakkam' ||
      lower === 'namaste' ||
      lower === 'test';

    if (isGreeting) {
      const greetingMsg = `
<b>Hello! I am your AUS Transport Assistant.</b>
<blockquote>Connected live to all 7 categories of your freight database.</blockquote>

Choose an option from the menu below, or ask any question about bills, fuel, maintenance, or drivers.
`;
      await sendTelegramMessage(chatId, greetingMsg, fullKeyboard);
      return NextResponse.json({ ok: true });
    }

    // Fetch live records across all categories safely
    let recentInvoices: any[] = [];
    let vehicles: any[] = [];
    let drivers: any[] = [];
    let fuelEntries: any[] = [];
    let maintenanceEntries: any[] = [];
    let expenseEntries: any[] = [];
    let pnlSummary: any[] = [];

    try {
      const results = await Promise.allSettled([
        supabase
          .from('invoices')
          .select('bill_number, bill_date, vehicle_number, net_amount, payment_status, raw_data, trips')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('vehicles')
          .select('registration_number, current_km')
          .order('current_km', { ascending: false })
          .limit(20),
        supabase
          .from('drivers')
          .select('name, phone, rate_per_km, status, license_number')
          .order('name', { ascending: true })
          .limit(20),
        supabase
          .from('fuel_entries')
          .select('vehicle_number, entry_date, bunk_name, liters, rate_per_liter, total_amount')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('maintenance_entries')
          .select('vehicle_number, entry_date, category, description, amount, workshop_name')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('expense_entries')
          .select('vehicle_number, entry_date, category, description, amount, payment_mode')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('vehicle_profit_and_loss_summary')
          .select('*')
          .limit(15),
      ]);

      if (results[0].status === 'fulfilled') recentInvoices = results[0].value?.data || [];
      if (results[1].status === 'fulfilled') vehicles = results[1].value?.data || [];
      if (results[2].status === 'fulfilled') drivers = results[2].value?.data || [];
      if (results[3].status === 'fulfilled') fuelEntries = results[3].value?.data || [];
      if (results[4].status === 'fulfilled') maintenanceEntries = results[4].value?.data || [];
      if (results[5].status === 'fulfilled') expenseEntries = results[5].value?.data || [];
      if (results[6].status === 'fulfilled') pnlSummary = results[6].value?.data || [];
    } catch (dbErr) {
      console.warn('Database query error in Telegram webhook:', dbErr);
    }

    // Check if user intends to edit
    const isEditIntent =
      lower.includes('update') ||
      lower.includes('edit') ||
      lower.includes('change') ||
      lower.includes('modify') ||
      lower.includes('fill') ||
      lower.includes('assign') ||
      lower.includes('set branch') ||
      lower.includes('mark paid');

    const isAuthed = isEditSessionValid(chatId);

    // Block edit if not authorized
    if (isEditIntent && !isAuthed) {
      const lockMsg = `
<b>Edit Mode Locked (Read-Only Mode Active)</b>
<blockquote>All categories can only be viewed by default to protect company records.</blockquote>

To make updates, enter your Supabase login password:
<code>/unlock YOUR_PASSWORD</code>

<i>Once verified, you will have a strict 5-minute window to modify bills and records.</i>
`;
      await sendTelegramMessage(chatId, lockMsg, fullKeyboard);
      return NextResponse.json({ ok: true });
    }

    // READ OPERATIONS ACROSS ALL CATEGORIES
    if (!isEditIntent) {
      // 1. Single Bill Query
      const specificBillMatch =
        text.match(/(?:bill|invoice)\s*#?\s*(\d+)/i) ||
        (text.length <= 6 && text.match(/^#?(\d{1,6})$/));

      if (specificBillMatch) {
        const targetNum = specificBillMatch[1];
        const { data: rows } = await supabase
          .from('invoices')
          .select('*')
          .eq('bill_number', targetNum)
          .limit(1);

        const inv = rows?.[0];
        if (inv) {
          const raw = inv.raw_data || {};
          const trips = inv.trips || [];
          const trip = trips[0] || {};
          const remaining = getSessionRemainingSeconds(chatId);
          const distance =
            trip.closingKm && trip.startingKm
              ? Math.max(0, Number(trip.closingKm) - Number(trip.startingKm))
              : 0;

          const msg = `
<b>Bill Details #${inv.bill_number}</b>
<blockquote>Vehicle: ${inv.vehicle_number || 'N/A'} • Status: ${(inv.payment_status || 'unpaid').toUpperCase()}</blockquote>

<pre>
METRIC          VALUE
---------------------------------------
Bill Number     #${inv.bill_number}
Vehicle Plate   ${inv.vehicle_number || 'N/A'}
Final Net       Rs. ${Math.round(Number(inv.net_amount) || 0).toLocaleString('en-IN')}
Payment Status  ${(inv.payment_status || 'unpaid').toUpperCase()}
Branch / Place  ${raw.place || 'Not Assigned'}
Bill Date       ${inv.bill_date || 'N/A'}
Trip Distance   ${distance > 0 ? `${distance.toLocaleString('en-IN')} KM` : '0 KM'}
Driver Name     ${trip.driver || raw.driverName || 'None'}
</pre>

${
  isAuthed
    ? `<i>Edit Mode Active (${Math.floor(remaining / 60)}m ${remaining % 60}s remaining). Reply with changes to update.</i>`
    : `<i>Read-Only Mode. To edit this bill, send <code>/unlock YOUR_PASSWORD</code>.</i>`
}
`;
          await sendTelegramMessage(chatId, msg, fullKeyboard);
          return NextResponse.json({ ok: true });
        }
      }

      // 2. Invoices List: "[Invoices]", "Invoices", "/bills", "recent bills", "final price"
      if (
        text === '[Invoices]' ||
        text === 'Invoices' ||
        text === '/bills' ||
        lower.includes('recent') ||
        lower.includes('final price') ||
        lower.includes('status') ||
        (lower.includes('bill') && !lower.includes('pending'))
      ) {
        let reply = `<b>Invoices & Billing Overview</b>\n<blockquote>Showing latest bills. Tap any button below to view full trip details.</blockquote>\n\n`;
        reply += `<pre>\nBILL   VEHICLE       NET (Rs)  STATUS\n---------------------------------------\n`;
        (recentInvoices || []).slice(0, 6).forEach((b: any) => {
          const billStr = `#${b.bill_number}`.padEnd(6);
          const vehStr = (b.vehicle_number || 'N/A').padEnd(14);
          const netStr = `${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}`.padStart(8);
          const statusStr = (b.payment_status || 'unpaid').toUpperCase() === 'PAID' ? 'PAID' : 'PEND';
          reply += `${billStr}${vehStr}${netStr}  ${statusStr}\n`;
        });
        reply += `</pre>`;

        const inlineButtons = (recentInvoices || []).slice(0, 6).map((b: any) => [
          {
            text: `Bill #${b.bill_number} • ${b.vehicle_number} (Rs. ${Math.round(Number(b.net_amount)).toLocaleString('en-IN')})`,
            callback_data: `bill_${b.bill_number}`,
          },
        ]);

        await sendTelegramMessage(chatId, reply, { inline_keyboard: inlineButtons });
        return NextResponse.json({ ok: true });
      }

      // 3. Pending Bills: "[Pending Bills]", "Pending Bills", "/pending", "unpaid"
      if (
        text === '[Pending Bills]' ||
        text === 'Pending Bills' ||
        text === '/pending' ||
        lower.includes('pending') ||
        lower.includes('unpaid')
      ) {
        const pending = (recentInvoices || []).filter(
          (b: any) => (b.payment_status || 'unpaid').toLowerCase() !== 'paid'
        );

        if (pending.length === 0) {
          await sendTelegramMessage(
            chatId,
            '<b>Pending Bills</b>\n<blockquote>All bills in your database are marked as <b>PAID</b>. Zero outstanding receivables.</blockquote>',
            fullKeyboard
          );
          return NextResponse.json({ ok: true });
        }

        let totalPendingAmt = 0;
        let reply = `<b>Pending Invoices Awaiting Payment (${pending.length})</b>\n<blockquote>Outstanding receivables awaiting clearance</blockquote>\n\n`;
        reply += `<pre>\nBILL   VEHICLE       AMOUNT (Rs) BRANCH\n---------------------------------------\n`;
        pending.slice(0, 8).forEach((b: any) => {
          const raw = b.raw_data || {};
          const amt = Math.round(Number(b.net_amount) || 0);
          totalPendingAmt += amt;
          const billStr = `#${b.bill_number}`.padEnd(6);
          const vehStr = (b.vehicle_number || 'N/A').padEnd(14);
          const amtStr = `${amt.toLocaleString('en-IN')}`.padStart(8);
          const placeStr = (raw.place || '-').slice(0, 8);
          reply += `${billStr}${vehStr}${amtStr}  ${placeStr}\n`;
        });
        reply += `</pre>\n<b>Total Outstanding: Rs. ${totalPendingAmt.toLocaleString('en-IN')}</b>`;

        const inlineButtons = pending.slice(0, 6).map((b: any) => [
          {
            text: `View Bill #${b.bill_number} (Rs. ${Math.round(Number(b.net_amount)).toLocaleString('en-IN')})`,
            callback_data: `bill_${b.bill_number}`,
          },
        ]);

        await sendTelegramMessage(chatId, reply, { inline_keyboard: inlineButtons });
        return NextResponse.json({ ok: true });
      }

      // 4. Fleet KMs: "[Fleet KMs]", "Fleet KMs", "/fleet", "odometer"
      if (
        text === '[Fleet KMs]' ||
        text === 'Fleet KMs' ||
        text === '/fleet' ||
        lower.includes('fleet') ||
        lower.includes('odometer')
      ) {
        let reply = `<b>Active Fleet Vehicles (${vehicles?.length || 0})</b>\n<blockquote>Recorded odometer readings and active status</blockquote>\n\n`;
        reply += `<pre>\nVEHICLE NUMBER      ODOMETER KM   STATUS\n----------------------------------------\n`;
        (vehicles || []).slice(0, 10).forEach((v: any) => {
          const vehStr = (v.registration_number || '').padEnd(19);
          const kmStr = `${Number(v.current_km || 0).toLocaleString('en-IN')} KM`.padEnd(13);
          reply += `${vehStr}${kmStr}ACTIVE\n`;
        });
        reply += `</pre>`;
        await sendTelegramMessage(chatId, reply, fullKeyboard);
        return NextResponse.json({ ok: true });
      }

      // 5. Fuel Records: "[Fuel Records]", "Fuel Records", "/fuel", "diesel", "bunk"
      if (
        text === '[Fuel Records]' ||
        text === 'Fuel Records' ||
        text === '/fuel' ||
        lower.includes('fuel') ||
        lower.includes('diesel')
      ) {
        let totalFuelAmt = 0;
        let totalLiters = 0;
        let reply = `<b>Fuel Management & Bunk Logs</b>\n<blockquote>Recent diesel refills logged across bunks</blockquote>\n\n`;
        reply += `<pre>\nVEHICLE        BUNK      LITERS  COST (Rs)\n----------------------------------------\n`;
        (fuelEntries || []).slice(0, 8).forEach((f: any) => {
          const cost = Number(f.total_amount) || 0;
          const ltr = Number(f.liters) || 0;
          totalFuelAmt += cost;
          totalLiters += ltr;
          const vehStr = (f.vehicle_number || '').padEnd(15);
          const bunkStr = (f.bunk_name || 'Bunk').slice(0, 9).padEnd(10);
          const ltrStr = `${ltr.toFixed(0)}L`.padEnd(6);
          const costStr = `Rs. ${Math.round(cost).toLocaleString('en-IN')}`;
          reply += `${vehStr}${bunkStr}${ltrStr}${costStr}\n`;
        });
        reply += `</pre>\n<b>Recent Total: ${totalLiters.toFixed(0)} L (Rs. ${Math.round(totalFuelAmt).toLocaleString('en-IN')})</b>`;
        await sendTelegramMessage(chatId, reply, fullKeyboard);
        return NextResponse.json({ ok: true });
      }

      // 6. Maintenance: "[Maintenance]", "Maintenance", "/maintenance", "repair", "service"
      if (
        text === '[Maintenance]' ||
        text === 'Maintenance' ||
        text === '/maintenance' ||
        lower.includes('maintenance') ||
        lower.includes('repair') ||
        lower.includes('service')
      ) {
        let totalMaint = 0;
        let reply = `<b>Repairs & Maintenance Log</b>\n<blockquote>Workshop services and component overhauls</blockquote>\n\n`;
        reply += `<pre>\nVEHICLE        CATEGORY       COST (Rs)\n----------------------------------------\n`;
        (maintenanceEntries || []).slice(0, 8).forEach((m: any) => {
          const cost = Number(m.amount) || 0;
          totalMaint += cost;
          const vehStr = (m.vehicle_number || '').padEnd(15);
          const catStr = (m.category || 'General').slice(0, 14).padEnd(15);
          const costStr = `Rs. ${Math.round(cost).toLocaleString('en-IN')}`;
          reply += `${vehStr}${catStr}${costStr}\n`;
        });
        reply += `</pre>\n<b>Total Recent Maintenance: Rs. ${Math.round(totalMaint).toLocaleString('en-IN')}</b>`;
        await sendTelegramMessage(chatId, reply, fullKeyboard);
        return NextResponse.json({ ok: true });
      }

      // 7. Expenses: "[Expenses]", "Expenses", "/expenses", "toll", "fastag"
      if (
        text === '[Expenses]' ||
        text === 'Expenses' ||
        text === '/expenses' ||
        lower.includes('expense') ||
        lower.includes('toll') ||
        lower.includes('fastag')
      ) {
        let totalExp = 0;
        let reply = `<b>Fleet & Business Expenses</b>\n<blockquote>Tolls, FASTag, driver bata, loading expenditure</blockquote>\n\n`;
        reply += `<pre>\nCATEGORY       VEHICLE       AMOUNT (Rs)\n----------------------------------------\n`;
        (expenseEntries || []).slice(0, 8).forEach((e: any) => {
          const amt = Number(e.amount) || 0;
          totalExp += amt;
          const catStr = (e.category || 'General').slice(0, 14).padEnd(15);
          const vehStr = (e.vehicle_number || 'General').slice(0, 13).padEnd(14);
          const amtStr = `Rs. ${Math.round(amt).toLocaleString('en-IN')}`;
          reply += `${catStr}${vehStr}${amtStr}\n`;
        });
        reply += `</pre>\n<b>Total Recent Expenses: Rs. ${Math.round(totalExp).toLocaleString('en-IN')}</b>`;
        await sendTelegramMessage(chatId, reply, fullKeyboard);
        return NextResponse.json({ ok: true });
      }

      // 8. Drivers: "[Drivers]", "Drivers", "/drivers"
      if (
        text === '[Drivers]' ||
        text === 'Drivers' ||
        text === '/drivers' ||
        lower.includes('driver')
      ) {
        let reply = `<b>Registered Drivers Directory (${drivers?.length || 0})</b>\n<blockquote>Active drivers, mobile contacts and rates</blockquote>\n\n`;
        reply += `<pre>\nDRIVER NAME    MOBILE       RATE/KM   STATUS\n--------------------------------------------\n`;
        (drivers || []).slice(0, 10).forEach((d: any) => {
          const nameStr = (d.name || '').slice(0, 14).padEnd(15);
          const phoneStr = (d.phone || '-').slice(0, 11).padEnd(13);
          const rateStr = `Rs.${Number(d.rate_per_km || 2.5).toFixed(1)}`.padEnd(9);
          const statusStr = (d.status || 'active').toUpperCase();
          reply += `${nameStr}${phoneStr}${rateStr}${statusStr}\n`;
        });
        reply += `</pre>`;
        await sendTelegramMessage(chatId, reply, fullKeyboard);
        return NextResponse.json({ ok: true });
      }

      // 9. Profit & Loss: "[Profit & Loss]", "Profit & Loss", "/pnl"
      if (
        text === '[Profit & Loss]' ||
        text === 'Profit & Loss' ||
        text === '/pnl' ||
        lower.includes('profit') ||
        lower.includes('pnl')
      ) {
        let netProfit = 0;
        let reply = `<b>Profit & Loss Fleet Summary</b>\n<blockquote>Net profit = Revenue minus Fuel, Maint & Expenses</blockquote>\n\n`;
        reply += `<pre>\nVEHICLE        REVENUE (Rs)  PROFIT (Rs)\n----------------------------------------\n`;
        (pnlSummary || []).slice(0, 8).forEach((p: any) => {
          const rev = Number(p.total_revenue) || 0;
          const prof = Number(p.net_profit) || 0;
          netProfit += prof;
          const vehStr = (p.registration_number || '').padEnd(15);
          const revStr = `${Math.round(rev).toLocaleString('en-IN')}`.padStart(10);
          const profStr = `${Math.round(prof).toLocaleString('en-IN')}`.padStart(10);
          reply += `${vehStr}${revStr}   ${profStr}\n`;
        });
        reply += `</pre>\n<b>Total Fleet Operating Profit: Rs. ${Math.round(netProfit).toLocaleString('en-IN')}</b>`;
        await sendTelegramMessage(chatId, reply, fullKeyboard);
        return NextResponse.json({ ok: true });
      }
    }

    // Authorized Edit Execution or Complex Intelligence via Gemini
    const contextPayload = `
COMPLETE ENTERPRISE DATABASE STATE ACROSS ALL 7 CATEGORIES:

1. Invoices & Billing:
${JSON.stringify((recentInvoices || []).slice(0, 10), null, 2)}

2. Active Fleet Vehicles:
${JSON.stringify((vehicles || []).slice(0, 15), null, 2)}

3. Registered Drivers:
${JSON.stringify((drivers || []).slice(0, 15), null, 2)}

4. Fuel Management Entries:
${JSON.stringify((fuelEntries || []).slice(0, 10), null, 2)}

5. Maintenance & Workshop Entries:
${JSON.stringify((maintenanceEntries || []).slice(0, 10), null, 2)}

6. Fleet & Business Expenses:
${JSON.stringify((expenseEntries || []).slice(0, 10), null, 2)}

7. Profit & Loss Summaries:
${JSON.stringify((pnlSummary || []).slice(0, 10), null, 2)}

USER INSTRUCTION (${isAuthed ? 'EDIT AUTHORIZED (5-MIN SESSION)' : 'READ-ONLY INQUIRY'}):
${text}
`;

    let aiResponse = '';
    let updateAction: any = null;
    try {
      aiResponse = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);
      updateAction = extractBillUpdateAction(aiResponse);
    } catch (aiErr: any) {
      console.warn('Telegram Gemini AI call failed:', aiErr.message);
      const fallbackMsg = `
<b>AUS Transport Assistant</b>
<blockquote>The AI model is temporarily occupied. Here is your quick menu:</blockquote>

Use the buttons below to access <b>Invoices</b>, <b>Pending Bills</b>, <b>Fuel</b>, <b>Maintenance</b>, <b>Expenses</b>, <b>Drivers</b>, and <b>P&L</b>.
`;
      await sendTelegramMessage(chatId, fallbackMsg, fullKeyboard);
      return NextResponse.json({ ok: true });
    }

    if (isAuthed && updateAction && updateAction.billNumber) {
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

        const confirmMsg = `
<b>Successfully Updated Bill #${targetBillNumber}</b>
<blockquote>Saved directly to Supabase and live on your website dashboard.</blockquote>

<pre>
FIELD           VALUE
---------------------------------------
Vehicle Plate   ${newVehicle}
Driver Name     ${firstTrip.driver || 'None'}
Trip Distance   ${Math.max(0, closing - starting).toLocaleString('en-IN')} KM
Final Net       Rs. ${Math.round(netAmount).toLocaleString('en-IN')}
Branch / Place  ${newPlace || 'None'}
Payment Status  ${newStatus.toUpperCase()}
</pre>
`;
        await sendTelegramMessage(chatId, confirmMsg, fullKeyboard);
        return NextResponse.json({ ok: true });
      }
    }

    const cleanDisplay = aiResponse.replace(/```json[\s\S]*?```/g, '').trim();
    await sendTelegramMessage(chatId, cleanDisplay || 'Processed successfully.', fullKeyboard);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
