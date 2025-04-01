// SPDX-FileCopyrightText: 2025 tracetronic GmbH
//
// SPDX-License-Identifier: MIT

import browser from 'webextension-polyfill';
import { HostInfo, ModifiedFile, SUPPORTED_FILES } from './types.js';
import { Buffer } from 'buffer';

// types for responses objects of github and gitlab and generalized types for common usage
type CommitInfo = {
  owner: string;
  repo: string;
  commitHash: string;
};

type PullInfo = {
  owner: string;
  repo: string;
  pullNumber: string;
};

type GithubCommitInfo = {
  files: GithubChangeFile[];
  parents: { sha: string }[];
  sha: string;
};

type GithubPullInfo = {
  info: { base: { sha: string }; head: { sha: string } };
  files: GithubChangeFile[];
};

type CommonChange = {
  filename: string;
  filenameOld: string;
  new: boolean;
  renamed: boolean;
  deleted: boolean;
  additions: number;
  deletions: number;
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

abstract class BaseScmAdapter {
  hostInfo: HostInfo;
  constructor(hostInfo: HostInfo) {
    this.hostInfo = hostInfo;
  }
  protected abstract getApiUrl(): string;

  protected abstract createHeaders(token: string): { Authorization: string };

  async test(token: string): Promise<boolean> {
    const url = this.getApiUrl();
    try {
      const response = await fetch(url, { headers: this.createHeaders(token) });
      return response.ok;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  protected isSupportedFile(filename: string): boolean {
    const ext = filename.split('.').pop();
    return SUPPORTED_FILES.includes(ext);
  }

  async fetchModifiedFiles(
    url: string,
    token: string,
  ): Promise<ModifiedFile[]> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error(`Not avalid URL: ${url}`);
    }

    const commitInfo = this.testCommit(parsedUrl);
    console.debug('test commit:', commitInfo);
    if (commitInfo) {
      return this.handleCommit(commitInfo, token);
    } else {
      const pullInfo = this.testPullRequest(parsedUrl);
      console.debug('test pull request', pullInfo);
      if (pullInfo !== null) {
        return this.handlePullRequest(pullInfo, token);
      } else {
        throw new Error('Not a GitHub commit or pull request page.');
      }
    }
  }

  protected abstract testCommit(url: URL): CommitInfo | null;
  protected abstract testPullRequest(url: URL): PullInfo | null;
  protected abstract handleCommit(
    commitInfo: CommitInfo,
    token: string,
  ): Promise<ModifiedFile[]>;
  protected abstract handlePullRequest(
    pullInfo: PullInfo,
    token: string,
  ): Promise<ModifiedFile[]>;

  private async downloadDummy(filename: string, suffix: string) {
    const [basename, fileExtension] = filename
      .split('/')
      .slice(-1)[0]
      .split('.');
    const downloadName = `diff/${basename}/${
      basename + suffix
    }.${fileExtension}`;
    const mimeType = `text/${
      fileExtension === 'txt' ? 'plain' : fileExtension
    }`;
    const downloadUrl = `data:${mimeType};charset=utf-8,`;
    return this.doDownload(downloadUrl, downloadName);
  }

  private async doDownload(
    downloadUrl: string,
    downloadName: string,
  ): Promise<string> {
    const downloadId = await browser.downloads.download({
      url: downloadUrl,
      filename: downloadName,
      conflictAction: 'overwrite',
    });

    if (downloadId === undefined) throw new Error('Failed to start download');

    return new Promise((resolve, reject) => {
      browser.downloads.onChanged.addListener(async function onChanged(
        downloadDelta,
      ) {
        if (
          downloadDelta.id === downloadId &&
          downloadDelta.state &&
          downloadDelta.state.current === 'complete'
        ) {
          const downloadItems = await browser.downloads.search({
            id: downloadId,
          });

          if (downloadItems.length > 0) {
            resolve(downloadItems[0].filename);
          } else {
            reject(new Error('Failed to retrieve download item'));
          }
          browser.downloads.onChanged.removeListener(onChanged);
          browser.downloads.erase({ id: downloadId });
        }
      });
    });
  }

  private async doDownloadFile(
    url: string,
    type: 'raw' | 'json',
    filename: string,
    suffix: string,
    token: string,
    sha: string,
  ): Promise<string> {
    const [basename, fileExtension] = filename
      .split('/')
      .slice(-1)[0]
      .split('.');
    const downloadName = `diff/${basename}/${
      basename + suffix
    }.${fileExtension}`;

    const mimeType = `text/${
      fileExtension === 'txt' ? 'plain' : fileExtension
    }`;

    console.debug(`Download file ${filename} from ${url} as ${downloadName}`);
    const response = await fetch(url, { headers: this.createHeaders(token) });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch file ${filename} for commit ${sha} via ${url}: ${response.statusText}`,
      );
    }
    let content: Buffer;
    let downloadUrl: string;

    const supportsObjectURL = !!URL.createObjectURL;

    if (type == 'json') {
      const fileData = await response.json();

      content = Buffer.from(fileData.content, 'base64');
      downloadUrl = `data:${mimeType};base64,${fileData.content}`;
      if (supportsObjectURL) {
        const res = await fetch(downloadUrl);
        downloadUrl = URL.createObjectURL(await res.blob());
      }
    } else if (type == 'raw') {
      if (supportsObjectURL) {
        downloadUrl = URL.createObjectURL(await response.blob());
      } else {
        content = Buffer.from(await (await response.blob()).arrayBuffer());
        downloadUrl = `data:${mimeType};base64,${encodeURIComponent(
          content.toString('base64'),
        )}`;
      }
    } else {
      throw new Error(`Unknown download type: ${type}`);
    }

    try {
      return await this.doDownload(downloadUrl, downloadName);
    } finally {
      if (supportsObjectURL) URL.revokeObjectURL(downloadUrl);
    }
  }

  async downloadDiff(file: ModifiedFile, token: string) {
    let oldFile = '';
    if (!file.new) {
      oldFile = await this.doDownloadFile(
        file.download.old,
        file.download.type,
        file.filename,
        '_old',
        token,
        file.shaOld,
      );
    } else {
      oldFile = await this.downloadDummy(file.filename, '_old');
    }

    let newFile = '';
    if (!file.deleted) {
      newFile = await this.doDownloadFile(
        file.download.new,
        file.download.type,
        file.filename,
        '_new',
        token,
        file.shaNew,
      );
    } else {
      newFile = await this.downloadDummy(file.filename, '_new');
    }

    const protocolUrl = encodeURI(
      `tracetronic://diff?file1=${oldFile}&file2=${newFile}&cleanup=True`,
    );
    await browser.tabs.update({ url: protocolUrl });
  }

  async downloadFile(file: ModifiedFile, what: 'old' | 'new', token: string) {
    const theFile = await this.doDownloadFile(
      file.download[what],
      file.download.type,
      file.filename,
      what == 'old' ? file.filenameOld : '_' + what,
      token,
      what == 'old' ? file.shaOld : file.shaNew,
    );
    const protocolUrl = encodeURI(`tracetronic:///${theFile}`);
    await browser.tabs.update({ url: protocolUrl });
  }
}

