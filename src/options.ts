// SPDX-FileCopyrightText: 2025 tracetronic GmbH
//
// SPDX-License-Identifier: MIT

import '../styles/options.scss';
import browser from 'webextension-polyfill';
import { Action, ScmHost, ServiceWorkerRequest } from './types';

const IP_REGEX =
  /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;

const HOSTNAME_REGEX =
  /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;

function setMessage(type: 'success' | 'error', message: string) {
  const elem = document.getElementById('message');
  elem.textContent = message;
  elem.classList.add(type);
  elem.classList.remove(type == 'success' ? 'error' : 'success');
}

function setValid(
  idOrElem: string | HTMLElement,
  value: boolean | null = true,
  tooltip = '',
) {
  const elem =
    typeof idOrElem == 'string' ? document.getElementById(idOrElem) : idOrElem;
  if (value === null) {
    elem.classList.remove('valid', 'invalid');
  } else {
    elem.classList.add(value ? 'valid' : 'invalid');
    elem.classList.remove(value ? 'invalid' : 'valid');
  }
  elem.title = tooltip;
}

let rowIdCounter = 0;

function getHostTableRowElement(
  rowId: string,
  elemId: string,
): HTMLElement | null {
  return document.getElementById(rowId).querySelector(`[id=${elemId}]`);
}
async function checkHost(scmHost: ScmHost, rowId: string): Promise<boolean> {
  const hostElem = getHostTableRowElement(rowId, 'host');
  const tokenElem = getHostTableRowElement(rowId, 'token');
  setValid(hostElem, null);
  setValid(tokenElem, null);

  let valid = true;
  if (
    !IP_REGEX.test(scmHost.host.trim()) &&
    !HOSTNAME_REGEX.test(scmHost.host.trim())
  ) {
    valid = false;
    setValid(hostElem, false, 'Not a valid host name. Example: "github.com"');
  } else {
    setValid(hostElem);
  }

  if (!scmHost.token.trim()) {
    valid = false;
    setValid(tokenElem, false, 'Please enter a token.');
  }

  if (valid) {
    valid = await browser.runtime.sendMessage({
      action: Action.checkConnection,
      option: {
        scmHost,
      },
    } as ServiceWorkerRequest);

    setValid(tokenElem, valid, valid ? null : 'Authentification failed!');
  }
  return valid;
}

function getHostsTableBody(): HTMLTableSectionElement {
  return document.getElementById('hosts').querySelector('tbody');
}
function onAddHost(): void {
  const body = getHostsTableBody();
  createHostRow(body, {
    host: '',
    scm: 'github',
    token: null,
  });
}
function onRemoveHost(rowId: string): void {
  document.getElementById(rowId).remove();
}

function buildScmHosts(): ScmHost[] {
  const rows = getHostsTableBody().childNodes;
  const data: ScmHost[] = [];
  rows.forEach((row: HTMLTableRowElement) => {
    data.push({
      scm: (row.childNodes[0].childNodes[1] as HTMLInputElement).value as
        | 'github'
        | 'gitlab',
      host: (row.childNodes[1].childNodes[0] as HTMLInputElement).value,
      token: (row.childNodes[2].childNodes[0] as HTMLInputElement).value,
    });
  });
  return data;
}
async function onCheckHosts(): Promise<void> {
  const data = buildScmHosts();
  data.forEach((scmHost, index) => {
    const hostRow = getHostsTableBody().childNodes[
      index
    ] as HTMLTableRowElement;
    checkHost(scmHost, hostRow.id);
  });
}

// Function to save options
async function onSave(): Promise<void> {
  await browser.runtime.sendMessage({
    action: Action.saveHosts,
    option: { hosts: buildScmHosts() },
  } as ServiceWorkerRequest);

  setMessage('success', 'Options saved!');
  setTimeout(() => setMessage('success', ''), 2000);
}

