import browser from 'webextension-polyfill';
import { Action, AuthType, ScmHost, ServiceWorkerRequest } from './types';
import { normalizeHost } from './utils';

const IP_REGEX =
  /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
const HOSTNAME_REGEX =
  /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
const BITBUCKET_BEARER_REGEX =
  /^bitbucket\.org\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$/i;
const BITBUCKET_BASIC_REGEX = /^bitbucket\.org$/i;
const TOKEN_DOC_URLS = {
  github:
    'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  gitlab: 'https://docs.gitlab.com/security/tokens',
  bitbucket: 'https://support.atlassian.com/bitbucket-cloud/docs/access-tokens',
};

type Scm = 'github' | 'gitlab' | 'bitbucket';

export class HostDialog {
  private dialog: HTMLDialogElement;
  private title: HTMLElement;
  private scmSelect: HTMLSelectElement;
  private scmIcon: HTMLImageElement;
  private hostInput: HTMLInputElement;
  private emailInput: HTMLInputElement;
  private tokenInput: HTMLInputElement;
  private tokenToggle: HTMLElement;
  private saveButton: HTMLButtonElement;
  private cancelButton: HTMLButtonElement;
  private bitbucketAuth: HTMLDivElement;
  private emailRow: HTMLDivElement;
  private authRadios: NodeListOf<HTMLInputElement>;
  private messageSpan: HTMLElement;

  constructor() {
    this.dialog = document.getElementById('hostDialog') as HTMLDialogElement;
    this.title = document.getElementById('hostDialogTitle')!;
    this.scmSelect = this.dialog.querySelector('#dlg-scm') as HTMLSelectElement;
    this.scmIcon = this.dialog.querySelector(
      '#dlg-scm-icon',
    ) as HTMLImageElement;
    this.hostInput = this.dialog.querySelector('#dlg-host') as HTMLInputElement;
    this.emailInput = this.dialog.querySelector(
      '#dlg-email',
    ) as HTMLInputElement;
    this.tokenInput = this.dialog.querySelector(
      '#dlg-token',
    ) as HTMLInputElement;
    this.tokenToggle = this.dialog.querySelector(
      '#dlg-token-toggle',
    ) as HTMLElement;
    this.saveButton = this.dialog.querySelector(
      '#dlg-btn-save',
    ) as HTMLButtonElement;
    this.cancelButton = this.dialog.querySelector(
      '#dlg-btn-cancel',
    ) as HTMLButtonElement;
    this.bitbucketAuth = this.dialog.querySelector(
      '#dlg-bitbucket-auth',
    ) as HTMLDivElement;
    this.emailRow = this.dialog.querySelector(
      '#dlg-email-row',
    ) as HTMLDivElement;
    this.authRadios = this.dialog.querySelectorAll<HTMLInputElement>(
      'input[name="dlg-bitbucket-auth-type"]',
    );
    this.messageSpan = this.dialog.querySelector('#dlg-message')!;
  }

  private setValid(
    input: HTMLElement,
    value: boolean | null = true,
    tooltip = '',
  ) {
    if (value === null) {
      input.classList.remove('valid', 'invalid');
    } else {
      input.classList.add(value ? 'valid' : 'invalid');
      input.classList.remove(value ? 'invalid' : 'valid');
    }
    input.title = tooltip;
  }

  private setError(input: HTMLElement, message: string | null) {
    const err = input.parentElement?.querySelector('.error') as HTMLElement;
    if (message) {
      this.setValid(input, false);
      err.textContent = message;
      err.style.visibility = 'visible';
    } else {
      err.textContent = '';
      err.style.visibility = 'hidden';
    }
  }

  private clearError(input: HTMLElement) {
    this.setValid(input, null);
    const err = input.parentElement?.querySelector('.error') as HTMLElement;
    if (err) {
      err.textContent = '';
      err.style.visibility = 'hidden';
    }
  }

  private attachLiveClear() {
    [this.hostInput, this.tokenInput, this.emailInput].forEach((input) => {
      input.addEventListener('input', () => this.clearError(input));
    });
  }

  private getAuthType(): AuthType {
    const selectedAuth = Array.from(this.authRadios).find(
      (r) => r.checked,
    )?.value;
    return selectedAuth === 'basic' ? AuthType.Basic : AuthType.Bearer;
  }

