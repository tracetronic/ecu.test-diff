import { scmAdapters } from '../src/scm.js';
import { SUPPORTED_FILES } from '../src/types.ts';
import expect from 'expect.js';

const adapterCases = [
  {
    name: 'GitHub',
    Class: scmAdapters.github,
    host: 'github.com',
    customHost: 'gh.custom',
    expectedApiUrl: 'https://api.github.com',
    expectedCustomApiUrl: 'https://gh.custom/api/v3',
    tokenPrefix: 'token',
    scm: 'github' as const,
  },
  {
    name: 'GitLab',
    Class: scmAdapters.gitlab,
    host: 'gitlab.com',
    customHost: 'gl.custom',
    expectedApiUrl: 'https://gitlab.com/api/v4',
    expectedCustomApiUrl: 'https://gl.custom/api/v4',
    tokenPrefix: 'Bearer',
    scm: 'gitlab' as const,
  },
];

describe('Adapter Methods', () => {
  describe('getApiUrl()', () => {
    adapterCases.forEach(
      ({
        name,
        Class,
        host,
        customHost,
        expectedApiUrl,
        expectedCustomApiUrl,
        scm,
      }) => {
        it(`${name} default host returns correct API URL`, () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const adapter: any = new Class({ host, scm });
          expect(adapter.getApiUrl()).to.equal(expectedApiUrl);
        });
        it(`${name} custom host returns correct API URL`, () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const adapter: any = new Class({ host: customHost, scm });
          expect(adapter.getApiUrl()).to.equal(expectedCustomApiUrl);
        });
      },
    );
  });

  describe('createHeaders()', () => {
    adapterCases.forEach(({ name, Class, host, tokenPrefix, scm }) => {
      it(`${name} adds correct Authorization header`, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter: any = new Class({ host, scm });
        const headers = adapter.createHeaders('abc123');
        expect(headers).to.have.property(
          'Authorization',
          `${tokenPrefix} abc123`,
        );
      });
    });
  });

  describe('isSupportedFile()', () => {
    adapterCases.forEach(({ name, Class, host, scm }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter: any = new Class({ host, scm });
      it(`${name} returns true for supported extensions`, () => {
        SUPPORTED_FILES.forEach((ext) => {
          expect(adapter.isSupportedFile(`file.${ext}`)).to.equal(true);
        });
      });
      it(`${name} returns false for unsupported or missing extensions`, () => {
        expect(adapter.isSupportedFile('file.unknownext')).to.equal(false);
        expect(adapter.isSupportedFile('file')).to.equal(false);
      });
    });
  });
});
