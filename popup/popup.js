// ============================================
// IOL Salta - Popup Controller
// Public API - no auth required
// ============================================

let state = {
  currentCase: null,
  searchResults: [],
  searchPage: 0,
  searchText: '',
  tramites: [],
  history: [],
  followed: [],
  // Import
  importData: [],
  importHeaders: [],
  importResults: [],
  importRunning: false,
  importCancelled: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadHistory();
  await loadFollowed();
  checkCurrentPage();
  initEventListeners();
  initMonitorListeners();
  initImportListeners();
  initAIListeners();

  $$('.status-bar a').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: a.href }); });
  });

  const opts = await getOptions();
  $('#inp-poll-interval').value = opts.pollInterval || 15;
});

// ---- Tabs ----
function initTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
  $$('#tab-info a').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: a.href }); });
  });
}

// ---- Event Listeners ----
function initEventListeners() {
  $('#inp-search').addEventListener('input', () => {
    $('#btn-search').disabled = !$('#inp-search').value.trim();
  });
  $('#btn-search').addEventListener('click', doSearch);
  $('#inp-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('#btn-search').disabled) doSearch();
  });
  $('#btn-load-more').addEventListener('click', loadMoreResults);
  $('#btn-follow-case').addEventListener('click', toggleFollowCurrentCase);
  $('#btn-summary-last').addEventListener('click', () => generateSummary('last'));
  $('#btn-summary-full').addEventListener('click', () => generateSummary('full'));
  $('#btn-download-all').addEventListener('click', downloadAll);
  $('#btn-copy-summary').addEventListener('click', copySummary);
  $('#btn-save-options').addEventListener('click', saveOptions);
  $('#btn-send-notebooklm').addEventListener('click', sendToNotebookLM);
}

async function bgMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

// ========================================
// SEARCH
// ========================================

async function doSearch() {
  const texto = $('#inp-search').value.trim();
  if (!texto) return;
  state.searchText = texto;
  state.searchPage = 0;
  state.searchResults = [];

  setStatus('Buscando...', 'loading');
  $('#btn-search .btn-text').classList.add('hidden');
  $('#btn-search .btn-loading').classList.remove('hidden');
  $('#btn-search').disabled = true;
  $('#search-results').classList.add('hidden');
  $('#search-empty').classList.add('hidden');
  $('#btn-load-more').classList.add('hidden');

  try {
    const resp = await bgMessage({ type: 'SEARCH', texto, page: 0, size: 20 });
    if (!resp.success) throw new Error(resp.error);
    const data = resp.data;
    const results = data?.content || [];
    state.searchResults = results;

    if (!results.length) {
      $('#search-empty').classList.remove('hidden');
    } else {
      renderSearchResults(results);
      $('#search-results').classList.remove('hidden');
      if (data.totalElements > results.length) $('#btn-load-more').classList.remove('hidden');
    }
    setStatus(`${data?.totalElements || 0} resultados`, 'online');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'offline');
  } finally {
    $('#btn-search .btn-text').classList.remove('hidden');
    $('#btn-search .btn-loading').classList.add('hidden');
    $('#btn-search').disabled = false;
  }
}

async function loadMoreResults() {
  state.searchPage++;
  setStatus('Cargando mas...', 'loading');
  try {
    const resp = await bgMessage({ type: 'SEARCH', texto: state.searchText, page: state.searchPage, size: 20 });
    if (!resp.success) throw new Error(resp.error);
    const newResults = resp.data?.content || [];
    state.searchResults = state.searchResults.concat(newResults);
    renderSearchResults(state.searchResults);
    if (state.searchResults.length >= (resp.data?.totalElements || 0)) $('#btn-load-more').classList.add('hidden');
    setStatus(`${resp.data?.totalElements || 0} resultados`, 'online');
  } catch (err) { setStatus(`Error: ${err.message}`, 'offline'); }
}