  private validateField(input: HTMLInputElement): boolean {
    if (input.id === 'dlg-host') {
      const host = normalizeHost(input.value.trim());
      const scm = this.scmSelect.value as Scm;
      if (!host) {
        this.setError(input, 'Please enter a host.');
        return false;
      }
      if (scm === 'bitbucket') {
        if (
          !BITBUCKET_BASIC_REGEX.test(host) &&
          !BITBUCKET_BEARER_REGEX.test(host)
        ) {
          this.setError(input, 'Invalid host name.');
          return false;
        }
        const authType = this.getAuthType();
        if (authType === AuthType.Basic) {
          // only allow bitbucket.org
          if (!BITBUCKET_BASIC_REGEX.test(host)) {
            this.setError(
              input,
              'For personal access tokens, please use bitbucket.org as host.',
            );
            return false;
          }
        } else {
          // require workspace or repository
          if (!BITBUCKET_BEARER_REGEX.test(host)) {
            this.setError(
              input,
              'Please specify a valid workspace or repository.',
            );
            return false;
          }
        }
        this.setError(input, null);
        this.setValid(input, null);
        return true;
      }
      if (IP_REGEX.test(host)) {
        this.setValid(input, null);
        return true;
      }
      if (!HOSTNAME_REGEX.test(host)) {
        this.setError(input, 'Invalid host name.');
        return false;
      }
      this.setValid(input, null);
      return true;
    }
    if (input.id === 'dlg-token') {
      const token = input.value.trim();
      if (!token) {
        this.setError(input, 'Please enter a token.');
        return false;
      }
      this.setValid(input, null);
      return true;
    }
    if (input.id === 'dlg-email') {
      const email = input.value.trim();
      const scm = this.scmSelect.value as Scm;
      const authType = this.getAuthType();
      if (scm !== 'bitbucket' || authType !== AuthType.Basic) {
        this.clearError(input);
        return true;
      }
      if (!email) {
        this.setError(input, 'Please enter your email address.');
        return false;
      }
      const simpleEmailRegex = /.+@.+\..+/;
      if (!simpleEmailRegex.test(email)) {
        this.setError(input, 'Please enter a valid email address.');
        return false;
      }
      this.setError(input, null);
      return true;
    }
    this.setValid(input, null);
    return true;
  }

  private validateDialog(): boolean {
    const fields: HTMLInputElement[] = [
      this.hostInput,
      this.tokenInput,
      this.emailInput,
    ];
    let allValid = true;
    for (const field of fields) {
      const ok = this.validateField(field);
      if (!ok) allValid = false;
    }
    return allValid;
  }

  private updateDialogVisibility() {
    const isBitbucket = this.scmSelect.value === 'bitbucket';
    const dlgHostHint = document.getElementById('dlg-host-hint');
    if (!isBitbucket) {
      this.bitbucketAuth.classList.add('hidden');
      this.emailRow.classList.add('hidden');
      dlgHostHint.style.display = 'none';
      return;
    }
    this.bitbucketAuth.classList.remove('hidden');
    dlgHostHint.style.display = 'block';
    const selectedAuth = Array.from(this.authRadios).find(
      (r) => r.checked,
    )?.value;
    if (selectedAuth === AuthType.Basic) {
      this.emailRow.classList.remove('hidden');
    } else {
      this.emailRow.classList.add('hidden');
    }
  }

  private updateControls() {
    const linkWrapper = document.getElementById('dlg-token-learnmore')!;
    const link = linkWrapper.querySelector('a')!;
    const scm = this.scmSelect.value as Scm;
    let url = '#';
    let placeholder = '';
    if (scm === 'github') {
      url = TOKEN_DOC_URLS.github;
      placeholder = 'e.g. github.com';
    } else if (scm === 'gitlab') {
      url = TOKEN_DOC_URLS.gitlab;
      placeholder = 'e.g. gitlab.com';
    } else if (scm === 'bitbucket') {
      url = TOKEN_DOC_URLS.bitbucket;
      placeholder = 'e.g. bitbucket.org';
    }
    link.href = url;
    this.hostInput.placeholder = placeholder;
  }

