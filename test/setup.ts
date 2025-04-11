// The chrome API won't be available in the test environment, so it has to be mocked
// Of course, you can remove this setup file if you don't want to test interactions with the chrome API
import sinonChrome from 'sinon-chrome';

global.chrome = sinonChrome as unknown as typeof chrome;
global.chrome.runtime.id = '123';

const mockedStorage: Record<string, unknown> = {};

// Reset existing stubs before customizing their behavior
sinonChrome.storage.sync.get.resetBehavior();
sinonChrome.storage.sync.set.resetBehavior();
sinonChrome.storage.sync.clear.resetBehavior();

// These are just the most important methods, feel free to add more if needed
sinonChrome.storage.sync.get.callsFake(() => {
  return Promise.resolve(mockedStorage);
});

sinonChrome.storage.sync.set.callsFake((obj: Record<string, unknown>) => {
  Object.assign(mockedStorage, obj);
  return Promise.resolve();
});

sinonChrome.storage.sync.clear.callsFake(() => {
  for (const key in mockedStorage) {
    delete mockedStorage[key];
  }
  return Promise.resolve();
});

beforeEach(() => {
  chrome.storage.sync.set({});
});

afterEach(() => {
  sinonChrome.reset(); // Reset all stubs after each test
});
