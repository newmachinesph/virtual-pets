import nodemailer from 'nodemailer'

/**
 * Transactional email. Local dev points at Mailpit, which ships with the
 * Supabase stack — nothing leaves the machine and every message is visible at
 * http://127.0.0.1:54324. Production only needs different SMTP_* values.
 */
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  // Mailpit speaks plaintext on a local port and has no credentials.
  secure: false,
  ignoreTLS: !process.env.SMTP_USER,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
})

export async function sendMail(to: string, subject: string, text: string, url?: string) {
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? 'pet@example.com',
    to,
    subject,
    text: url ? `${text}\n\n${url}` : text,
  })
}