class Github extends BaseScmAdapter {
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
      throw new Error(
        `Failed to retrieve commit details: ${response.statusText}`,
      );
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
    const modifiedFiles = commitData.files.map((file) => {
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

    return modifiedFiles;
  }

  private async getPullDetails(
    commitInfo: PullInfo,
    token: string,
  ): Promise<GithubPullInfo> {
    const pullUrl = `${this.getApiUrl()}/repos/${commitInfo.owner}/${
      commitInfo.repo
    }/pulls/${commitInfo.pullNumber}`;

    let response = await fetch(pullUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to retrieve commit details: ${response.statusText}`,
      );
    }
    const info = await response.json();

    const pullFilesUrl = `${this.getApiUrl()}/repos/${commitInfo.owner}/${
      commitInfo.repo
    }/pulls/${commitInfo.pullNumber}/files`;
    response = await fetch(pullFilesUrl, {
      headers: this.createHeaders(token),
    });
    const files = await response.json();

    return { info, files };
  }

  protected async handlePullRequest(
    pullInfo: PullInfo,
    token: string,
  ): Promise<ModifiedFile[]> {
    const pullData = await this.getPullDetails(pullInfo, token);
    const baseApiUrl = `${this.getApiUrl()}/repos/${pullInfo.owner}/${
      pullInfo.repo
    }`;
    const modifiedFiles = pullData.files.map((file) => {
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
          old: `${baseApiUrl}/contents/${file.filename}?ref=${shaOld}`,
          new: `${baseApiUrl}/contents/${file.filename}?ref=${pullData.info.head.sha}`,
        },
      };
    });
    return modifiedFiles;
  }
}

class Gitlab extends BaseScmAdapter {
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

  private async getCommitDetails(
    commitInfo: CommitInfo,
    token: string,
  ): Promise<{
    sha: string;
    parents: { sha: string }[];
    files: CommonChange[];
  }> {
    // get project id
    const commitUrl = `${this.getApiUrl()}/projects/${commitInfo.owner}%2F${
      commitInfo.repo
    }/repository/commits/${commitInfo.commitHash}`;

    let response = await fetch(commitUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to retrieve commit details: [${response.status}] ${response.statusText}`,
      );
    }
    const commitData = await response.json();

    const diffUrl = `${this.getApiUrl()}/projects/${commitInfo.owner}%2F${
      commitInfo.repo
    }/repository/commits/${commitInfo.commitHash}/diff`;

    response = await fetch(diffUrl, {
      headers: this.createHeaders(token),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to retrieve commit details: [${response.status}] ${response.statusText}`,
      );
    }

    const diffData: GitlabChange[] = await response.json();
    const files = this.processChanges(diffData);
    const parents = commitData.parent_ids.map((id: string) => {
      return { sha: id };
    });

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

    const baseApiUrl = `${this.getApiUrl()}/projects/${commitInfo.owner}%2F${
      commitInfo.repo
    }/repository/files`;
    const modifiedFiles = commitData.files.map((file) => {
      return {
        filename: file.filename,
        filenameOld: file.filenameOld,
        new: file.new,
        deleted: file.deleted,
        renamed: file.renamed,
        additions: file.additions,
        deletions: file.deletions,
        shaOld: commitData.parents[0].sha,
        shaNew: commitData.sha,
        download: {
          type: 'raw' as const,
          old: `${baseApiUrl}/${file.filenameOld.replace(
            /\//g,
            '%2f',
          )}/raw?ref=${commitData.parents[0].sha}`,
          new: `${baseApiUrl}/${file.filename.replace(/\//g, '%2f')}/raw?ref=${
            commitData.sha
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
    const response = await fetch(
      `${this.getApiUrl()}/projects/${pullInfo.owner}%2f${
        pullInfo.repo
      }/merge_requests/${pullInfo.pullNumber}/changes`,
      { headers: this.createHeaders(token) },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to retrieve merge request details: [${response.status}] ${response.statusText}`,
      );
    }
    const pullData = await response.json();
    const files = this.processChanges(pullData.changes);

    return {
      info: {
        head: { sha: pullData.sha },
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
    const baseApiUrl = `${this.getApiUrl()}/projects/${pullInfo.owner}%2F${
      pullInfo.repo
    }/repository/files`;

    const modifiedFiles = pullData.files.map((file) => {
      return {
        filename: file.filename,
        filenameOld: file.filenameOld,
        new: file.new,
        deleted: file.deleted,
        renamed: file.renamed,
        additions: file.additions,
        deletions: file.deletions,
        shaOld: pullData.info.base.sha,
        shaNew: pullData.info.head.sha,
        download: {
          type: 'raw' as const,
          old: `${baseApiUrl}/${file.filenameOld.replace(
            /\//g,
            '%2f',
          )}/raw?ref=${pullData.info.base.sha}`,
          new: `${baseApiUrl}/${file.filename.replace(/\//g, '%2f')}/raw?ref=${
            pullData.info.head.sha
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

// export only the adapter lookup
export const scmAdapters = { github: Github, gitlab: Gitlab };
