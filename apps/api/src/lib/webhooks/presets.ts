// Starting points for common targets. A preset only pre-fills the editor;
// once saved, a webhook is a plain template the admin can change freely.

import type { HeaderTemplate } from './delivery'

export type WebhookPreset = {
  key: string
  label: string
  description: string
  method: string
  url: string
  headers: HeaderTemplate[]
  body: string
  contentType: string
  // Secret names the admin must fill in, referenced as {{secrets.NAME}}.
  secrets: string[]
}

const DISCORD_BODY = `{
  "username": "{{registry.name}}",
  "embeds": [
    {
      "title": "{{event.title | truncate:250}}",
      "url": "{{event.url}}",
      "color": {{event.color}},
      "description": "{{subject.description | truncate:300 | default:"—"}}{{#if event.reason}}\\n\\n**Reason:** {{event.reason | truncate:500}}{{/if}}",
      "fields": [
        { "name": "Event", "value": "\`{{event.type}}\`", "inline": true }{{#if owner.username}},
        { "name": "Owner", "value": "{{owner.username}}", "inline": true }{{/if}}{{#if release.version}},
        { "name": "Version", "value": "{{release.version}}", "inline": true }{{/if}}{{#if event.actor.name}},
        { "name": "By", "value": "{{event.actor.name}}", "inline": true }{{/if}}
      ],
      "timestamp": "{{event.occurredAt | date}}"
    }
  ]
}`

const SLACK_BODY = `{
  "text": "*{{event.title}}*\\n<{{event.url}}|Open in {{registry.name}}>{{#if event.reason}}\\n>Reason: {{event.reason}}{{/if}}"
}`

const TURBOSMTP_BODY = `{
  "from": "noreply@example.com",
  "to": "admin@example.com",
  "subject": "[{{registry.name}}] {{event.title}}",
  "content": "{{event.title}}\\n\\n{{subject.description}}{{#if event.reason}}\\n\\nReason: {{event.reason}}{{/if}}\\n\\n{{event.url}}",
  "html_content": "<h2>{{event.title | html}}</h2><p>{{subject.description | html}}</p>{{#if event.reason}}<p><strong>Reason:</strong> {{event.reason | html}}</p>{{/if}}<p><a href=\\"{{event.url | html}}\\">Open in {{registry.name | html}}</a></p>"
}`

const GENERIC_BODY = `{
  "event": {{event | json}},
  "registry": {{registry | json}},
  "subject": {{subject | json}},
  "plugin": {{plugin | json}},
  "owner": {{owner | json}},
  "release": {{release | json}},
  "transfer": {{transfer | json}},
  "request": {{request | json}}
}`

export const WEBHOOK_PRESETS: WebhookPreset[] = [
  {
    key: 'discord',
    label: 'Discord',
    description: 'Post an embed to a Discord channel via an incoming webhook URL.',
    method: 'POST',
    url: '{{secrets.DISCORD_WEBHOOK_URL | raw}}',
    headers: [],
    body: DISCORD_BODY,
    contentType: 'application/json',
    secrets: ['DISCORD_WEBHOOK_URL'],
  },
  {
    key: 'slack',
    label: 'Slack',
    description: 'Post a message to a Slack channel via an incoming webhook URL.',
    method: 'POST',
    url: '{{secrets.SLACK_WEBHOOK_URL | raw}}',
    headers: [],
    body: SLACK_BODY,
    contentType: 'application/json',
    secrets: ['SLACK_WEBHOOK_URL'],
  },
  {
    key: 'turbosmtp',
    label: 'Email via turboSMTP',
    description:
      'Send an email through the turboSMTP API. Set the sender and recipients in the body; use api.eu.turbo-smtp.com for the EU region.',
    method: 'POST',
    url: 'https://api.turbo-smtp.com/api/v2/mail/send',
    headers: [
      { name: 'Accept', value: 'application/json' },
      { name: 'consumerKey', value: '{{secrets.CONSUMER_KEY}}' },
      { name: 'consumerSecret', value: '{{secrets.CONSUMER_SECRET}}' },
    ],
    body: TURBOSMTP_BODY,
    contentType: 'application/json',
    secrets: ['CONSUMER_KEY', 'CONSUMER_SECRET'],
  },
  {
    key: 'generic',
    label: 'Generic JSON',
    description: 'POST the full event context as JSON. Set a signing secret to verify X-Tabularium-Signature.',
    method: 'POST',
    url: 'https://example.com/hooks/tabularium',
    headers: [],
    body: GENERIC_BODY,
    contentType: 'application/json',
    secrets: [],
  },
]

export function getPreset(key: string): WebhookPreset | undefined {
  return WEBHOOK_PRESETS.find((p) => p.key === key)
}
