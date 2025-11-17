import '../styles/options.scss';
import browser from 'webextension-polyfill';
import { Action, AuthType, ScmHost, ServiceWorkerRequest } from './types';
import { HostDialog } from './HostDialog';
import { normalizeHost } from './utils';

const IP_REGEX =
  /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;

const HOSTNAME_REGEX =
  /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;

const BITBUCKET_BEARER_REGEX =
  /^bitbucket\.org\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$/i;
const BITBUCKET_BASIC_REGEX = /^bitbucket\.org$/i;

type Scm = 'github' | 'gitlab' | 'bitbucket';

const SCM_DISPLAY_NAME: Record<Scm, string> = {
  github: 'Github',
  gitlab: 'Gitlab',
  bitbucket: 'Bitbucket Cloud',
};
function setMessage(
  type: 'success' | 'error',
  message: string,
  dialog: boolean = false,
) {
  const elem = document.getElementById(dialog ? 'dlg-message' : 'message');
  elem.textContent = message;
  elem.classList.add(type);
  elem.classList.remove(type == 'success' ? 'error' : 'success');
}

let rowIdCounter = 0;

function getHostsTableBody(): HTMLTableSectionElement {
  return document.getElementById('hosts').querySelector('tbody');
}

function getHostRows(): HTMLTableRowElement[] {
  return Array.from(getHostsTableBody().children) as HTMLTableRowElement[];
}

function getRowScmHost(row: HTMLTableRowElement): ScmHost {
  const scm = row.dataset.scm as Scm;
  const token = row.dataset.token ?? '';
  const hostSpan = row.querySelector('.host-text') as HTMLElement | null;
  const host = hostSpan?.textContent ?? '';
  const authTypeRaw = row.dataset.authType;
  const authType =
    scm === 'bitbucket' &&
    (authTypeRaw === AuthType.Basic || authTypeRaw === AuthType.Bearer)
      ? authTypeRaw
      : undefined;

  return { scm, host, token, authType };
}

function getBitbucketScopeLevel(host: string): number {
  const parts = host.split('/').filter(Boolean);
  if (parts.length <= 1) return 0;
  if (parts.length === 2) return 1;
  return 2;
}

function hostPriorityKey(h: ScmHost): {
  scmOrder: number;
  scopeLevel: number;
  hostLen: number;
  host: string;
} {
  const scm = h.scm as Scm;
  const normHost = normalizeHost(h.host);

  // keep platforms grouped
  const scmOrderMap: Record<Scm, number> = {
    bitbucket: 0,
    github: 1,
    gitlab: 2,
  };

  const scopeLevel = scm === 'bitbucket' ? getBitbucketScopeLevel(normHost) : 0;

  return {
    scmOrder: scmOrderMap[scm],
    scopeLevel,
    hostLen: normHost.length,
    host: normHost,
  };
}

function sortHostsByPriority(hosts: ScmHost[]): ScmHost[] {
  return [...hosts].sort((a, b) => {
    const ka = hostPriorityKey(a);
    const kb = hostPriorityKey(b);

    if (ka.scmOrder !== kb.scmOrder) return ka.scmOrder - kb.scmOrder;
    if (ka.scopeLevel !== kb.scopeLevel) return kb.scopeLevel - ka.scopeLevel;
    if (ka.hostLen !== kb.hostLen) return kb.hostLen - ka.hostLen;
    return ka.host.localeCompare(kb.host);
  });
}

function renderHosts(hosts: ScmHost[]) {
  const body = getHostsTableBody();
  const table = document.getElementById('hosts');
  const placeholder = document.getElementById('hosts-empty-placeholder');
  body.innerHTML = '';
  rowIdCounter = 0;
  if (hosts.length === 0) {
    table.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
  } else {
    table.style.display = '';
    if (placeholder) placeholder.style.display = 'none';
    hosts.forEach((h) => createHostRow(body, h));
  }
}

