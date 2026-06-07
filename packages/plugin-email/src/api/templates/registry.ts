import { mjml as accountWelcome } from './account-welcome.mjml'
import { mjml as pluginApproved } from './plugin-approved.mjml'
import { mjml as pluginRejected } from './plugin-rejected.mjml'
import type { EmailTrigger } from '../types'

export const TEMPLATES: Record<EmailTrigger, string> = {
  'account.welcome': accountWelcome,
  'plugin.approved': pluginApproved,
  'plugin.rejected': pluginRejected,
}

type TranslatedString = Partial<Record<string, string>> & { en: string }

export const SUBJECTS: Record<EmailTrigger, TranslatedString> = {
  'account.welcome': {
    en: 'Welcome to Tabularium',
    de: 'Willkommen bei Tabularium',
    es: 'Bienvenido a Tabularium',
    fr: 'Bienvenue sur Tabularium',
    it: 'Benvenuto su Tabularium',
    'zh-CN': '欢迎使用 Tabularium',
  },
  'plugin.approved': {
    en: 'Your plugin {{pluginName}} is approved',
    de: 'Dein Plugin {{pluginName}} ist freigegeben',
    es: 'Tu plugin {{pluginName}} ha sido aprobado',
    fr: 'Votre plugin {{pluginName}} est approuvé',
    it: 'Il tuo plugin {{pluginName}} è stato approvato',
    'zh-CN': '您的插件 {{pluginName}} 已通过审核',
  },
  'plugin.rejected': {
    en: 'Your plugin {{pluginName}} needs changes',
    de: 'Dein Plugin {{pluginName}} muss angepasst werden',
    es: 'Tu plugin {{pluginName}} necesita cambios',
    fr: 'Votre plugin {{pluginName}} doit être modifié',
    it: 'Il tuo plugin {{pluginName}} richiede modifiche',
    'zh-CN': '您的插件 {{pluginName}} 需要修改',
  },
}

export function resolveSubject(trigger: EmailTrigger, locale: string): string {
  const t = SUBJECTS[trigger]
  return t[locale] ?? t.en
}
