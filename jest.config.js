module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/android/',
    '/__tests__/helpers/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/assets/**',
    '!src/sdk/device.ts',
    '!src/main.ts',
    '!src/ui/**',
  ],
};