function renderSearchResults(results) {
  const list = $('#results-list');
  list.innerHTML = '';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-card-header">
        <span class="result-card-number">${escapeHtml(r.expId || '')}</span>
        <span class="result-card-type">${escapeHtml(r.codigoOrganismoRadActual || '')}</span>
      </div>
      <div class="result-card-title">Cargando...</div>
    `;
    card.addEventListener('click', () => openCase(r.expId));
    list.appendChild(card);
    loadCardDetails(card, r.expId);
  });
}

async function loadCardDetails(card, expId) {
  try {
    const resp = await bgMessage({ type: 'GET_ENCABEZADO', expId });
    if (resp.success && resp.data) {
      const d = resp.data;
      card.querySelector('.result-card-number').textContent = `Exp. ${d.numero || ''}/${d.anio || ''}`;
      card.querySelector('.result-card-title').textContent = d.caratula || 'Sin caratula';
      card.querySelector('.result-card-type').textContent = d.organismoRadActual || '';
    }
  } catch {}
}

// ========================================
// OPEN CASE
// ========================================

async function openCase(expId) {
  if (!expId) return;
  setStatus('Cargando expediente...', 'loading');

  try {
    const resp = await bgMessage({ type: 'GET_ENCABEZADO', expId });
    if (!resp.success) throw new Error(resp.error);
    const data = resp.data;
    state.currentCase = { ...data, expId };
    state.tramites = [];

    // Switch to current tab
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    $$('.tab')[1].classList.add('active');
    $('#tab-current').classList.add('active');

    $('#current-empty').classList.add('hidden');
    $('#current-case').classList.remove('hidden');
    $('#summary-section').classList.add('hidden');
    $('#tramites-section').classList.add('hidden');
    $('#download-progress').classList.add('hidden');

    $('#case-title').textContent = data.caratula || 'Sin caratula';
    $('#case-number').textContent = `Exp. ${data.numero || ''}/${data.anio || ''}`;
    $('#case-court').textContent = data.organismoRadActual || '-';
    $('#case-estado').textContent = data.estadoAdministrativo || '-';
    $('#case-cuij').textContent = data.cuij || '-';

    updateFollowButton();
    saveToHistory({ expId, numero: `${data.numero || ''}/${data.anio || ''}`, caratula: data.caratula || '' });

    // Load actuaciones
    await loadTramites(expId);
    setStatus('Listo', 'online');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'offline');
  }
}

async function loadTramites(expId) {
  try {
    setStatus('Cargando actuaciones...', 'loading');
    const resp = await bgMessage({ type: 'GET_ACTUACIONES', expId, page: 0, size: 100 });
    if (!resp.success) throw new Error(resp.error);
    state.tramites = resp.data?.content || [];
    renderTramites(state.tramites);
    setStatus(`${state.tramites.length} actuaciones`, 'online');
  } catch (err) {
    setStatus(`Error actuaciones: ${err.message}`, 'offline');
  }
}

function renderTramites(tramites) {
  if (!tramites.length) {
    $('#tramites-section').classList.remove('hidden');
    $('#tramites-list').innerHTML = '<div class="empty-state"><p>No hay actuaciones publicas</p></div>';
    return;
  }
  $('#tramites-section').classList.remove('hidden');
  const container = $('#tramites-list');
  container.innerHTML = tramites.map((t, i) => {
    const fecha = t.fechaPub ? formatDate(t.fechaPub) : '';
    const org = t.organismo ? t.organismo.split(' | ')[0] : '';
    return `
      <div class="tramite-card">
        <div class="tramite-header" data-index="${i}">
          <span class="tramite-date">${fecha}</span>
          <span class="tramite-desc">${escapeHtml(t.titulo || t.tipo || 'Actuacion')}</span>
          <span class="tramite-toggle">▼</span>
        </div>
        <div class="tramite-body" data-index="${i}">
          <div class="tramite-text">${escapeHtml(t.tipo || '')} ${t.firmantes ? '- ' + escapeHtml(t.firmantes) : ''}</div>
          ${t.actId ? `<div class="tramite-files"><a class="tramite-file" href="#" data-act-id="${t.actId}" data-org="${escapeAttr(org)}" data-exp-id="${state.currentCase.expId}">📄 Descargar PDF</a></div>` : ''}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.tramite-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = container.querySelector(`.tramite-body[data-index="${h.dataset.index}"]`);
      const toggle = h.querySelector('.tramite-toggle');
      body.classList.toggle('open');
      toggle.classList.toggle('open');
    });
  });

  container.querySelectorAll('.tramite-file').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      downloadActuacionPdf(link.dataset.actId, link.dataset.org, link.dataset.expId);
    });
  });
}

async function downloadActuacionPdf(actId, org, expId) {
  setStatus('Descargando PDF...', 'loading');
  try {
    const resp = await bgMessage({ type: 'DOWNLOAD_PDF', actId, org, expId });
    if (!resp.success) throw new Error(resp.error);
    const dataUrl = `data:${resp.data.type};base64,${resp.data.base64}`;
    chrome.downloads.download({ url: dataUrl, filename: `actuacion_${actId}.pdf`, saveAs: true });
    setStatus('PDF descargado', 'online');
  } catch (err) { setStatus(`Error PDF: ${err.message}`, 'offline'); }
}

// ========================================
// SUMMARIES
// ========================================

