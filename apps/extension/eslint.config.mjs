import globals from 'globals';
import root from '../../eslint.config.mjs';

// The monorepo rules, with browser and WebExtension globals for the extension's sources.
export default [
  ...root,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
    rules: {
      // The extension never builds markup from strings: page and API values are set as text only.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent / createElement (M26: no HTML from page or API data).' },
        { property: 'outerHTML', message: 'Use textContent / createElement.' },
        { property: 'insertAdjacentHTML', message: 'Use textContent / createElement.' },
      ],
      'no-restricted-globals': ['error', { name: 'eval', message: 'No eval in the extension.' }],
      'no-new-func': 'error',
    },
  },
];
