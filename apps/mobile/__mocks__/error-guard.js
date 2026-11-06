// Mock for @react-native/js-polyfills/error-guard
// This module uses Flow types that Jest can't parse

module.exports = {
  ErrorHandler: function() {},
  reportError: function() {},
  setErrorHandler: function() {},
  getErrorHandler: function() { return null; },
};