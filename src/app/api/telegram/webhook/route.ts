import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  callGemini,
  AUS_ASSISTANT_SYSTEM_PROMPT,
  extractBillUpdateAction,
} from '@/lib/geminiAssistant';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
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
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
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
      const chatId = cb.message?.chat?.id;
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

          const msg = `
<b>Selected Bill #${inv.bill_number}</b>
Vehicle: <code>${inv.vehicle_number || 'N/A'}</code>
Date: ${inv.bill_date || 'N/A'}
Status: <b>${(inv.payment_status || 'unpaid').toUpperCase()}</b>
Place / Branch: <b>${raw.place || 'Not Assigned'}</b>
Current Net: Rs.${Number(inv.net_amount || 0).toLocaleString('en-IN')}

<b>Trips:</b> ${trips.length} trip(s)
Last KM: Start ${trip.startingKm || 0} - Close ${trip.closingKm || 0}
Driver: ${trip.driver || 'None'}

<i>Now simply reply with what you want to fill or change.</i>
Example:
<code>Driver Murugan, starting 45000, closing 45800, freight 16000, diesel 3000, Nilakottai branch</code>
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

    const chatId = message.chat.id;
    const text = message.text.trim();
    const supabase = createClient();

    // Command: /start or /help
    if (text === '/start' || text === '/help') {
      const welcome = `
<b>AUS Transport Assistant</b>
Welcome to your automated logistics assistant bot.

You can ask for bill numbers, select one, and supply data in natural language to automatically fill and save details in your database and website.

<b>Quick Commands:</b>
/bills - View recent bills
/pending - View pending payments
/fleet - View fleet status

<b>Example Message:</b>
<i>"Update bill 439: driver Murugan, closing km 45800, freight 15000, branch Nilakottai"</i>
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

    // Command: /bills (List recent bills with interactive buttons)
    if (text === '/bills') {
      const { data: bills } = await supabase
        .from('invoices')
        .select('bill_number, vehicle_number, net_amount, payment_status')
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
        '<b>Select a bill to view or update:</b>',
        { inline_keyboard: inlineButtons }
      );
      return NextResponse.json({ ok: true });
    }

    // Command: /pending (List unpaid bills)
    if (text === '/pending') {
      const { data: bills } = await supabase
        .from('invoices')
        .select('bill_number, vehicle_number, net_amount, bill_date')
        .eq('payment_status', 'unpaid')
        .order('created_at', { ascending: false })
        .limit(8);

      if (!bills || bills.length === 0) {
        await sendTelegramMessage(chatId, 'All bills are currently marked as paid.');
        return NextResponse.json({ ok: true });
      }

      let summary = '<b>Pending Bills Awaiting Payment:</b>\n\n';
      bills.forEach((b: any) => {
        summary += `• Bill #${b.bill_number} (${b.vehicle_number}): <b>Rs.${Number(b.net_amount).toLocaleString('en-IN')}</b>\n`;
      });
      summary += '\n<i>Tap /bills or send a bill number to edit.</i>';

      await sendTelegramMessage(chatId, summary);
      return NextResponse.json({ ok: true });
    }

    // Command: /fleet
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

    // 3. Process natural language query or update with Gemini AI
    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select('bill_number, bill_date, vehicle_number, net_amount, payment_status, raw_data, trips')
      .order('created_at', { ascending: false })
      .limit(10);

    const contextPayload = `
CURRENT DATABASE STATE:
Recent Bills in System:
${JSON.stringify(recentInvoices || [], null, 2)}

USER MESSAGE IN TELEGRAM:
${text}
`;

    const aiResponse = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);
    const updateAction = extractBillUpdateAction(aiResponse);

    // Apply database update if requested
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
• <b>Driver:</b> ${firstTrip.driver || 'Unchanged'}
• <b>Distance:</b> ${Math.max(0, closing - starting).toLocaleString('en-IN')} KM (${starting} to ${closing})
• <b>Net Amount:</b> Rs.${Math.round(netAmount).toLocaleString('en-IN')}
• <b>Branch:</b> ${newPlace || 'None'}
• <b>Status:</b> ${newStatus.toUpperCase()}

<i>The changes have been saved to Supabase and are now live on your website dashboard.</i>
`;
        await sendTelegramMessage(chatId, confirmMsg);
        return NextResponse.json({ ok: true });
      }
    }

    // Default: Send AI response text
    const cleanDisplay = aiResponse.replace(/```json[\s\S]*?```/g, '').trim();
    await sendTelegramMessage(chatId, cleanDisplay || 'I have processed your request.');

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook processing error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
