import { NextRequest, NextResponse } from 'next/server';
import { getTelegramToken } from '@/lib/geminiAssistant';

export async function GET(req: NextRequest) {
  const TELEGRAM_BOT_TOKEN = getTelegramToken();
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN is missing in environment variables (.env.local or Vercel).' },
      { status: 500 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const explicitUrl = searchParams.get('url');
  const pingChatId = searchParams.get('ping_chat_id');

  // Handle optional test ping
  if (pingChatId) {
    try {
      const pingRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: pingChatId,
            text: '<b>Test Ping from AUS Transport System</b>\n\nYour Telegram bot webhook is fully operational and receiving updates.',
            parse_mode: 'HTML',
          }),
        }
      );
      const pingData = await pingRes.json();
      return NextResponse.json({ ping: 'sent', result: pingData });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Detect Host / Domain automatically
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl.host;
  const proto =
    req.headers.get('x-forwarded-proto') ||
    (host && (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https');

  let targetWebhookUrl = explicitUrl || '';
  if (!targetWebhookUrl && host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    targetWebhookUrl = `${proto}://${host}/api/telegram/webhook`;
  }

  let webhookSetResult: any = null;
  if (targetWebhookUrl) {
    try {
      const setRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(
          targetWebhookUrl
        )}`
      );
      webhookSetResult = await setRes.json();
    } catch (err: any) {
      console.error('Failed to set Telegram webhook:', err);
    }
  }

  // Fetch current bot info and webhook status
  let botMe: any = null;
  let webhookInfo: any = null;
  try {
    const [meRes, infoRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`),
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`),
    ]);
    const [meData, infoData] = await Promise.all([meRes.json(), infoRes.json()]);
    botMe = meData.result || null;
    webhookInfo = infoData.result || null;
  } catch (err) {
    console.warn('Could not fetch Telegram webhook info:', err);
  }

  const acceptsHtml = req.headers.get('accept')?.includes('text/html');

  if (acceptsHtml) {
    const isWebhookActive = Boolean(webhookInfo?.url && webhookInfo.url.length > 0);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AUS Transport - Telegram Bot Status</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; display: flex; justify-content: center; align-items: center; min-height: 90vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 1.5rem; max-width: 560px; width: 100%; padding: 2rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
    .icon { width: 48px; height: 48px; border-radius: 1rem; background: #2563eb; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    h1 { font-size: 1.25rem; font-weight: 700; margin: 0; }
    .status-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-top: 0.25rem; }
    .status-badge.active { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .status-badge.pending { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }
    .info-group { background: #0f172a; border-radius: 1rem; padding: 1rem; margin: 1rem 0; border: 1px solid #1e293b; font-size: 0.85rem; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #94a3b8; }
    .info-val { font-family: monospace; font-weight: 600; color: #e2e8f0; word-break: break-all; }
    .btn { display: inline-flex; justify-content: center; align-items: center; width: 100%; padding: 0.75rem 1rem; border-radius: 0.75rem; background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; font-size: 0.9rem; margin-top: 0.75rem; transition: background 0.2s; box-sizing: border-box; }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #334155; }
    .btn-secondary:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">🤖</div>
      <div>
        <h1>AUS Telegram Bot Setup</h1>
        <div class="status-badge ${isWebhookActive ? 'active' : 'pending'}">
          ${isWebhookActive ? '● Webhook Active & Connected' : '○ Webhook Not Registered Yet'}
        </div>
      </div>
    </div>

    <div class="info-group">
      <div class="info-row">
        <span class="info-label">Bot Username:</span>
        <span class="info-val">@${botMe?.username || 'aus_transport_assistant_bot'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Bot Name:</span>
        <span class="info-val">${botMe?.first_name || 'AUS Transport Assistant'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Active Webhook URL:</span>
        <span class="info-val">${webhookInfo?.url || 'None (Requires registration)'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Pending Messages:</span>
        <span class="info-val">${webhookInfo?.pending_update_count || 0} in queue</span>
      </div>
    </div>

    ${
      !isWebhookActive && targetWebhookUrl
        ? `<p style="font-size: 0.85rem; color: #94a3b8;">Attempting to register webhook to: <code>${targetWebhookUrl}</code></p>`
        : ''
    }

    <a href="https://t.me/${botMe?.username || 'aus_transport_assistant_bot'}" target="_blank" class="btn">
      Open Bot in Telegram App
    </a>

    <a href="?url=${encodeURIComponent(targetWebhookUrl || `${proto}://${host}/api/telegram/webhook`)}" class="btn btn-secondary">
      🔄 Re-register / Refresh Webhook Now
    </a>
  </div>
</body>
</html>`;
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return NextResponse.json({
    success: true,
    bot: botMe,
    targetWebhookUrl,
    webhookSetResult,
    webhookInfo,
  });
}
