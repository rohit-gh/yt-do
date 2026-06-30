import { config } from "../config";

export async function sendTelegramMessage(text: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }
}

export async function notifyVideoReady(data: {
  id: string;
  title: string;
  password: string;
}): Promise<void> {
  const watchUrl = `${config.baseUrl}/watch/${data.id}`;
  const message = [
    "🎬 <b>New video ready</b>",
    "",
    `<b>Title:</b> ${escapeHtml(data.title)}`,
    `<b>Link:</b> <a href="${watchUrl}">${watchUrl}</a>`,
    `<b>Password:</b> <code>${escapeHtml(data.password)}</code>`,
  ].join("\n");

  await sendTelegramMessage(message);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
