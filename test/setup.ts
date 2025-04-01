// SPDX-FileCopyrightText: 2025 tracetronic GmbH
//
// SPDX-License-Identifier: MIT

// The chrome API won't be available in the test environment, so it has to be mocked
// Of course, you can remove this setup file if you don't want to test interactions with the chrome API
import sinonChrome from 'sinon-chrome';

global.chrome = sinonChrome as any;
global.chrome.runtime.id ='123'

let mockedStorage: any = {};
/* tslint:disable */
// These are just the most important methods, feel free to add more if needed
// @ts-ignore
chrome.storage.sync.get.callsFake(() => {
  return Promise.resolve(mockedStorage);
});
// @ts-ignore
chrome.storage.sync.set.callsFake((obj) => {
  Object.assign(mockedStorage, obj);
  return Promise.resolve();
});
// @ts-ignore
chrome.storage.sync.clear.callsFake(() => {
  for (const key in mockedStorage) {
    delete mockedStorage[key];
  }
  return Promise.resolve();
});

beforeEach(() => {
  chrome.storage.sync.set({});
});

afterEach(async function () {
  await chrome.storage.sync.clear();
});
