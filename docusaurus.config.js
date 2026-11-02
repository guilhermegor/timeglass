// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'timeglass',
  tagline: 'AI subscription usage and billing across vendors and accounts: CLI + GNOME top-bar',
  url: 'https://guilhermegor.github.io',
  baseUrl: '/timeglass/',
  favicon: 'timeglass.svg',
  staticDirectories: ['assets/logo'],
  organizationName: 'guilhermegor',
  projectName: 'timeglass',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/guilhermegor/timeglass/edit/main/docs/',
        },
        blog: false,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'timeglass',
        logo: { alt: 'timeglass', src: 'timeglass.svg', srcDark: 'timeglass-dark.svg' },
        items: [
          {
            href: 'https://github.com/guilhermegor/timeglass',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
    }),
};

module.exports = config;
