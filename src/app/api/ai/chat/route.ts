import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import {
  callGemini,
  AUS_ASSISTANT_SYSTEM_PROMPT,
  extractBillUpdateAction,
} from '@/lib/geminiAssistant';

export async function POST(req: NextRequest) {
  try {
    const { message, billContext, history = [] } = await req.json();

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

    // Format minimal context for prompt
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

    // 2. Call Gemini
    const aiText = await callGemini(contextPayload, AUS_ASSISTANT_SYSTEM_PROMPT);

    // 3. Check if Gemini produced a structured bill update
    const updateAction = extractBillUpdateAction(aiText);
    let updatedBillResult: any = null;

    if (updateAction && updateAction.billNumber) {
      const targetBillNumber = String(updateAction.billNumber);

      // Find the existing bill in Supabase
      const { data: existingRows } = await supabase
        .from('invoices')
        .select('*')
        .eq('bill_number', targetBillNumber)
        .limit(1);

      const existingInvoice = existingRows?.[0];

      if (existingInvoice) {
        const raw = existingInvoice.raw_data || {};
        const trips = Array.isArray(existingInvoice.trips) ? [...existingInvoice.trips] : [];

        // Update trip 0 or append
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

        // Compute running distance and amounts
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
        } else {
          console.error('Supabase update invoice error:', saveError);
        }
      }
    }

    // Clean conversational response removing raw json fence for pleasant display
    const cleanDisplayResponse = aiText.replace(/```json[\s\S]*?```/g, '').trim();

    return NextResponse.json({
      text: cleanDisplayResponse || aiText,
      action: updateAction,
      updatedBill: updatedBillResult,
    });
  } catch (err: any) {
    console.error('AI chat endpoint error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error while processing AI request.' },
      { status: 500 }
    );
  }
}
