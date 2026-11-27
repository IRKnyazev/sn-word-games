module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: ['/node_modules/', '/build/', '/android/'],
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/assets/**',
    '!src/sdk/device.ts',
    '!src/ui/**',
  ],
};
