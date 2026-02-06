import { AuthType, ModifiedFile } from '../types.ts';
import { normalizeHost } from '../utils.ts';
import { BaseScmAdapter, CommitInfo, CommonChange, PullInfo } from './base.ts';
import { Buffer } from 'buffer';

type BitbucketChange = {
  status: string;
  lines_added: number;
  lines_removed: number;
  new: { path: string };
  old?: { path: string };
};

export class Bitbucket extends BaseScmAdapter {
  private authType: AuthType = AuthType.Basic;

  public setAuthType(type: AuthType): void {
    this.authType = type;
  }

  protected getApiUrl(): string {
    const { hostname } = this.parseHostScope();
    if (hostname !== 'bitbucket.org') {
      throw new Error('Bitbucket Cloud only supports bitbucket.org');
    }
    return `https://api.${hostname}/2.0`;
  }

  protected createHeaders(token: string): { Authorization: string } {
    if (this.usesBearerAuth()) {
      return { Authorization: `Bearer ${token}` };
    }

    return { Authorization: `Basic ${Buffer.from(token).toString('base64')}` };
  }

  private parseHostScope() {
    const raw = normalizeHost(this.hostInfo.host);
    const [hostname, workspace, repo] = raw.split('/');
    return { hostname, workspace, repo };
  }

  private usesBearerAuth(): boolean {
    return this.authType === AuthType.Bearer;
  }

  async test(token: string): Promise<boolean> {
    const { workspace, repo } = this.parseHostScope();
    const baseUrl = this.getApiUrl();

    try {
      if (!this.usesBearerAuth()) {
        if (workspace || repo) return false;

        const response = await fetch(`${baseUrl}/user`, {
          headers: this.createHeaders(token),
        });
        // 403 means the read:user scope is missing, still a valid token
        return response.status === 200 || response.status === 403;
      }

      if (!workspace) return false;
      if (repo) {
        const response = await fetch(
          `${baseUrl}/repositories/${workspace}/${repo}`,
          {
            headers: this.createHeaders(token),
          },
        );
        return response.status === 200;
      }

      const response = await fetch(`${baseUrl}/repositories/${workspace}`, {
        headers: this.createHeaders(token),
      });
      return response.status === 200;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  protected testCommit(url: URL): CommitInfo | null {
    const result = /\/(.*?)\/(.*?)\/commits\/([a-z0-9]+)$/.exec(url.pathname);

    if (result)
      return { owner: result[1], repo: result[2], commitHash: result[3] };
    return null;
  }

  protected testPullRequest(url: URL): PullInfo | null {
    const result =
      /^\/([^/]+)\/([^/]+)\/pull-?requests?\/(\d+)(?:\/.*)?$/i.exec(
        url.pathname,
      );

    if (result)
      return { owner: result[1], repo: result[2], pullNumber: result[3] };
    return null;
  }

  private processChanges(changes: BitbucketChange[]): CommonChange[] {
    return changes
      .filter((change) => this.isSupportedFile(change.new.path))
      .map((change) => {
        const isAdded = change.status === 'added';
        const isRemoved = change.status === 'removed';
        const isRenamed = change.status === 'renamed';
        return {
          filename: change.new.path,
          filenameOld:
            isRenamed && change.old ? change.old.path : change.new.path,
          new: isAdded,
          renamed: isRenamed,
          deleted: isRemoved,
          additions: change.lines_added,
          deletions: change.lines_removed,
        };
      });
  }

  protected override getHttpErrorMessages(): Record<number, string> {
    return {
      401: 'Unauthorized: Invalid or missing token.',
      403: 'Forbidden: Your credentials lack one or more required privilege scopes.',
      404: 'Not found: You may not have access to this repository.',
    };
  }

  private async fetchPaginated<T>(url: string, token: string): Promise<T[]> {
    let results: T[] = [];
    let nextUrl: string | null = url;
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: this.createHeaders(token),
      });
      if (!response.ok) {
        throw this.buildHttpError(response, 'paginated data');
      }
      const data = await response.json();
      results = results.concat(data.values);
      nextUrl = data.next || null;
    }
    return results;
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
    const commitUrl = `${this.getApiUrl()}/repositories/${namespace}/commit/${commitInfo.commitHash}`;
    const response = await fetch(commitUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw this.buildHttpError(response, 'commit details');
    }
    const commitData = await response.json();

    const diffUrl = `${this.getApiUrl()}/repositories/${namespace}/diffstat/${commitInfo.commitHash}`;
    const allChanges: BitbucketChange[] = await this.fetchPaginated(
      diffUrl,
      token,
    );

    const files = this.processChanges(allChanges);
    const parents = Array.isArray(commitData.parents)
      ? commitData.parents.map(({ hash }: { hash: string }) => ({ sha: hash }))
      : [];
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
    const baseApiUrl = `${this.getApiUrl()}/repositories/${namespace}`;

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
          old: `${baseApiUrl}/src/${shaOld}/${file.filenameOld.replace(/\//g, '%2f')}`,
          new: `${baseApiUrl}/src/${shaNew}/${file.filename.replace(/\//g, '%2f')}`,
        },
      };
    });

    return modifiedFiles;
  }

  private async getPullDetails(
    pullInfo: PullInfo,
    token: string,
  ): Promise<{
    info: { head: { sha: string }; base: { sha: string } };
    files: CommonChange[];
  }> {
    const namespace = encodeURIComponent(`${pullInfo.owner}/${pullInfo.repo}`);
    const prUrl = `${this.getApiUrl()}/repositories/${namespace}/pullrequests/${pullInfo.pullNumber}`;
    const response = await fetch(prUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw this.buildHttpError(response, 'pull request details');
    }
    const prData = await response.json();

    const headSha = prData.source.commit.hash;
    const baseSha = prData.destination.commit.hash;

    const diffStatUrl = `${this.getApiUrl()}/repositories/${namespace}/pullrequests/${pullInfo.pullNumber}/diffstat`;
    const allChanges: BitbucketChange[] = await this.fetchPaginated(
      diffStatUrl,
      token,
    );

    const files = this.processChanges(allChanges);
    return { info: { head: { sha: headSha }, base: { sha: baseSha } }, files };
  }

  protected async handlePullRequest(
    pullInfo: PullInfo,
    token: string,
  ): Promise<ModifiedFile[]> {
    const pullData = await this.getPullDetails(pullInfo, token);

    const shaOld = pullData.info.base.sha || pullData.info.head.sha;
    const shaNew = pullData.info.head.sha;

    const namespace = encodeURIComponent(`${pullInfo.owner}/${pullInfo.repo}`);
    const baseApiUrl = `${this.getApiUrl()}/repositories/${namespace}`;

    const modifiedFiles = pullData.files.map((file) => ({
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
        old: `${baseApiUrl}/src/${shaOld}/${file.filenameOld.replace(/\//g, '%2f')}`,
        new: `${baseApiUrl}/src/${shaNew}/${file.filename.replace(/\//g, '%2f')}`,
      },
    }));
    return modifiedFiles;
  }
}
