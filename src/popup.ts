import '../styles/popup.scss';
import browser from 'webextension-polyfill';
import {
  Action,
  ErrorType,
  HostInfo,
  ModifiedFile,
  ServiceWorkerRequest,
  SUPPORTED_DIFF_FILES,
  SUPPORTED_FILES,
} from './types';

function showElement(id: string, value = true) {
  const elem = document.getElementById(id);
  if (value) {
    elem.classList.remove('hidden');
  } else {
    elem.classList.add('hidden');
  }
}

// Function to display error message
function displayErrorMessage(errorMessage: string) {
  const errorContainer = document.getElementById('error-message');
  errorContainer.textContent = errorMessage;
}

const MESSAGES = new Map<string, string>([
  [
    ErrorType.TOKEN_NOT_SET,
    'Host is already added, but no API token is set! Go to options to add an API token.',
  ],
  [
    ErrorType.SCM_NOT_SET,
    'SCM type for this host is not correctly configured!',
  ],
  [ErrorType.HOST_NOT_FOUND, 'Given host is not found in settings!'],
]);

function getFileExt(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) return parts[parts.length - 1];
  return '';
}

// Function to fetch modified files when the popup is opened
async function fetchModifiedFiles(
  hostInfo: HostInfo,
): Promise<ModifiedFile[] | null> {
  try {
    return await browser.runtime.sendMessage({
      action: Action.fetchModifiedFiles,
      option: { hostInfo },
    } as ServiceWorkerRequest);
  } catch (error) {
    const message = MESSAGES.get(error.message) || error.message;
    console.error(message);
    displayErrorMessage(message);
    return null;
  }
}

function showAddHost(host: string) {
  showElement('addhost');
  document.getElementById('addhost_host').textContent = host;
}
async function onAddHost() {
  const scmSelect = document.getElementById('addhost_scm') as HTMLSelectElement;
  const host = document.getElementById('addhost_host').textContent;
  await browser.runtime.sendMessage({
    action: Action.addHost,
    option: { hostInfo: { scm: scmSelect.value, host } },
  } as ServiceWorkerRequest);
  initData();
}

// Function to display total changes
function displayTotalChanges(
  totalChanges: { additions: number; deletions: number },
  heading: HTMLElement,
) {
  const totalChangesElement = document.createElement('span');
  totalChangesElement.classList.add('total-changes');

  const totalAdditionsSpan = createChangeSpan(
    `+${totalChanges.additions}`,
    'additions',
  );
  totalChangesElement.appendChild(totalAdditionsSpan);

  const totalDeletionsSpan = createChangeSpan(
    `-${totalChanges.deletions}`,
    'deletions',
  );
  totalChangesElement.appendChild(totalDeletionsSpan);

  heading.appendChild(totalChangesElement);
}

function displayModifiedFiles(modifiedFiles: ModifiedFile[] | null) {
  if (modifiedFiles == null) {
    showElement('content', false);
    return;
  }
  showElement('content');

  const heading = document.getElementById('heading');
  heading.textContent = `${modifiedFiles.length} modified files:`;
  heading.style.display = 'block';
  const totalChanges = {
    additions: 0,
    deletions: 0,
  };
  modifiedFiles.forEach((file) => {
    totalChanges.additions += file.additions;
    totalChanges.deletions += file.deletions;
  });
  displayTotalChanges(totalChanges, heading);
  const fileList = document.getElementById('file-list');
  fileList.innerHTML = '';

  modifiedFiles.forEach((file, index) => {
    const listItem = createFileListItem(file, index);
    fileList.appendChild(listItem);
  });
}
// Function to create a list item for a file
function createFileListItem(file: ModifiedFile, index: number) {
  const listItem = document.createElement('li');
  listItem.classList.add('file-item');
  listItem.style.counterReset = 'file-item-counter ' + index;

  const fileInfoContainer = document.createElement('div');
  fileInfoContainer.classList.add('file-info');
  listItem.appendChild(fileInfoContainer);

  // icon
  const ext = getFileExt(file.filename);
  if (SUPPORTED_FILES.includes(ext)) {
    const fileImg = document.createElement('img');
    fileImg.src = `icons/${ext}.png`;
    fileImg.classList.add('icon');
    fileInfoContainer.appendChild(fileImg);
  }

  const filenameElement = createFilenameElement(file.filename);
  filenameElement.classList.add('filename');
  if (file.renamed) {
    const filenameElement2 = createFilenameElement(
      `renamed from ${file.filenameOld}`,
    );
    filenameElement2.classList.add('renamedfrom');
    filenameElement.appendChild(filenameElement2);
  }
  fileInfoContainer.appendChild(filenameElement);

  const changesElement = createChangesElement(file);
  fileInfoContainer.appendChild(changesElement);

  const buttonContainer = document.createElement('div');
  buttonContainer.classList.add('button-container');
  buttonContainer.style.display = 'none';
  if (SUPPORTED_DIFF_FILES.includes(ext)) {
    const diffButton = createDiffButton(file);
    buttonContainer.appendChild(diffButton);
  } else {
    const downloadButtons = createDownloadButtons(file);
    buttonContainer.append(...downloadButtons);
  }
  listItem.appendChild(buttonContainer);
  addExpandCollapseEventListener(listItem, buttonContainer);

  return listItem;
}

