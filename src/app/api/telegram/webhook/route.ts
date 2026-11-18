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

      await answerCallbackQuery(cb.id, 'Bill selected');

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

          const msg = `
<b>Bill Details #${inv.bill_number}</b>
• <b>Vehicle:</b> <code>${inv.vehicle_number || 'N/A'}</code>
• <b>Final Net Amount:</b> Rs.${Number(inv.net_amount || 0).toLocaleString('en-IN')}
• <b>Payment Status:</b> <b>${(inv.payment_status || 'unpaid').toUpperCase()}</b>
• <b>Branch / Place:</b> ${raw.place || 'Not Assigned'}
• <b>Bill Date:</b> ${inv.bill_date || 'N/A'}
• <b>Last Recorded KM:</b> Start ${trip.startingKm || 0} - Close ${trip.closingKm || 0}
• <b>Driver:</b> ${trip.driver || 'None'}

${
  isAuthed
    ? `<i>🔓 Edit Mode Active (${Math.floor(remaining / 60)}m ${remaining % 60}s remaining). Reply with changes to update.</i>`
    : `<i>🔒 Read-Only Mode. To make changes to this bill, send <code>/unlock YOUR_PASSWORD</code> to activate the 5-minute edit timer.</i>`
}
`;
          await sendTelegramMessage(chatId, msg);
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
    const supabase = createClient();

    // Check Password Unlock Attempt: /unlock <password>
    if (text.startsWith('/unlock ') || text.startsWith('/password ')) {
      const pwd = text.replace(/^\/(?:unlock|password)\s+/, '').trim();
      const isValid = await verifyAdminPassword(pwd);

      if (isValid) {
        grantEditSession(chatId);
        const unlockMsg = `
<b>🔓 Edit Mode Unlocked!</b>

You have been granted a strict <b>5-minute timer</b> to make updates, edit bills, assign drivers, or change branches.

After 5 minutes, it will automatically return to Read-Only mode.

<i>What would you like to update?</i>
Example:
<code>Update bill 439: driver Murugan, closing km 45800, freight 16000, branch Nilakottai</code>
`;
        await sendTelegramMessage(chatId, unlockMsg);
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegramMessage(
          chatId,
          '<b>❌ Incorrect Password.</b>\nPlease enter the same password you use to log in to the Supabase admin dashboard.'
        );
        return NextResponse.json({ ok: true });
      }
    }

    // Command: /start or /help
    if (text === '/start' || text === '/help') {
      const welcome = `
<b>AUS Transport Assistant</b>
By default, this bot is in <b>Read-Only Mode</b> to safely fetch and tell you current bills, final prices, and payment statuses.

<b>Commands:</b>
/bills - Fetch recent bills
/pending - Fetch unpaid bills
/fleet - Fetch vehicle distance
/unlock &lt;password&gt; - Unlock 5-minute edit mode with your Supabase login password

<b>Example Query:</b>
<i>"recent bill number and its final price and status"</i>
`;
      const keyboard = {
        keyboard: [
          [{ text: '/bills' }, { text: '/pending' }],
          [{ text: '/fleet' }],
        ],
        resize_keyboard: true,
      };
      await sendTelegramMessage(chatId, welcome, keyboard);
      return NextResponse.json({ ok: true });
    }

    // Command: /bills (Fetch recent bills)
    if (text === '/bills') {
      const { data: bills } = await supabase
        .from('invoices')
        .select('bill_number, vehicle_number, net_amount, payment_status, bill_date')
        .order('created_at', { ascending: false })
        .limit(6);

      if (!bills || bills.length === 0) {
        await sendTelegramMessage(chatId, 'No bills found in the database.');
        return NextResponse.json({ ok: true });
      }

      const inlineButtons = bills.map((b: any) => [
        {
          text: `Bill #${b.bill_number} - ${b.vehicle_number} (Rs.${Number(b.net_amount).toLocaleString('en-IN')})`,
          callback_data: `bill_${b.bill_number}`,
        },
      ]);

      await sendTelegramMessage(
        chatId,
        '<b>Recent Bills in System (Tap to view details):</b>',
        { inline_keyboard: inlineButtons }
      );
      return NextResponse.json({ ok: true });
    }

    // Command: /pending (Fetch unpaid bills)
    if (text === '/pending') {
      const { data: bills } = await supabase
        .from('invoices')
        .select('bill_number, vehicle_number, net_amount, bill_date')
        .eq('payment_status', 'unpaid')
        .order('created_at', { ascending: false })
        .limit(8);

      if (!bills || bills.length === 0) {
        await sendTelegramMessage(chatId, 'All bills are currently marked as <b>PAID</b>.');
        return NextResponse.json({ ok: true });
      }

      let summary = '<b>Pending Bills Awaiting Payment:</b>\n\n';
      bills.forEach((b: any) => {
        summary += `• <b>Bill #${b.bill_number}</b> (${b.vehicle_number}): Rs.${Number(b.net_amount).toLocaleString('en-IN')}\n`;
      });

      await sendTelegramMessage(chatId, summary);
      return NextResponse.json({ ok: true });
    }

    // Command: /fleet (Fetch fleet vehicles)
    if (text === '/fleet') {
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('registration_number, current_km')
        .limit(10);

      let summary = '<b>Active Fleet Vehicles:</b>\n\n';
      (vehicles || []).forEach((v: any) => {
        summary += `• <b>${v.registration_number}</b> - ${Number(v.current_km).toLocaleString('en-IN')} KM\n`;
      });

      await sendTelegramMessage(chatId, summary);
      return NextResponse.json({ ok: true });
    }

    // Check if the user intends to edit or modify
    const lower = text.toLowerCase();
    const isEditIntent =
      lower.includes('update') ||
      lower.includes('edit') ||
      lower.includes('change') ||
      lower.includes('modify') ||
      lower.includes('fill') ||
      lower.includes('assign') ||
      lower.includes('set branch');

    const isAuthed = isEditSessionValid(chatId);

    // Block edit if not authorized
    if (isEditIntent && !isAuthed) {
      const lockMsg = `
<b>🔒 Edit Mode Locked (Read-Only Active)</b>

By default, the bot can only fetch and tell you existing details.

To edit or update bills, you must authenticate using your Supabase login password.

Please reply with:
<code>/unlock YOUR_PASSWORD</code>

Once verified, you will have a strict <b>5-minute window</b> to make changes.
`;
      await sendTelegramMessage(chatId, lockMsg);
      return NextResponse.json({ ok: true });
    }

    // Fetch existing details for read query
    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select('bill_number, bill_date, vehicle_number, net_amount, payment_status, raw_data, trips')
      .order('created_at', { ascending: false })
      .limit(10);

    // If read request (e.g. recent bills, price, status, or specific bill)
    if (!isEditIntent) {
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
          const isAuthed = isEditSessionValid(chatId);
          const remaining = getSessionRemainingSeconds(chatId);
          const distance =
            trip.closingKm && trip.startingKm
              ? Math.max(0, Number(trip.closingKm) - Number(trip.startingKm))
              : 0;

          const msg = `
<b>Bill Details #${inv.bill_number}</b>
• <b>Vehicle:</b> <code>${inv.vehicle_number || 'N/A'}</code>
• <b>Final Net Amount:</b> Rs.${Number(inv.net_amount || 0).toLocaleString('en-IN')}
• <b>Payment Status:</b> <b>${(inv.payment_status || 'unpaid').toUpperCase()}</b>
• <b>Branch / Place:</b> ${raw.place || 'Not Assigned'}
• <b>Bill Date:</b> ${inv.bill_date || 'N/A'}
• <b>Distance:</b> ${distance.toLocaleString('en-IN')} KM
• <b>Driver:</b> ${trip.driver || 'None'}

${
  isAuthed
    ? `<i>🔓 Edit Mode Active (${Math.floor(remaining / 60)}m ${remaining % 60}s remaining). Reply with changes to update.</i>`
    : `<i>🔒 Read-Only Mode. To edit this bill, send <code>/unlock YOUR_PASSWORD</code> to start the 5-minute timer.</i>`
}
`;
          await sendTelegramMessage(chatId, msg);
          return NextResponse.json({ ok: true });
        }
      }

      if (
        lower.includes('recent') ||
        lower.includes('bill number') ||
        lower.includes('final price') ||
        lower.includes('status') ||
        lower.includes('bills')
      ) {
        let reply = '<b>Recent Bills & Final Prices:</b>\n\n';
        (recentInvoices || []).slice(0, 6).forEach((b: any) => {
          const raw = b.raw_data || {};
          reply += `• <b>Bill #${b.bill_number}</b> (${b.vehicle_number || 'N/A'})\n`;
          reply += `  Final Price: <b>Rs.${Number(b.net_amount || 0).toLocaleString('en-IN')}</b>\n`;
          reply += `  Status: <b>${(b.payment_status || 'unpaid').toUpperCase()}</b>\n`;
          if (raw.place) reply += `  Branch: ${raw.place}\n`;
          reply += `  Date: ${b.bill_date || 'N/A'}\n\n`;
        });
        await sendTelegramMessage(chatId, reply);
        return NextResponse.json({ ok: true });
      }
    }

    // Authorized Edit Execution via Gemini
    const contextPayload = `
CURRENT DATABASE STATE:
Recent Bills in System:
${JSON.stringify(recentInvoices || [], null, 2)}

USER MESSAGE IN TELEGRAM (EDIT AUTHORIZED):
${text}
`;

    const aiResponse = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);
    const updateAction = extractBillUpdateAction(aiResponse);

    if (updateAction && updateAction.billNumber) {
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
<b>Successfully Updated Bill #${targetBillNumber}!</b>

• <b>Vehicle:</b> ${newVehicle}
• <b>Driver:</b> ${firstTrip.driver || 'None'}
• <b>Distance:</b> ${Math.max(0, closing - starting).toLocaleString('en-IN')} KM
• <b>Final Net Amount:</b> Rs.${Math.round(netAmount).toLocaleString('en-IN')}
• <b>Branch:</b> ${newPlace || 'None'}
• <b>Status:</b> ${newStatus.toUpperCase()}

<i>Saved to Supabase and live on your website.</i>
`;
        await sendTelegramMessage(chatId, confirmMsg);
        return NextResponse.json({ ok: true });
      }
    }

    const cleanDisplay = aiResponse.replace(/```json[\s\S]*?```/g, '').trim();
    await sendTelegramMessage(chatId, cleanDisplay || 'Processed.');

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
