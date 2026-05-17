(function initOptionsPage() {
  const shared = globalThis.XMDShared;
  if (!shared) {
    return;
  }

  const { DEFAULT_FILENAME_TEMPLATES, DEFAULT_DOWNLOAD_OPTIONS, resolveFilenameTemplateOptions, resolveDownloadOptions } = shared;
  const form = document.getElementById('settings-form');
  const primaryInput = document.getElementById('primaryTemplate');
  const fallbackInput = document.getElementById('fallbackTemplate');
  const downloadSubdirectoryInput = document.getElementById('downloadSubdirectory');
  const resetButton = document.getElementById('resetButton');
  const status = document.getElementById('status');

  load();
  form.addEventListener('submit', onSubmit);
  resetButton.addEventListener('click', onReset);

  function load() {
    chrome.storage.local.get(['primaryTemplate', 'fallbackTemplate', 'downloadSubdirectory'], (stored) => {
      const values = {
        ...resolveFilenameTemplateOptions(stored || {}),
        ...resolveDownloadOptions(stored || {}),
      };
      primaryInput.value = values.primaryTemplate;
      fallbackInput.value = values.fallbackTemplate;
      downloadSubdirectoryInput.value = values.downloadSubdirectory;
    });
  }

  function onSubmit(event) {
    event.preventDefault();
    const values = {
      ...resolveFilenameTemplateOptions({
        primaryTemplate: primaryInput.value,
        fallbackTemplate: fallbackInput.value,
      }),
      ...resolveDownloadOptions({
        downloadSubdirectory: downloadSubdirectoryInput.value,
      }),
    };

    chrome.storage.local.set(values, () => {
      primaryInput.value = values.primaryTemplate;
      fallbackInput.value = values.fallbackTemplate;
      downloadSubdirectoryInput.value = values.downloadSubdirectory;
      flash('Saved');
    });
  }

  function onReset() {
    chrome.storage.local.set({
      ...DEFAULT_FILENAME_TEMPLATES,
      ...DEFAULT_DOWNLOAD_OPTIONS,
    }, () => {
      primaryInput.value = DEFAULT_FILENAME_TEMPLATES.primaryTemplate;
      fallbackInput.value = DEFAULT_FILENAME_TEMPLATES.fallbackTemplate;
      downloadSubdirectoryInput.value = DEFAULT_DOWNLOAD_OPTIONS.downloadSubdirectory;
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
