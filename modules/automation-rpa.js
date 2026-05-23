/**
 * PhantomPrint — AutomationRPA
 * No-code visual automation / RPA engine. Runs in service worker.
 * Supports script management, execution, scheduling, and batch operations.
 */

class AutomationRPA {
  // ─── Action Types ────────────────────────────────────────────────────────────

  static ACTION_TYPES = Object.freeze({
    CLICK:          'click',
    TYPE:           'type',
    SCROLL:         'scroll',
    WAIT:           'wait',
    NAVIGATE:       'navigate',
    SCREENSHOT:     'screenshot',
    EXTRACT:        'extract',
    LOOP:           'loop',
    CONDITION:      'condition',
    SWITCH_PROFILE: 'switch_profile',
    LOAD_COOKIES:   'load_cookies',
    CLEAR_DATA:     'clear_data',
    EXPORT_DATA:    'export_data',
  });

  constructor() {
    /** Runtime state (in-memory; authoritative copy is in storage). */
    this._running = false;
    this._stopRequested = false;
    this._batchRunning = false;
  }

  // ─── Script Management ───────────────────────────────────────────────────────

  /**
   * Persist a script to chrome.storage.local.
   * Assigns an id and timestamps the record.
   * @param {object} script
   * @returns {Promise<object>} Saved script (with id injected)
   */
  async saveScript(script) {
    if (!script.id) script.id = `rpa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    script.savedAt = Date.now();
    const key = `pp_rpa_script_${script.id}`;
    await chrome.storage.local.set({ [key]: script });
    return script;
  }

  /**
   * Load a script by id.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getScript(id) {
    const key = `pp_rpa_script_${id}`;
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  }

  /**
   * List all stored scripts (metadata only: id, name, description, savedAt).
   * @returns {Promise<object[]>}
   */
  async listScripts() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith('pp_rpa_script_'))
      .map(([, v]) => ({
        id:          v.id,
        name:        v.name,
        description: v.description,
        version:     v.version,
        savedAt:     v.savedAt,
        stepCount:   (v.steps ?? []).length,
      }));
  }

  /**
   * Delete a script by id.
   * @param {string} id
   */
  async deleteScript(id) {
    await chrome.storage.local.remove(`pp_rpa_script_${id}`);
    await this.removeSchedule(id);
  }

  /**
   * Export a script as a JSON string.
   * @param {string} id
   * @returns {Promise<string>}
   */
  async exportScript(id) {
    const script = await this.getScript(id);
    if (!script) throw new Error(`Script not found: ${id}`);
    return JSON.stringify(script, null, 2);
  }

  /**
   * Validate and import a script from a JSON string.
   * Reassigns a new id to prevent collisions.
   * @param {string} jsonString
   * @returns {Promise<object>} Imported script
   */
  async importScript(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid JSON: cannot import script.');
    }

    if (!parsed.steps || !Array.isArray(parsed.steps)) {
      throw new Error('Invalid script format: missing steps array.');
    }
    if (!parsed.name) {
      throw new Error('Invalid script format: missing name field.');
    }

    // Give it a fresh id to avoid collision with existing scripts
    parsed.id = `rpa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.saveScript(parsed);
  }

  // ─── Execution Helpers ───────────────────────────────────────────────────────