function createHostRow(
  body: HTMLTableSectionElement,
  hostInfo: ScmHost,
): HTMLTableRowElement {
  const row = body.insertRow();
  const rowId = 'hostrow_' + rowIdCounter.toString();
  row.id = rowId;
  rowIdCounter += 1;

  const platformCell = row.insertCell();
  const img = document.createElement('img');
  img.src = `icons/${hostInfo.scm}.svg`;
  img.width = 16;
  img.style.paddingRight = '2px';
  img.style.verticalAlign = 'middle';
  const label = document.createElement('span');
  label.textContent =
    SCM_DISPLAY_NAME[hostInfo.scm as keyof typeof SCM_DISPLAY_NAME];
  label.style.marginLeft = '4px';
  platformCell.append(img, label);
  platformCell.style.whiteSpace = 'nowrap';

  const hostCell = row.insertCell();
  const hostSpan = document.createElement('span');
  hostSpan.classList.add('host-text');
  hostSpan.textContent = hostInfo.host;
  hostCell.append(hostSpan);

  const actionCell = row.insertCell();
  const editIcon = document.createElement('span');
  editIcon.classList.add('material-symbols-outlined', 'clickable');
  editIcon.style.verticalAlign = 'text-top';
  editIcon.textContent = 'edit';
  editIcon.title = 'Edit';
  editIcon.addEventListener('click', () => {
    const row = document.getElementById(rowId) as HTMLTableRowElement | null;
    if (!row) return;
    hostDialog.open(getRowScmHost(row), rowId, true);
  });

  actionCell.append(editIcon);
  const delIcon = document.createElement('span');
  delIcon.classList.add('material-symbols-outlined', 'clickable');
  delIcon.style.verticalAlign = 'text-top';
  delIcon.textContent = 'delete';
  delIcon.title = 'Remove';
  delIcon.addEventListener('click', () => onRemoveHost(rowId));
  actionCell.append(delIcon);

  row.dataset.token = hostInfo.token ?? '';
  row.dataset.scm = hostInfo.scm;
  row.dataset.authType =
    hostInfo.scm === 'bitbucket' && hostInfo.authType ? hostInfo.authType : '';

  return row;
}

function buildScmHosts(): ScmHost[] {
  return getHostRows().map(getRowScmHost);
}

async function updateHosts() {
  const hosts: ScmHost[] = await browser.runtime.sendMessage({
    action: Action.getHosts,
  } as ServiceWorkerRequest);
  renderHosts(sortHostsByPriority(hosts));
}

// Function to save settings
async function onSave(): Promise<void> {
  const sorted = sortHostsByPriority(buildScmHosts());
  await browser.runtime.sendMessage({
    action: Action.saveHosts,
    option: { hosts: sorted },
  } as ServiceWorkerRequest);

  setMessage('success', 'Settings saved!');
  setTimeout(() => setMessage('success', ''), 2000);
}

async function onRemoveHost(rowId: string): Promise<void> {
  const row = document.getElementById(rowId);
  if (!row) return;
  const confirmed = window.confirm(
    'Are you sure you want to remove this host?',
  );

  if (!confirmed) return;
  row.remove();
  await onSave();
  await updateHosts();
}

type FieldErrorMap = Partial<Record<'host' | 'token', string>>;

interface ValidationResult {
  valid: boolean;
  reason?: string;
  fieldErrors?: FieldErrorMap;
}

async function validateHostRow(
  row: HTMLTableRowElement,
): Promise<ValidationResult> {
  const scmHost = getRowScmHost(row);
  row.classList.remove('valid-host', 'invalid-host');

  const rawHost = scmHost.host ?? '';
  const normHost = normalizeHost(rawHost);
  const token = (scmHost.token ?? '').trim();

  const fieldErrors: FieldErrorMap = {};
  let valid = true;
  let reason: string | undefined;

  if (!normHost) {
    valid = false;
    reason = 'Host is missing.';
    fieldErrors.host = reason;
  } else if (scmHost.scm === 'bitbucket') {
    if (
      !BITBUCKET_BASIC_REGEX.test(normHost) &&
      !BITBUCKET_BEARER_REGEX.test(normHost)
    ) {
      valid = false;
      reason = 'Invalid host format.';
      fieldErrors.host = reason;
    }
  } else {
    if (!IP_REGEX.test(normHost) && !HOSTNAME_REGEX.test(normHost)) {
      valid = false;
      reason = 'Invalid host format.';
      fieldErrors.host = reason;
    }
  }

  if (!token) {
    valid = false;
    reason = 'Access token is missing.';
    fieldErrors.token = reason;
  }

  if (valid) {
    try {
      const ok = (await browser.runtime.sendMessage({
        action: Action.checkConnection,
        option: { scmHost: { ...scmHost, host: normHost } },
      } as ServiceWorkerRequest)) as boolean;

      if (!ok) {
        valid = false;
        reason = 'Authentication failed.';
        fieldErrors.token = reason;
      }
    } catch (e) {
      valid = false;
      reason = 'Connection error.';
      fieldErrors.token = reason;
      console.error('Error while checking host', scmHost.host, e);
    }
  }
  row.classList.add(valid ? 'valid-host' : 'invalid-host');
  row.title = reason ?? '';

  delete row.dataset.hostError;
  delete row.dataset.tokenError;

  if (fieldErrors.host) row.dataset.hostError = fieldErrors.host;
  if (fieldErrors.token) row.dataset.tokenError = fieldErrors.token;

  return { valid, reason, fieldErrors };
}

