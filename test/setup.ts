/**
 * Jest setup file
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TOPIX_DATA_DIR = '/tmp/topix-test';

// Mock console methods to reduce noise in tests
const noop = () => {};
global.console = {
  ...console,
  log: noop,
  debug: noop,
  info: noop,
  // Keep warn and error for important messages
};
