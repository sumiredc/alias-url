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
const shortUrlAnchor = document.querySelector<HTMLAnchorElement>('#short-url');
const shortUrlPrefix = document.querySelector<HTMLSpanElement>('#short-url-prefix');

if (!form || !submitButton || !successDialog || !shortUrlAnchor || !shortUrlPrefix) {
  throw new Error('Required UI elements were not found.');
}

shortUrlPrefix.textContent = shortUrlBaseUrl ? `${shortUrlBaseUrl}/` : '/';

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const url = String(formData.get('url') ?? '').trim();
  const alias = String(formData.get('alias') ?? '').trim();

  if (!url || !alias) {
    alert('URL と 短縮名 を入力してください。');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = '登録中...';

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
      const message = payload.message ?? `登録に失敗しました。status=${response.status}`;
      throw new Error(message);
    }

    const shortUrl = payload.shortUrl ?? `${shortUrlBaseUrl}/${alias}`;

    shortUrlAnchor.href = shortUrl;
    shortUrlAnchor.textContent = shortUrl;
    successDialog.showModal();
    form.reset();
  } catch (error) {
    const message = error instanceof Error ? error.message : '登録に失敗しました。';
    alert(message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = '登録';
  }
});
