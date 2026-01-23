import expect from 'expect.js';
import { createScmAdaptersForTests } from './utils.ts';

const { gh, gl, bb } = createScmAdaptersForTests();

describe('Pagination', () => {
  describe('GitHub Adapter getPullDetails()', () => {
    const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };

    beforeEach(() => {
      globalThis.fetch = (input: URL | RequestInfo) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (
          url.startsWith('https://api.github.com/repos/foo/bar/pulls/1') &&
          !url.includes('/files')
        ) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                base: { sha: 'baseSha' },
                head: { sha: 'headSha' },
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/repos/foo/bar/pulls/1/files')) {
          const page = Number(new URL(url).searchParams.get('page'));
          const count = page === 1 ? 100 : 20;
          const batch = Array(count).fill({
            filename: `f${page}.pkg`,
            previous_filename: `f${page}.pkg`,
            additions: 1,
            deletions: 0,
            status: 'modified',
            sha: 'h',
            blob_url: '',
            raw_url: '',
            content_url: '',
          });
          return Promise.resolve(
            new Response(JSON.stringify(batch), { status: 200 }),
          );
        }
        return Promise.reject(new Error('Unexpected fetch: ' + url));
      };
    });

    afterEach(() => {
      delete (globalThis as { fetch?: CallableFunction }).fetch;
    });

    it('collects all files across pull request pages', async () => {
      const prData = await gh.getPullDetails(fakePullInfo, 'token');
      expect(prData.info.base.sha).to.equal('baseSha');
      expect(prData.info.head.sha).to.equal('headSha');
      expect(prData.files).to.have.length(120);
      expect(prData.files[0].filename).to.equal('f1.pkg');
      expect(prData.files[119].filename).to.equal('f2.pkg');
    });
  });

  describe('GitLab Adapter', () => {
    describe('getCommitDetails()', () => {
      const fakeCommitInfo = {
        owner: 'foo',
        repo: 'bar',
        commitHash: '123abc',
      };

      beforeEach(() => {
        (globalThis as { fetch?: CallableFunction }).fetch = (input: URL | RequestInfo) => {
          const url = typeof input === 'string' ? input : (input as Request).url;
          if (
            url ===
            'https://gitlab.com/api/v4/projects/foo%2Fbar/repository/commits/123abc'
          ) {
            return Promise.resolve(
              new Response(JSON.stringify({ parent_ids: ['p1'] }), {
                status: 200,
              }),
            );
          }
          if (
            url.startsWith(
              'https://gitlab.com/api/v4/projects/foo%2Fbar/repository/commits/123abc/diff',
            )
          ) {
            const page = Number(new URL(url).searchParams.get('page'));
            const count = page === 1 ? 100 : 20;
            const batch = Array(count).fill({
              diff: '+a\n-b',
              new_path: 'f.pkg',
              old_path: 'f.pkg',
              new_file: false,
              renamed_file: false,
              deleted_file: false,
              generated_file: null,
            });
            const headers = new Headers({ 'x-total-pages': '2' });
            return Promise.resolve(
              new Response(JSON.stringify(batch), { status: 200, headers }),
            );
          }
          return Promise.reject(new Error('Unexpected fetch: ' + url));
        };
      });

      afterEach(() => {
        delete (globalThis as { fetch?: CallableFunction }).fetch;
      });

      it('collects all files across commit pages', async () => {
        const commitData = await gl.getCommitDetails(fakeCommitInfo, 'token');
        expect(commitData.sha).to.equal('123abc');
        expect(commitData.parents[0].sha).to.equal('p1');
        expect(commitData.files).to.have.length(120);
      });
    });

    describe('getPullDetails()', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };

      beforeEach(() => {
        (globalThis as { fetch?: CallableFunction }).fetch = (input: URL | RequestInfo) => {
          const url = typeof input === 'string' ? input : (input as Request).url;
          const u = new URL(url);

          if (
            u.pathname === '/api/v4/projects/foo%2Fbar/merge_requests/1' &&
            !u.searchParams.has('page')
          ) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  diff_refs: { base_sha: 'baseSha', head_sha: 'headSha' },
                }),
                { status: 200, headers: new Headers() },
              ),
            );
          }

          if (
            u.pathname ===
              '/api/v4/projects/foo%2Fbar/merge_requests/1/diffs' &&
            u.searchParams.has('page')
          ) {
            const page = Number(u.searchParams.get('page'));
            const count = page === 1 ? 100 : 20;
            const batch = Array(count).fill({
              diff: '+a\n-b',
              new_path: 'file.pkg',
              old_path: 'file.pkg',
              new_file: false,
              renamed_file: false,
              deleted_file: false,
              generated_file: null,
            });
            const headers = new Headers({ 'x-total-pages': '2' });
            return Promise.resolve(
              new Response(JSON.stringify(batch), { status: 200, headers }),
            );
          }
          return Promise.reject(new Error('Unexpected fetch: ' + url));
        };
      });

      afterEach(() => {
        delete (globalThis as { fetch?: CallableFunction }).fetch;
      });

      it('collects all files across merge request pages', async () => {
        const mrData = await gl.getPullDetails(fakePullInfo, 'token');
        expect(mrData.info.base.sha).to.equal('baseSha');
        expect(mrData.info.head.sha).to.equal('headSha');
        expect(mrData.files).to.have.length(120);
        expect(mrData.files[0].filename).to.equal('file.pkg');
        expect(mrData.files[119].filename).to.equal('file.pkg');
      });
    });
  });

  describe('BitBucket Adapter', () => {
    describe('getCommitDetails()', () => {
      const fakeCommitInfo = {
        owner: 'foo',
        repo: 'bar',
        commitHash: '123abc',
      };

      beforeEach(() => {
        (globalThis as { fetch?: CallableFunction }).fetch = (input: URL | RequestInfo) => {
          const url = typeof input === 'string' ? input : (input as Request).url;
          if (
            url ===
            'https://api.bitbucket.org/2.0/repositories/foo%2Fbar/commit/123abc'
          ) {
            return Promise.resolve(
              new Response(JSON.stringify({ parents: [{ hash: 'p1' }] }), {
                status: 200,
              }),
            );
          }
          if (
            url.startsWith(
              'https://api.bitbucket.org/2.0/repositories/foo%2Fbar/diffstat/123abc',
            )
          ) {
            const pageParam = new URL(url).searchParams.get('page');
            const page = pageParam ? Number(pageParam) : 1;
            const count = page === 1 ? 100 : 20;
            const batch = Array.from({ length: count }, () => ({
              status: 'modified',
              lines_added: 1,
              lines_removed: 1,
              new: { path: 'f.pkg' },
              old: { path: 'f.pkg' },
            }));
            const body: Record<string, unknown> = { values: batch };
            if (page === 1) {
              body.next =
                'https://api.bitbucket.org/2.0/repositories/foo%2Fbar/diffstat/123abc?page=2';
            }
            return Promise.resolve(
              new Response(JSON.stringify(body), { status: 200 }),
            );
          }
          return Promise.reject(new Error('Unexpected fetch: ' + url));
        };
      });

      afterEach(() => {
        delete (globalThis as { fetch?: CallableFunction }).fetch;
      });

      it('collects all files across commit pages', async () => {
        const commitData = await bb.getCommitDetails(fakeCommitInfo, 'token');
        expect(commitData.sha).to.equal('123abc');
        expect(commitData.parents[0].sha).to.equal('p1');
        expect(commitData.files).to.have.length(120);
      });
    });

    describe('getPullDetails()', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };

      beforeEach(() => {
        (globalThis as { fetch?: CallableFunction }).fetch = (input: URL | RequestInfo) => {
          const url = typeof input === 'string' ? input : (input as Request).url;
          const u = new URL(url);

          if (u.pathname === '/2.0/repositories/foo%2Fbar/pullrequests/1') {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  source: { commit: { hash: 'headSha' } },
                  destination: { commit: { hash: 'baseSha' } },
                }),
                { status: 200, headers: new Headers() },
              ),
            );
          }

          if (
            u.pathname === '/2.0/repositories/foo%2Fbar/pullrequests/1/diffstat'
          ) {
            const pageParam = new URL(url).searchParams.get('page');
            const page = pageParam ? Number(pageParam) : 1;
            const count = page === 1 ? 100 : 20;
            const batch = Array.from({ length: count }, () => ({
              status: 'modified',
              lines_added: 1,
              lines_removed: 1,
              new: { path: 'f.pkg' },
              old: { path: 'f.pkg' },
            }));
            const body: Record<string, unknown> = { values: batch };
            if (page === 1) {
              body.next =
                'https://api.bitbucket.org/2.0/repositories/foo%2Fbar/pullrequests/1/diffstat?page=2';
            }
            return Promise.resolve(
              new Response(JSON.stringify(body), { status: 200 }),
            );
          }
          return Promise.reject(new Error('Unexpected fetch: ' + url));
        };
      });

      afterEach(() => {
        delete (globalThis as { fetch?: CallableFunction }).fetch;
      });

      it('collects all files across merge request pages', async () => {
        const mrData = await bb.getPullDetails(fakePullInfo, 'token');
        expect(mrData.info.base.sha).to.equal('baseSha');
        expect(mrData.info.head.sha).to.equal('headSha');
        expect(mrData.files).to.have.length(120);
        expect(mrData.files[0].filename).to.equal('f.pkg');
        expect(mrData.files[119].filename).to.equal('f.pkg');
      });
    });
  });
});
