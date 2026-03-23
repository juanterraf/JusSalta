// ============================================
// IOL Salta - Background Service Worker
// Public API access (no auth needed)
// Polling with chrome.alarms, diff, notifications
// ============================================

importScripts('../lib/api.js', '../lib/storage.js', '../lib/diff.js');

const ALARM_NAME = 'iol-monitor';
const DEFAULT_POLL_MINUTES = 15;

// ---- Message Handler ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'SEARCH':
      IolApi.buscarCausas(msg.texto, msg.page || 0, msg.size || 20)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_ENCABEZADO':
      IolApi.getEncabezado(msg.expId)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_ACTUACIONES':
      IolApi.getActuaciones(msg.expId, msg.page || 0, msg.size || 20)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'DOWNLOAD_PDF':
      IolApi.downloadPdf(IolApi.getActuacionPdfUrl(msg.actId, msg.org, msg.expId))
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'UPDATE_ALARM':
      setupAlarm(msg.count || 0);
      return false;

    case 'CHECK_NOW':
      checkAllFollowed().then(() => sendResponse({ success: true }));
      return true;

    case 'URL_CHANGED':
      handleUrlChange(msg.url, sender.tab);
      return false;
  }
});

// ---- Alarm-based monitoring ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkAllFollowed();
  }
});

async function setupAlarm(followedCount) {
  if (followedCount > 0) {
    const data = await chrome.storage.local.get('iol_options');
    const opts = data.iol_options || {};
    const interval = opts.pollInterval || DEFAULT_POLL_MINUTES;
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: interval });
  } else {
    chrome.alarms.clear(ALARM_NAME);
  }
}

async function checkAllFollowed() {
  const data = await chrome.storage.local.get('iol_followed');
  const followed = data.iol_followed || [];
  if (!followed.length) return;

  let totalNew = 0;

  for (const f of followed) {
    try {
      const result = await IolApi.getActuaciones(f.expId, 0, 50);
      const acts = result?.content || [];

      const diff = IolDiff.compare(acts, f.lastActId);

      f.lastCheck = Date.now();

      if (acts.length > 0) {
        const latest = acts[0];
        f.lastFecha = latest.fechaPub || f.lastFecha;
        f.lastDescripcion = latest.titulo || latest.tipo || f.lastDescripcion;
      }

      if (diff.hasChanges) {
        f.newCount = (f.newCount || 0) + diff.newItems.length;
        f.lastActId = diff.maxActId;
        totalNew += diff.newItems.length;

        chrome.notifications.create(`iol-new-${f.expId}`, {
          type: 'basic',
          iconUrl: '/icons/icon128.png',
          title: `Exp. ${f.numero} - Nuevo movimiento`,
          message: `${diff.newItems.length} nueva(s) actuación(es): ${diff.newItems[0]?.titulo || diff.newItems[0]?.tipo || ''}`,
          priority: 2,
        });
      }
    } catch (err) {
      // Silently ignore per-case errors
    }

    // Delay 500ms between API calls
    await new Promise(r => setTimeout(r, 500));
  }

  await chrome.storage.local.set({ iol_followed: followed });

  // Update badge
  const totalBadge = followed.reduce((sum, f) => sum + (f.newCount || 0), 0);
  if (totalBadge > 0) {
    chrome.action.setBadgeText({ text: String(totalBadge) });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ---- Notification click -> open portal ----
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('iol-new-')) {
    chrome.tabs.create({
      url: 'https://plataforma.justiciasalta.gov.ar/iol-ui/p/inicio',
    });
  }
});

// ---- URL Change Handler ----
function handleUrlChange(url, tab) {
  if (!url || !tab?.id) return;
  const isOnExpediente = url.includes('/iol-ui/') && url.includes('expediente');
  if (isOnExpediente) {
    chrome.action.setBadgeText({ text: '●', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#059669', tabId: tab.id });
  } else if (url.includes('plataforma.justiciasalta.gov.ar')) {
    chrome.action.setBadgeText({ text: '', tabId: tab.id });
  }
}

// ---- On Install/Update ----
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('iol_followed');
  const count = (data.iol_followed || []).length;
  if (count > 0) {
    await setupAlarm(count);
  }
});
