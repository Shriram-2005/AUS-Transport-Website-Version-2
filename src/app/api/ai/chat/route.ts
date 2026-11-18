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
 * Formats a single bill with deep operational details
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
  text += `**Bill #${b.bill_number}** • ${b.vehicle_number || 'No Vehicle'}\n`;
  text += `- **Final Net Amount:** ₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}\n`;
  text += `- **Payment Status:** ${isPaid ? 'PAID' : 'PENDING (NOT RECEIVED)'}\n`;
  if (firstTrip.driver || raw.driverName) text += `- **Assigned Driver:** ${firstTrip.driver || raw.driverName}\n`;
  if (raw.place) text += `- **Branch / Place:** ${raw.place}\n`;
  if (distance > 0) text += `- **Trip Distance:** ${distance.toLocaleString('en-IN')} KM (${firstTrip.startingKm} → ${firstTrip.closingKm})\n`;
  if (firstTrip.freightRate) text += `- **Freight Rate:** ₹ ${Number(firstTrip.freightRate).toLocaleString('en-IN')}\n`;
  if (firstTrip.advanceAmount) text += `- **Advance Amount:** ₹ ${Number(firstTrip.advanceAmount).toLocaleString('en-IN')}\n`;
  if (firstTrip.diesel) text += `- **Diesel Deduction:** ₹ ${Number(firstTrip.diesel).toLocaleString('en-IN')}\n`;
  text += `- **Bill Date:** ${b.bill_date || 'N/A'}\n\n`;
  text += '*Note: Assistant is in Read-Only mode. To update this bill, unlock edit mode with your login password.*';
  return text;
}

/**
 * Formats bills in a clean structured layout for reading
 */