async function onCheckHosts(): Promise<void> {
  const rows = getHostRows();
  if (rows.length === 0) {
    setMessage('error', 'There are no configured hosts.');
    return;
  }

  rows.forEach((row) => {
    row.classList.remove('valid-host', 'invalid-host');
    row.title = '';
  });

  const results = await Promise.all(
    rows.map(async (row) => {
      const result = await validateHostRow(row);
      const hostText = getRowScmHost(row).host || '(unknown)';
      return { row, host: hostText, ...result };
    }),
  );

  const failures = results.filter((r) => !r.valid);
  if (failures.length === 0) {
    setMessage('success', 'All hosts passed validation.');
    return;
  } else {
    setMessage(
      'error',
      'Validation failed for one or more hosts. See the tooltips in the table for details.',
    );
  }
}

async function addPendingHosts(): Promise<void> {
  const allHosts: ScmHost[] = await browser.runtime.sendMessage({
    action: Action.getHosts,
  } as ServiceWorkerRequest);

  const visible = new Set<string>();
  getHostRows().forEach((row) => {
    const { scm, host } = getRowScmHost(row);
    visible.add(`${scm}|${normalizeHost(host)}`);
  });

  const body = getHostsTableBody();
  allHosts.forEach((h) => {
    const key = `${h.scm}|${normalizeHost(h.host)}`;
    if (!visible.has(key)) createHostRow(body, h);
  });
}

type PendingHost = {
  scm: Scm;
  host: string;
};

async function openPendingHostDialog(): Promise<void> {
  const { pendingHost } = (await browser.storage.local.get('pendingHost')) as {
    pendingHost?: PendingHost;
  };

  if (!pendingHost) return;

  try {
    const targetScm = pendingHost.scm;
    const targetHostNormalized = normalizeHost(pendingHost.host);

    const hosts: ScmHost[] = await browser.runtime.sendMessage({
      action: Action.getHosts,
    } as ServiceWorkerRequest);

    const match = hosts.find(
      (h) =>
        h.scm === targetScm && normalizeHost(h.host) === targetHostNormalized,
    );

    if (!match) return;

    await updateHosts();

    const row = getHostRows().find((r) => {
      const rh = getRowScmHost(r);
      return (
        rh.scm === targetScm && normalizeHost(rh.host) === targetHostNormalized
      );
    });

    hostDialog.open(match, row?.id);
  } finally {
    await browser.storage.local.remove('pendingHost');
  }
}

const hostDialog = new HostDialog();

hostDialog.registerEvents(async (scmHost, editRowId) => {
  const body = getHostsTableBody();
  if (editRowId) {
    const row = document.getElementById(editRowId) as HTMLTableRowElement;
    if (!row) {
      console.error('Edit row not found: ', editRowId);
      return;
    }
    const platformCell = row.cells[0];
    const img = platformCell.querySelector('img') as HTMLImageElement;
    const label = platformCell.querySelector('span:last-child') as HTMLElement;
    img.src = `icons/${scmHost.scm}.svg`;
    label.textContent =
      SCM_DISPLAY_NAME[scmHost.scm as keyof typeof SCM_DISPLAY_NAME];
    const hostSpan = row.querySelector('.host-text') as HTMLElement;
    hostSpan.textContent = scmHost.host;
    row.dataset.token = scmHost.token ?? '';
    row.dataset.scm = scmHost.scm;
    row.dataset.authType =
      scmHost.scm === 'bitbucket' && scmHost.authType ? scmHost.authType : '';
    row.classList.remove('invalid-host');
    row.classList.add('valid-host');
  } else {
    const row = createHostRow(body, scmHost);
    row.classList.remove('invalid-host');
    row.classList.add('valid-host');
  }
  await onSave();
  await updateHosts();
});

async function initUi() {
  const addHostButton = document.getElementById('addhost');
  addHostButton.addEventListener('click', () => hostDialog.open());

  const addHostEmptyButton = document.getElementById('addhost-empty');
  if (addHostEmptyButton) {
    addHostEmptyButton.addEventListener('click', () => hostDialog.open());
  }

  const checkHostButton = document.getElementById('checkhosts');
  checkHostButton.addEventListener('click', onCheckHosts);

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      await addPendingHosts();
      const { pendingHost } = await browser.storage.local.get('pendingHost');
      if (pendingHost) await openPendingHostDialog();
    }
  });

  // init data
  await updateHosts();
  await openPendingHostDialog();
}

initUi();