  /** @private — Run a single step on the given tab. */
  async _executeStep(step, tabId, variables) {
    const T = AutomationRPA.ACTION_TYPES;

    switch (step.type) {
      case T.CLICK:
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel, x, y, btn) => {
            const el = sel ? document.querySelector(sel) : null;
            const target = el ?? document.elementFromPoint(x ?? 0, y ?? 0);
            if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: btn === 'right' ? 2 : 0 }));
          },
          args: [step.selector ?? null, step.x ?? 0, step.y ?? 0, step.button ?? 'left'],
        });
        break;

      case T.TYPE:
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel, text, speed) => {
            const el = sel ? document.querySelector(sel) : document.activeElement;
            if (!el) return;
            el.focus();
            let i = 0;
            const interval = setInterval(() => {
              if (i >= text.length) { clearInterval(interval); return; }
              el.value = (el.value ?? '') + text[i];
              el.dispatchEvent(new Event('input', { bubbles: true }));
              i++;
            }, speed ?? 50);
          },
          args: [step.selector ?? null, step.text ?? '', step.speed ?? 50],
        });
        // Approximate wait for typing to finish
        await this._sleep((step.text ?? '').length * (step.speed ?? 50) + 200);
        break;

      case T.SCROLL:
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel, dir, amount) => {
            const el = sel === 'window' || !sel ? window : document.querySelector(sel);
            if (!el) return;
            const delta = dir === 'up' ? -(amount ?? 500) : (amount ?? 500);
            (el === window ? window : el).scrollBy({ top: delta, behavior: 'smooth' });
          },
          args: [step.selector ?? 'window', step.direction ?? 'down', step.amount ?? 500],
        });
        break;

      case T.WAIT:
        if (step.forElement) {
          await this._waitForElement(tabId, step.forElement, step.timeout ?? 10_000);
        } else {
          await this._sleep(step.duration ?? 1000);
        }
        break;

      case T.NAVIGATE:
        await chrome.tabs.update(tabId, { url: step.url });
        // Wait for the tab to finish loading
        await this._waitForTabLoad(tabId, 15_000);
        break;

      case T.SCREENSHOT: {
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
        variables['__screenshot__'] = dataUrl;
        break;
      }

      case T.EXTRACT: {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel, attr) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            return attr === 'textContent' ? el.textContent?.trim() : el.getAttribute(attr);
          },
          args: [step.selector, step.attribute ?? 'textContent'],
        });
        if (step.variable) variables[step.variable] = result;
        break;
      }

      case T.LOOP:
        for (let n = 0; n < (step.count ?? 1); n++) {
          if (this._stopRequested) break;
          for (const subStep of (step.steps ?? [])) {
            if (this._stopRequested) break;
            await this._executeStep(subStep, tabId, variables);
          }
        }
        break;

      case T.CONDITION: {
        const condMet = await this._evaluateCondition(step.check, tabId);
        const branch = condMet ? (step.ifTrue ?? []) : (step.ifFalse ?? []);
        for (const subStep of branch) {
          if (this._stopRequested) break;
          await this._executeStep(subStep, tabId, variables);
        }
        break;
      }

      case T.SWITCH_PROFILE:
        await chrome.runtime.sendMessage({ type: 'SWITCH_PROFILE', profileId: step.profileId });
        await this._sleep(500);
        break;

      case T.LOAD_COOKIES:
        await chrome.runtime.sendMessage({ type: 'LOAD_COOKIE_PROFILE', profileName: step.profileName });
        await this._sleep(300);
        break;

      case T.CLEAR_DATA:
        await chrome.browsingData.remove(
          {},
          {
            cookies:      !!(step.cookies),
            localStorage: !!(step.localStorage),
            cache:        !!(step.cache),
          }
        );
        break;

      case T.EXPORT_DATA: {
        const exportObj = {};
        for (const varName of (step.variables ?? [])) {
          exportObj[varName] = variables[varName] ?? null;
        }
        // Persist export to storage; popup/UI can retrieve it
        const exportKey = `pp_rpa_export_${Date.now()}`;
        await chrome.storage.local.set({
          [exportKey]: { filename: step.filename ?? 'output.json', data: exportObj, exportedAt: Date.now() },
        });
        break;
      }

      default:
        console.warn(`[AutomationRPA] Unknown step type: ${step.type}`);
    }
  }

  /** @private */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** @private — Poll for an element to appear in DOM, up to timeout ms. */
  async _waitForElement(tabId, selector, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this._stopRequested) return;
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: sel => !!document.querySelector(sel),
        args: [selector],
      });
      if (result) return;
      await this._sleep(500);
    }
    throw new Error(`Timeout waiting for element: ${selector}`);
  }

  /** @private — Wait for a tab to finish its pending navigation. */
  _waitForTabLoad(tabId, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, timeout);

      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /** @private — Evaluate a condition check object. */
  async _evaluateCondition(check, tabId) {
    if (!check) return false;
    switch (check.type) {
      case 'elementExists': {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: sel => !!document.querySelector(sel),
          args: [check.selector],
        });
        return !!result;
      }
      case 'urlContains': {
        const tab = await chrome.tabs.get(tabId);
        return (tab.url ?? '').includes(check.value ?? '');
      }
      case 'variableEquals':
        return false; // variables not passed here; handled by caller
      default:
        return false;
    }
  }

  // ─── Execution ───────────────────────────────────────────────────────────────

  /**
   * Execute all steps of a script on the given tab.
   * Progress is tracked in chrome.storage.local under 'pp_rpa_status'.
   * @param {string} scriptId
   * @param {number} tabId
   */
  async runScript(scriptId, tabId) {
    const script = await this.getScript(scriptId);
    if (!script) throw new Error(`Script not found: ${scriptId}`);

    this._running = true;
    this._stopRequested = false;
    const variables = {};
    const steps = script.steps ?? [];

    await chrome.storage.local.set({
      pp_rpa_status: {
        running: true,
        scriptId,
        currentStep: 0,
        totalSteps: steps.length,
        results: {},
        error: null,
        startedAt: Date.now(),
      },
    });

    try {
      for (let i = 0; i < steps.length; i++) {
        if (this._stopRequested) break;

        await chrome.storage.local.set({
          pp_rpa_status: {
            running: true,
            scriptId,
            currentStep: i,
            totalSteps: steps.length,
            results: variables,
            error: null,
            startedAt: Date.now(),
          },
        });

        await this._executeStep(steps[i], tabId, variables);
      }
    } catch (err) {
      await chrome.storage.local.set({
        pp_rpa_status: {
          running: false,
          scriptId,
          currentStep: steps.length,
          totalSteps: steps.length,
          results: variables,
          error: err.message,
          finishedAt: Date.now(),
        },
      });
      this._running = false;
      throw err;
    }

    await chrome.storage.local.set({
      pp_rpa_status: {
        running: false,
        scriptId,
        currentStep: steps.length,
        totalSteps: steps.length,
        results: variables,
        error: null,
        finishedAt: Date.now(),
      },
    });
    this._running = false;
  }

  /** Request that the currently running script stop after the current step. */
  async stopScript() {
    this._stopRequested = true;
    const result = await chrome.storage.local.get('pp_rpa_status');
    const status = result.pp_rpa_status ?? {};
    await chrome.storage.local.set({
      pp_rpa_status: { ...status, running: false, stoppedAt: Date.now() },
    });
  }

  /**
   * @returns {Promise<{running:boolean, currentStep:number, totalSteps:number,
   *                    results:object, error:string|null}>}
   */
  async getRunStatus() {
    const result = await chrome.storage.local.get('pp_rpa_status');
    return result.pp_rpa_status ?? {
      running: false,
      currentStep: 0,
      totalSteps: 0,
      results: {},
      error: null,
    };
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────

  /**
   * Schedule a script to run automatically.
   * @param {string} scriptId
   * @param {{type:'cron'|'startup'|'once', cron?:string, timestamp?:number}} schedule
   */
  async scheduleScript(scriptId, schedule) {
    const alarmName = `pp_rpa_alarm_${scriptId}`;
    const scheduleKey = `pp_rpa_schedule_${scriptId}`;

    await chrome.storage.local.set({
      [scheduleKey]: { scriptId, schedule, createdAt: Date.now() },
    });

    chrome.alarms.clear(alarmName);

    if (schedule.type === 'once' && schedule.timestamp) {
      const delayMs = schedule.timestamp - Date.now();
      if (delayMs > 0) {
        chrome.alarms.create(alarmName, { delayInMinutes: delayMs / 60_000 });
      }
    } else if (schedule.type === 'cron' && schedule.cron) {
      // Chrome alarms don't support full cron — use periodInMinutes as a best-effort
      // Parse simple '*/N * * * *' patterns; for complex cron expressions,
      // the service worker alarm handler should re-check on each fire.
      const match = schedule.cron.match(/^\*\/(\d+)\s+\*/);
      const periodMinutes = match ? parseInt(match[1], 10) : 60;
      chrome.alarms.create(alarmName, { periodInMinutes: periodMinutes, delayInMinutes: periodMinutes });
    } else if (schedule.type === 'startup') {
      // Handled via chrome.runtime.onStartup listener; no alarm needed
    }
  }

  /**
   * @returns {Promise<object[]>}
   */
  async getSchedules() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith('pp_rpa_schedule_'))
      .map(([, v]) => v);
  }

  /**
   * Remove a script's schedule and cancel its alarm.
   * @param {string} scriptId
   */
  async removeSchedule(scriptId) {
    chrome.alarms.clear(`pp_rpa_alarm_${scriptId}`);
    await chrome.storage.local.remove(`pp_rpa_schedule_${scriptId}`);
  }

  // ─── Batch Operations ────────────────────────────────────────────────────────

  /**
   * Run a script sequentially across multiple profiles.
   * @param {string} scriptId
   * @param {string[]} profileIds
   */
  async runBatch(scriptId, profileIds) {
    this._batchRunning = true;
    const results = [];

    await chrome.storage.local.set({
      pp_rpa_batch_status: {
        running: true,
        total: profileIds.length,
        completed: 0,
        failed: 0,
        results: [],
        startedAt: Date.now(),
      },
    });

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTab?.id;
    if (!tabId) throw new Error('No active tab for batch execution.');

    for (let i = 0; i < profileIds.length; i++) {
      if (this._stopRequested) break;

      const profileId = profileIds[i];
      let success = false;
      let error = null;

      try {
        // Switch to profile
        await chrome.runtime.sendMessage({ type: 'SWITCH_PROFILE', profileId });
        await new Promise(r => setTimeout(r, 800));

        // Run the script
        await this.runScript(scriptId, tabId);

        const status = await this.getRunStatus();
        success = !status.error;
        error = status.error;
      } catch (err) {
        error = err.message;
      }

      results.push({ profileId, success, error, completedAt: Date.now() });

      await chrome.storage.local.set({
        pp_rpa_batch_status: {
          running: true,
          total: profileIds.length,
          completed: i + 1,
          failed: results.filter(r => !r.success).length,
          results,
          startedAt: Date.now(),
        },
      });
    }

    this._batchRunning = false;
    await chrome.storage.local.set({
      pp_rpa_batch_status: {
        running: false,
        total: profileIds.length,
        completed: results.length,
        failed: results.filter(r => !r.success).length,
        results,
        finishedAt: Date.now(),
      },
    });
  }

  /**
   * @returns {Promise<{running:boolean, total:number, completed:number,
   *                    failed:number, results:object[]}>}
   */
  async getBatchStatus() {
    const result = await chrome.storage.local.get('pp_rpa_batch_status');
    return result.pp_rpa_batch_status ?? {
      running: false,
      total: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }
}

if (typeof self !== 'undefined') self.AutomationRPA = AutomationRPA;
