import { BaseScmAdapter, CommitInfo, PullInfo } from './base.ts';
import { ModifiedFile } from '../types';

type GithubCommitInfo = {
  files: GithubChangeFile[];
  parents: { sha: string }[];
  sha: string;
};

type GithubPullInfo = {
  info: { base: { sha: string }; head: { sha: string } };
  files: GithubChangeFile[];
};

type GithubChangeFile = {
  additions: number;
  deletions: number;
  changes: number;
  filename: string;
  previous_filename?: string;
  patch: string;
  sha: string;
  status: 'added' | 'renamed' | 'removed';
  blob_url: string;
  raw_url: string;
  content_url: string;
};

export class Github extends BaseScmAdapter {
  protected getApiUrl(): string {
    let url = null;

    if (this.hostInfo.host == 'github.com') {
      url = 'https://api.github.com';
    } else {
      url = `https://${this.hostInfo.host}/api/v3`;
    }
    return url;
  }
  protected createHeaders(token: string) {
    return { Authorization: `token ${token}` };
  }

  protected testCommit(url: URL): CommitInfo | null {
    // e.g., https://github.com/Mscht/PackageDiffTest/commit/fc33321adcf0ff9d697f64d32a6dfe5f5a12903a
    const result = /\/(.*?)\/(.*?)\/commit\/([a-z0-9]+)$/.exec(url.pathname);

    if (result)
      return { owner: result[1], repo: result[2], commitHash: result[3] };
    return null;
  }

  protected testPullRequest(url: URL): PullInfo | null {
    // e.g., https://github.com/Mscht/PackageDiffTest/pull/1
    // or https://github.com/Mscht/PackageDiffTest/pull/1/files
    const result = /\/(.*?)\/(.*?)\/pull\/(\d+)\/?/.exec(url.pathname);
    if (result)
      return { owner: result[1], repo: result[2], pullNumber: result[3] };
    return null;
  }

  protected override getHttpErrorMessages(): Record<number, string> {
    return {
      401: 'Unauthorized: Invalid or missing token.',
      403: 'Forbidden: If you use a fine-grained access token, make sure to give permissions "Content" and "Pull requests".',
      404: 'Not found: You may not have access to this repository.',
    };
  }

  private async fetchPaginated<T>(
    url: string,
    token: string,
    perPage = 100,
  ): Promise<T[]> {
    let page = 1;
    const allItems: T[] = [];
    let itemsOnPage: T[];

    do {
      const pageUrl = `${url}?per_page=${perPage}&page=${page}`;
      const response = await fetch(pageUrl, {
        headers: this.createHeaders(token),
      });
      if (!response.ok) {
        throw this.buildHttpError(response, `paginated data (page ${page})`);
      }
      itemsOnPage = await response.json();
      allItems.push(...itemsOnPage);
      page++;
    } while (itemsOnPage.length === perPage);

    return allItems;
  }

  private async getCommitDetails(
    commitInfo: CommitInfo,
    token: string,
  ): Promise<GithubCommitInfo> {
    const commitUrl = `${this.getApiUrl()}/repos/${commitInfo.owner}/${
      commitInfo.repo
    }/commits/${commitInfo.commitHash}`;

    const response = await fetch(commitUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw this.buildHttpError(response, 'commit details');
    }
    return await response.json();
  }

  protected async handleCommit(
    commitInfo: CommitInfo,
    token: string,
  ): Promise<ModifiedFile[]> {
    const commitData = await this.getCommitDetails(commitInfo, token);

    if (!commitData.files || !Array.isArray(commitData.files)) {
      throw new Error('Unable to retrieve modified files from commitData.');
    }

    const baseApiUrl = `${this.getApiUrl()}/repos/${commitInfo.owner}/${
      commitInfo.repo
    }`;
    return commitData.files
      .filter((f) => this.isSupportedFile(f.filename))
      .map((file) => {
        const filenameOld = file.previous_filename ?? file.filename;
        const shaOld = commitData.parents[0]?.sha;
        return {
          filename: file.filename,
          filenameOld,
          new: file.status == 'added',
          renamed: file.status == 'renamed',
          deleted: file.status == 'removed',
          additions: file.additions,
          deletions: file.deletions,
          shaOld,
          shaNew: commitData.sha,
          download: {
            type: 'json' as const,
            old: shaOld
              ? `${baseApiUrl}/contents/${filenameOld}?ref=${shaOld}`
              : null,
            new: `${baseApiUrl}/contents/${file.filename}?ref=${commitData.sha}`,
          },
        };
      });
  }

  private async getPullDetails(
    commitInfo: PullInfo,
    token: string,
  ): Promise<GithubPullInfo> {
    const pullUrl = `${this.getApiUrl()}/repos/${commitInfo.owner}/${
      commitInfo.repo
    }/pulls/${commitInfo.pullNumber}`;

    const response = await fetch(pullUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw this.buildHttpError(response, 'pull request details');
    }
    const info = await response.json();

    const pullFilesUrl = `${this.getApiUrl()}/repos/${commitInfo.owner}/${
      commitInfo.repo
    }/pulls/${commitInfo.pullNumber}/files`;
    const allFiles: GithubChangeFile[] =
      await this.fetchPaginated<GithubChangeFile>(pullFilesUrl, token);

    return { info, files: allFiles };
  }

  protected async handlePullRequest(
    pullInfo: PullInfo,
    token: string,
  ): Promise<ModifiedFile[]> {
    const pullData = await this.getPullDetails(pullInfo, token);
    const baseApiUrl = `${this.getApiUrl()}/repos/${pullInfo.owner}/${
      pullInfo.repo
    }`;

    return pullData.files
      .filter((f) => this.isSupportedFile(f.filename))
      .map((file) => {
        const filenameOld = file.previous_filename ?? file.filename;
        const shaOld = pullData.info.base.sha;
        return {
          filename: file.filename,
          filenameOld,
          new: file.status == 'added',
          renamed: file.status == 'renamed',
          deleted: file.status == 'removed',
          additions: file.additions,
          deletions: file.deletions,
          shaOld,
          shaNew: pullData.info.head.sha,
          download: {
            type: 'json' as const,
            old: `${baseApiUrl}/contents/${filenameOld}?ref=${shaOld}`,
            new: `${baseApiUrl}/contents/${file.filename}?ref=${pullData.info.head.sha}`,
          },
        };
      });
  }
}
