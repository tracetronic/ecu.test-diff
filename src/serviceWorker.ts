import browser from 'webextension-polyfill';
import {
  Action,
  AuthType,
  ErrorType,
  HostInfo,
  ModifiedFile,
  ScmHost,
  ServiceWorkerRequest,
} from './types';
import { scmAdapters } from './scm/index';
import { normalizeHost } from './utils';

browser.runtime.onMessage.addListener(async function (
  request: ServiceWorkerRequest,
) {
  console.debug('request', request.action);
  switch (request.action) {
    case Action.checkTab:
      return await checkTab();
    case Action.getHosts:
      return getHosts();
    case Action.saveHosts:
      return saveHosts(request.option.hosts);
    case Action.addHost:
      return await addHost(request.option.hostInfo);
    case Action.checkConnection:
      return checkConnection(request.option.scmHost);
    case Action.fetchModifiedFiles:
      return fetchModifiedFiles(request.option.hostInfo);
    case Action.downloadDiff:
      return downloadDiff(request.option.file);
    case Action.downloadFile:
      return downloadFile(request.option.file, request.option.what);
    default:
      console.error(
        `Unknown action ${(request as { action?: string }).action}`,
      );
  }
});

async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tab;
}

async function checkTab(): Promise<HostInfo | null> {
  const tab = await getActiveTab();
  const url = URL.parse(tab.url);
  const currentHost = url.host;
  if (!['http:', 'https:'].includes(url.protocol.toLowerCase())) {
    return null;
  }

  const hostList = await getHosts();
  const entry = findScmHostForUrl(url, hostList);
  if (entry) return { scm: entry.scm, host: entry.host };

  return { scm: null, host: currentHost };
}

function findScmHostForUrl(url: URL, hosts: ScmHost[]): ScmHost | undefined {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'bitbucket.org') {
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    const parts = path.split('/');

    const candidates: string[] = [];
    if (parts.length >= 2) {
      /* Can be a non-repository-URL as well, we accept this,
        because the URL gives no additional hint for differentiation. 
        Bad examples:
        - bitbucket.org/account/settings
        - bitbucket.org/myWorkspace/workspace/overview
        parts.length == 1 is ignored, because bitbucket automatically redirects
        the short workspace URL to the overview page.
        */
      candidates.push(`bitbucket.org/${parts[0]}/${parts[1]}`);
      candidates.push(`bitbucket.org/${parts[0]}`);
    }

    candidates.push('bitbucket.org');
    const normalizedHosts = hosts
      .filter((h) => h.scm === 'bitbucket')
      .map((h) => ({ host: h, key: normalizeHost(h.host) }));

    for (const candidate of candidates) {
      const key = normalizeHost(candidate);
      const match = normalizedHosts.find((x) => x.key === key);
      if (match) return match.host;
    }
    return undefined;
  }

  const key = normalizeHost(hostname);
  const normalizedHosts = hosts.map((h) => ({
    host: h,
    key: normalizeHost(h.host),
  }));
  return normalizedHosts.find((x) => x.key === key)?.host;
}

async function getHosts(): Promise<ScmHost[]> {
  const dataString: Record<string, string | undefined> =
    (await browser.storage.local.get('hosts')) as Record<
      string,
      string | undefined
    >;
  try {
    const data = JSON.parse(dataString.hosts ?? '[]');
    return data;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return [];
  }
}

function saveHosts(data: ScmHost[]): Promise<void> {
  return browser.storage.local.set({
    hosts: JSON.stringify(data),
  });
}

async function addHost(hostInfo: HostInfo): Promise<true> {
  const data = await getHosts();
  data.push({ scm: hostInfo.scm, host: hostInfo.host, token: null });
  await saveHosts(data);
  console.debug(`Host ${hostInfo.host} added`);
  return true;
}

function createAdapter(hostInfo: HostInfo, entry?: ScmHost) {
  const AdapterClass = scmAdapters[hostInfo.scm!];
  const adapter = new AdapterClass(hostInfo);

  if (hostInfo.scm === 'bitbucket' && entry?.authType) {
    (adapter as unknown as { setAuthType: (t: AuthType) => void }).setAuthType(
      entry.authType,
    );
  }

  return adapter;
}

async function getHostEntry(hostInfo: HostInfo): Promise<ScmHost> {
  const data = await getHosts();
  const targetKey = normalizeHost(hostInfo.host);
  const entry = data.find(
    (h) => normalizeHost(h.host) === targetKey && h.scm === hostInfo.scm,
  );
  if (!entry) throw new Error(ErrorType.HOST_NOT_FOUND);
  return entry;
}

async function checkConnection(scmHost: ScmHost): Promise<boolean> {
  if (scmHost.token == null) throw new Error(ErrorType.SCM_NOT_SET);
  const hostInfo: HostInfo = { scm: scmHost.scm, host: scmHost.host };
  const adapter = createAdapter(hostInfo, scmHost);
  return adapter.test(scmHost.token);
}

async function fetchModifiedFiles(hostInfo: HostInfo) {
  if (hostInfo.scm == null) throw new Error(ErrorType.SCM_NOT_SET);

  const entry = await getHostEntry(hostInfo);
  if (entry.token == null) throw new Error(ErrorType.TOKEN_NOT_SET);

  const adapter = createAdapter(hostInfo, entry);
  return adapter.fetchModifiedFiles((await getActiveTab()).url, entry.token);
}

async function downloadDiff(file: ModifiedFile) {
  const hostInfo = await checkTab();
  if (hostInfo === null) throw new Error(ErrorType.HOST_NOT_FOUND);
  if (hostInfo.scm == null) throw new Error(ErrorType.SCM_NOT_SET);

  const entry = await getHostEntry(hostInfo);
  if (entry.token == null) throw new Error(ErrorType.TOKEN_NOT_SET);

  const adapter = createAdapter(hostInfo, entry);
  return adapter.downloadDiff(file, entry.token);
}

async function downloadFile(file: ModifiedFile, what: 'old' | 'new') {
  const hostInfo = await checkTab();
  if (hostInfo === null) throw new Error(ErrorType.HOST_NOT_FOUND);
  if (hostInfo.scm == null) throw new Error(ErrorType.SCM_NOT_SET);

  const entry = await getHostEntry(hostInfo);
  if (entry.token == null) throw new Error(ErrorType.TOKEN_NOT_SET);

  const adapter = createAdapter(hostInfo, entry);
  return adapter.downloadFile(file, what, entry.token);
}
