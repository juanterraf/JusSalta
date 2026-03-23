// ============================================
// IOL Salta - Storage Helper
// chrome.storage.local wrapper
// ============================================

const KEYS = {
  FOLLOWED: 'iol_followed',       // Array of monitored cases
  HISTORY: 'iol_history',         // Recent search/view history
  JWT: 'iol_jwt',                 // JWT token + expiry
  OPTIONS: 'iol_options',         // User preferences
};

const IolStorage = {
  // ---- Followed / Monitored Cases ----

  async getFollowed() {
    const data = await chrome.storage.local.get(KEYS.FOLLOWED);
    return data[KEYS.FOLLOWED] || [];
  },

  async setFollowed(list) {
    await chrome.storage.local.set({ [KEYS.FOLLOWED]: list });
  },

  async addFollowed(caseData) {
    const list = await this.getFollowed();
    if (list.some(f => f.expId === caseData.expId)) return false;
    list.push(caseData);
    await this.setFollowed(list);
    return true;
  },

  async removeFollowed(expId) {
    let list = await this.getFollowed();
    list = list.filter(f => f.expId !== expId);
    await this.setFollowed(list);
  },

  async isFollowed(expId) {
    const list = await this.getFollowed();
    return list.some(f => f.expId === expId);
  },

  // ---- History ----

  async getHistory() {
    const data = await chrome.storage.local.get(KEYS.HISTORY);
    return data[KEYS.HISTORY] || [];
  },

  async addToHistory(entry) {
    let list = await this.getHistory();
    // Remove existing entry for same expId
    list = list.filter(h => h.expId !== entry.expId);
    // Add to front
    list.unshift({ ...entry, viewedAt: Date.now() });
    // Keep max 20
    if (list.length > 20) list = list.slice(0, 20);
    await chrome.storage.local.set({ [KEYS.HISTORY]: list });
  },

  async removeFromHistory(expId) {
    let list = await this.getHistory();
    list = list.filter(h => h.expId !== expId);
    await chrome.storage.local.set({ [KEYS.HISTORY]: list });
  },

  // ---- JWT ----

  async getJwt() {
    const data = await chrome.storage.local.get(KEYS.JWT);
    const jwt = data[KEYS.JWT];
    if (!jwt) return null;
    // Check TTL
    if (jwt.expiresAt && Date.now() > jwt.expiresAt) {
      await chrome.storage.local.remove(KEYS.JWT);
      return null;
    }
    return jwt.token;
  },

  async setJwt(token, ttlMinutes = 60) {
    await chrome.storage.local.set({
      [KEYS.JWT]: {
        token,
        expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      },
    });
  },

  async clearJwt() {
    await chrome.storage.local.remove(KEYS.JWT);
  },

  // ---- Options ----

  async getOptions() {
    const data = await chrome.storage.local.get(KEYS.OPTIONS);
    return {
      pollInterval: 15,
      ...data[KEYS.OPTIONS],
    };
  },

  async setOptions(opts) {
    const current = await this.getOptions();
    await chrome.storage.local.set({
      [KEYS.OPTIONS]: { ...current, ...opts },
    });
  },
};
