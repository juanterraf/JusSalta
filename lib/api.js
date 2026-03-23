// ============================================
// IOL Salta - API Helper
// All public endpoints use prefix: /iol-api/api/public/
// No authentication required for public access
// ============================================

const IOL_BASE = 'https://plataforma.justiciasalta.gov.ar/iol-api/api/public';

const IolApi = {
  /**
   * Search expedientes by number, caratula, or parties.
   * info JSON must include page and size fields.
   */
  async buscarCausas(identificador, page = 0, size = 20) {
    const info = JSON.stringify({ identificador, page, size });
    const url = `${IOL_BASE}/expedientes/lista?info=${encodeURIComponent(info)}`;
    return this._get(url);
  },

  /**
   * Get expediente header/detail.
   */
  async getEncabezado(expId) {
    const url = `${IOL_BASE}/expedientes/encabezado?expId=${expId}`;
    return this._get(url);
  },

  /**
   * Get actuaciones list (paginated).
   * filtro JSON contains expId; page/size are separate query params.
   */
  async getActuaciones(expId, page = 0, size = 20) {
    const filtro = JSON.stringify({ expId: String(expId) });
    const url = `${IOL_BASE}/expedientes/actuaciones?filtro=${encodeURIComponent(filtro)}&page=${page}&size=${size}`;
    return this._get(url);
  },

  /**
   * Check if an expediente has public access to actuaciones.
   */
  async tieneAccesoActuacionesPublico(expId) {
    const url = `${IOL_BASE}/expedientes/accesoActuacionesPublico?expId=${expId}`;
    const resp = await fetch(url);
    const text = await resp.text();
    return text === 'true';
  },

  /**
   * Get actuacion PDF URL.
   * Parameters: actId, org (organismo code), expId.
   */
  getActuacionPdfUrl(actId, org, expId) {
    return `${IOL_BASE}/expedientes/actuaciones/pdf?actId=${actId}&org=${encodeURIComponent(org)}&expId=${expId}`;
  },

  /**
   * Get sujetos/partes of an expediente.
   */
  async getPartes(expId) {
    const url = `${IOL_BASE}/expedientes/partes?expId=${expId}`;
    return this._get(url);
  },

  /**
   * Get UI configuration (fueros, distritos, etc).
   */
  async getConfiguracion() {
    const url = `${IOL_BASE}/ui/configuracion`;
    return this._get(url);
  },

  /**
   * Get fueros list.
   */
  async getFueros(filtro = '{}') {
    const url = `${IOL_BASE}/ui/fueros?filtro=${encodeURIComponent(filtro)}`;
    return this._get(url);
  },

  // ---- Internal ----

  async _get(url) {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (!text) return null;
    return JSON.parse(text);
  },

  async downloadPdf(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return {
      base64: btoa(binary),
      type: resp.headers.get('content-type') || 'application/pdf',
      size: bytes.length,
    };
  },
};