async function generateSummary(type) {
  if (!state.currentCase || !state.tramites.length) {
    showToast('No hay actuaciones para resumir', 'error'); return;
  }
  const btn = type === 'last' ? $('#btn-summary-last') : $('#btn-summary-full');
  const origText = btn.textContent;
  btn.textContent = 'Generando...';
  btn.disabled = true;

  try {
    let summary = '', title = '';
    if (type === 'last') {
      title = 'Resumen - Ultima Actuacion';
      summary = buildLastTramiteSummary(state.tramites[0]);
    } else {
      title = 'Informe General de la Causa';
      summary = buildFullCaseSummary(state.currentCase, state.tramites);
    }
    $('#summary-title').textContent = title;
    $('#summary-content').textContent = summary;
    $('#summary-section').classList.remove('hidden');
    $('#summary-section').scrollIntoView({ behavior: 'smooth' });
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function buildLastTramiteSummary(t) {
  const lines = [];
  lines.push(`FECHA: ${t.fechaPub ? formatDate(t.fechaPub) : 'N/D'}`);
  lines.push(`TIPO: ${t.tipo || 'N/D'}`);
  lines.push(`TITULO: ${t.titulo || 'N/D'}`);
  if (t.firmantes) lines.push(`FIRMANTES: ${t.firmantes}`);
  if (t.organismo) lines.push(`ORGANISMO: ${t.organismo}`);
  lines.push('');
  if (t.actId) lines.push(`ID Actuacion: ${t.actId}`);
  return lines.join('\n');
}

function buildFullCaseSummary(c, tramites) {
  const lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push('     INFORME GENERAL DE LA CAUSA');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`EXPEDIENTE: ${c.numero || ''}/${c.anio || ''}`);
  lines.push(`CUIJ: ${c.cuij || 'N/D'}`);
  lines.push(`CARATULA: ${c.caratula || 'N/D'}`);
  lines.push(`JUZGADO: ${c.organismoRadActual || 'N/D'}`);
  lines.push(`ESTADO: ${c.estadoAdministrativo || 'N/D'}`);

  if (c.sujetos?.length) {
    lines.push('');
    lines.push('── PARTES ──');
    c.sujetos.forEach(s => {
      lines.push(`  ${s.vinculo || 'PARTE'}: ${s.nombreApellido || 'N/D'}`);
      if (s.representantes?.length) {
        s.representantes.forEach(r => {
          lines.push(`    ${r.vinculo || 'REP'}: ${r.nombreApellido || ''}`);
        });
      }
    });
  }

  lines.push('');
  lines.push('── ESTADISTICAS ──');
  lines.push(`Total de actuaciones: ${tramites.length}`);
  if (tramites.length > 0) {
    const sorted = [...tramites].filter(t => t.fechaPub).sort((a, b) => a.fechaPub - b.fechaPub);
    if (sorted.length) {
      lines.push(`Primera actuacion: ${formatDate(sorted[0].fechaPub)}`);
      lines.push(`Ultima actuacion: ${formatDate(sorted[sorted.length - 1].fechaPub)}`);
    }
  }

  lines.push('');
  lines.push('── CRONOLOGIA DE ACTUACIONES ──');
  lines.push('');
  tramites.forEach((t, i) => {
    const fecha = t.fechaPub ? formatDate(t.fechaPub) : 'S/F';
    lines.push(`[${i + 1}] ${fecha} - ${t.tipo || ''} - ${t.titulo || ''}`);
    if (t.firmantes) lines.push(`    Firmantes: ${t.firmantes}`);
    lines.push('');
  });

  if (tramites.length > 0) {
    const last = tramites[0];
    lines.push('── ESTADO ACTUAL ──');
    lines.push(`Ultimo movimiento: ${last.fechaPub ? formatDate(last.fechaPub) : 'N/D'}`);
    lines.push(`Tipo: ${last.tipo || 'N/D'}`);
    lines.push(`Titulo: ${last.titulo || 'N/D'}`);
  }

  return lines.join('\n');
}

function copySummary() {
  const text = $('#summary-content').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Copiado al portapapeles', 'success'));
}

// ========================================
// ZIP DOWNLOAD
// ========================================

async function downloadAll() {
  if (!state.currentCase || !state.tramites.length) {
    showToast('No hay actuaciones para descargar', 'error'); return;
  }

  const btn = $('#btn-download-all');
  btn.disabled = true;
  btn.textContent = 'Preparando...';
  const progressEl = $('#download-progress');
  const progressFill = $('#progress-fill');
  const progressText = $('#progress-text');
  progressEl.classList.remove('hidden');

  try {
    const zip = new JSZip();
    const expNum = `${state.currentCase.numero || 'exp'}_${state.currentCase.anio || ''}`;
    const folder = `Expediente_${expNum}`;

    // Add summary
    zip.file(`${folder}/INFORME_GENERAL.txt`, buildFullCaseSummary(state.currentCase, state.tramites));

    const total = state.tramites.length;
    let done = 0, errors = 0;

    for (let i = 0; i < state.tramites.length; i++) {
      const t = state.tramites[i];
      const num = String(i + 1).padStart(3, '0');
      const fecha = t.fechaPub ? new Date(t.fechaPub).toISOString().slice(0, 10) : 'sf';
      const desc = sanitizeFilename(t.titulo || t.tipo || 'actuacion');
      const prefix = `${folder}/${num}_${fecha}_${desc}`;

      done++;
      progressText.textContent = `[${done}/${total}] ${t.titulo || t.tipo || ''}...`;
      progressFill.style.width = `${Math.round((done / total) * 100)}%`;

      if (t.actId) {
        try {
          const org = t.organismo ? t.organismo.split(' | ')[0] : '';
          const resp = await bgMessage({ type: 'DOWNLOAD_PDF', actId: t.actId, org, expId: state.currentCase.expId });
          if (resp.success) {
            const binary = atob(resp.data.base64);
            const bytes = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
            zip.file(`${prefix}.pdf`, bytes);
          } else { errors++; }
        } catch { errors++; }
      } else { errors++; }
    }

    progressText.textContent = 'Generando ZIP...';
    const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
      progressFill.style.width = `${meta.percent}%`;
    });

    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `${folder}.zip`, saveAs: true },
      () => setTimeout(() => URL.revokeObjectURL(url), 1000));

    const msg = errors > 0 ? `ZIP generado (${errors} sin PDF)` : 'ZIP generado correctamente';
    progressText.textContent = msg;
    showToast(msg, errors > 0 ? 'info' : 'success');
  } catch (err) {
    showToast('Error ZIP: ' + err.message, 'error');
    progressText.textContent = 'Error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Descargar todo (ZIP)';
    setTimeout(() => progressEl.classList.add('hidden'), 5000);
  }
}

// ========================================
// AI REPORT (Gemini)
// ========================================

function initAIListeners() {
  $('#btn-save-key').addEventListener('click', saveGeminiKey);
  $('#btn-ai-report').addEventListener('click', generateAIReport);
  chrome.storage.local.get('iol_gemini_key', (data) => {
    if (data.iol_gemini_key) $('#inp-gemini-key').value = data.iol_gemini_key;
  });
}

function saveGeminiKey() {
  const key = $('#inp-gemini-key').value.trim();
  if (!key) { showToast('Ingresa una API key', 'error'); return; }
  chrome.storage.local.set({ iol_gemini_key: key });
  showToast('API Key guardada', 'success');
}

