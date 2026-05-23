/**
 * NetworkInterceptor — HTTP request/response modification engine
 * Runs in service worker context. Uses chrome.declarativeNetRequest (DNR).
 * DNR rule ID range: 4000–4999
 */

'use strict';

class NetworkInterceptor {
  constructor() {
    // DNR ID ranges
    this.RULE_ID_BASE = 4000;
    this.RULE_ID_MAX  = 4999;

    // Built-in privacy rule IDs (4000–4010)
    this.BUILT_IN_RULE_IDS = {
      REMOVE_REQUEST_TRACKING_HEADERS : 4000,
      SET_DNT_GPC                     : 4001,
      REMOVE_RESPONSE_TRACKING_HEADERS: 4002,
    };

    // Storage key names
    this.STORAGE_KEY_CUSTOM_RULES  = 'ni_custom_rules';
    this.STORAGE_KEY_PRIVACY_ON    = 'ni_privacy_enabled';
    this.STORAGE_KEY_LOGS          = 'ni_request_logs';
    this.LOG_RING_MAX              = 500;

    // Built-in DNR rule definitions
    this.PRIVACY_RULES = [
      {
        id      : this.BUILT_IN_RULE_IDS.REMOVE_REQUEST_TRACKING_HEADERS,
        priority: 1,
        action  : {
          type          : 'modifyHeaders',
          requestHeaders: [
            { header: 'x-forwarded-for',    operation: 'remove' },
            { header: 'x-real-ip',          operation: 'remove' },
            { header: 'via',                operation: 'remove' },
            { header: 'x-client-ip',        operation: 'remove' },
            { header: 'x-originating-ip',   operation: 'remove' },
          ],
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','xmlhttprequest','script','image','media','font','stylesheet','other'] },
      },
      {
        id      : this.BUILT_IN_RULE_IDS.SET_DNT_GPC,
        priority: 1,
        action  : {
          type          : 'modifyHeaders',
          requestHeaders: [
            { header: 'dnt',     operation: 'set', value: '1' },
            { header: 'sec-gpc', operation: 'set', value: '1' },
          ],
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','xmlhttprequest','script','image','media','font','stylesheet','other'] },
      },
      {
        id      : this.BUILT_IN_RULE_IDS.REMOVE_RESPONSE_TRACKING_HEADERS,
        priority: 1,
        action  : {
          type           : 'modifyHeaders',
          responseHeaders: [
            { header: 'etag',             operation: 'remove' },
            { header: 'server',           operation: 'remove' },
            { header: 'x-request-id',     operation: 'remove' },
            { header: 'x-correlation-id', operation: 'remove' },
            { header: 'x-powered-by',     operation: 'remove' },
            { header: 'last-modified',    operation: 'remove' },
          ],
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','xmlhttprequest','script','image','media','font','stylesheet','other'] },
      },
    ];
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async _getStorage(key, defaultValue) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    });
  }

  async _setStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  _nextCustomRuleId(existingRules) {
    const usedBuiltIn = Object.values(this.BUILT_IN_RULE_IDS);
    const used = existingRules
      .map((r) => r.id)
      .filter((id) => id >= 4000 && id <= 4999 && !usedBuiltIn.includes(id));
    for (let id = 4011; id <= this.RULE_ID_MAX; id++) {
      if (!used.includes(id)) return id;
    }
    throw new Error('NetworkInterceptor: no available DNR rule IDs in range 4000–4999');
  }

  _buildDnrRule(rule) {
    const dnr = {
      id      : rule.id,
      priority: rule.priority || 1,
      action  : {},
      condition: {},
    };

    // Condition
    if (rule.conditions) {
      if (rule.conditions.urlPattern) {
        dnr.condition.urlFilter = rule.conditions.urlPattern;
      }
      if (rule.conditions.domains && rule.conditions.domains.length > 0) {
        dnr.condition.initiatorDomains = rule.conditions.domains;
      }
      if (rule.conditions.resourceTypes && rule.conditions.resourceTypes.length > 0) {
        dnr.condition.resourceTypes = rule.conditions.resourceTypes;
      } else {
        dnr.condition.resourceTypes = [
          'main_frame','sub_frame','xmlhttprequest','script',
          'image','media','font','stylesheet','other',
        ];
      }
    } else {
      dnr.condition.urlFilter = '*';
      dnr.condition.resourceTypes = [
        'main_frame','sub_frame','xmlhttprequest','script',
        'image','media','font','stylesheet','other',
      ];
    }

    if (!dnr.condition.urlFilter) {
      dnr.condition.urlFilter = '*';
    }

    // Action
    switch (rule.type) {
      case 'block':
        dnr.action.type = 'block';
        break;

      case 'redirect':
        dnr.action.type = 'redirect';
        dnr.action.redirect = { url: rule.actions.redirectUrl };
        break;

      case 'header':
      default: {
        dnr.action.type = 'modifyHeaders';
        const reqHeaders = [];
        const resHeaders = [];

        if (rule.actions && rule.actions.requestHeaders) {
          for (const [name, value] of Object.entries(rule.actions.requestHeaders)) {
            if (value === null || value === '') {
              reqHeaders.push({ header: name.toLowerCase(), operation: 'remove' });
            } else {
              reqHeaders.push({ header: name.toLowerCase(), operation: 'set', value: String(value) });
            }
          }
        }

        if (rule.actions && rule.actions.responseHeaders) {
          for (const [name, value] of Object.entries(rule.actions.responseHeaders)) {
            if (value === null || value === '') {
              resHeaders.push({ header: name.toLowerCase(), operation: 'remove' });
            } else {
              resHeaders.push({ header: name.toLowerCase(), operation: 'set', value: String(value) });
            }
          }
        }

        if (reqHeaders.length > 0) dnr.action.requestHeaders  = reqHeaders;
        if (resHeaders.length > 0) dnr.action.responseHeaders = resHeaders;
        break;
      }
    }

    return dnr;
  }

  // ─── Custom rules CRUD ────────────────────────────────────────────────────

  async getUserRules() {
    return this._getStorage(this.STORAGE_KEY_CUSTOM_RULES, []);
  }

  async addRule(rule) {
    if (!rule || typeof rule !== 'object') throw new Error('Invalid rule object');

    const rules = await this.getUserRules();

    // Validate required fields
    if (!rule.name)  throw new Error('Rule must have a name');
    if (!rule.type)  throw new Error('Rule must have a type: header | block | redirect');

    // Assign ID if not provided
    if (!rule.id) {
      rule.id = this._nextCustomRuleId(rules);
    }

    // Check uniqueness
    if (rules.find((r) => r.id === rule.id)) {
      throw new Error(`Rule with id ${rule.id} already exists`);
    }

    rule.enabled  = rule.enabled !== false;
    rule.created  = Date.now();
    rule.modified = Date.now();

    rules.push(rule);
    await this._setStorage(this.STORAGE_KEY_CUSTOM_RULES, rules);
    await this.applyAllRules();
    return rule;
  }

  async removeRule(id) {
    const rules = await this.getUserRules();
    const idx   = rules.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Rule ${id} not found`);

    rules.splice(idx, 1);
    await this._setStorage(this.STORAGE_KEY_CUSTOM_RULES, rules);

    // Remove from DNR
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [id] });
    return true;
  }

  async toggleRule(id, enabled) {
    const rules = await this.getUserRules();
    const rule  = rules.find((r) => r.id === id);
    if (!rule) throw new Error(`Rule ${id} not found`);

    rule.enabled  = Boolean(enabled);
    rule.modified = Date.now();

    await this._setStorage(this.STORAGE_KEY_CUSTOM_RULES, rules);
    await this.applyAllRules();
    return rule;
  }

  async applyAllRules() {
    const [customRules, privacyEnabled] = await Promise.all([
      this.getUserRules(),
      this._getStorage(this.STORAGE_KEY_PRIVACY_ON, true),
    ]);

    // Collect all DNR rule IDs we manage (4000–4999)
    let existingDynamic = [];
    try {
      existingDynamic = await chrome.declarativeNetRequest.getDynamicRules();
    } catch (_) {}

    const managedIds = existingDynamic
      .filter((r) => r.id >= this.RULE_ID_BASE && r.id <= this.RULE_ID_MAX)
      .map((r) => r.id);

    const addRules = [];

    // Privacy rules
    if (privacyEnabled) {
      addRules.push(...this.PRIVACY_RULES);
    }

    // Custom enabled rules
    for (const rule of customRules) {
      if (rule.enabled) {
        try {
          addRules.push(this._buildDnrRule(rule));
        } catch (e) {
          console.warn(`[NetworkInterceptor] Failed to build rule ${rule.id}:`, e.message);
        }
      }
    }

    // Remove all managed, re-add active
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: managedIds,
      addRules     : addRules,
    });
  }

  async enablePrivacyRules(enabled) {
    await this._setStorage(this.STORAGE_KEY_PRIVACY_ON, Boolean(enabled));
    await this.applyAllRules();
    return { privacyEnabled: Boolean(enabled) };
  }

  async getStats() {
    const [customRules, privacyEnabled] = await Promise.all([
      this.getUserRules(),
      this._getStorage(this.STORAGE_KEY_PRIVACY_ON, true),
    ]);

    const activeCustom = customRules.filter((r) => r.enabled).length;
    const privacyCount = privacyEnabled ? this.PRIVACY_RULES.length : 0;

    return {
      totalRules    : customRules.length + this.PRIVACY_RULES.length,
      activeRules   : activeCustom + privacyCount,
      privacyEnabled: privacyEnabled,
      customRules   : customRules.length,
    };
  }

  // ─── Request Logger ───────────────────────────────────────────────────────

  async logRequest(details) {
    if (!details || !details.url) return;

    const entry = {
      id            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp     : new Date().toISOString(),
      url           : details.url,
      method        : details.method       || 'GET',
      type          : details.type         || 'other',
      status        : details.status       || 0,
      requestHeaders : details.requestHeaders  || [],
      responseHeaders: details.responseHeaders || [],
      timing        : details.timing        || 0,
      initiator     : details.initiator     || null,
    };

    let logs = await this._getStorage(this.STORAGE_KEY_LOGS, []);
    logs.push(entry);

    // Ring buffer — keep last 500
    if (logs.length > this.LOG_RING_MAX) {
      logs = logs.slice(logs.length - this.LOG_RING_MAX);
    }

    await this._setStorage(this.STORAGE_KEY_LOGS, logs);
    return entry;
  }

  async getLogs(filter) {
    let logs = await this._getStorage(this.STORAGE_KEY_LOGS, []);

    if (!filter) return logs;

    if (filter.url) {
      const pattern = filter.url.toLowerCase();
      logs = logs.filter((l) => l.url.toLowerCase().includes(pattern));
    }

    if (filter.method) {
      logs = logs.filter((l) => l.method.toUpperCase() === filter.method.toUpperCase());
    }

    if (filter.type) {
      logs = logs.filter((l) => l.type === filter.type);
    }

    if (filter.status) {
      logs = logs.filter((l) => l.status === filter.status);
    }

    if (filter.since) {
      const sinceTs = new Date(filter.since).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= sinceTs);
    }

    if (filter.limit && Number.isFinite(filter.limit)) {
      logs = logs.slice(-filter.limit);
    }

    return logs;
  }

  async clearLogs() {
    await this._setStorage(this.STORAGE_KEY_LOGS, []);
    return { cleared: true };
  }

  async exportHAR() {
    const logs = await this._getStorage(this.STORAGE_KEY_LOGS, []);

    const har = {
      log: {
        version : '1.2',
        creator : {
          name   : 'PhantomPrint NetworkInterceptor',
          version: '1.0.0',
        },
        browser: {
          name   : 'Chrome',
          version: 'unknown',
        },
        pages  : [],
        entries: logs.map((entry) => {
          const requestHeaders = (entry.requestHeaders || []).map((h) => ({
            name : h.name  || h.header || '',
            value: h.value || '',
          }));

          const responseHeaders = (entry.responseHeaders || []).map((h) => ({
            name : h.name  || h.header || '',
            value: h.value || '',
          }));

          return {
            startedDateTime: entry.timestamp,
            time           : entry.timing || 0,
            request        : {
              method     : entry.method || 'GET',
              url        : entry.url,
              httpVersion: 'HTTP/1.1',
              headers    : requestHeaders,
              queryString: NetworkInterceptor._parseQueryString(entry.url),
              cookies    : [],
              headersSize: -1,
              bodySize   : -1,
            },
            response: {
              status     : entry.status || 0,
              statusText : NetworkInterceptor._statusText(entry.status),
              httpVersion: 'HTTP/1.1',
              headers    : responseHeaders,
              cookies    : [],
              content    : {
                size    : -1,
                mimeType: NetworkInterceptor._guessMime(entry.type),
              },
              redirectURL: '',
              headersSize: -1,
              bodySize   : -1,
            },
            cache    : {},
            timings  : { send: 0, wait: entry.timing || 0, receive: 0 },
            _initiator: entry.initiator || null,
            _resourceType: entry.type || 'other',
          };
        }),
      },
    };

    return har;
  }

  // ─── Static helpers ───────────────────────────────────────────────────────

  static _parseQueryString(url) {
    try {
      const u      = new URL(url);
      const params = [];
      u.searchParams.forEach((value, name) => params.push({ name, value }));
      return params;
    } catch (_) {
      return [];
    }
  }

  static _statusText(code) {
    const map = {
      200: 'OK', 201: 'Created', 204: 'No Content', 206: 'Partial Content',
      301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
      500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
    };
    return map[code] || '';
  }

  static _guessMime(resourceType) {
    const map = {
      script    : 'application/javascript',
      stylesheet: 'text/css',
      image     : 'image/png',
      media     : 'video/mp4',
      font      : 'font/woff2',
      document  : 'text/html',
      xhr       : 'application/json',
      fetch     : 'application/json',
      other     : 'application/octet-stream',
    };
    return map[resourceType] || 'application/octet-stream';
  }
}

if (typeof self !== 'undefined') self.NetworkInterceptor = NetworkInterceptor;
