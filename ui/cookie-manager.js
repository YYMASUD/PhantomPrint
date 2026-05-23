/**
 * PhantomPrint Cookie Manager — UI Controller
 * Communicates with background CookieManager via chrome.runtime.sendMessage
 */
'use strict';

(function() {
  // =========================================================================
  // STATE
  // =========================================================================
  let allCookies = [];
  let filteredCookies = [];
  let selectedCookies = new Set();
  let editingCookie = null;
  let currentFilter = 'all';
  let searchQuery = '';
  let sortField = 'name';
  let sortAsc = true;
  let currentDomain = '';
  let profiles = [];
  let trackerDomains = new Set();

  const TRACKER_DOMAINS_SAMPLE = [
    'google-analytics.com','googletagmanager.com','doubleclick.net','facebook.net',
    'connect.facebook.net','criteo.com','hotjar.com','fullstory.com','mixpanel.com',
    'segment.com','amplitude.com','adnxs.com','scorecard.research.com','quantserve.com',
    'moatads.com','openx.net','rubiconproject.com','pubmatic.com','casalemedia.com',
    'adsrvr.org','taboola.com','outbrain.com','addthis.com','sharethis.com',
    'bing.com','advertising.com','yahoo.com','yieldmo.com','amazon-adsystem.com',
    'rlcdn.com','fastclick.net','yandex.ru','mc.yandex.ru','heapanalytics.com',
    'logrocket.com','mouseflow.com','clarity.ms','inspectlet.com','crazyegg.com',
    'newrelic.com','sentry.io','bugsnag.com','rollbar.com','trackjs.com',
    'ads-twitter.com','analytics.twitter.com','licdn.com','platform.linkedin.com',
    'fingerprintjs.com','api.fpjs.io'
  ];

  // =========================================================================
  // MESSAGING
  // =========================================================================
  function msg(data) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(data, r => resolve(r || {}));
      } else {
        resolve({});
      }
    });
  }

  // Direct cookie access (for extension context)
  async function getCookies(details) {
    return new Promise(resolve => {
      if (chrome.cookies) chrome.cookies.getAll(details, resolve);
      else resolve([]);
    });
  }

  async function setCookie(details) {
    return new Promise((resolve, reject) => {
      if (chrome.cookies) chrome.cookies.set(details, c => c ? resolve(c) : reject(chrome.runtime.lastError));
      else reject(new Error('No cookies API'));
    });
  }

  async function removeCookie(url, name) {
    return new Promise(resolve => {
      if (chrome.cookies) chrome.cookies.remove({ url, name }, resolve);
      else resolve(null);
    });
  }

  // =========================================================================
  // LOAD DATA
  // =========================================================================
  async function loadAllCookies() {
    showStatus('Loading cookies…');
    try {
      allCookies = await getCookies({});
      trackerDomains = new Set(TRACKER_DOMAINS_SAMPLE);
      updateDomainFilter();
      applyFilters();
      updateCounts();
      showStatus(`Loaded ${allCookies.length} cookies`);
    } catch(e) {
      showStatus('Error loading cookies', 'error');
    }
  }

  function updateDomainFilter() {
    const domains = [...new Set(allCookies.map(c => c.domain))].sort();
    const sel = document.getElementById('domainFilter');
    const exportSel = document.getElementById('exportDomain');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">All Domains</option>';
    exportSel.innerHTML = '<option value="">All Domains</option>';
    domains.forEach(d => {
      sel.innerHTML += `<option value="${d}">${d}</option>`;
      exportSel.innerHTML += `<option value="${d}">${d}</option>`;
    });
    if (currentVal) sel.value = currentVal;

    // Domain sidebar
    const domainCounts = {};
    allCookies.forEach(c => { domainCounts[c.domain] = (domainCounts[c.domain]||0) + 1; });
    const sorted = Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).slice(0, 12);
    const list = document.getElementById('domainList');
    list.innerHTML = sorted.map(([d,n]) => `<div class="sidebar-item" data-domain="${d}" title="${d}">${d.length > 22 ? d.slice(0,20)+'…' : d} <span class="count">${n}</span></div>`).join('');
    list.querySelectorAll('[data-domain]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('domainFilter').value = el.dataset.domain;
        currentDomain = el.dataset.domain;
        applyFilters();
      });
    });

    document.getElementById('domainCount').textContent = domains.length;
  }

  function isTracker(cookie) {
    const domain = cookie.domain.replace(/^\./, '');
    return TRACKER_DOMAINS_SAMPLE.some(t => domain === t || domain.endsWith('.'+t));
  }

  function updateCounts() {
    const counts = { all: 0, secure: 0, httponly: 0, session: 0, persistent: 0, trackers: 0 };
    allCookies.forEach(c => {
      counts.all++;
      if (c.secure) counts.secure++;
      if (c.httpOnly) counts.httponly++;
      if (!c.expirationDate) counts.session++;
      else counts.persistent++;
      if (isTracker(c)) counts.trackers++;
    });
    Object.keys(counts).forEach(k => {
      const el = document.getElementById('count' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.textContent = counts[k];
    });
    document.getElementById('totalCount').textContent = counts.all;

    // Tracker count on privacy tab
    const tc = document.getElementById('trackerCount');
    if (tc) tc.textContent = `${counts.trackers} tracker cookies found`;
  }

  function applyFilters() {
    let result = [...allCookies];

    if (currentDomain) result = result.filter(c => c.domain === currentDomain);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.value||'').toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.path.toLowerCase().includes(q)
      );
    }

    switch(currentFilter) {
      case 'secure': result = result.filter(c => c.secure); break;
      case 'httponly': result = result.filter(c => c.httpOnly); break;
      case 'session': result = result.filter(c => !c.expirationDate); break;
      case 'persistent': result = result.filter(c => !!c.expirationDate); break;
      case 'trackers': result = result.filter(c => isTracker(c)); break;
    }

    result.sort((a, b) => {
      let va = a[sortField] ?? '', vb = b[sortField] ?? '';
      if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    filteredCookies = result;
    renderTable();
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  function renderTable() {
    const tbody = document.getElementById('cookieTableBody');
    if (!filteredCookies.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text3)">No cookies found</td></tr>`;
      document.getElementById('selectedCount').textContent = selectedCookies.size;
      return;
    }
    tbody.innerHTML = filteredCookies.map((c, i) => {
      const exp = c.expirationDate ? new Date(c.expirationDate*1000).toLocaleDateString() : 'Session';
      const size = (c.name.length + (c.value||'').length) + ' B';
      const tracker = isTracker(c) ? '<span class="flag flag-ss" title="Tracker">TRK</span>' : '';
      const flags = [
        c.secure ? '<span class="flag flag-secure">S</span>' : '',
        c.httpOnly ? '<span class="flag flag-http">H</span>' : '',
        c.sameSite && c.sameSite !== 'unspecified' ? `<span class="flag flag-ss">${c.sameSite.charAt(0).toUpperCase()}</span>` : '',
        tracker
      ].join('');
      const isSelected = selectedCookies.has(cookieKey(c));
      return `<tr class="${isSelected ? 'selected' : ''}" data-index="${i}">
        <td class="col-check"><input type="checkbox" class="row-check" data-index="${i}" ${isSelected?'checked':''}></td>
        <td class="col-name" title="${c.name}">${escHtml(c.name)}</td>
        <td class="col-value"><span class="cookie-value" title="${escHtml(c.value||'')}">${truncate(c.value||'', 22)}</span></td>
        <td class="col-domain" title="${c.domain}">${escHtml(c.domain)}</td>
        <td class="col-path" title="${c.path}">${escHtml(c.path)}</td>
        <td class="col-expires">${exp}</td>
        <td class="col-size">${size}</td>
        <td class="col-flags">${flags}</td>
        <td class="col-actions">
          <button class="btn-icon edit-btn" data-index="${i}" title="Edit">✏️</button>
          <button class="btn-icon del-btn" data-index="${i}" title="Delete">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    // Bind events
    tbody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editCookie(filteredCookies[+btn.dataset.index]));
    });
    tbody.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteSingleCookie(filteredCookies[+btn.dataset.index]));
    });
    tbody.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const c = filteredCookies[+cb.dataset.index];
        if (cb.checked) selectedCookies.add(cookieKey(c));
        else selectedCookies.delete(cookieKey(c));
        document.getElementById('selectedCount').textContent = selectedCookies.size;
      });
    });

    document.getElementById('selectedCount').textContent = selectedCookies.size;
  }

  function cookieKey(c) { return `${c.domain}::${c.name}::${c.path}`; }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function truncate(s, n) { return s.length > n ? s.slice(0,n)+'…' : s; }

  // =========================================================================
  // EDIT
  // =========================================================================
  function editCookie(cookie) {
    editingCookie = cookie;
    document.getElementById('editorTitle').textContent = 'Edit Cookie';
    document.getElementById('editName').value = cookie.name;
    document.getElementById('editValue').value = cookie.value || '';
    document.getElementById('editDomain').value = cookie.domain;
    document.getElementById('editPath').value = cookie.path;
    document.getElementById('editExpires').value = cookie.expirationDate || '';
    document.getElementById('editSameSite').value = cookie.sameSite || 'no_restriction';
    document.getElementById('editSecure').checked = cookie.secure;
    document.getElementById('editHttpOnly').checked = cookie.httpOnly;
    document.getElementById('editSession').checked = !cookie.expirationDate;
    document.getElementById('editorPanel').classList.remove('hidden');
  }

  async function saveCookieEdit() {
    const isSession = document.getElementById('editSession').checked;
    const domain = document.getElementById('editDomain').value;
    const secure = document.getElementById('editSecure').checked;
    const url = `http${secure?'s':''}://${domain.replace(/^\./,'')}`;
    const details = {
      url,
      name: document.getElementById('editName').value,
      value: document.getElementById('editValue').value,
      domain: document.getElementById('editDomain').value,
      path: document.getElementById('editPath').value,
      secure: document.getElementById('editSecure').checked,
      httpOnly: document.getElementById('editHttpOnly').checked,
      sameSite: document.getElementById('editSameSite').value,
    };
    if (!isSession) {
      const exp = document.getElementById('editExpires').value;
      if (exp) details.expirationDate = parseFloat(exp);
    }

    // Delete old if name/domain changed
    if (editingCookie) {
      const oldUrl = `http${editingCookie.secure?'s':''}://${editingCookie.domain.replace(/^\./,'')}${editingCookie.path}`;
      await removeCookie(oldUrl, editingCookie.name);
    }

    try {
      await setCookie(details);
      toast('Cookie saved', 'success');
      document.getElementById('editorPanel').classList.add('hidden');
      await loadAllCookies();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function deleteSingleCookie(cookie) {
    const url = `http${cookie.secure?'s':''}://${cookie.domain.replace(/^\./,'')}${cookie.path}`;
    await removeCookie(url, cookie.name);
    toast('Cookie deleted');
    await loadAllCookies();
  }

  async function deleteSelectedCookies() {
    if (!selectedCookies.size) { toast('No cookies selected'); return; }
    const toDelete = filteredCookies.filter(c => selectedCookies.has(cookieKey(c)));
    for (const c of toDelete) {
      const url = `http${c.secure?'s':''}://${c.domain.replace(/^\./,'')}${c.path}`;
      await removeCookie(url, c.name);
    }
    selectedCookies.clear();
    toast(`Deleted ${toDelete.length} cookies`, 'success');
    await loadAllCookies();
  }

  // =========================================================================
  // ADD COOKIE
  // =========================================================================
  async function addNewCookie() {
    const domain = document.getElementById('newDomain').value.trim();
    const secure = document.getElementById('newSecure').checked;
    if (!domain) { toast('Domain is required', 'error'); return; }
    const url = `http${secure?'s':''}://${domain.replace(/^\./,'')}`;
    const details = {
      url,
      name: document.getElementById('newName').value.trim(),
      value: document.getElementById('newValue').value,
      domain,
      path: document.getElementById('newPath').value || '/',
      secure,
      httpOnly: document.getElementById('newHttpOnly').checked,
      sameSite: document.getElementById('newSameSite').value,
    };
    const exp = document.getElementById('newExpires').value;
    if (exp) details.expirationDate = parseFloat(exp);
    try {
      await setCookie(details);
      toast('Cookie added', 'success');
      document.getElementById('addCookieModal').classList.add('hidden');
      await loadAllCookies();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // =========================================================================
  // EXPORT
  // =========================================================================
  function exportCookiesJSON(cookies) {
    return JSON.stringify(cookies, null, 2);
  }

  function exportCookiesNetscape(cookies) {
    const lines = ['# Netscape HTTP Cookie File', '# Generated by PhantomPrint Cookie Manager', ''];
    cookies.forEach(c => {
      const domain = c.domain.startsWith('.') ? c.domain : c.domain;
      const flag = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const exp = c.expirationDate ? Math.floor(c.expirationDate) : 0;
      lines.push([domain, flag, c.path, secure, exp, c.name, c.value||''].join('\t'));
    });
    return lines.join('\n');
  }

  function exportCookiesHeader(cookies, domain) {
    const filtered = domain ? cookies.filter(c => c.domain === domain || c.domain === '.' + domain) : cookies;
    return filtered.map(c => `${c.name}=${c.value||''}`).join('; ');
  }

  async function encryptData(data, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:100000, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(data));
    const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    return JSON.stringify({v:'1',salt:toB64(salt),iv:toB64(iv),data:toB64(encrypted)});
  }

  async function decryptData(encJson, password) {
    const {salt:s64, iv:i64, data:d64} = JSON.parse(encJson);
    const fromB64 = b64 => new Uint8Array([...atob(b64)].map(c=>c.charCodeAt(0)));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:fromB64(s64), iterations:100000, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv:fromB64(i64)}, key, fromB64(d64));
    return new TextDecoder().decode(decrypted);
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function doExport() {
    const format = document.getElementById('exportFormat').value;
    const domain = document.getElementById('exportDomain').value;
    const cookies = domain ? allCookies.filter(c => c.domain === domain) : allCookies;

    let content, filename, mime;
    try {
      if (format === 'json') {
        content = exportCookiesJSON(cookies);
        filename = `cookies-${Date.now()}.json`;
        mime = 'application/json';
      } else if (format === 'netscape') {
        content = exportCookiesNetscape(cookies);
        filename = `cookies-${Date.now()}.txt`;
        mime = 'text/plain';
      } else if (format === 'header') {
        content = exportCookiesHeader(cookies, domain);
        filename = `cookies-header-${Date.now()}.txt`;
        mime = 'text/plain';
      } else if (format === 'encrypted') {
        const pw = document.getElementById('exportPassword').value;
        if (!pw) { toast('Enter a password', 'error'); return; }
        content = await encryptData(exportCookiesJSON(cookies), pw);
        filename = `cookies-${Date.now()}.phantomprint-cookies`;
        mime = 'application/octet-stream';
      }
      downloadFile(content, filename, mime);
      toast(`Exported ${cookies.length} cookies`, 'success');
      document.getElementById('exportModal').classList.add('hidden');
    } catch(e) {
      toast('Export error: ' + e.message, 'error');
    }
  }

  // =========================================================================
  // IMPORT
  // =========================================================================
  async function doImport() {
    const format = document.getElementById('importFormat').value;
    let data = document.getElementById('importData').value.trim();
    const file = document.getElementById('importFile').files[0];

    if (file && !data) {
      data = await file.text();
    }
    if (!data) { toast('No data to import', 'error'); return; }

    let cookies = [];
    try {
      if (format === 'json') {
        cookies = JSON.parse(data);
        if (!Array.isArray(cookies)) cookies = Object.values(cookies);
      } else if (format === 'netscape') {
        cookies = parseNetscape(data);
      } else if (format === 'header') {
        cookies = parseHeader(data);
      } else if (format === 'encrypted') {
        const pw = document.getElementById('importPassword').value;
        if (!pw) { toast('Enter password', 'error'); return; }
        const decrypted = await decryptData(data, pw);
        cookies = JSON.parse(decrypted);
      }

      let imported = 0;
      for (const c of cookies) {
        try {
          const domain = (c.domain||'').replace(/^\./,'');
          const url = `http${c.secure?'s':''}://${domain}${c.path||'/'}`;
          const d = { url, name: c.name, value: c.value||'', domain: c.domain, path: c.path||'/', secure: !!c.secure, httpOnly: !!c.httpOnly };
          if (c.expirationDate && c.expirationDate > 0) d.expirationDate = c.expirationDate;
          await setCookie(d);
          imported++;
        } catch(e) {}
      }
      toast(`Imported ${imported}/${cookies.length} cookies`, 'success');
      document.getElementById('importModal').classList.add('hidden');
      await loadAllCookies();
    } catch(e) {
      toast('Import error: ' + e.message, 'error');
    }
  }

  function parseNetscape(text) {
    const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
    return lines.map(l => {
      const parts = l.split('\t');
      if (parts.length < 7) return null;
      return { domain: parts[0], path: parts[2], secure: parts[3]==='TRUE', expirationDate: parseInt(parts[4])||0, name: parts[5], value: parts[6] };
    }).filter(Boolean);
  }

  function parseHeader(text) {
    return text.split(';').map(pair => {
      const idx = pair.indexOf('=');
      if (idx === -1) return null;
      return { name: pair.slice(0,idx).trim(), value: pair.slice(idx+1).trim(), domain: '', path: '/' };
    }).filter(Boolean);
  }

  // =========================================================================
  // PROFILES
  // =========================================================================
  async function loadProfiles() {
    const result = await new Promise(r => chrome.storage.local.get('pp_cookie_profiles', r));
    profiles = Object.entries(result.pp_cookie_profiles || {}).map(([name, data]) => ({name, ...data}));
    renderProfiles();
  }

  function renderProfiles() {
    const list = document.getElementById('profileList');
    if (!profiles.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">💾</div><div class="empty-msg">No saved profiles yet</div></div>';
      return;
    }
    list.innerHTML = profiles.map(p => `
      <div class="profile-card">
        <div>
          <div class="profile-card-name">${escHtml(p.name)}</div>
          <div class="profile-card-meta">${p.count||0} cookies · ${p.domain ? p.domain : 'All domains'} · ${new Date(p.savedAt||0).toLocaleDateString()}</div>
        </div>
        <div class="profile-card-actions">
          <button class="btn btn-sm" data-load="${p.name}">▶ Load</button>
          <button class="btn btn-sm" data-export-profile="${p.name}">📤</button>
          <button class="btn btn-sm btn-danger" data-delete-profile="${p.name}">🗑️</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-load]').forEach(btn => btn.addEventListener('click', () => loadProfile(btn.dataset.load)));
    list.querySelectorAll('[data-delete-profile]').forEach(btn => btn.addEventListener('click', () => deleteProfile(btn.dataset.deleteProfile)));
    list.querySelectorAll('[data-export-profile]').forEach(btn => btn.addEventListener('click', () => exportProfile(btn.dataset.exportProfile)));
  }

  async function saveCurrentProfile() {
    const name = document.getElementById('newProfileName').value.trim();
    if (!name) { toast('Enter a profile name', 'error'); return; }
    const result = await new Promise(r => chrome.storage.local.get('pp_cookie_profiles', r));
    const store = result.pp_cookie_profiles || {};
    store[name] = { cookies: allCookies, count: allCookies.length, savedAt: Date.now() };
    await new Promise(r => chrome.storage.local.set({ pp_cookie_profiles: store }, r));
    toast(`Profile "${name}" saved`, 'success');
    document.getElementById('newProfileName').value = '';
    await loadProfiles();
  }

  async function loadProfile(name) {
    const result = await new Promise(r => chrome.storage.local.get('pp_cookie_profiles', r));
    const profile = result.pp_cookie_profiles?.[name];
    if (!profile) { toast('Profile not found', 'error'); return; }
    let loaded = 0;
    for (const c of profile.cookies||[]) {
      try {
        const domain = (c.domain||'').replace(/^\./,'');
        const url = `http${c.secure?'s':''}://${domain}${c.path||'/'}`;
        const d = { url, name: c.name, value: c.value||'', domain: c.domain, path: c.path||'/', secure: !!c.secure, httpOnly: !!c.httpOnly };
        if (c.expirationDate && c.expirationDate > 0) d.expirationDate = c.expirationDate;
        await setCookie(d);
        loaded++;
      } catch(e) {}
    }
    toast(`Loaded ${loaded} cookies from "${name}"`, 'success');
    await loadAllCookies();
  }

  async function deleteProfile(name) {
    const result = await new Promise(r => chrome.storage.local.get('pp_cookie_profiles', r));
    const store = result.pp_cookie_profiles || {};
    delete store[name];
    await new Promise(r => chrome.storage.local.set({ pp_cookie_profiles: store }, r));
    toast(`Profile "${name}" deleted`);
    await loadProfiles();
  }

  function exportProfile(name) {
    const profile = profiles.find(p => p.name === name);
    if (!profile) return;
    downloadFile(JSON.stringify(profile, null, 2), `${name}-cookies.json`, 'application/json');
  }

  // =========================================================================
  // PRIVACY TOOLS
  // =========================================================================
  async function blockTrackerCookies() {
    let deleted = 0;
    for (const c of allCookies) {
      if (isTracker(c)) {
        const url = `http${c.secure?'s':''}://${c.domain.replace(/^\./,'')}${c.path}`;
        await removeCookie(url, c.name);
        deleted++;
      }
    }
    toast(`Deleted ${deleted} tracker cookies`, 'success');
    await loadAllCookies();
  }

  async function clearAllCookies() {
    if (!confirm('Delete ALL cookies? This will log you out of all sites.')) return;
    for (const c of allCookies) {
      const url = `http${c.secure?'s':''}://${c.domain.replace(/^\./,'')}${c.path}`;
      await removeCookie(url, c.name);
    }
    toast('All cookies cleared', 'success');
    await loadAllCookies();
  }

  async function clearSessionCookies() {
    const session = allCookies.filter(c => !c.expirationDate);
    for (const c of session) {
      const url = `http${c.secure?'s':''}://${c.domain.replace(/^\./,'')}${c.path}`;
      await removeCookie(url, c.name);
    }
    toast(`Cleared ${session.length} session cookies`);
    await loadAllCookies();
  }

  async function clearExpiredCookies() {
    const now = Date.now() / 1000;
    const expired = allCookies.filter(c => c.expirationDate && c.expirationDate < now);
    for (const c of expired) {
      const url = `http${c.secure?'s':''}://${c.domain.replace(/^\./,'')}${c.path}`;
      await removeCookie(url, c.name);
    }
    toast(`Cleared ${expired.length} expired cookies`);
    await loadAllCookies();
  }

  // =========================================================================
  // STATUS / TOAST
  // =========================================================================
  function showStatus(text, type) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusDot');
    dot.style.background = type === 'error' ? 'var(--danger)' : 'var(--success)';
  }

  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { el.className = ''; }, 2500);
  }

  // =========================================================================
  // EVENTS
  // =========================================================================
  function bindEvents() {
    // Search
    document.getElementById('searchInput').addEventListener('input', e => {
      searchQuery = e.target.value;
      applyFilters();
    });

    // Domain filter
    document.getElementById('domainFilter').addEventListener('change', e => {
      currentDomain = e.target.value;
      applyFilters();
    });

    // Sidebar filters
    document.querySelectorAll('[data-filter]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        currentFilter = el.dataset.filter;
        applyFilters();
      });
    });

    // Sort columns
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        if (sortField === th.dataset.sort) sortAsc = !sortAsc;
        else { sortField = th.dataset.sort; sortAsc = true; }
        document.querySelectorAll('th').forEach(t => t.classList.remove('sorted'));
        th.classList.add('sorted');
        applyFilters();
      });
    });

    // Select all
    document.getElementById('selectAll').addEventListener('change', e => {
      if (e.target.checked) filteredCookies.forEach(c => selectedCookies.add(cookieKey(c)));
      else selectedCookies.clear();
      renderTable();
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.add('hidden'));
        document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
        if (btn.dataset.tab === 'profiles') loadProfiles();
        if (btn.dataset.tab === 'privacy') updateCounts();
        // Also hide editor
        document.getElementById('toolbar-viewer').classList.toggle('hidden', btn.dataset.tab !== 'viewer');
      });
    });

    // Buttons
    document.getElementById('btnRefresh').addEventListener('click', loadAllCookies);
    document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedCookies);
    document.getElementById('btnBlockTrackers').addEventListener('click', blockTrackerCookies);

    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importModal').classList.remove('hidden'));
    document.getElementById('btnExport').addEventListener('click', () => document.getElementById('exportModal').classList.remove('hidden'));
    document.getElementById('btnAddCookie').addEventListener('click', () => document.getElementById('addCookieModal').classList.remove('hidden'));

    // Import modal
    document.getElementById('importFormat').addEventListener('change', e => {
      document.getElementById('importPasswordGroup').style.display = e.target.value === 'encrypted' ? '' : 'none';
    });
    document.getElementById('btnImportCancel').addEventListener('click', () => document.getElementById('importModal').classList.add('hidden'));
    document.getElementById('btnImportConfirm').addEventListener('click', doImport);

    // Export modal
    document.getElementById('exportFormat').addEventListener('change', e => {
      document.getElementById('exportPasswordGroup').style.display = e.target.value === 'encrypted' ? '' : 'none';
    });
    document.getElementById('btnExportCancel').addEventListener('click', () => document.getElementById('exportModal').classList.add('hidden'));
    document.getElementById('btnExportConfirm').addEventListener('click', doExport);

    // Add cookie modal
    document.getElementById('btnAddCancel').addEventListener('click', () => document.getElementById('addCookieModal').classList.add('hidden'));
    document.getElementById('btnAddConfirm').addEventListener('click', addNewCookie);

    // Editor panel
    document.getElementById('btnSaveCookie').addEventListener('click', saveCookieEdit);
    document.getElementById('btnCancelEdit').addEventListener('click', () => document.getElementById('editorPanel').classList.add('hidden'));
    document.getElementById('btnDeleteCookie').addEventListener('click', () => {
      if (editingCookie) deleteSingleCookie(editingCookie).then(() => document.getElementById('editorPanel').classList.add('hidden'));
    });
    document.getElementById('editSession').addEventListener('change', e => {
      document.getElementById('editExpires').disabled = e.target.checked;
    });

    // Privacy tab
    document.getElementById('btnDeleteTrackers').addEventListener('click', blockTrackerCookies);
    document.getElementById('btnSetLifetime').addEventListener('click', () => {
      const days = parseInt(document.getElementById('lifetimeLimit').value);
      if (isNaN(days) || days < 1) { toast('Enter a valid number of days', 'error'); return; }
      chrome.storage.local.set({ pp_cookie_lifetime_days: days });
      toast(`Cookie lifetime limited to ${days} days`);
    });
    document.getElementById('autoDeleteToggle').addEventListener('change', e => {
      chrome.storage.local.set({ pp_auto_delete_trackers: e.target.checked });
      toast('Auto-delete ' + (e.target.checked ? 'enabled' : 'disabled'));
    });
    document.getElementById('btnClearAll').addEventListener('click', clearAllCookies);
    document.getElementById('btnClearSession').addEventListener('click', clearSessionCookies);
    document.getElementById('btnClearOld').addEventListener('click', clearExpiredCookies);

    // Profiles tab
    document.getElementById('btnSaveProfile').addEventListener('click', saveCurrentProfile);
    document.getElementById('btnImportProfile').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const text = await input.files[0].text();
        const data = JSON.parse(text);
        const name = data.name || `imported-${Date.now()}`;
        const result = await new Promise(r => chrome.storage.local.get('pp_cookie_profiles', r));
        const store = result.pp_cookie_profiles || {};
        store[name] = data;
        await new Promise(r => chrome.storage.local.set({ pp_cookie_profiles: store }, r));
        toast(`Profile "${name}" imported`, 'success');
        await loadProfiles();
      };
      input.click();
    });

    // Load settings
    chrome.storage.local.get(['pp_auto_delete_trackers', 'pp_cookie_lifetime_days'], r => {
      if (r.pp_auto_delete_trackers) document.getElementById('autoDeleteToggle').checked = true;
      if (r.pp_cookie_lifetime_days) document.getElementById('lifetimeLimit').value = r.pp_cookie_lifetime_days;
    });
  }

  // =========================================================================
  // INIT
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadAllCookies();
  });
})();