async function generateAIReport() {
  if (!state.currentCase || !state.tramites.length) {
    showToast('No hay expediente cargado', 'error'); return;
  }
  const data = await chrome.storage.local.get('iol_gemini_key');
  const apiKey = data.iol_gemini_key;
  if (!apiKey) {
    showToast('Configura tu API Key de Gemini en la pestana Info', 'error');
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    $$('.tab')[4].classList.add('active');
    $('#tab-info').classList.add('active');
    $('#inp-gemini-key').focus();
    return;
  }

  const btn = $('#btn-ai-report');
  btn.textContent = 'Analizando con IA...';
  btn.disabled = true;

  try {
    const c = state.currentCase;
    const tramitesText = state.tramites.map((t, i) => {
      const fecha = t.fechaPub ? formatDate(t.fechaPub) : 'S/F';
      return `[${i + 1}] ${fecha} - ${t.tipo || ''} - ${t.titulo || ''} ${t.firmantes ? '(Firma: ' + t.firmantes + ')' : ''}`;
    }).join('\n');

    const sujetos = (c.sujetos || []).map(s => `${s.vinculo}: ${s.nombreApellido}`).join(', ');

    const prompt = `Sos un abogado argentino experto en derecho procesal. Analiza el siguiente expediente judicial y genera un informe profesional en español.

EXPEDIENTE: ${c.numero || ''}/${c.anio || ''}
CUIJ: ${c.cuij || 'N/D'}
CARATULA: ${c.caratula || 'N/D'}
JUZGADO: ${c.organismoRadActual || 'N/D'}
ESTADO: ${c.estadoAdministrativo || 'N/D'}
PARTES: ${sujetos || 'N/D'}
TOTAL DE ACTUACIONES: ${state.tramites.length}

CRONOLOGIA:
${tramitesText}

Genera un informe con:
1. RESUMEN EJECUTIVO (2-3 oraciones)
2. OBJETO DE LA CAUSA
3. PARTES INTERVINIENTES
4. CRONOLOGIA PROCESAL RELEVANTE (solo hitos importantes)
5. ESTADO ACTUAL Y PROXIMOS PASOS PROBABLES
6. OBSERVACIONES

Se conciso y profesional. No inventes datos.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    });

    if (!resp.ok) throw new Error(await resp.text().then(t => t.substring(0, 200)));
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Respuesta vacia de Gemini');

    $('#summary-title').textContent = 'Informe IA';
    $('#summary-content').textContent = text;
    $('#summary-section').classList.remove('hidden');
    $('#summary-section').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast('Error IA: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Informe IA';
    btn.disabled = false;
  }
}

// ========================================
// NOTEBOOKLM (ported from working Tucumán code)
// ========================================

async function sendToNotebookLM() {
  if (!state.currentCase || !state.tramites.length) {
    showToast('No hay actuaciones para enviar', 'error');
    return;
  }

  const btn = $('#btn-send-notebooklm');
  btn.disabled = true;
  btn.textContent = 'Preparando...';
  const progressEl = $('#download-progress');
  const progressFill = $('#progress-fill');
  const progressText = $('#progress-text');
  progressEl.classList.remove('hidden');
  progressText.textContent = 'Abriendo NotebookLM...';
  progressFill.style.width = '0%';

  try {
    const caseData = state.currentCase;
    const expNum = `${caseData.numero || ''}/${caseData.anio || ''}`;
    const caratula = caseData.caratula || 'Expediente';
    const notebookTitle = `${caratula} - Exp. ${expNum}`;

    // Step 1: Find or open NotebookLM tab
    progressText.textContent = 'Buscando pestana de NotebookLM...';
    let nlmTab = await findNotebookLMTab();

    if (!nlmTab) {
      nlmTab = await chrome.tabs.create({ url: 'https://notebooklm.google.com/', active: false });
      progressText.textContent = 'Esperando que cargue NotebookLM...';
      await waitForTabLoad(nlmTab.id, 15000);
      await sleep(3000);
    }

    // Step 2: Inject bridge script
    progressText.textContent = 'Conectando con NotebookLM...';
    progressFill.style.width = '10%';

    await chrome.scripting.executeScript({
      target: { tabId: nlmTab.id },
      files: ['content/notebooklm-bridge.js'],
      world: 'MAIN',
    });
    await sleep(1000);

    // Step 3: Create notebook via bridge
    progressText.textContent = 'Creando notebook...';
    progressFill.style.width = '15%';

    const createResult = await chrome.scripting.executeScript({
      target: { tabId: nlmTab.id },
      world: 'MAIN',
      func: async () => {
        try {
          const bridge = window.__SAE_NLM_BRIDGE;
          if (!bridge?.ready) throw new Error('Bridge no disponible');
          const projectId = await bridge.createNotebook();
          return { success: true, projectId };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
    });

    const createData = createResult?.[0]?.result;
    if (!createData?.success) {
      throw new Error(createData?.error || 'No se pudo crear el notebook');
    }
    const projectId = createData.projectId;

    // Step 4: Navigate to the new notebook
    await chrome.tabs.update(nlmTab.id, {
      url: `https://notebooklm.google.com/notebook/${projectId}`,
    });
    await waitForTabLoad(nlmTab.id, 10000);
    await sleep(2000);

    // Re-inject bridge with retries
    let bridgeReady = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(2000);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: nlmTab.id },
          files: ['content/notebooklm-bridge.js'],
          world: 'MAIN',
        });
        await sleep(1000);

        const check = await chrome.scripting.executeScript({
          target: { tabId: nlmTab.id },
          world: 'MAIN',
          func: () => {
            const b = window.__SAE_NLM_BRIDGE;
            if (!b?.ready) return { ready: false };
            const p = b.getSessionParams();
            return { ready: !!p.at };
          },
        });
        if (check?.[0]?.result?.ready) { bridgeReady = true; break; }
      } catch {}
      progressText.textContent = `Esperando que cargue NotebookLM (intento ${attempt + 2}/5)...`;
    }

    if (!bridgeReady) {
      throw new Error('No se pudo conectar con NotebookLM despues de 5 intentos. Recarga la pagina de NotebookLM y volve a intentar.');
    }

    // Step 5: Upload sources
    progressText.textContent = 'Preparando actuaciones...';
    progressFill.style.width = '20%';

    const MAX_SOURCES = 50;
    const tramites = state.tramites;
    let successCount = 0, failCount = 0, skipped = 0;

    // Upload summary source
    const summaryText = buildFullCaseSummary(caseData, tramites);
    progressText.textContent = 'Subiendo resumen del expediente...';
    const summaryOk = await nlmAddSource(nlmTab.id, projectId, `Expediente ${expNum} - Resumen`, summaryText);
    if (summaryOk) successCount++; else failCount++;
    await sleep(1000);

    // Get Gemini key for PDF text extraction
    const geminiKeyData = await chrome.storage.local.get('iol_gemini_key');
    const geminiKey = geminiKeyData.iol_gemini_key || null;

    // Upload each actuacion as individual source
    const maxTramites = Math.min(tramites.length, MAX_SOURCES - 1);
    for (let i = 0; i < maxTramites; i++) {
      const t = tramites[i];
      const pct = 20 + Math.round((i / maxTramites) * 75);
      progressFill.style.width = `${pct}%`;

      const num = String(i + 1).padStart(3, '0');
      const fecha = t.fechaPub ? formatDate(t.fechaPub) : 'S/F';
      const sourceTitle = `${num} - ${fecha} - ${t.titulo || t.tipo || 'Actuacion'}`;
      progressText.textContent = `[${i + 1}/${maxTramites}] ${t.titulo || t.tipo || 'Actuacion'}...`;

      // Build source content from actuacion metadata
      const contentParts = [
        `FECHA: ${fecha}`,
        `TIPO: ${t.tipo || 'N/D'}`,
        `TITULO: ${t.titulo || 'N/D'}`,
        t.firmantes ? `FIRMANTES: ${t.firmantes}` : null,
        t.organismo ? `ORGANISMO: ${t.organismo}` : null,
        '',
      ].filter(Boolean);

      // Try to extract text from PDF using Gemini
      if (t.actId && geminiKey) {
        try {
          progressText.textContent = `[${i + 1}/${maxTramites}] Extrayendo PDF...`;
          const org = t.organismo ? t.organismo.split(' | ')[0] : '';
          const pdfResp = await bgMessage({ type: 'DOWNLOAD_PDF', actId: t.actId, org, expId: caseData.expId });
          if (pdfResp.success && pdfResp.data?.base64) {
            const pdfText = await extractPdfTextWithGemini(geminiKey, pdfResp.data.base64);
            if (pdfText && pdfText.length >= 10) {
              contentParts.push('--- CONTENIDO DEL DOCUMENTO ---', pdfText);
            }
          }
        } catch {}
      }

      const sourceContent = contentParts.join('\n');
      if (sourceContent.length < 50) { skipped++; continue; }

      const result = await nlmAddSource(nlmTab.id, projectId, sourceTitle, sourceContent);
      if (result) successCount++; else failCount++;
      if (i < maxTramites - 1) await sleep(1500);
    }

    if (tramites.length > MAX_SOURCES - 1) skipped += tramites.length - maxTramites;

    // Done
    progressFill.style.width = '100%';
    const parts = [`${successCount} fuente(s) subidas`];
    if (failCount > 0) parts.push(`${failCount} fallaron`);
    if (skipped > 0) parts.push(`${skipped} omitidas`);
    const msg = `NotebookLM: ${parts.join(', ')}`;
    progressText.textContent = msg;
    showToast(msg, failCount > 0 ? 'error' : 'success');
    chrome.tabs.update(nlmTab.id, { active: true });

  } catch (err) {
    console.error('NotebookLM error:', err);
    showToast('Error NotebookLM: ' + err.message, 'error');
    progressText.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar a NotebookLM';
    setTimeout(() => progressEl.classList.add('hidden'), 5000);
  }
}