  private buildScmHost(): ScmHost {
    const scm = this.scmSelect.value as Scm;
    const host = normalizeHost(this.hostInput.value.trim());
    let token = this.tokenInput.value.trim();
    const email = this.emailInput.value.trim();
    const authType = this.getAuthType();
    if (scm === 'bitbucket' && authType === AuthType.Basic) {
      token = `${email}:${token}`;
    }
    return {
      scm,
      host,
      token,
      authType: scm === 'bitbucket' ? authType : undefined,
    };
  }

  private async checkHostConnection(scmHost: ScmHost): Promise<boolean> {
    const ok = (await browser.runtime.sendMessage({
      action: Action.checkConnection,
      option: { scmHost },
    } as ServiceWorkerRequest)) as boolean;
    this.setError(
      this.tokenInput,
      ok ? '' : 'Authentication failed for this host.',
    );
    return ok;
  }

  public open(prefill?: ScmHost, editRowId?: string, edit = false) {
    this.reset();
    if (prefill) {
      this.title.textContent = edit ? 'Edit host' : 'Add host';
      this.scmSelect.value = prefill.scm;
      this.scmIcon.src = `icons/${prefill.scm}.svg`;
      this.hostInput.value = prefill.host;
      let tokenValue = prefill.token ?? '';
      let emailValue = '';
      if (prefill.scm === 'bitbucket') {
        const authType = prefill.authType || AuthType.Basic;
        this.authRadios.forEach((radio) => {
          radio.checked = radio.value === authType;
        });

        if (authType === AuthType.Basic) {
          if (tokenValue.includes(':')) {
            const [emailPart, ...rest] = tokenValue.split(':');
            emailValue = emailPart;
            tokenValue = rest.join(':');
          } else {
            emailValue = '';
          }
        }
      }
      this.tokenInput.value = tokenValue;
      this.emailInput.value = emailValue;
      (this.saveButton as HTMLButtonElement).dataset.editRow = editRowId ?? '';
    } else {
      this.title.textContent = 'Add host';
      delete (this.saveButton as HTMLButtonElement).dataset.editRow;
    }
    this.updateDialogVisibility();
    this.updateControls();
    this.dialog.showModal();
    this.hostInput.focus();
  }

  private reset() {
    this.scmSelect.value = 'github';
    this.scmIcon.src = `icons/github.svg`;
    this.hostInput.value = '';
    this.emailInput.value = '';
    this.tokenInput.value = '';
    this.authRadios.forEach((radio) => {
      radio.checked = radio.value === AuthType.Basic;
    });
    this.updateDialogVisibility();
    [this.scmSelect, this.hostInput, this.emailInput, this.tokenInput].forEach(
      (elem) => {
        this.clearError(elem);
      },
    );
  }

  private async onDialogSave(
    event: Event,
    onSaveCallback: (host: ScmHost, editRowId?: string) => Promise<void>,
  ) {
    event.preventDefault();
    if (!this.validateDialog()) return;
    const scmHost = this.buildScmHost();
    const ok = await this.checkHostConnection(scmHost);
    if (!ok) return;
    const editRowId = (this.saveButton as HTMLButtonElement).dataset.editRow as
      | string
      | undefined;
    await onSaveCallback(scmHost, editRowId);
    this.dialog.close();
  }

  public registerEvents(
    onSaveCallback: (host: ScmHost, editRowId?: string) => Promise<void>,
  ) {
    this.cancelButton.addEventListener('click', () => this.dialog.close());
    this.tokenToggle.addEventListener('click', () => {
      if (this.tokenInput.type === 'password') {
        this.tokenInput.type = 'text';
        this.tokenToggle.textContent = 'visibility_off';
      } else {
        this.tokenInput.type = 'password';
        this.tokenToggle.textContent = 'visibility';
      }
    });
    this.scmSelect.addEventListener('change', () => {
      this.scmIcon.src = `icons/${this.scmSelect.value}.svg`;
      this.updateDialogVisibility();
      this.updateControls();
    });
    this.authRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        this.updateDialogVisibility();
        this.clearError(this.hostInput);
      });
    });
    this.attachLiveClear();
    this.hostInput.addEventListener('blur', () =>
      this.validateField(this.hostInput),
    );
    this.tokenInput.addEventListener('blur', () =>
      this.validateField(this.tokenInput),
    );
    this.emailInput.addEventListener('blur', () =>
      this.validateField(this.emailInput),
    );
    this.saveButton.addEventListener('click', (event) =>
      this.onDialogSave(event, onSaveCallback),
    );
  }
}
