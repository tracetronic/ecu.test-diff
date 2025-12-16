import expect from 'expect.js';
import { createScmAdaptersForTests, globalWithFetch } from './utils.js';
const { gh, gl } = createScmAdaptersForTests();

function mockGithubPullFetch(fileCount = 120) {
  globalWithFetch.fetch = (input: RequestInfo | { url: string }) => {
    const url = typeof input === 'string' ? input : input.url;
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
      const page = Number(new URL(url).searchParams.get('page')) || 1;
      if (fileCount <= 100) {
        // Only one page
        const batch = Array(fileCount).fill({
          filename: `f1.pkg`,
          previous_filename: `f1.pkg`,
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
      } else {
        // Pagination: first page 100, second page fileCount-100
        const count = page === 1 ? 100 : fileCount - 100;
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
    }
    return Promise.reject(new Error('Unexpected fetch: ' + url));
  };
}

const GITLAB_FILE_BASE = {
  diff: '+a\n-b',

  new_file: false,
  renamed_file: false,
  deleted_file: false,
  generated_file: null,
};

function mockGitlabCommitFetch(fileCount = 120) {
  globalWithFetch.fetch = (input: RequestInfo | { url: string }) => {
    const url = typeof input === 'string' ? input : input.url;

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
      const page = Number(new URL(url).searchParams.get('page')) || 1;
      const gitlabFile = {
        ...GITLAB_FILE_BASE,
        new_path: `${page}.pkg`,
        old_path: `${page}.pkg`,
      };
      if (fileCount <= 100) {
        const batch = Array(fileCount).fill(gitlabFile);
        const headers = new Headers({ 'x-total-pages': '1' });
        return Promise.resolve(
          new Response(JSON.stringify(batch), { status: 200, headers }),
        );
      } else {
        const count = page === 1 ? 100 : fileCount - 100;
        const batch = Array(count).fill(gitlabFile);
        const headers = new Headers({ 'x-total-pages': '2' });
        return Promise.resolve(
          new Response(JSON.stringify(batch), { status: 200, headers }),
        );
      }
    }
    return Promise.reject(new Error('Unexpected fetch: ' + url));
  };
}

function mockGitlabPullFetch(fileCount = 120) {
  globalWithFetch.fetch = (input: RequestInfo | { url: string }) => {
    const url = typeof input === 'string' ? input : input.url;
    const u = new URL(url);

    if (
      u.pathname.toLocaleLowerCase() ===
        '/api/v4/projects/foo%2fbar/merge_requests/1' &&
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
      u.pathname.toLocaleLowerCase() ===
        '/api/v4/projects/foo%2fbar/merge_requests/1/diffs' &&
      u.searchParams.has('page')
    ) {
      const page = Number(u.searchParams.get('page')) || 1;
      const gitlabFile = {
        ...GITLAB_FILE_BASE,
        new_path: `${page}.pkg`,
        old_path: `${page}.pkg`,
      };
      if (fileCount <= 100) {
        const batch = Array(fileCount).fill(gitlabFile);
        const headers = new Headers({ 'x-total-pages': '1' });
        return Promise.resolve(
          new Response(JSON.stringify(batch), { status: 200, headers }),
        );
      } else {
        const count = page === 1 ? 100 : fileCount - 100;
        const batch = Array(count).fill(gitlabFile);
        const headers = new Headers({ 'x-total-pages': '2' });
        return Promise.resolve(
          new Response(JSON.stringify(batch), { status: 200, headers }),
        );
      }
    }
    return Promise.reject(new Error('Unexpected fetch: ' + url));
  };
}

function clearFetchMock() {
  delete globalWithFetch.fetch;
}

describe('Commit and Pull Details', () => {
  describe('GitHub Adapter', () => {
    describe('getPullDetails()', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };

      afterEach(clearFetchMock);

      it('collects all files across pull request pages (pagination)', async () => {
        mockGithubPullFetch(120);
        const prData = await gh.getPullDetails(fakePullInfo, 'token');
        expect(prData.info.base.sha).to.equal('baseSha');
        expect(prData.info.head.sha).to.equal('headSha');
        expect(prData.files).to.have.length(120);
        expect(prData.files[0].filename).to.equal('f1.pkg');
        expect(prData.files[119].filename).to.equal('f2.pkg');
      });

      it('collects all files when only one page is returned (no pagination)', async () => {
        mockGithubPullFetch(5);
        const prData = await gh.getPullDetails(fakePullInfo, 'token');
        expect(prData.info.base.sha).to.equal('baseSha');
        expect(prData.info.head.sha).to.equal('headSha');
        expect(prData.files).to.have.length(5);
        expect(prData.files[0].filename).to.equal('f1.pkg');
        expect(prData.files[4].filename).to.equal('f1.pkg');
      });
    });
  });

  describe('GitLab Adapter', () => {
    describe('getCommitDetails()', () => {
      const fakeCommitInfo = {
        owner: 'foo',
        repo: 'bar',
        commitHash: '123abc',
      };

      afterEach(clearFetchMock);

      it('collects all files across commit pages (pagination)', async () => {
        mockGitlabCommitFetch(120);
        const commitData = await gl.getCommitDetails(fakeCommitInfo, 'token');
        expect(commitData.sha).to.equal('123abc');
        expect(commitData.parents[0].sha).to.equal('p1');
        expect(commitData.files).to.have.length(120);
      });

      it('collects all files when only one page is returned (no pagination)', async () => {
        mockGitlabCommitFetch(5);
        const commitData = await gl.getCommitDetails(fakeCommitInfo, 'token');
        expect(commitData.sha).to.equal('123abc');
        expect(commitData.parents[0].sha).to.equal('p1');
        expect(commitData.files).to.have.length(5);
      });
    });

    describe('getPullDetails()', () => {
      const fakePullInfo = { owner: 'foo', repo: 'bar', pullNumber: '1' };

      afterEach(clearFetchMock);

      it('collects all files across merge request pages (pagination)', async () => {
        mockGitlabPullFetch(120);
        const mrData = await gl.getPullDetails(fakePullInfo, 'token');
        expect(mrData.info.base.sha).to.equal('baseSha');
        expect(mrData.info.head.sha).to.equal('headSha');
        expect(mrData.files).to.have.length(120);
        expect(mrData.files[0].filename).to.equal('1.pkg');
        expect(mrData.files[119].filename).to.equal('2.pkg');
      });

      it('collects all files when only one page is returned (no pagination)', async () => {
        mockGitlabPullFetch(5);
        const mrData = await gl.getPullDetails(fakePullInfo, 'token');
        expect(mrData.info.base.sha).to.equal('baseSha');
        expect(mrData.info.head.sha).to.equal('headSha');
        expect(mrData.files).to.have.length(5);
        expect(mrData.files[0].filename).to.equal('1.pkg');
        expect(mrData.files[4].filename).to.equal('1.pkg');
      });
    });
  });
});
