import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  callGemini,
  AUS_ASSISTANT_SYSTEM_PROMPT,
  extractBillUpdateAction,
} from '@/lib/geminiAssistant';

/**
 * Fallback deterministic processor if external AI API encounters network or permission problems
 */
function handleLocalDatabaseQuery(message: string, bills: any[], vehicles: any[]) {
  const lower = message.toLowerCase();

  // 1. Query for recent bills / price / status
  if (
    lower.includes('recent') ||
    lower.includes('bill number') ||
    lower.includes('final price') ||
    lower.includes('status') ||
    lower.includes('bills') ||
    lower.includes('list')
  ) {
    if (!bills || bills.length === 0) {
      return 'No bills were found in the database. You can create a new bill from the Invoices dashboard.';
    }

    let response = '**Recent Bills in System:**\n\n';
    bills.slice(0, 6).forEach((b: any) => {
      const trips = b.trips || [];
      const firstTrip = trips[0] || {};
      const raw = b.raw_data || {};
      const distance =
        firstTrip.closingKm && firstTrip.startingKm
          ? Math.max(0, Number(firstTrip.closingKm) - Number(firstTrip.startingKm))
          : 0;

      response += `• **Bill #${b.bill_number}**\n`;
      response += `  - Vehicle: ${b.vehicle_number || 'N/A'}\n`;
      response += `  - Final Net Amount: ₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}\n`;
      response += `  - Payment Status: ${(b.payment_status || 'unpaid').toUpperCase()}\n`;
      if (raw.place) response += `  - Branch / Place: ${raw.place}\n`;
      if (distance > 0) response += `  - Trip Distance: ${distance.toLocaleString('en-IN')} KM\n`;
      response += `  - Date: ${b.bill_date || 'N/A'}\n\n`;
    });

    response += 'To update any bill, simply tell me: *"Update bill <number>: driver <name>, closing km <km>, freight <amount>, branch <place>"*.';
    return response;
  }

  // 2. Query for pending / unpaid bills
  if (lower.includes('pending') || lower.includes('unpaid')) {
    const pending = bills.filter((b: any) => b.payment_status !== 'paid');
    if (pending.length === 0) {
      return 'Great news! All bills in your database are marked as paid.';
    }

    let response = `**Pending Bills Awaiting Payment (${pending.length}):**\n\n`;
    pending.slice(0, 6).forEach((b: any) => {
      response += `• **Bill #${b.bill_number}** (${b.vehicle_number}): ₹ ${Math.round(Number(b.net_amount) || 0).toLocaleString('en-IN')}\n`;
    });
    return response;
  }

  // 3. Query for fleet vehicles
  if (lower.includes('fleet') || lower.includes('vehicle') || lower.includes('km')) {
    if (!vehicles || vehicles.length === 0) {
      return 'No vehicles found in the fleet database.';
    }

    let response = `**Fleet Vehicles (${vehicles.length}):**\n\n`;
    vehicles.slice(0, 8).forEach((v: any) => {
      response += `• **${v.registration_number}** - Current Odometer: ${Number(v.current_km || 0).toLocaleString('en-IN')} KM\n`;
    });
    return response;
  }

  return 'I am ready to help. You can ask for recent bills, pending payments, or tell me to update any bill (e.g. "Update bill 439: driver Murugan, closing km 45800, freight 16000, branch Nilakottai").';
}

export async function POST(req: NextRequest) {
  try {
    const { message, billContext } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = createClient();

    // 1. Fetch recent invoices and fleet reference data for context
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

    // Format context summary
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

${billContext ? `SPECIFICALLY FOCUSED BILL CONTEXT:\n${JSON.stringify(billContext, null, 2)}` : ''}

USER INSTRUCTION:
${message}
`;

    let aiText = '';
    let updateAction: any = null;

    // 2. Attempt Gemini generation with auto-fallback models
    try {
      aiText = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);
      updateAction = extractBillUpdateAction(aiText);
    } catch (geminiErr: any) {
      console.warn('Gemini call encountered error, using smart database fallback:', geminiErr.message);
      aiText = handleLocalDatabaseQuery(message, recentInvoices || [], vehicles || []);

      // Check if message is a manual bill update command
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

    // 3. Process structured bill update if present
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

        const firstTrip = trips[0] || {
          startingKm: 0,
          closingKm: 0,
          freightRate: 0,
          advanceAmount: 0,
          diesel: 0,
          driver: '',
        };

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
        const newDate = updateAction.date || existingInvoice.bill_date;

        const updatedRaw = {
          ...raw,
          place: newPlace,
          tdsRate: newTdsRate,
          vehicleNumber: newVehicle,
          date: newDate,
          status: newStatus,
          trips,
          netAmount,
        };

        const payload = {
          bill_number: targetBillNumber,
          bill_date: newDate,
          vehicle_number: newVehicle,
          trips,
          net_amount: netAmount,
          payment_status: newStatus,
          raw_data: updatedRaw,
          updated_at: new Date().toISOString(),
        };

        const { error: saveError } = await supabase
          .from('invoices')
          .update(payload)
          .eq('bill_number', targetBillNumber);

        if (!saveError) {
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
          aiText += `\n\nUpdated Bill #${targetBillNumber} in database (Vehicle: ${newVehicle}, Net: ₹${Math.round(netAmount).toLocaleString('en-IN')}, Branch: ${newPlace || 'None'}).`;
        }
      }
    }

    const cleanDisplayResponse = aiText.replace(/```json[\s\S]*?```/g, '').trim();

    return NextResponse.json({
      text: cleanDisplayResponse || aiText,
      action: updateAction,
      updatedBill: updatedBillResult,
    });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    return NextResponse.json(
      { error: err.message || 'Error processing request.' },
      { status: 500 }
    );
  }
}
