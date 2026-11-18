import { NextRequest, NextResponse } from 'next/server';
import { getTelegramToken } from '@/lib/geminiAssistant';

export async function GET(req: NextRequest) {
  const TELEGRAM_BOT_TOKEN = getTelegramToken();
  const searchParams = req.nextUrl.searchParams;
  const webhookUrl = searchParams.get('url');

  if (webhookUrl) {
    try {
      const setRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(
          webhookUrl
        )}`
      );
      const data = await setRes.json();
      return NextResponse.json({
        action: 'setWebhook',
        targetUrl: webhookUrl,
        telegramResponse: data,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Get current webhook info and bot profile
  try {
    const [infoRes, meRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`),
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`),
    ]);

    const [webhookInfo, botMe] = await Promise.all([infoRes.json(), meRes.json()]);

    return NextResponse.json({
      bot: botMe.result,
      webhookInfo: webhookInfo.result,
      instructions:
        'To set the Telegram webhook when deployed on Vercel or public domain, call: /api/telegram/setup?url=https://your-domain.com/api/telegram/webhook',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
