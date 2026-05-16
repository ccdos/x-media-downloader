(function initOptionsPage() {
  const shared = globalThis.XMDShared;
  if (!shared) {
    return;
  }

  const { DEFAULT_FILENAME_TEMPLATES, resolveFilenameTemplateOptions } = shared;
  const form = document.getElementById('settings-form');
  const primaryInput = document.getElementById('primaryTemplate');
  const fallbackInput = document.getElementById('fallbackTemplate');
  const resetButton = document.getElementById('resetButton');
  const status = document.getElementById('status');

  load();
  form.addEventListener('submit', onSubmit);
  resetButton.addEventListener('click', onReset);

  function load() {
    chrome.storage.local.get(['primaryTemplate', 'fallbackTemplate'], (stored) => {
      const values = resolveFilenameTemplateOptions(stored || {});
      primaryInput.value = values.primaryTemplate;
      fallbackInput.value = values.fallbackTemplate;
    });
  }

  function onSubmit(event) {
    event.preventDefault();
    const values = resolveFilenameTemplateOptions({
      primaryTemplate: primaryInput.value,
      fallbackTemplate: fallbackInput.value,
    });

    chrome.storage.local.set(values, () => {
      primaryInput.value = values.primaryTemplate;
      fallbackInput.value = values.fallbackTemplate;
      flash('Saved');
    });
  }

  function onReset() {
    chrome.storage.local.set({ ...DEFAULT_FILENAME_TEMPLATES }, () => {
      primaryInput.value = DEFAULT_FILENAME_TEMPLATES.primaryTemplate;
      fallbackInput.value = DEFAULT_FILENAME_TEMPLATES.fallbackTemplate;
      flash('Defaults restored');
    });
  }

  function flash(message) {
    status.textContent = message;
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => {
      status.textContent = '';
    }, 2000);
  }
})();
