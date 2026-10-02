import nodemailer from "nodemailer";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

const subject = "Восстановление пароля — StockKeeper";

function getEmailContent(resetUrl: string) {
  return {
    text: `Перейдите по ссылке для сброса пароля:\n\n${resetUrl}\n\nСсылка действительна 1 час.\n\nЕсли вы не запрашивали сброс пароля, проигнорируйте это письмо.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#1a1d27;color:#e2e8f0;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#f97316;border-radius:12px;margin-bottom:12px;">
            <span style="color:#fff;font-size:24px;">SK</span>
          </div>
          <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:.05em;color:#f8fafc;">STOCKKEEPER</h1>
        </div>
        <p style="font-size:15px;color:#94a3b8;margin-bottom:8px;">Запрошен сброс пароля для вашей учётной записи.</p>
        <a href="${resetUrl}" style="display:block;text-align:center;background:#f97316;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;margin:24px 0;">Сбросить пароль</a>
        <p style="font-size:13px;color:#64748b;text-align:center;">Ссылка действительна 1 час. Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
        <hr style="border:none;border-top:1px solid #2d3148;margin:24px 0;"/>
        <p style="font-size:12px;color:#475569;text-align:center;word-break:break-all;">${resetUrl}</p>
      </div>
    `,
  };
}

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_PORT === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  const from =
    process.env.RESEND_FROM_EMAIL ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "StockKeeper <onboarding@resend.dev>";
  const content = getEmailContent(resetUrl);

  try {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy("resend", "/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        ...content,
      }),
    });

    if (response.ok) {
      return;
    }

    const errorBody = await response.text().catch(() => "");
    logger.error(
      { email, status: response.status, errorBody },
      "Resend rejected password reset email",
    );
  } catch (error) {
    logger.error({ email, error }, "Resend password reset email failed");
  }

  const transport = createTransport();
  if (!transport) {
    throw new Error("No working email delivery provider is configured");
  }

  await transport.sendMail({
    from,
    to: email,
    subject,
    ...content,
  });
}
