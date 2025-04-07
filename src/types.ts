export const SUPPORTED_DIFF_FILES = ['pkg', 'ta', 'prj'];
export const SUPPORTED_FILES = [...SUPPORTED_DIFF_FILES, 'trf'];

export type HostInfo = {
  scm: 'gitlab' | 'github' | null;
  host: string;
};

export type ScmHost = {
  scm: 'gitlab' | 'github';
  host: string;
  token: string | null;
};

export enum ErrorType {
  TOKEN_NOT_SET = 'TOKEN_NOT_SET',
  SCM_NOT_SET = 'SCM_NOT_SET',
  HOST_NOT_FOUND = 'HOST_NOT_FOUND',
}

// service worker message options
export enum Action {
  getHosts = 'getHosts',
  addHost = 'addHost',
  saveHosts = 'saveHosts',
  checkConnection = 'checkConnection',
  checkTab = 'checkTab',
  fetchModifiedFiles = 'fetchModifiedFiles',
  downloadDiff = 'downloadDiff',
  downloadFile = 'downloadFile',
}

export type ServiceWorkerRequest =
  | {
      action: Action.checkTab | Action.getHosts;
      option: undefined;
    }
  | {
      action: Action.addHost | Action.fetchModifiedFiles;
      option: { hostInfo: HostInfo };
    }
  | {
      action: Action.saveHosts;
      option: { hosts: ScmHost[] };
    }
  | {
      action: Action.checkConnection;
      option: { scmHost: ScmHost };
    }
  | { action: Action.downloadDiff; option: { file: ModifiedFile } }
  | {
      action: Action.downloadFile;
      option: { file: ModifiedFile; what: 'old' | 'new' };
    };

// scm changes
export type ModifiedFile = {
  filename: string;
  filenameOld: string | null;
  new: boolean;
  deleted: boolean;
  renamed: boolean;
  additions: number;
  deletions: number;
  shaOld: string;
  shaNew: string;
  download: { type: 'raw' | 'json'; old: string | null; new: string | null };
};