// Function to create a div element for filename
function createFilenameElement(filename: string) {
  const filenameElement = document.createElement('div');
  filenameElement.textContent = filename;

  filenameElement.style.cursor = 'pointer';
  filenameElement.addEventListener('mouseover', () => {
    filenameElement.style.textDecoration = 'underline';
  });
  filenameElement.addEventListener('mouseout', () => {
    filenameElement.style.textDecoration = '';
  });
  return filenameElement;
}

// Function to create a span element for changes
function createChangesElement(file: ModifiedFile) {
  const changesElement = document.createElement('span');
  changesElement.classList.add('changes');
  let additionText: string, deletionText: string;
  if (file.new) {
    additionText = 'added';
    deletionText = '';
  } else if (file.deleted) {
    additionText = '';
    deletionText = 'removed';
  } else {
    additionText = `+${file.additions}`;
    deletionText = `-${file.deletions}`;
  }
  const additionsSpan = createChangeSpan(additionText, 'additions');
  changesElement.appendChild(additionsSpan);

  const deletionsSpan = createChangeSpan(deletionText, 'deletions');
  changesElement.appendChild(deletionsSpan);

  return changesElement;
}
// Function to create a span element for a single change
function createChangeSpan(text: string, className: string) {
  const span = document.createElement('span');
  span.textContent = text;
  span.classList.add(className);
  return span;
}

// Function to create a diff button for a file
function createDiffButton(file: ModifiedFile) {
  const diffButton = document.createElement('button');
  diffButton.textContent = 'Show diff';
  diffButton.classList.add('diff-button', 'button-50');
  diffButton.addEventListener('click', async () => {
    try {
      await browser.runtime.sendMessage({
        action: Action.downloadDiff,
        option: { file },
      } as ServiceWorkerRequest);
    } catch (error) {
      console.error(error);
      displayErrorMessage(error);
    }
  });

  //diffButton.style.display = 'none';
  return diffButton;
}
async function onDownload(file: ModifiedFile, what: 'old' | 'new') {
  try {
    await browser.runtime.sendMessage({
      action: Action.downloadFile,
      option: { file, what },
    } as ServiceWorkerRequest);
  } catch (error) {
    console.error(error);
    displayErrorMessage(error);
  }
}

// Function to create two optional seperate show buttons for old/new file
function createDownloadButtons(file: ModifiedFile) {
  const buttons = [];
  if (file.new || !file.deleted) {
    const btn = document.createElement('button');
    btn.classList.add('download-button', 'button-50');
    btn.textContent = 'Show new';
    btn.addEventListener('click', () => onDownload(file, 'new'));
    buttons.push(btn);
  }
  if (file.deleted || !file.new) {
    const btn = document.createElement('button');
    btn.classList.add('download-button', 'button-50');
    btn.textContent = 'Show old';
    btn.addEventListener('click', () => onDownload(file, 'old'));
    buttons.push(btn);
  }
  return buttons;
}

// Function to add event listener for expanding/collapsing file item
function addExpandCollapseEventListener(
  listItem: HTMLLIElement,
  buttonContainer: HTMLDivElement,
) {
  const filenameElement = listItem.querySelector('.file-info > .filename');
  filenameElement.addEventListener('click', () => {
    if (listItem.classList.contains('expanded')) {
      listItem.classList.remove('expanded');
      buttonContainer.style.display = 'none';
    } else {
      const expandedItem = document.querySelector('.file-item.expanded');
      if (expandedItem) {
        expandedItem.classList.remove('expanded');
        expandedItem.querySelector('.button-container').style.display = 'none';
      }
      listItem.classList.add('expanded');
      buttonContainer.style.display = 'block';
    }
  });
}

async function initUi() {
  ['go-to-options-icon', 'go-to-options'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => {
      browser.runtime.openOptionsPage();
    });
  });

  document
    .getElementById('addhost_btn_submit')
    .addEventListener('click', onAddHost);
}

async function initData() {
  try {
    // check host
    const hostInfo: HostInfo = await browser.runtime.sendMessage({
      action: Action.checkTab,
    } as ServiceWorkerRequest);

    if (hostInfo.scm == null) {
      showAddHost(hostInfo.host);
      return;
    }
    showElement('addhost', false);

    displayModifiedFiles(await fetchModifiedFiles(hostInfo));
  } catch (error) {
    console.error(error);
    displayErrorMessage(error);
  }
}

// Call functions when the popup is opened
initUi();
initData();