async function nlmAddSource(tabId, projectId, title, content) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (pid, t, c) => {
        try {
          const b = window.__SAE_NLM_BRIDGE;
          if (!b?.ready) return { success: false, error: 'Bridge no disponible' };
          await b.addTextSource(pid, t, c);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
      args: [projectId, title, content],
    });
    return result?.[0]?.result?.success || false;
  } catch (err) {
    console.warn('[IOL NLM] Source error:', title, err.message);
    return false;
  }
}

async function findNotebookLMTab() {
  const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
  return tabs[0] || null;
}

function waitForTabLoad(tabId, timeout = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, timeout);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractPdfTextWithGemini(apiKey, base64Pdf) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
          { text: 'Extrae todo el texto de este documento PDF. Devuelve SOLO el texto completo, sin comentarios ni explicaciones.' },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini PDF: ${resp.status}`);
  const json = await resp.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini no devolvio texto del PDF');
  return text;
}

// ========================================
// MONITORING
// ========================================

async function loadFollowed() {
  const data = await chrome.storage.local.get('iol_followed');
  state.followed = data.iol_followed || [];
  renderMonitorList();
}

function saveFollowed() {
  chrome.storage.local.set({ iol_followed: state.followed });
  renderMonitorList();
  bgMessage({ type: 'UPDATE_ALARM', count: state.followed.length });
}

function toggleFollowCurrentCase() {
  const c = state.currentCase;
  if (!c?.expId) { showToast('No hay expediente cargado', 'error'); return; }

  const idx = state.followed.findIndex(f => f.expId === c.expId);
  if (idx >= 0) {
    state.followed.splice(idx, 1);
    showToast('Dejaste de monitorear el expediente', 'info');
  } else {
    const maxActId = state.tramites.reduce((max, t) => Math.max(max, parseInt(t.actId) || 0), 0);
    const last = state.tramites[0];
    state.followed.unshift({
      expId: c.expId,
      numero: `${c.numero || ''}/${c.anio || ''}`,
      caratula: c.caratula || '',
      organismo: c.organismoRadActual || '',
      lastActId: maxActId,
      lastFecha: last?.fechaPub ? formatDate(last.fechaPub) : '',
      lastDescripcion: last?.titulo || last?.tipo || '',
      lastCheck: Date.now(),
      newCount: 0,
    });
    showToast('Expediente agregado a seguimiento', 'success');
  }
  saveFollowed();
  updateFollowButton();
}

function updateFollowButton() {
  const btn = $('#btn-follow-case');
  if (!btn || !state.currentCase?.expId) return;
  const isF = state.followed.some(f => f.expId === state.currentCase.expId);
  btn.textContent = isF ? 'Dejar de monitorear' : 'Monitorear expediente';
  btn.classList.toggle('following', isF);
}

function initMonitorListeners() {
  $('#btn-check-all').addEventListener('click', checkAllFollowed);
}

function renderMonitorList() {
  if (!state.followed.length) {
    $('#monitor-empty').classList.remove('hidden');
    $('#monitor-content').classList.add('hidden');
    return;
  }
  $('#monitor-empty').classList.add('hidden');
  $('#monitor-content').classList.remove('hidden');
  $('#monitor-count').textContent = `${state.followed.length} expediente(s)`;

  const container = $('#monitor-list');
  container.innerHTML = state.followed.map((f, i) => {
    const hasNew = f.newCount > 0;
    return `
      <div class="monitor-card${hasNew ? ' has-new' : ''}" data-index="${i}">
        <div class="monitor-card-top">
          <div class="monitor-card-info">
            <div class="monitor-card-number">Exp. ${escapeHtml(f.numero || '')}</div>
            <div class="monitor-card-title">${escapeHtml(f.caratula || '')}</div>
          </div>
          <span class="badge ${hasNew ? 'badge-new' : 'badge-ok'}">${hasNew ? f.newCount + ' nueva(s)' : 'Al dia'}</span>
        </div>
        <div class="monitor-card-bottom">
          <span class="monitor-card-status">${f.lastFecha || 'Sin verificar'}</span>
          <div class="monitor-card-actions">
            <button class="btn-sm btn-primary monitor-check" data-index="${i}">Verificar</button>
            <button class="btn-sm btn-danger monitor-unfollow" data-index="${i}">Quitar</button>
          </div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.monitor-check').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); checkSingleFollowed(parseInt(btn.dataset.index)); });
  });
  container.querySelectorAll('.monitor-unfollow').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); state.followed.splice(parseInt(btn.dataset.index), 1); saveFollowed(); });
  });
  container.querySelectorAll('.monitor-card').forEach(card => {
    card.addEventListener('click', () => {
      const f = state.followed[parseInt(card.dataset.index)];
      if (f) { f.newCount = 0; saveFollowed(); openCase(f.expId); }
    });
  });
}

