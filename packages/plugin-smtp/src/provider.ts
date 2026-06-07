import nodemailer, { type Transporter } from 'nodemailer'
import { getSetting } from '../../settings'
import type { EmailMessage, EmailProvider, SendResult, VerifyResult } from '../types'

function buildTransport(): Transporter | null {
  const host = getSetting('email.smtp.host')
  const portRaw = getSetting('email.smtp.port')
  if (!host || !portRaw) return null
  const port = Number(portRaw)
  if (!Number.isFinite(port) || port <= 0) return null
  const user = getSetting('email.smtp.user')
  const pass = getSetting('email.smtp.pass')
  const tls = getSetting('email.smtp.tls') !== 'false'
  return nodemailer.createTransport({
    host,
    port,
    secure: tls && port === 465, // STARTTLS on 587 is auto-detected by nodemailer
    requireTLS: tls && port !== 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  })
}

export async function buildSmtpProvider(): Promise<EmailProvider | null> {
  const transport = buildTransport()
  if (!transport) return null

  return {
    name: 'smtp',
    async send(msg: EmailMessage): Promise<SendResult> {
      const info = await transport.sendMail({
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.htmlContent,
        text: msg.textContent,
        headers: msg.headers,
      })
      return { providerMid: info.messageId ?? null }
    },
    async verifyAuth(): Promise<VerifyResult> {
      try {
        await transport.verify()
        return { ok: true }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown'
        return { ok: false, reason }
      }
    },
  }
}
