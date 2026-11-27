module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: [
    'node_modules/',
    'build/',
    'android/',
    'coverage/',
    'src/assets/*.generated.ts',
  ],
  overrides: [
    {
      files: ['__mocks__/**', '__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
      env: {jest: true},
    },
    {
      files: ['scripts/**'],
      env: {node: true},
    },
  ],
};