async function checkSingleFollowed(index) {
  const f = state.followed[index];
  if (!f) return;
  const btn = $$(`.monitor-check[data-index="${index}"]`)[0];
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  try {
    const resp = await bgMessage({ type: 'GET_ACTUACIONES', expId: f.expId, page: 0, size: 50 });
    if (!resp.success) throw new Error(resp.error);
    const acts = resp.data?.content || [];
    const maxActId = acts.reduce((max, a) => Math.max(max, parseInt(a.actId) || 0), 0);
    const newCount = acts.filter(a => (parseInt(a.actId) || 0) > (f.lastActId || 0)).length;

    f.lastCheck = Date.now();
    if (acts.length > 0) {
      f.lastFecha = acts[0].fechaPub ? formatDate(acts[0].fechaPub) : f.lastFecha;
      f.lastDescripcion = acts[0].titulo || acts[0].tipo || f.lastDescripcion;
    }
    if (newCount > 0) { f.newCount = newCount; f.lastActId = maxActId; }
    saveFollowed();
  } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
  finally { if (btn) { btn.textContent = 'Verificar'; btn.disabled = false; } }
}

async function checkAllFollowed() {
  const btn = $('#btn-check-all');
  btn.textContent = 'Verificando...';
  btn.disabled = true;
  for (let i = 0; i < state.followed.length; i++) {
    await checkSingleFollowed(i);
    if (i < state.followed.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  btn.textContent = 'Verificar todos';
  btn.disabled = false;
  showToast('Verificacion completada', 'success');
}

// ========================================
// BULK IMPORT
// ========================================

function initImportListeners() {
  const dropZone = $('#drop-zone');
  const fileInput = $('#inp-file');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFileUpload(fileInput.files[0]); });

  $('#btn-import-clear').addEventListener('click', resetImport);
  $('#btn-start-import').addEventListener('click', startImport);
  $('#btn-cancel-import').addEventListener('click', () => { state.importCancelled = true; });
  $('#btn-export-results').addEventListener('click', exportResults);
  $('#btn-follow-all').addEventListener('click', followAllImported);
  $('#btn-new-import')?.addEventListener('click', resetImport);
  $('#sel-col-number').addEventListener('change', validateImportForm);
  $('#sel-col-filter').addEventListener('change', () => {
    $('#filter-value-section').classList.toggle('hidden', !$('#sel-col-filter').value);
  });
}

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!json.length) { showToast('El archivo esta vacio', 'error'); return; }

      state.importData = json;
      state.importHeaders = Object.keys(json[0]);

      $('#import-upload').classList.add('hidden');
      $('#import-config').classList.remove('hidden');
      $('#import-filename').textContent = file.name + ` (${json.length} filas)`;

      const sel = $('#sel-col-number');
      sel.innerHTML = '<option value="">Seleccionar columna</option>';
      state.importHeaders.forEach(h => {
        const selected = /exp|nro|numero|causa/i.test(h) ? 'selected' : '';
        sel.innerHTML += `<option value="${h}" ${selected}>${h}</option>`;
      });

      const filterSel = $('#sel-col-filter');
      filterSel.innerHTML = '<option value="">Sin filtro</option>';
      state.importHeaders.forEach(h => {
        filterSel.innerHTML += `<option value="${h}">${h}</option>`;
      });

      renderImportPreview(json.slice(0, 5));
      validateImportForm();
    } catch (err) { showToast('Error al leer: ' + err.message, 'error'); }
  };
  reader.readAsArrayBuffer(file);
}

