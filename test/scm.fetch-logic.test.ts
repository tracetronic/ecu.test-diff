import { scmAdapters } from '../src/scm.js';
import { ModifiedFile } from '../src/types.ts';
import expect from 'expect.js';
import sinon from 'sinon';
import { createScmAdaptersForTests, globalWithFetch } from './utils.ts';

const { gh, gl } = createScmAdaptersForTests();

describe('Fetch Logic', () => {
  describe('getCommitDetails()', () => {
    context('GitHub', () => {
      const fakeInfo = { owner: 'foo', repo: 'bar', commitHash: '123abc' };
      const token = 'tok';

      beforeEach(() => {
        sinon.stub(gh, 'getApiUrl').returns('https://api');
        sinon
          .stub(gh, 'createHeaders')
          .withArgs(token)
          .returns({ Authorization: 'token tok' });
      });
      afterEach(() => sinon.restore());

      it('returns parsed JSON when response.ok=true', async () => {
        globalWithFetch.fetch = sinon.stub().resolves({
          ok: true,
          statusText: 'OK',
          json: async () => ({ sha: 'sha123', files: [] }),
        });

        const result = await gh.getCommitDetails(fakeInfo, token);
        expect(result).to.eql({ sha: 'sha123', files: [] });
      });

      it('throws if response.ok=false', async () => {
        globalWithFetch.fetch = sinon.stub().resolves({
          ok: false,
          statusText: 'Not Found',
        });

        try {
          await gh.getCommitDetails(fakeInfo, token);
          expect().fail('Expected error');
        } catch (err: unknown) {
          if (!(err instanceof Error)) throw err;
          expect(err.message).to.match(
            /Failed to retrieve commit details: Not Found/,
          );
        }
      });
    });

    context('GitLab diff error', () => {
      const fakeInfo = { owner: 'foo', repo: 'bar', commitHash: 'abc123' };
      const token = 'tok';

      beforeEach(() => {
        sinon.stub(gl, 'getApiUrl').returns('https://gitlab.com/api/v4');
        sinon
          .stub(gl, 'createHeaders')
          .withArgs(token)
          .returns({ Authorization: 'Bearer tok' });
      });
      afterEach(() => sinon.restore());

      it('throws if diff page 1 fetch fails', async () => {
        globalWithFetch.fetch = sinon
          .stub()
          .onFirstCall()
          .resolves({ ok: true, json: async () => ({ parent_ids: ['p1'] }) })
          .onSecondCall()
          .resolves({ ok: false, status: 500, statusText: 'Internal Error' });

        try {
          await gl.getCommitDetails(fakeInfo, token);
          expect().fail('Expected error');
        } catch (err: unknown) {
          if (!(err instanceof Error)) throw err;
          expect(err.message).to.match(/\[500\] Internal Error/);
        }
      });
    });

    context('GitLab nested project group', () => {
      const token = 'token';
      const fakeInfo = {
        owner: 'group/subgroup',
        repo: 'project',
        commitHash: 'abc123',
      };

      beforeEach(() => {
        sinon.stub(gl, 'getApiUrl').returns('https://gitlab.com/api/v4');
        sinon
          .stub(gl, 'createHeaders')
          .withArgs(token)
          .returns({ Authorization: 'Bearer token' });

        sinon.replace(
          globalThis,
          'fetch',
          sinon
            .stub()
            .onFirstCall()
            .resolves(
              new Response(JSON.stringify({ parent_ids: ['p1'] }), {
                status: 200,
                headers: new Headers({ 'Content-Type': 'application/json' }),
              }),
            )
            .onSecondCall()
            .resolves(
              new Response(
                JSON.stringify([
                  {
                    diff: '+x\n-y',
                    new_path: 'file.pkg',
                    old_path: 'file.pkg',
                    new_file: false,
                    renamed_file: false,
                    deleted_file: false,
                  },
                ]),
                { status: 200, headers: new Headers({ 'x-total-pages': '1' }) },
              ),
            ),
        );
      });

      afterEach(() => sinon.restore());

      it('handles commit from nested group project', async () => {
        const result = await gl.getCommitDetails(fakeInfo, token);
        expect(result).to.have.property('sha', 'abc123');
        expect(result.files).to.be.an('array');
        expect(result.files[0].filename).to.equal('file.pkg');
      });
    });
  });

  describe('getPullDetails()', () => {
    context('GitHub error paths', () => {
      const token = 'token';
      const pullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };

      beforeEach(() => {
        sinon.stub(gh, 'getApiUrl').returns('https://api');
        sinon
          .stub(gh, 'createHeaders')
          .withArgs(token)
          .returns({ Authorization: 'token token' });
      });
      afterEach(() => sinon.restore());

      it('throws when first page of pull-files is non-ok', async () => {
        globalWithFetch.fetch = sinon
          .stub()
          .onFirstCall()
          .resolves({ ok: true, json: async () => {} })
          .onSecondCall()
          .resolves({ ok: false, statusText: 'Bad Gateway' });

        try {
          await gh.getPullDetails(pullInfo, token);
          expect().fail('Expected error');
        } catch (err: unknown) {
          if (!(err instanceof Error)) throw err;
          expect(err.message).to.match(
            /Failed to retrieve paginated data \(page 1\): Bad Gateway/,
          );
        }
      });

      it('throws if initial pull metadata fetch fails', async () => {
        globalWithFetch.fetch = sinon.stub().resolves({
          ok: false,
          statusText: 'Not Found',
        });

        try {
          await gh.getPullDetails(pullInfo, token);
          expect().fail('Expected error not thrown');
        } catch (err: unknown) {
          if (!(err instanceof Error)) throw err;
          expect(err.message).to.match(
            /Failed to retrieve pull details: Not Found/,
          );
        }
      });
    });

    context('GitLab MR diff error', () => {
      const fakeInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };
      const token = 'tok';

      beforeEach(() => {
        sinon.stub(gl, 'getApiUrl').returns('https://gitlab.com/api/v4');
        sinon
          .stub(gl, 'createHeaders')
          .withArgs(token)
          .returns({ Authorization: 'Bearer tok' });
      });
      afterEach(() => sinon.restore());

      it('throws if MR diff page 2 fetch fails', async () => {
        globalWithFetch.fetch = (input: RequestInfo | { url: string }) => {
          const urlStr = typeof input === 'string' ? input : input.url;
          const u = new URL(urlStr);

          if (
            u.pathname.endsWith('/diffs') &&
            u.searchParams.get('page') === '1'
          ) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    diff: '+a\n-b',
                    new_path: 'f.pkg',
                    old_path: 'f.pkg',
                    new_file: false,
                    renamed_file: false,
                    deleted_file: false,
                    generated_file: null,
                  },
                ]),
                { status: 200, headers: new Headers({ 'x-total-pages': '2' }) },
              ),
            );
          }

          if (
            u.pathname.endsWith('/diffs') &&
            u.searchParams.get('page') === '2'
          ) {
            return Promise.resolve(
              new Response(null, { status: 502, statusText: 'Bad Gateway' }),
            );
          }

          return Promise.resolve(
            new Response(null, {
              status: 500,
              statusText: 'Unexpected fetch ' + urlStr,
            }),
          );
        };

        try {
          await gl.getPullDetails(fakeInfo, token);
          expect().fail('Expected error');
        } catch (err: unknown) {
          if (!(err instanceof Error)) throw err;
          expect(err.message).to.match(
            /Failed to retrieve paginated data \(page 2\): \[502\] Bad Gateway/,
          );
        }
      });

      it('throws if final merge request metadata fetch fails', async () => {
        globalWithFetch.fetch = (input: RequestInfo | { url: string }) => {
          const url = typeof input === 'string' ? input : input.url;
          const u = new URL(url);
          if (u.pathname.endsWith('/diffs')) {
            if (u.searchParams.get('page') === '1') {
              return Promise.resolve(
                new Response(
                  JSON.stringify([
                    {
                      diff: '+a\n-b',
                      new_path: 'f.pkg',
                      old_path: 'f.pkg',
                      new_file: false,
                      renamed_file: false,
                      deleted_file: false,
                      generated_file: null,
                    },
                  ]),
                  {
                    status: 200,
                    headers: new Headers({ 'x-total-pages': '2' }),
                  },
                ),
              );
            }
            return Promise.resolve(
              new Response(JSON.stringify([]), {
                status: 200,
                headers: new Headers(),
              }),
            );
          }

          return Promise.resolve(
            new Response(null, {
              status: 404,
              statusText: 'Not Found',
              headers: new Headers(),
            }),
          );
        };

        try {
          await gl.getPullDetails(fakeInfo, token);
          expect().fail('Expected error');
        } catch (err: unknown) {
          if (!(err instanceof Error)) throw err;
          expect(err.message).to.match(
            /Failed to retrieve merge request details: \[404\] Not Found/,
          );
        }
      });
    });
  });

  describe('fetchModifiedFiles()', () => {
    const cases = [
      {
        name: 'GitHub',
        Adapter: scmAdapters.github,
        commitUrl: 'https://github.com/foo/bar/commit/123abc',
        prUrl: 'https://github.com/foo/bar/pull/1',
        hostInfo: { host: 'github.com', scm: 'github' as const },
      },
      {
        name: 'GitLab',
        Adapter: scmAdapters.gitlab,
        commitUrl: 'https://gitlab.com/foo/bar/-/commit/123abc',
        prUrl: 'https://gitlab.com/foo/bar/-/merge_requests/1',
        hostInfo: { host: 'gitlab.com', scm: 'gitlab' as const },
      },
    ];

    cases.forEach(({ name, Adapter, hostInfo, commitUrl, prUrl }) => {
      describe(`${name} Adapter`, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let adapter: any;
        let fakeFiles: ModifiedFile[];
        let stubCommit: sinon.SinonStub;
        let stubPull: sinon.SinonStub;

        beforeEach(() => {
          adapter = new Adapter(hostInfo);
          fakeFiles = [
            {
              filename: 'x.ts',
              filenameOld: 'x.ts',
              new: false,
              renamed: false,
              deleted: false,
              additions: 1,
              deletions: 0,
              shaOld: 'o',
              shaNew: 'n',
              download: { type: 'json', old: 'o', new: 'n' },
            },
          ];
          stubCommit = sinon.stub(adapter, 'handleCommit').resolves(fakeFiles);
          stubPull = sinon
            .stub(adapter, 'handlePullRequest')
            .resolves(fakeFiles);
        });

        afterEach(() => sinon.restore());

        it('calls handleCommit for commit URLs', async () => {
          const result = await adapter.fetchModifiedFiles(commitUrl, 'token');
          expect(stubCommit.calledOnce).to.equal(true);
          expect(stubPull.notCalled).to.equal(true);
          expect(result).to.eql(fakeFiles);
        });

        it('calls handlePullRequest for pull/merge request URLs', async () => {
          const result = await adapter.fetchModifiedFiles(prUrl, 'token');
          expect(stubPull.calledOnce).to.equal(true);
          expect(stubCommit.notCalled).to.equal(true);
          expect(result).to.eql(fakeFiles);
        });

        it('throws on malformed URL', async () => {
          try {
            await adapter.fetchModifiedFiles('not-a-url', 'token');
            throw new Error('Promise did not reject');
          } catch (err: unknown) {
            if (!(err instanceof Error)) throw err;
            expect(err.message).to.match(/Not a valid URL: not-a-url/);
          }
        });

        it('throws if URL is neither commit nor pull/merge request', async () => {
          try {
            const badUrl =
              name === 'GitHub'
                ? 'https://github.com/foo/bar/issues/1'
                : 'https://gitlab.com/foo/bar/-/issues/1';
            await adapter.fetchModifiedFiles(badUrl, 'token');
            throw new Error('Promise did not reject');
          } catch (err: unknown) {
            if (!(err instanceof Error)) throw err;
            expect(err.message).to.match(
              /Not a GitHub commit or pull request page/,
            );
          }
        });
      });
    });
  });

  describe('test()', () => {
    describe('GitHub Adapter', () => {
      it('returns true when fetch.ok is true', async () => {
        globalWithFetch.fetch = () =>
          Promise.resolve(
            new Response(null, { status: 200, statusText: 'OK' }),
          );
        const result = await gh.test('token');
        expect(result).to.equal(true);
      });

      it('returns false then fetch.ok is false', async () => {
        globalWithFetch.fetch = () =>
          Promise.resolve(
            new Response(null, { status: 400, statusText: 'Bad Request' }),
          );
        const result = await gh.test('token');
        expect(result).to.equal(false);
      });

      it('returns false on network error', async () => {
        const errStub = sinon.stub(console, 'error');
        globalWithFetch.fetch = () => Promise.reject(new Error());
        const result = await gh.test('token');
        expect(result).to.equal(false);
        errStub.restore();
      });
    });

    describe('GitLab Adapter', () => {
      it('returns true on 200 OK', async () => {
        globalWithFetch.fetch = () =>
          Promise.resolve(
            new Response(null, {
              status: 200,
              headers: new Headers(),
            }),
          );
        const result = await gl.test('token');
        expect(result).to.equal(true);
      });

      it('returns true on 403 with x-gitlab-meta header', async () => {
        globalWithFetch.fetch = () =>
          Promise.resolve(
            new Response(null, {
              status: 403,
              headers: { 'x-gitlab-meta': 'yes' },
            }),
          );
        const result = await gl.test('token');
        expect(result).to.equal(true);
      });

      it('returns false on 403 without x-gitlab-meta header', async () => {
        globalWithFetch.fetch = () =>
          Promise.resolve(
            new Response(null, {
              status: 403,
              statusText: 'Forbidden',
              headers: new Headers(),
            }),
          );
        const result = await gl.test('token');
        expect(result).to.equal(false);
      });

      it('returns false on network error', async () => {
        const errStub = sinon.stub(console, 'error');
        globalWithFetch.fetch = () => Promise.reject(new Error());
        const result = await gl.test('token');
        expect(result).to.equal(false);
        errStub.restore();
      });
    });
  });
});
