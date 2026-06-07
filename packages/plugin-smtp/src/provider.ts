import nodemailer, { type Transporter } from 'nodemailer'
import type { PluginHost } from '@tabularium/plugin-host-types'
import type { EmailMessage, EmailProvider, SendResult, VerifyResult } from '@tabularium/plugin-email/types'

function buildTransport(host: PluginHost): Transporter | null {
  const smtpHost = host.settings.get('email.smtp.host')
  const portRaw = host.settings.get('email.smtp.port')
  if (!smtpHost || !portRaw) return null
  const port = Number(portRaw)
  if (!Number.isFinite(port) || port <= 0) return null
  const user = host.settings.get('email.smtp.user')
  const pass = host.settings.get('email.smtp.pass')
  const tls = host.settings.get('email.smtp.tls') !== 'false'
  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: tls && port === 465, // STARTTLS on 587 is auto-detected by nodemailer
    requireTLS: tls && port !== 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  })
}

export async function buildSmtpProvider(host: PluginHost): Promise<EmailProvider | null> {
  const transport = buildTransport(host)
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

/**
 * Lazy SMTP provider shim — settings are read on every send/verify so admin
 * reconfiguration takes effect without re-registering.
 */
export function lazySmtpProvider(host: PluginHost): EmailProvider {
  return {
    name: 'smtp',
    async send(msg: EmailMessage): Promise<SendResult> {
      const inner = await buildSmtpProvider(host)
      if (!inner) throw new Error('SMTP not configured')
      return inner.send(msg)
    },
    async verifyAuth(): Promise<VerifyResult> {
      const inner = await buildSmtpProvider(host)
      if (!inner) return { ok: false, reason: 'SMTP not configured' }
      return inner.verifyAuth()
    },
  }
}
