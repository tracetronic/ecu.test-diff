import { BaseScmAdapter, scmAdapters } from '../src/scm.js';

interface GlobalWithFetch extends GlobalThis {
  fetch?: (input: RequestInfo | { url: string }) => Promise<Response>;
}

export const globalWithFetch = globalThis as GlobalWithFetch;

export type InternalAdapterMethodsGithub = BaseScmAdapter & {
  testCommit: typeof scmAdapters.github.prototype.testCommit;
  testPullRequest: typeof scmAdapters.github.prototype.testPullRequest;
  handlePullRequest: typeof scmAdapters.github.prototype.handlePullRequest;
  getPullDetails: typeof scmAdapters.github.prototype.getPullDetails;
  handleCommit: typeof scmAdapters.github.prototype.handleCommit;
  getCommitDetails: typeof scmAdapters.github.prototype.getCommitDetails;
  getApiUrl: typeof scmAdapters.github.prototype.getApiUrl;
  createHeaders: typeof scmAdapters.github.prototype.createHeaders;
};

export type InternalAdapterMethodsGitlab = BaseScmAdapter & {
  testCommit: typeof scmAdapters.gitlab.prototype.testCommit;
  testPullRequest: typeof scmAdapters.gitlab.prototype.testPullRequest;
  handlePullRequest: typeof scmAdapters.gitlab.prototype.handlePullRequest;
  getPullDetails: typeof scmAdapters.gitlab.prototype.getPullDetails;
  handleCommit: typeof scmAdapters.gitlab.prototype.handleCommit;
  getCommitDetails: typeof scmAdapters.gitlab.prototype.getCommitDetails;
  getApiUrl: typeof scmAdapters.gitlab.prototype.getApiUrl;
  createHeaders: typeof scmAdapters.gitlab.prototype.createHeaders;
  parseStats: typeof scmAdapters.gitlab.prototype.parseStats;
  processChanges: typeof scmAdapters.gitlab.prototype.processChanges;
};

// Helper to create scm adapter instances for tests that make internal methods accessible
export function createScmAdaptersForTests() {
  const gh = new scmAdapters.github({
    host: 'github.com',
    scm: 'github',
  }) as unknown as InternalAdapterMethodsGithub;
  const gl = new scmAdapters.gitlab({
    host: 'gitlab.com',
    scm: 'gitlab',
  }) as unknown as InternalAdapterMethodsGitlab;
  return { gh, gl };
}
