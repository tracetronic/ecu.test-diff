import { BaseScmAdapter, CommitInfo, PullInfo, CommonChange } from './base.ts';
import { ModifiedFile } from '../types';

type GitlabChange = {
  diff: string;
  new_path: string;
  old_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  generated_file: boolean | null;
};

export class Gitlab extends BaseScmAdapter {
  protected testCommit(url: URL): CommitInfo | null {
    // https://myhost/mygroup/myproject/-/commit/7afcf8cd245c29bb424543cef583947230166ae4e
    const result = /\/(.*?)\/(.*?)\/-\/commit\/([a-z0-9]+)$/.exec(url.pathname);

    if (result)
      return { owner: result[1], repo: result[2], commitHash: result[3] };
    return null;
  }

  protected testPullRequest(url: URL): PullInfo | null {
    const result = /\/(.*?)\/(.*?)\/-\/merge_requests\/([0-9]+)\/?/.exec(
      url.pathname,
    );

    if (result)
      return { owner: result[1], repo: result[2], pullNumber: result[3] };
    return null;
  }

  private parseStats(diff: string): { additions: number; deletions: number } {
    let additions = 0;
    let deletions = 0;
    const result = diff.matchAll(/\r?\n([+-])/g);
    [...result].forEach((entry) => {
      if (entry[1] == '+') {
        additions += 1;
      } else {
        deletions += 1;
      }
    });
    return { additions, deletions };
  }

  private processChanges(changes: GitlabChange[]): CommonChange[] {
    return changes
      .filter((change) => this.isSupportedFile(change.new_path))
      .map((change: GitlabChange) => {
        const stats = this.parseStats(change.diff);
        return {
          filename: change.new_path,
          filenameOld: change.old_path,
          new: change.new_file,
          renamed: change.renamed_file,
          deleted: change.deleted_file,
          ...stats,
        };
      });
  }
  
  protected override getHttpErrorMessages(): Record<number, string> {
    return {
      401: 'Unauthorized: Invalid or missing token.',
      403: 'Forbidden: Insufficient scope. Make sure to give permission "read_api".',
      404: 'Not found: You may not have access to this repository.',
    };
  }

  private async fetchPaginated<T>(
    url: string,
    token: string,
    perPage = 100,
  ): Promise<T[]> {
    let page = 1;
    let totalPages = 1;
    const allItems: T[] = [];

    do {
      const response = await fetch(`${url}?per_page=${perPage}&page=${page}`, {
        headers: this.createHeaders(token),
      });
      if (!response.ok) {
        throw this.buildHttpError(response, `paginated data (page ${page})`);
      }
      if (page === 1) {
        const tp = response.headers.get('x-total-pages');
        totalPages = tp ? parseInt(tp, 10) : 1;
      }
      const batch: T[] = await response.json();
      allItems.push(...batch);
      page++;
    } while (page <= totalPages);

    return allItems;
  }

  private async getCommitDetails(
    commitInfo: CommitInfo,
    token: string,
  ): Promise<{
    sha: string;
    parents: { sha: string }[];
    files: CommonChange[];
  }> {
    const namespace = encodeURIComponent(
      `${commitInfo.owner}/${commitInfo.repo}`,
    );
    const commitUrl = `${this.getApiUrl()}/projects/${namespace}/repository/commits/${commitInfo.commitHash}`;

    const response = await fetch(commitUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw this.buildHttpError(response, 'commit details');
    }
    const commitData = await response.json();

    const diffUrl = `${this.getApiUrl()}/projects/${namespace}/repository/commits/${commitInfo.commitHash}/diff`;
    const allChanges: GitlabChange[] = await this.fetchPaginated(
      diffUrl,
      token,
    );

    const files = this.processChanges(allChanges);
    const parents = commitData.parent_ids.map((id: string) => ({ sha: id }));

    return {
      sha: commitInfo.commitHash,
      parents,
      files,
    };
  }

