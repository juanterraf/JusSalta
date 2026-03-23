document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get('iol_options');
  const opts = data.iol_options || {};
  document.getElementById('poll-interval').value = opts.pollInterval || 15;

  document.getElementById('btn-save').addEventListener('click', async () => {
    const interval = parseInt(document.getElementById('poll-interval').value) || 15;
    const clamped = Math.max(5, Math.min(120, interval));
    await chrome.storage.local.set({ iol_options: { pollInterval: clamped } });
    document.getElementById('poll-interval').value = clamped;

    const followedData = await chrome.storage.local.get('iol_followed');
    const count = (followedData.iol_followed || []).length;
    chrome.runtime.sendMessage({ type: 'UPDATE_ALARM', count });

    document.getElementById('status').textContent = 'Configuracion guardada.';
  });
});
