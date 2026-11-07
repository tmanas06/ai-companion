// Local entry that re-exports expo-router's entry. Works around a Metro HMR
// resolver issue in pnpm monorepos where `"main": "expo-router/entry"` is
// treated as a relative path from this package.json instead of a module
// lookup. See: https://docs.expo.dev/guides/monorepos/
import 'expo-router/entry';