  protected async handleCommit(
    commitInfo: CommitInfo,
    token: string,
  ): Promise<ModifiedFile[]> {
    const commitData = await this.getCommitDetails(commitInfo, token);

    if (!commitData.files || !Array.isArray(commitData.files)) {
      throw new Error('Unable to retrieve modified files from commitData.');
    }

    const namespace = encodeURIComponent(
      `${commitInfo.owner}/${commitInfo.repo}`,
    );
    const baseApiUrl = `${this.getApiUrl()}/projects/${namespace}/repository/files`;

    // commitData.parents[0] is probably empty if this is the first commit
    const shaOld = commitData.parents[0]?.sha || commitData.sha;
    const shaNew = commitData.sha;
    const modifiedFiles = commitData.files.map((file) => {
      return {
        filename: file.filename,
        filenameOld: file.filenameOld,
        new: file.new,
        deleted: file.deleted,
        renamed: file.renamed,
        additions: file.additions,
        deletions: file.deletions,
        shaOld,
        shaNew,
        download: {
          type: 'raw' as const,
          old: `${baseApiUrl}/${file.filenameOld.replace(
            /\//g,
            '%2f',
          )}/raw?ref=${shaOld}`,
          new: `${baseApiUrl}/${file.filename.replace(/\//g, '%2f')}/raw?ref=${
            shaNew
          }`,
        },
      };
    });

    return modifiedFiles;
  }

  private async getPullDetails(
    pullInfo: PullInfo,
    token: string,
  ): Promise<{
    info: {
      head: { sha: string };
      base: { sha: string };
    };
    files: CommonChange[];
  }> {
    const namespace = encodeURIComponent(`${pullInfo.owner}/${pullInfo.repo}`);
    const diffsUrl = `${this.getApiUrl()}/projects/${namespace}/merge_requests/${pullInfo.pullNumber}/diffs`;
    const allChanges: GitlabChange[] = await this.fetchPaginated<GitlabChange>(
      diffsUrl,
      token,
    );
    const files: CommonChange[] = this.processChanges(allChanges);

    const response = await fetch(
      `${this.getApiUrl()}/projects/${namespace}/merge_requests/${pullInfo.pullNumber}`,
      { headers: this.createHeaders(token) },
    );
    if (!response.ok) {
      throw this.buildHttpError(response, 'merge request details');
    }
    const pullData = await response.json();

    return {
      info: {
        head: { sha: pullData.diff_refs.head_sha },
        base: { sha: pullData.diff_refs.base_sha },
      },
      files,
    };
  }

  protected async handlePullRequest(
    pullInfo: PullInfo,
    token: string,
  ): Promise<ModifiedFile[]> {
    const pullData = await this.getPullDetails(pullInfo, token);
    const namespace = encodeURIComponent(`${pullInfo.owner}/${pullInfo.repo}`);
    const baseApiUrl = `${this.getApiUrl()}/projects/${namespace}/repository/files`;

    // pullData.info.base.sha is probably not set if target branch has no commit yet
    const shaOld = pullData.info.base.sha || pullData.info.head.sha;
    const shaNew = pullData.info.head.sha;
    const modifiedFiles = pullData.files.map((file) => {
      return {
        filename: file.filename,
        filenameOld: file.filenameOld,
        new: file.new,
        deleted: file.deleted,
        renamed: file.renamed,
        additions: file.additions,
        deletions: file.deletions,
        shaOld,
        shaNew,
        download: {
          type: 'raw' as const,
          old: `${baseApiUrl}/${file.filenameOld.replace(
            /\//g,
            '%2f',
          )}/raw?ref=${shaOld}`,
          new: `${baseApiUrl}/${file.filename.replace(/\//g, '%2f')}/raw?ref=${
            shaNew
          }`,
        },
      };
    });

    return modifiedFiles;
  }

  protected createHeaders(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  protected getApiUrl(): string {
    return `https://${this.hostInfo.host}/api/v4`;
  }
  async test(token: string): Promise<boolean> {
    const url = this.getApiUrl() + '/metadata';
    try {
      const response = await fetch(url, { headers: this.createHeaders(token) });

      return (
        response.ok ||
        (response.status == 403 &&
          response.headers.get('x-gitlab-meta') != null)
      );
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
