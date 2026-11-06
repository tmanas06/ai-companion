module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/)?((jest-)?@?react-native|@?expo|@react-navigation|@expo/vector-icons|nativewind|@testing-library|expo-modules-core|@react-native/js-polyfills|three|@react-native-community/slider))',
    '__mocks__/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ai-companion/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@react-native/js-polyfills/error-guard$': '<rootDir>/__mocks__/error-guard.js',
  },
  testMatch: ['**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};