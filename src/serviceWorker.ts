import { Browser } from 'webextension-polyfill';
import {
  Action,
  ErrorType,
  HostInfo,
  ModifiedFile,
  ScmHost,
  ServiceWorkerRequest,
} from './types';
import { scmAdapters } from './scm';

const browser: Browser = require('webextension-polyfill');

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

async function checkTab(): Promise<HostInfo> {
  const tab = await getActiveTab();
  const url = URL.parse(tab.url);
  const currentHost = url.host;

  const hostList = await getHosts();
  const entry = hostList.find((value) => value.host == currentHost);
  if (entry) return { scm: entry.scm, host: currentHost };

  return { scm: null, host: currentHost };
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

async function getToken(hostInfo: HostInfo): Promise<string | null> {
  const data = await getHosts();
  const entry = data.find((value) => value.host == hostInfo.host);
  if (entry == null) throw new Error(ErrorType.HOST_NOT_FOUND);
  return entry.token;
}

async function checkConnection(scmHost: ScmHost): Promise<boolean> {
  return new scmAdapters[scmHost.scm](scmHost).test(scmHost.token);
}

async function fetchModifiedFiles(hostInfo: HostInfo) {
  if (hostInfo.scm == null) throw new Error(ErrorType.SCM_NOT_SET);

  const token = await getToken(hostInfo);
  if (token == null) throw new Error(ErrorType.TOKEN_NOT_SET);

  return await new scmAdapters[hostInfo.scm](hostInfo).fetchModifiedFiles(
    (
      await getActiveTab()
    ).url,
    token,
  );
}

async function downloadDiff(file: ModifiedFile) {
  const hostInfo = await checkTab();
  const token = await getToken(hostInfo);
  new scmAdapters[hostInfo.scm](hostInfo).downloadDiff(file, token);
}

async function downloadFile(file: ModifiedFile, what: 'old' | 'new') {
  const hostInfo = await checkTab();
  const token = await getToken(hostInfo);
  new scmAdapters[hostInfo.scm](hostInfo).downloadFile(file, what, token);
}
