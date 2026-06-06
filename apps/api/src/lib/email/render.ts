import mjml2html from 'mjml'
import { convert as htmlToText } from 'html-to-text'
import { TEMPLATES, resolveSubject } from './templates/registry'
import type { EmailTrigger } from './types'

const VAR_RE = /{{\s*([a-zA-Z0-9_]+)\s*}}/g

function substitute(template: string, vars: Record<string, unknown>): string {
  return template.replace(VAR_RE, (_, key: string) => {
    const v = vars[key]
    return v == null ? '' : String(v)
  })
}

export type RenderInput = {
  trigger: EmailTrigger
  locale: string
  vars: Record<string, unknown>
}

export type RenderOutput = {
  subject: string
  html: string
  text: string
}

export async function renderTemplate(input: RenderInput): Promise<RenderOutput> {
  const mjmlSource = TEMPLATES[input.trigger]
  const filled = substitute(mjmlSource, input.vars)
  const compiled = await mjml2html(filled, { validationLevel: 'soft' })
  if (compiled.errors.length > 0) {
    throw new Error(`mjml errors: ${compiled.errors.map((e) => e.message).join('; ')}`)
  }
  const subject = substitute(resolveSubject(input.trigger, input.locale), input.vars)
  const text = htmlToText(compiled.html, { wordwrap: 120 })
  return { subject, html: compiled.html, text }
}
