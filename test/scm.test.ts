import expect from 'expect.js';
import { scmAdapters } from '../src/scm.js';

// The "npm test" command will run all test files and also create a coverage report using c8
describe('scm.ts', () => {
  it('there are two scm adapters', async () => {
    expect(Object.keys(scmAdapters)).eql(['github', 'gitlab']);
  });
});
