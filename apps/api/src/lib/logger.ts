import { pino, type Logger } from 'pino'
import { env } from './env'

const isDev = env.NODE_ENV !== 'production'

export const logger: Logger = pino({
  level: env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { service: 'registry' },
  redact: {
    paths: [
      '*.accessToken',
      '*.access_token',
      'accessToken',
      'access_token',
      'token',
      'webhookSecret',
      'webhook_secret',
      '*.password',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[redacted]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service',
          messageFormat: '{module} | {msg}',
        },
      }
    : undefined,
})

export type { Logger }
