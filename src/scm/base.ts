import browser from 'webextension-polyfill';
import { HostInfo, ModifiedFile, SUPPORTED_FILES } from '../types.ts';
import { Buffer } from 'buffer';

// types for responses objects of github and gitlab and generalized types for common usage
export type CommitInfo = {
  owner: string;
  repo: string;
  commitHash: string;
};

export type PullInfo = {
  owner: string;
  repo: string;
  pullNumber: string;
};

export type CommonChange = {
  filename: string;
  filenameOld: string;
  new: boolean;
  renamed: boolean;
  deleted: boolean;
  additions: number;
  deletions: number;
};

export abstract class BaseScmAdapter {
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

  protected getHttpErrorMessages(): Record<number, string> {
    return {};
  }

  protected buildHttpError(response: Response, context: string): Error {
    const map = this.getHttpErrorMessages();
    const statusMessage = map[response.status] ?? 'An unknown error occurred.';

    return new Error(`Failed to retrieve ${context}. ${statusMessage}`);
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new Error(`Not a valid URL: ${url}`);
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
        throw new Error('Not a commit or pull request page.');
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
    let downloadUrl: string;
    if (typeof URL.createObjectURL === 'function') {
      // firefox does not support data URL, use blob instead.
      // Firefox applies the file extension based on download name.
      const blob = new Blob([''], { type: 'text/plain' });
      downloadUrl = URL.createObjectURL(blob);
    } else {
      // chrome supports data URL. It applies the file extension based on data URL mime type.
      downloadUrl = `data:${mimeType};charset=utf-8,`;
    }

    try {
      return await this.doDownload(downloadUrl, downloadName);
    } finally {
      if (
        typeof URL.createObjectURL === 'function' &&
        downloadUrl.startsWith('blob:')
      ) {
        URL.revokeObjectURL(downloadUrl);
      }
    }
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
      browser.downloads.onChanged.addListener(
        async function onChanged(downloadDelta) {
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
        },
      );
    });
  }

  private calcShortHash(sha: string): string {
    return sha.substring(0, 8);
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
        `.${this.calcShortHash(file.shaOld)}.old`,
        token,
        file.shaOld,
      );
    } else {
      oldFile = await this.downloadDummy(
        file.filename,
        `.${this.calcShortHash(file.shaOld)}.old`,
      );
    }

    let newFile = '';
    if (!file.deleted) {
      newFile = await this.doDownloadFile(
        file.download.new,
        file.download.type,
        file.filename,
        `.${this.calcShortHash(file.shaNew)}.new`,
        token,
        file.shaNew,
      );
    } else {
      newFile = await this.downloadDummy(
        file.filename,
        `.${this.calcShortHash(file.shaNew)}.new`,
      );
    }

    const protocolUrl = encodeURI(
      `tracetronic://diff?file1=${oldFile}&file2=${newFile}&cleanup=True`,
    );
    await browser.tabs.update({ url: protocolUrl });
  }

  async downloadFile(file: ModifiedFile, what: 'old' | 'new', token: string) {
    const sha = what == 'old' ? file.shaOld : file.shaNew;
    const theFile = await this.doDownloadFile(
      file.download[what],
      file.download.type,
      file.filename,
      `.${this.calcShortHash(sha)}.${what}`,
      token,
      sha,
    );
    const protocolUrl = encodeURI(`tracetronic:///${theFile}`);
    await browser.tabs.update({ url: protocolUrl });
  }
}
