import expect from 'expect.js';
import { createScmAdaptersForTests } from './utils.js';

const GITHUB_REPO = 'https://github.com/foo/bar';
const GITLAB_REPO = 'https://gitlab.com/foo/bar';
const BITBUCKET_REPO = 'https://bitbucket.org/foo/bar';
const GITHUB_PR_VARIANTS = [
  '',
  'commits',
  'commits/123abc',
  'checks',
  'files',
  'unexisting_subpage',
];
const GITLAB_MR_VARIANTS = [
  '',
  'commits',
  'commits/123abc',
  'pipelines',
  'diffs',
  'unexisting_subpage',
];
const BITBUCKET_PR_VARIANTS = [
  '',
  'overview',
  'commits',
  'diff',
  'diff#chg-file.ext',
  'unexisting_subpage',
];

const { gh, gl, bb } = createScmAdaptersForTests();

describe('URL Detection', () => {
  describe('GitHub Adapter', () => {
    it('recognizes valid commit URLs', () => {
      const url = new URL(`${GITHUB_REPO}/commit/123abc`);
      expect(gh.testCommit(url)).to.not.equal(null);
      expect(gh.testPullRequest(url)).to.equal(null);
    });

    it('returns null for invalid commit URLs', () => {
      [
        `${GITHUB_REPO}/commit`,
        `${GITHUB_REPO}/commits`,
        `${GITHUB_REPO}/commit/`,
      ].forEach((urlStr) => {
        const url = new URL(urlStr);
        expect(gh.testCommit(url)).to.equal(null);
        expect(gh.testPullRequest(url)).to.equal(null);
      });
    });

    it('recognizes valid pull request URLs (including subpages)', () => {
      GITHUB_PR_VARIANTS.forEach((suffix) => {
        const url = new URL(`${GITHUB_REPO}/pull/1/${suffix}`);
        expect(gh.testPullRequest(url)).to.not.equal(null);
        expect(gh.testCommit(url)).to.equal(null);
      });
    });

    it('returns null for invalid pull request URLs', () => {
      const url = new URL(`${GITHUB_REPO}/pull`);
      expect(gh.testCommit(url)).to.equal(null);
      expect(gh.testPullRequest(url)).to.equal(null);
    });
  });

  describe('GitLab Adapter', () => {
    it('recognizes valid commit URLs', () => {
      const url = new URL(`${GITLAB_REPO}/-/commit/123abc`);
      expect(gl.testCommit(url)).to.not.equal(null);
      expect(gl.testPullRequest(url)).to.equal(null);
    });

    it('returns null for invalid commit URLs', () => {
      [
        `${GITLAB_REPO}/-/commit`,
        `${GITLAB_REPO}/-/commits`,
        `${GITLAB_REPO}/-/commit/`,
      ].forEach((urlStr) => {
        const url = new URL(urlStr);
        expect(gl.testCommit(url)).to.equal(null);
        expect(gl.testPullRequest(url)).to.equal(null);
      });
    });

    it('recognizes valid merge request URLs (including subpages)', () => {
      GITLAB_MR_VARIANTS.forEach((suffix) => {
        const url = new URL(`${GITLAB_REPO}/-/merge_requests/1/${suffix}`);
        expect(gl.testPullRequest(url)).to.not.equal(null);
        expect(gl.testCommit(url)).to.equal(null);
      });
    });

    it('returns null for invalid merge request URLs', () => {
      const url = new URL(`${GITLAB_REPO}/-/merge_requests`);
      expect(gl.testCommit(url)).to.equal(null);
      expect(gl.testPullRequest(url)).to.equal(null);
    });
  });

  describe('BitBucket Adapter', () => {
    it('recognizes valid commit URLs', () => {
      const url = new URL(`${BITBUCKET_REPO}/commits/123abc`);
      expect(bb.testCommit(url)).to.not.equal(null);
      expect(bb.testPullRequest(url)).to.equal(null);
    });

    it('returns null for invalid commit URLs', () => {
      [
        `${BITBUCKET_REPO}/commit`,
        `${BITBUCKET_REPO}/commits`,
        `${BITBUCKET_REPO}/commit/`,
      ].forEach((urlStr) => {
        const url = new URL(urlStr);
        expect(bb.testCommit(url)).to.equal(null);
        expect(bb.testPullRequest(url)).to.equal(null);
      });
    });

    it('recognizes valid pull request URLs (including subpages)', () => {
      BITBUCKET_PR_VARIANTS.forEach((suffix) => {
        const url = new URL(`${BITBUCKET_REPO}/pull-requests/1/${suffix}`);
        expect(bb.testPullRequest(url)).to.not.equal(null);
        expect(bb.testCommit(url)).to.equal(null);
      });
    });

    it('returns null for invalid merge request URLs', () => {
      const url = new URL(`${GITLAB_REPO}/pull-requests`);
      expect(bb.testCommit(url)).to.equal(null);
      expect(bb.testPullRequest(url)).to.equal(null);
    });
  });
});
