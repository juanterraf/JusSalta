// ============================================
// IOL Salta - Content Script (ISOLATED world)
// Injected on plataforma.justiciasalta.gov.ar/*
// - Relays intercepted data & JWT to extension
// - Injects "Monitorear" button in portal UI
// ============================================

(() => {
  'use strict';

  let interceptedExpediente = null;
  let interceptedActuaciones = null;
  let monitorButtonInjected = false;

  // Listen for data from MAIN world interceptor
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    // Intercepted API data
    if (event.data?.type === 'IOL_EXT_INTERCEPTED') {
      if (event.data.expediente) {
        interceptedExpediente = event.data.expediente;
      }
      if (event.data.actuaciones) {
        interceptedActuaciones = event.data.actuaciones;
      }
      if (interceptedExpediente) {
        injectMonitorButton();
      }
    }

    // Intercepted JWT token - save to extension storage
    if (event.data?.type === 'IOL_EXT_TOKEN' && event.data.token) {
      chrome.runtime.sendMessage({
        type: 'SAVE_TOKEN',
        token: event.data.token,
      }).catch(() => {});
    }
  });

  // ---- Message Handler (from popup / background) ----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'GET_CURRENT_CASE':
        if (interceptedExpediente) {
          sendResponse({ expediente: interceptedExpediente, actuaciones: interceptedActuaciones });
        } else {
          // Wait a bit for interception
          setTimeout(() => {
            sendResponse({ expediente: interceptedExpediente, actuaciones: interceptedActuaciones });
          }, 1500);
        }
        return true;

      case 'SHOW_TOAST':
        showToast(msg.message, msg.toastType);
        return false;
    }
  });

  // ---- Inject "Monitorear" button into IOL Angular UI ----
  function injectMonitorButton() {
    if (monitorButtonInjected) return;

    const tryInject = () => {
      // Look for the expediente detail area in the Angular SPA
      const candidates = document.querySelectorAll(
        '.expediente-header, .detalle-expediente, [class*="expediente"], ' +
        '.card-header, .panel-heading, .mat-card-title, .mat-toolbar, ' +
        'h2, h3, .page-title'
      );

      for (const el of candidates) {
        if (el.querySelector('.iol-ext-monitor-btn')) return;

        const text = el.textContent || '';
        if (text.includes('Expediente') || text.includes('expediente') ||
            text.includes('Actuaciones') || text.includes('Detalle')) {
          const btn = document.createElement('button');
          btn.className = 'iol-ext-monitor-btn';
          btn.innerHTML = '\uD83D\uDCCC Monitorear';
          btn.title = 'Agregar a seguimiento en IOL Salta Extension';
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addToMonitorFromPage();
          });
          el.appendChild(btn);
          monitorButtonInjected = true;
          return;
        }
      }
    };

    tryInject();

    if (!monitorButtonInjected) {
      const observer = new MutationObserver(() => {
        tryInject();
        if (monitorButtonInjected) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 10000);
    }
  }

  async function addToMonitorFromPage() {
    if (!interceptedExpediente) {
      showToast('No se detectó expediente', 'error');
      return;
    }

    try {
      const exp = interceptedExpediente;
      const data = await chrome.storage.local.get('iol_followed');
      const followed = data.iol_followed || [];
      const expId = exp.expId || exp.id || exp.expedienteId;

      if (followed.some(f => String(f.expId) === String(expId))) {
        showToast('Ya estás monitoreando este expediente', 'info');
        return;
      }

      followed.push({
        expId,
        numero: exp.numero || exp.nroExpediente || '',
        caratula: exp.caratula || exp.nombre || '',
        organismo: exp.organismo || exp.juzgado || '',
        lastActId: 0,
        lastCheck: Date.now(),
        newCount: 0,
      });

      await chrome.storage.local.set({ iol_followed: followed });
      chrome.runtime.sendMessage({ type: 'UPDATE_ALARM', count: followed.length });
      showToast('Expediente agregado a seguimiento', 'success');
    } catch (err) {
      showToast('Error al agregar: ' + err.message, 'error');
    }
  }

  // ---- Toast ----
  function showToast(message, type = 'info') {
    const existing = document.querySelector('.iol-ext-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `iol-ext-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---- Monitor URL changes (Angular SPA) ----
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      interceptedExpediente = null;
      interceptedActuaciones = null;
      monitorButtonInjected = false;
      chrome.runtime.sendMessage({ type: 'URL_CHANGED', url: lastUrl }).catch(() => {});
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
})();
