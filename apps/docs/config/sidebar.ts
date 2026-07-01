export default {
  '/': [
    {
      title: 'Getting Started',
      items: [
        { title: 'Overview', to: '/' },
        { title: 'Install', to: '/install/' },
        { title: 'Install wizard', to: '/install-wizard/' },
      ],
    },
    {
      title: 'Admin',
      collapsible: true,
      items: [
        { title: 'Providers', to: '/admin/providers/' },
        { title: 'Plugins', to: '/admin/plugins/' },
        { title: 'Kinds', to: '/admin/kinds/' },
        { title: 'Users', to: '/admin/users/' },
        { title: 'Pages (CMS)', to: '/admin/pages/' },
        { title: 'Developer docs', to: '/admin/docs/' },
        { title: 'API tokens (M2M)', to: '/admin/tokens/' },
        { title: 'Branding', to: '/admin/branding/' },
        { title: 'Languages', to: '/admin/i18n/' },
        { title: 'Features', to: '/admin/features/' },
        { title: 'Infrastructure', to: '/admin/infra/' },
        { title: 'Security', to: '/admin/security/' },
      ],
    },
    {
      title: 'Authors',
      collapsible: true,
      items: [
        { title: 'Publishing', to: '/publishing/' },
        { title: 'CI-driven push', to: '/authors/publish-push/' },
        { title: 'Plugin developer docs', to: '/authors/dev-docs/' },
      ],
    },
    {
      title: 'Consumers',
      items: [{ title: 'Consuming', to: '/consuming/' }],
    },
    {
      title: 'Reference',
      collapsible: true,
      items: [
        { title: 'API & clients', to: '/api/' },
        { title: 'Manifest spec', to: '/manifest/' },
        { title: 'Manifest JSON Schema', to: '/manifest.schema.json' },
        { title: 'Webhooks', to: '/webhooks/' },
      ],
    },
    {
      title: 'Deploy',
      items: [{ title: 'Docker', to: '/deploy/' }],
    },
  ],
}
