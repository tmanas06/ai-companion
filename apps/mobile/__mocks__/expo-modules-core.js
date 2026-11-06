// Mock for expo-modules-core
const ReactNative = require('react-native');

module.exports = {
  CoreModule: class {},
  NativeModulesProxy: {},
  EventEmitter: class {
    addListener() {}
    removeListener() {}
    emit() {}
  },
  requireNativeModule: () => ({}),
  requireNativeViewManager: () => ({}),
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios || obj.default,
  },
  DeviceEventEmitter: ReactNative.DeviceEventEmitter,
};