function validateImportForm() {
  $('#btn-start-import').disabled = !$('#sel-col-number').value;
}

function renderImportPreview(rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  let html = '<table><thead><tr>';
  headers.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr>';
    headers.forEach(h => { html += `<td>${escapeHtml(String(r[h] || ''))}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  $('#import-preview').innerHTML = html;
}

function resetImport() {
  state.importData = [];
  state.importHeaders = [];
  state.importResults = [];
  $('#import-upload').classList.remove('hidden');
  $('#import-config').classList.add('hidden');
  $('#import-progress').classList.add('hidden');
  $('#inp-file').value = '';
}

async function startImport() {
  const colName = $('#sel-col-number').value;
  if (!colName) return;

  const filterCol = $('#sel-col-filter').value;
  const filterValue = ($('#inp-filter-value')?.value || '').trim().toUpperCase();

  const cases = state.importData.map(row => {
    const number = String(row[colName] || '').trim();
    if (!number) return null;
    let skip = false;
    if (filterCol && filterValue) {
      skip = !String(row[filterCol] || '').toUpperCase().includes(filterValue);
    }
    return { number, skip, row };
  }).filter(Boolean);

  if (!cases.length) { showToast('No se encontraron numeros', 'error'); return; }

  state.importRunning = true;
  state.importCancelled = false;
  state.importResults = [];

  $('#import-config').classList.add('hidden');
  $('#import-progress').classList.remove('hidden');
  $('#btn-cancel-import').classList.remove('hidden');
  $('#btn-new-import').classList.add('hidden');
  $('#btn-export-results').classList.add('hidden');
  $('#btn-follow-all').classList.add('hidden');

  let tableHtml = '<table><thead><tr><th></th><th>Busqueda</th><th>Expediente</th><th>Juzgado</th></tr></thead><tbody>';
  cases.forEach((c, i) => {
    tableHtml += `<tr id="import-row-${i}" class="import-row-pending"><td>...</td><td>${escapeHtml(c.number)}</td><td></td><td></td></tr>`;
  });
  tableHtml += '</tbody></table>';
  $('#import-results').innerHTML = tableHtml;

  const progressFill = $('#import-progress-fill');
  const progressText = $('#import-progress-text');

  for (let i = 0; i < cases.length; i++) {
    if (state.importCancelled) { progressText.textContent = 'Cancelado'; break; }
    const c = cases[i];
    const pct = Math.round(((i + 1) / cases.length) * 100);
    progressFill.style.width = `${pct}%`;
    const row = $(`#import-row-${i}`);
    let result = { number: c.number, status: 'error', expId: null, caratula: '', organismo: '', lastActId: 0 };

    if (c.skip) {
      result.status = 'skip';
      updateImportRow(row, 'skip', '', 'Omitido', '');
      state.importResults.push(result);
      continue;
    }

    progressText.textContent = `[${i + 1}/${cases.length}] Buscando ${c.number}...`;

    try {
      const resp = await bgMessage({ type: 'SEARCH', texto: c.number, page: 0, size: 5 });
      if (!resp.success) throw new Error(resp.error);
      const results = resp.data?.content || [];

      if (results.length > 0) {
        const found = results[0];
        // Get encabezado
        const encResp = await bgMessage({ type: 'GET_ENCABEZADO', expId: found.expId });
        if (encResp.success && encResp.data) {
          const d = encResp.data;
          result.status = 'ok';
          result.expId = found.expId;
          result.caratula = d.caratula || '';
          result.organismo = d.organismoRadActual || '';
          result.numero = `${d.numero || ''}/${d.anio || ''}`;

          // Get last actId
          try {
            const actResp = await bgMessage({ type: 'GET_ACTUACIONES', expId: found.expId, page: 0, size: 5 });
            if (actResp.success) {
              const acts = actResp.data?.content || [];
              result.lastActId = acts.reduce((max, a) => Math.max(max, parseInt(a.actId) || 0), 0);
              result.lastFecha = acts[0]?.fechaPub ? formatDate(acts[0].fechaPub) : '';
              result.lastDescripcion = acts[0]?.titulo || acts[0]?.tipo || '';
            }
          } catch {}

          updateImportRow(row, 'ok', result.numero, (d.caratula || '').substring(0, 50), (d.organismoRadActual || '').substring(0, 40));
        } else {
          updateImportRow(row, 'err', '', 'Sin datos', '');
        }
      } else {
        result.status = 'error';
        updateImportRow(row, 'err', '', 'No encontrado', '');
      }
    } catch (err) {
      updateImportRow(row, 'err', '', err.message, '');
    }

    state.importResults.push(result);
    if (i < cases.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  state.importRunning = false;
  const okCount = state.importResults.filter(r => r.status === 'ok').length;
  const errCount = state.importResults.filter(r => r.status === 'error').length;
  progressText.textContent = `Completado: ${okCount} OK, ${errCount} errores de ${cases.length}`;
  $('#btn-cancel-import').classList.add('hidden');
  $('#btn-new-import').classList.remove('hidden');
  $('#btn-export-results').classList.remove('hidden');
  if (okCount > 0) {
    $('#btn-follow-all').classList.remove('hidden');
    $('#btn-follow-all').textContent = `Seguir ${okCount} expedientes`;
  }
}

function updateImportRow(row, status, col2, col3, col4) {
  if (!row) return;
  const classMap = { ok: 'import-row-ok', err: 'import-row-err', skip: 'import-row-skip' };
  const labelMap = { ok: 'OK', err: 'ERR', skip: '---' };
  row.className = classMap[status] || '';
  const cells = row.querySelectorAll('td');
  cells[0].textContent = labelMap[status] || '';
  cells[2].textContent = col3;
  cells[3].textContent = col4;
}

function followAllImported() {
  const okResults = state.importResults.filter(r => r.status === 'ok' && r.expId);
  let added = 0;
  for (const r of okResults) {
    if (state.followed.some(f => f.expId === r.expId)) continue;
    state.followed.push({
      expId: r.expId, numero: r.numero || r.number, caratula: r.caratula,
      organismo: r.organismo, lastActId: r.lastActId || 0,
      lastFecha: r.lastFecha || '', lastDescripcion: r.lastDescripcion || '',
      lastCheck: Date.now(), newCount: 0,
    });
    added++;
  }
  saveFollowed();
  showToast(`${added} expedientes agregados a seguimiento`, 'success');
  $('#btn-follow-all').textContent = `${added} agregados`;
  $('#btn-follow-all').disabled = true;
}

function exportResults() {
  if (!state.importResults.length) return;
  const data = state.importResults.map(r => ({
    'Busqueda': r.number, 'Estado': r.status === 'ok' ? 'OK' : r.status === 'skip' ? 'OMITIDO' : 'ERROR',
    'Expediente': r.numero || '', 'Caratula': r.caratula, 'Juzgado': r.organismo,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
  XLSX.writeFile(wb, `IOL_Salta_Consulta_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Excel exportado', 'success');
}

// ========================================
// HISTORY
// ========================================

async function loadHistory() {
  const data = await chrome.storage.local.get('iol_history');
  state.history = data.iol_history || [];
  renderHistory();
}

function saveToHistory(entry) {
  state.history = state.history.filter(h => h.expId !== entry.expId);
  state.history.unshift({ ...entry, timestamp: Date.now() });
  state.history = state.history.slice(0, 50);
  chrome.storage.local.set({ iol_history: state.history });
  renderHistory();
}

function renderHistory() {
  const section = $('#history-section');
  const container = $('#history-list');
  if (!state.history.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  container.innerHTML = state.history.slice(0, 10).map(h => `
    <div class="history-item" data-expid="${h.expId}">
      <div class="history-item-info">
        <div class="history-item-number">Exp. ${escapeHtml(h.numero || '')}</div>
        <div class="history-item-title">${escapeHtml(h.caratula || '')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <span class="history-item-date">${timeAgo(h.timestamp)}</span>
        <button class="history-item-delete" data-expid="${h.expId}">✕</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('history-item-delete')) return;
      openCase(item.dataset.expid);
    });
  });
  container.querySelectorAll('.history-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.history = state.history.filter(h => h.expId !== btn.dataset.expid);
      chrome.storage.local.set({ iol_history: state.history });
      renderHistory();
    });
  });
}

