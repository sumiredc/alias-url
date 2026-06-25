import './style.css';

type CreateAliasResponse = {
  alias?: string;
  url?: string;
  shortUrl?: string;
  message?: string;
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const shortUrlBaseUrl = (import.meta.env.VITE_SHORT_URL_BASE_URL ?? apiBaseUrl).replace(/\/$/, '');

const form = document.querySelector<HTMLFormElement>('#alias-form');
const submitButton = document.querySelector<HTMLButtonElement>('.submit-button');
const successDialog = document.querySelector<HTMLDialogElement>('#success-dialog');
const shortUrlInput = document.querySelector<HTMLInputElement>('#short-url');
const shortUrlPrefix = document.querySelector<HTMLSpanElement>('#short-url-prefix');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-button');
const copyButtonContent = copyButton?.innerHTML ?? '';
const copiedButtonContent = `
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9.3 16.6 4.9 12.2l1.4-1.4 3 3 8.4-8.4 1.4 1.4-9.8 9.8Z" />
  </svg>
`;

if (!form || !submitButton || !successDialog || !shortUrlInput || !shortUrlPrefix || !copyButton) {
  throw new Error('Required UI elements were not found.');
}

shortUrlPrefix.textContent = shortUrlBaseUrl ? `${shortUrlBaseUrl}/` : '/';

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const url = String(formData.get('url') ?? '').trim();
  const alias = String(formData.get('alias') ?? '').trim();

  if (!url || !alias) {
    alert('Enter both URL and short name.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Creating...';

  try {
    const response = await fetch(`${apiBaseUrl}/api/aliases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, alias }),
    });

    const payload = (await response.json().catch(() => ({}))) as CreateAliasResponse;

    if (!response.ok) {
      const message = payload.message ?? `Failed to create alias URL. status=${response.status}`;
      throw new Error(message);
    }

    const shortUrl = payload.shortUrl ?? `${shortUrlBaseUrl}/${alias}`;

    shortUrlInput.value = shortUrl;
    copyButton.innerHTML = copyButtonContent;
    copyButton.setAttribute('aria-label', 'Copy alias URL');
    successDialog.showModal();
    form.reset();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alias URL.';
    alert(message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Create';
  }
});

copyButton.addEventListener('click', async () => {
  const shortUrl = shortUrlInput.value;

  if (!shortUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(shortUrl);
    copyButton.innerHTML = copiedButtonContent;
    copyButton.setAttribute('aria-label', 'Copied');

    window.setTimeout(() => {
      copyButton.innerHTML = copyButtonContent;
      copyButton.setAttribute('aria-label', 'Copy alias URL');
    }, 1800);
  } catch {
    shortUrlInput.select();
    alert('Could not copy automatically. Copy the selected URL manually.');
  }
});
