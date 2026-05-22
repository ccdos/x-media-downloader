(function initOptionsPage() {
  const shared = globalThis.XMDShared;
  if (!shared) {
    return;
  }

  const { DEFAULT_FILENAME_TEMPLATES, DEFAULT_DOWNLOAD_OPTIONS, resolveFilenameTemplateOptions, resolveDownloadOptions } = shared;
  const form = document.getElementById('settings-form');
  const downloadModeInputs = Array.from(document.querySelectorAll('input[name="downloadMode"]'));
  const primaryInput = document.getElementById('primaryTemplate');
  const fallbackInput = document.getElementById('fallbackTemplate');
  const downloadSubdirectoryInput = document.getElementById('downloadSubdirectory');
  const debugLoggingInput = document.getElementById('debugLogging');
  const resetButton = document.getElementById('resetButton');
  const status = document.getElementById('status');

  load();
  form.addEventListener('submit', onSubmit);
  resetButton.addEventListener('click', onReset);

  function load() {
    chrome.storage.local.get(['primaryTemplate', 'fallbackTemplate', 'downloadSubdirectory', 'downloadMode', 'debugLogging'], (stored) => {
      const values = {
        ...resolveFilenameTemplateOptions(stored || {}),
        ...resolveDownloadOptions(stored || {}),
      };
      primaryInput.value = values.primaryTemplate;
      fallbackInput.value = values.fallbackTemplate;
      downloadSubdirectoryInput.value = values.downloadSubdirectory;
      debugLoggingInput.checked = values.debugLogging;
      setDownloadMode(values.downloadMode);
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
        downloadMode: getSelectedDownloadMode(),
        debugLogging: debugLoggingInput.checked,
      }),
    };

    chrome.storage.local.set(values, () => {
      primaryInput.value = values.primaryTemplate;
      fallbackInput.value = values.fallbackTemplate;
      downloadSubdirectoryInput.value = values.downloadSubdirectory;
      debugLoggingInput.checked = values.debugLogging;
      setDownloadMode(values.downloadMode);
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
      debugLoggingInput.checked = DEFAULT_DOWNLOAD_OPTIONS.debugLogging;
      setDownloadMode(DEFAULT_DOWNLOAD_OPTIONS.downloadMode);
      flash('Defaults restored');
    });
  }

  function getSelectedDownloadMode() {
    return downloadModeInputs.find((input) => input.checked)?.value || DEFAULT_DOWNLOAD_OPTIONS.downloadMode;
  }

  function setDownloadMode(value) {
    const resolved = value === 'ask' || value === 'subdirectory' ? value : DEFAULT_DOWNLOAD_OPTIONS.downloadMode;
    downloadModeInputs.forEach((input) => {
      input.checked = input.value === resolved;
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