function formatBillsResponse(bills: any[]) {
  if (!bills || bills.length === 0) {
    return 'No bills were found in the database.';
  }

  let text = '### Recent Bills Overview\n\n';
  bills.slice(0, 6).forEach((b: any) => {
    const trips = b.trips || [];
    const firstTrip = trips[0] || {};
    const raw = b.raw_data || {};
    const distance =
      firstTrip.closingKm && firstTrip.startingKm
        ? Math.max(0, Number(firstTrip.closingKm) - Number(firstTrip.startingKm))
        : 0;

    const statusUpper = (b.payment_status || 'unpaid').toUpperCase();
    const isPaid = statusUpper === 'PAID';

    text += `**Bill #${b.bill_number}** • ${b.vehicle_number || 'No Vehicle'}\n`;
    text += `- **Final Net Amount:** ₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}\n`;
    text += `- **Payment Status:** ${isPaid ? 'PAID' : 'PENDING (NOT RECEIVED)'}\n`;
    if (raw.place) text += `- **Branch / Place:** ${raw.place}\n`;
    if (distance > 0) text += `- **Trip Distance:** ${distance.toLocaleString('en-IN')} KM\n`;
    text += `- **Bill Date:** ${b.bill_date || 'N/A'}\n\n`;
  });

  text += '*Note: By default, the assistant is in Read-Only mode. To edit any bill details, unlock edit mode with your login password.*';
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
          text: '**Edit Mode Unlocked Successfully!**\n\nYou now have a strict **5-minute window** to make edits to bills, trips, drivers, and branches. After 5 minutes, it will automatically lock back to read-only mode.\n\nWhat would you like to update?',
          isEditAuthorized: true,
          remainingSeconds: 300,
        });
      } else {
        return NextResponse.json({
          text: '**Incorrect Password.**\n\nPlease enter the same password you use to log in to the Supabase admin dashboard.',
          isEditAuthorized: false,
          remainingSeconds: 0,
        });
      }
    }

    // 2. Fetch live database records for read operations
    const supabase = createClient();
    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select('id, bill_number, bill_date, vehicle_number, net_amount, payment_status, raw_data, trips')
      .order('created_at', { ascending: false })
      .limit(15);

    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('registration_number, current_km')
      .limit(30);

    const { data: drivers } = await supabase
      .from('drivers')
      .select('name, phone, rate_per_km, status')
      .limit(30);

    // Check if message is purely a fetch / inquiry
    const lower = trimmedMsg.toLowerCase();
    const isEditIntent =
      lower.includes('update') ||
      lower.includes('edit') ||
      lower.includes('change') ||
      lower.includes('modify') ||
      lower.includes('fill') ||
      lower.includes('assign') ||
      lower.includes('set branch') ||
      lower.includes('mark paid');

    // 3. Strict Security Check: If user wants to edit, check 5-minute session
    if (isEditIntent && !isCurrentlyAuthorized) {
      return NextResponse.json({
        text: '**Edit Mode Locked (Read-Only Mode Active)**\n\nBoth the Telegram bot and AI assistant can only fetch existing details by default.\n\nTo make edits or update bills, you must enter your Supabase login password. Once verified, you will have a strict **5-minute timer** to make your changes.\n\n*Please click "Unlock Edit Mode" or reply with `/unlock <password>`.*',
        requiresAuth: true,
        isEditAuthorized: false,
        remainingSeconds: 0,
      });
    }

    // 4. Handle Read-Only Fetch Requests (Direct or via Gemini)
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

        // Direct database lookup if not in top 15
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

      if (
        lower.includes('recent') ||
        lower.includes('bill number') ||
        lower.includes('final price') ||
        lower.includes('status') ||
        lower.includes('bills') ||
        lower.includes('list')
      ) {
        return NextResponse.json({
          text: formatBillsResponse(recentInvoices || []),
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      if (lower.includes('pending') || lower.includes('unpaid')) {
        const pending = (recentInvoices || []).filter((b: any) => b.payment_status !== 'paid');
        if (pending.length === 0) {
          return NextResponse.json({
            text: 'All bills in your database are currently marked as **PAID**.',
            isEditAuthorized: isCurrentlyAuthorized,
            remainingSeconds,
          });
        }
        let reply = `### Pending Bills (${pending.length})\n\n`;
        pending.slice(0, 6).forEach((b: any) => {
          reply += `• **Bill #${b.bill_number}** • ${b.vehicle_number || 'N/A'}\n`;
          reply += `  - Outstanding Amount: ₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}\n`;
          reply += `  - Status: PENDING\n\n`;
        });
        return NextResponse.json({
          text: reply,
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }

      if (lower.includes('fleet') || lower.includes('vehicle') || lower.includes('odometer')) {
        let reply = `### Fleet Status (${vehicles?.length || 0} Vehicles)\n\n`;
        (vehicles || []).slice(0, 8).forEach((v: any) => {
          reply += `• **${v.registration_number}**: ${Number(v.current_km || 0).toLocaleString('en-IN')} KM logged\n`;
        });
        return NextResponse.json({
          text: reply,
          isEditAuthorized: isCurrentlyAuthorized,
          remainingSeconds,
        });
      }
    }

    // 5. Authorized Edit Flow (Gemini + Supabase Update)
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
CURRENT DATABASE STATE:
Recent Bills in System:
${JSON.stringify(billsContextSummary, null, 2)}

Active Fleet Vehicles:
${JSON.stringify(vehicles || [], null, 2)}

Registered Drivers:
${JSON.stringify(drivers || [], null, 2)}

USER INSTRUCTION (EDIT AUTHORIZED):
${message}
`;

    let aiText = '';
    let updateAction: any = null;

    try {
      aiText = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);
      updateAction = extractBillUpdateAction(aiText);
    } catch {
      // Fallback regex matching
      const billMatch = message.match(/(?:bill|invoice)\s*#?\s*(\d+)/i);
      if (billMatch) {
        const billNum = billMatch[1];
        const kmCloseMatch = message.match(/closing\s*(?:km)?\s*[:=]?\s*(\d+)/i);
        const kmStartMatch = message.match(/starting\s*(?:km)?\s*[:=]?\s*(\d+)/i);
        const freightMatch = message.match(/freight\s*(?:rate|amount)?\s*[:=]?\s*(\d+)/i);
        const branchMatch = message.match(/branch\s*[:=]?\s*([a-zA-Z\s]+)/i);
        const driverMatch = message.match(/driver\s*[:=]?\s*([a-zA-Z\s]+)/i);

        if (kmCloseMatch || freightMatch || branchMatch || driverMatch) {
          updateAction = {
            action: 'update_bill',
            billNumber: billNum,
            closingKm: kmCloseMatch ? Number(kmCloseMatch[1]) : undefined,
            startingKm: kmStartMatch ? Number(kmStartMatch[1]) : undefined,
            freightRate: freightMatch ? Number(freightMatch[1]) : undefined,
            branchName: branchMatch ? branchMatch[1].trim() : undefined,
            driverName: driverMatch ? driverMatch[1].trim() : undefined,
          };
        }
      }
    }

    let updatedBillResult: any = null;

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

        aiText = `**Bill #${targetBillNumber} Updated Successfully!**\n\n• **Vehicle:** ${newVehicle}\n• **Driver:** ${firstTrip.driver || 'None'}\n• **Trip Distance:** ${runningDistance.toLocaleString('en-IN')} KM\n• **Final Net Amount:** ₹ ${Math.round(netAmount).toLocaleString('en-IN')}\n• **Branch / Place:** ${newPlace || 'Not assigned'}\n• **Status:** ${newStatus.toUpperCase()}`;
      } else {
        aiText = `Could not find Bill #${targetBillNumber} in the database. Please verify the bill number.`;
      }
    }

    const cleanDisplayResponse = aiText.replace(/```json[\s\S]*?```/g, '').trim();

    return NextResponse.json({
      text: cleanDisplayResponse || aiText,
      action: updateAction,
      updatedBill: updatedBillResult,
      isEditAuthorized: isCurrentlyAuthorized,
      remainingSeconds,
    });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    return NextResponse.json({
      text: `### Notice\n\n${err.message || 'The AI service is temporarily busy.'}\n\nYou can ask about **recent bills**, **pending payments**, **vehicle distance**, or a specific bill (e.g. "bill 437") directly.`,
      isEditAuthorized: false,
      remainingSeconds: 0,
    });
  }
}
