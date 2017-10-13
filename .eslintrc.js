module.exports = {
  extends: 'eslint-config-airbnb',
  plugins: [
    'react', 'import',
  ],
  env: {
    "es6": true,
    "browser": true
  },
  rules: {
    'jsx-a11y/href-no-hash': 'off',
    'react/jsx-tag-spacing': 1,
    'no-unused-vars': 1,
    'react/no-danger': 0,
    'no-underscore-dangle': 0,
    'global-require': 0,
    'no-console': 0,
    'new-cap': 0,
    'eol-last': 1,
    'jsx-a11y/label-has-for': 0,
},
  globals: {
    window: true,
    document: true,
    web3: true,
    fetch: true,
    localStorage: true,
    Ipfs: true,
  },
};