// ========================================
// CHECK CURRENT PAGE
// ========================================

async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('plataforma.justiciasalta.gov.ar')) return;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_CASE' });
      if (response?.expediente) {
        const exp = response.expediente;
        const expId = exp.expId || exp.id;
        if (expId) openCase(expId);
      }
    } catch {}
  } catch {}
}

// ========================================
// OPTIONS
// ========================================

async function getOptions() {
  const data = await chrome.storage.local.get('iol_options');
  return { pollInterval: 15, ...data.iol_options };
}

async function saveOptions() {
  const interval = Math.max(5, Math.min(120, parseInt($('#inp-poll-interval').value) || 15));
  await chrome.storage.local.set({ iol_options: { pollInterval: interval } });
  $('#inp-poll-interval').value = interval;
  bgMessage({ type: 'UPDATE_ALARM', count: state.followed.length });
  showToast('Configuracion guardada', 'success');
}

// ========================================
// UTILITIES
// ========================================

function setStatus(text, type) {
  $('#status-text').textContent = text;
  $('#status-indicator').className = `status-indicator ${type}`;
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('popup-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'popup-toast';
    toast.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:9999;padding:10px 14px;border-radius:6px;font-size:12px;font-weight:500;color:white;text-align:center;transition:opacity 0.3s;opacity:0;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#1a56db';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(ts) {
  if (!ts) return 'N/D';
  const d = new Date(ts);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').substring(0, 50).trim() || 'actuacion';
}
