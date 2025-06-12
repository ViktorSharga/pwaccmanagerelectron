import { PlatformService } from './mocks/platformService';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.FORCE_MOCK_MODE = 'true';
  process.env.TEST_LOG_LEVEL = 'error';
  process.env.DISABLE_REAL_LAUNCH = 'true';
  
  // Initialize platform service
  PlatformService.initialize();
});

afterAll(() => {
  // Cleanup
  delete process.env.FORCE_MOCK_MODE;
  delete process.env.TEST_LOG_LEVEL;
  delete process.env.DISABLE_REAL_LAUNCH;
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidAccount(): R;
      toBeValidSettings(): R;
    }
  }
}

// Augment jest expect interface
declare module 'expect' {
  interface Matchers<R> {
    toBeValidAccount(): R;
    toBeValidSettings(): R;
  }
}

// Custom matchers
expect.extend({
  toBeValidAccount(received) {
    const pass = received && 
                 typeof received.id === 'string' &&
                 typeof received.login === 'string' &&
                 typeof received.password === 'string' &&
                 typeof received.server === 'string';
    
    return {
      message: () => `expected ${received} to be a valid account`,
      pass,
    };
  },
  
  toBeValidSettings(received) {
    const pass = received &&
                 typeof received.gamePath === 'string' &&
                 typeof received.launchDelay === 'number' &&
                 received.launchDelay >= 1 &&
                 received.launchDelay <= 30;
    
    return {
      message: () => `expected ${received} to be valid settings`,
      pass,
    };
  },
});