function createHostRow(body: HTMLTableSectionElement, hostInfo: ScmHost) {
  const row = body.insertRow();
  const rowId = 'hostrow_' + rowIdCounter.toString();
  row.id = rowId;
  rowIdCounter += 1;

  // scm platform
  const img = document.createElement('img');
  if (hostInfo.scm) img.src = `icons/${hostInfo.scm}.svg`;
  img.width = 16;
  img.style.paddingRight = '2px';
  img.style.verticalAlign = 'middle';
  const scmSelection = document.createElement('select');
  scmSelection.id = `scm`;
  scmSelection.addEventListener('input', () => {
    img.src = `icons/${scmSelection.value}.svg`;
  });
  const option1 = document.createElement('option');
  option1.value = 'github';
  option1.text = 'Github';
  const option2 = document.createElement('option');
  option2.value = 'gitlab';
  option2.text = 'Gitlab';

  scmSelection.append(option1, option2);
  const imgCell = row.insertCell();
  imgCell.append(img, scmSelection);
  scmSelection.value = hostInfo.scm;
  imgCell.style.whiteSpace = 'nowrap';

  // host
  const hostCell = row.insertCell();
  const hostInput = document.createElement('input');
  hostInput.type = 'text';
  hostInput.classList.add('hostinput');
  hostInput.id = `host`;
  hostInput.value = hostInfo.host;
  hostCell.append(hostInput);

  // token
  const tokenCell = row.insertCell();
  tokenCell.style.whiteSpace = 'nowrap';
  const tokenInput = document.createElement('input');
  tokenInput.type = 'password';
  tokenInput.classList.add('tokeninput');
  tokenInput.id = `token`;

  tokenInput.value = hostInfo.token;
  const imgShowPw = document.createElement('div');
  imgShowPw.classList.add('icon', 'icon-tt-eye', 'clickable');
  imgShowPw.style.cursor = 'pointer';
  imgShowPw.style.paddingLeft = '4px';
  imgShowPw.addEventListener('click', () => {
    console.log(imgShowPw.classList);
    if (imgShowPw.classList.contains('icon-tt-eye')) {
      imgShowPw.classList.remove('icon-tt-eye');
      imgShowPw.classList.add('icon-tt-eye-disabled');
      tokenInput.type = 'text';
    } else {
      imgShowPw.classList.remove('icon-tt-eye-disabled');
      imgShowPw.classList.add('icon-tt-eye');
      tokenInput.type = 'password';
    }
  });
  tokenCell.append(tokenInput, imgShowPw);

  // actions
  const actionCell = row.insertCell();
  const delImg = document.createElement('div');
  delImg.classList.add('icon', 'icon-tt-bin', 'clickable');
  delImg.style.cursor = 'pointer';
  delImg.addEventListener('click', () => onRemoveHost(rowId));
  actionCell.append(delImg);

  row.append(imgCell, hostCell, tokenCell, actionCell);
}

async function updateHosts() {
  const hosts: ScmHost[] = await browser.runtime.sendMessage({
    action: Action.getHosts,
  } as ServiceWorkerRequest);

  const body = getHostsTableBody();
  body.innerHTML = '';
  hosts.forEach((scmHost) => {
    createHostRow(body, scmHost);
  });
}
async function addPendingHosts() {
  // detect whether a host was added
  let hosts: ScmHost[] = await browser.runtime.sendMessage({
    action: Action.getHosts,
  } as ServiceWorkerRequest);
  const visibleHosts = buildScmHosts().map((host) => host.host);
  hosts = hosts.filter((scmHost) => !visibleHosts.includes(scmHost.host));
  if (hosts.length == 0) return;
  const body = getHostsTableBody();
  hosts.forEach((scmHost) => {
    createHostRow(body, scmHost);
  });
}
async function initUi() {
  // Event listener for saveAccessTokenButton click
  const saveAccessTokenButton = document.getElementById('saveOptions');
  saveAccessTokenButton.addEventListener('click', onSave);
  const addHostButton = document.getElementById('addhost');
  addHostButton.addEventListener('click', onAddHost);

  const checkHostButton = document.getElementById('checkhosts');
  checkHostButton.addEventListener('click', onCheckHosts);

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) addPendingHosts();
  });

  // init data
  updateHosts();
}

initUi();
