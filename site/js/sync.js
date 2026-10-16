// Optional cross-device sync. Notes, completed topics and quiz scores are saved to a private GitHub gist,
// one file per course (<course.id>.json). The token and gist id live in localStorage and are shared by all courses.
// Merge rule: each note and each completed flag carries a timestamp in <course.id>-stamps, and the newer one wins;
// quiz scores keep the higher best.
(function () {
  const API = 'https://api.github.com';
  const DESC = 'Study guide sync (kyle-law.github.io/cka-cks-study-guide)';
  const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Study%20guide%20sync';
  let id, file, onChange, busy = false, again = false, timer = null, last = 0, state = 'off', message = '';

  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const json = k => { try { return JSON.parse(get(k) || '{}'); } catch (e) { return {}; } };
  const token = () => get('study-sync-token');
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Canonical JSON (sorted keys) so key order never counts as a change.
  const canon = v => v && typeof v === 'object'
    ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v);

  const readLocal = () => ({ done: json(id + '-done'), quiz: json(id + '-quiz'), notes: json(id + '-notes'), stamps: json(id + '-stamps') });
  const writeLocal = d => ['done', 'quiz', 'notes', 'stamps'].forEach(k => set(`${id}-${k}`, JSON.stringify(d[k])));

  function merge(L, R) {
    const out = { done: {}, quiz: {}, notes: {}, stamps: {} };
    const ls = L.stamps || {}, rs = R.stamps || {};
    const field = (name, p, combine) => {
      const a = L[name] || {}, b = R[name] || {};
      const fromStamps = s => Object.keys(s).filter(k => k.startsWith(p)).map(k => k.slice(p.length));
      new Set([...Object.keys(a), ...Object.keys(b), ...fromStamps(ls), ...fromStamps(rs)]).forEach(k => {
        const lt = ls[p + k] || 0, rt = rs[p + k] || 0;
        let v = rt > lt ? b[k] : lt > rt ? a[k] : combine(a[k], b[k], k);
        if (v) out[name][k] = v;
        const t = Math.max(lt, rt, out.stamps[p + k] || 0);
        if (t) out.stamps[p + k] = t;
      });
    };
    field('done', 'd:', (a, b) => a || b);
    // Same timestamp but different text only happens for notes written before sync existed: keep both.
    field('notes', 'n:', (a, b, k) => {
      if (a && b && a !== b) { out.stamps['n:' + k] = Date.now(); return `${a}\n\n---\n\n${b}`; }
      return a || b;
    });
    const qa = L.quiz || {}, qb = R.quiz || {};
    new Set([...Object.keys(qa), ...Object.keys(qb)]).forEach(k => {
      out.quiz[k] = !qb[k] || (qa[k] && qa[k].best >= qb[k].best) ? qa[k] : qb[k];
    });
    return out;
  }

  async function api(method, path, body) {
    const r = await fetch(API + path, {
      method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body && JSON.stringify(body)
    });
    if (r.status === 404) return null;
    if (r.status === 401) throw new Error('GitHub rejected the token. Create a new one and connect again.');
    if (r.status === 403) throw new Error('GitHub refused the request (403). Check that the token has the gist scope.');
    if (!r.ok) throw new Error('GitHub returned ' + r.status + '.');
    return r.json();
  }

  async function findGist() {
    for (let page = 1; page <= 10; page++) {
      const list = await api('GET', `/gists?per_page=100&page=${page}`) || [];
      const g = list.find(g => g.description === DESC);
      if (g) return g.id;
      if (list.length < 100) return null;
    }
    return null;
  }

  async function sync() {
    if (!token()) return;
    if (busy) { again = true; return; }
    busy = true; clearTimeout(timer); timer = null;
    status('busy', 'Syncing…');
    try {
      let gid = get('study-sync-gist') || await findGist(), remote = {};
      if (gid) {
        const g = await api('GET', '/gists/' + gid);
        if (!g) gid = null;
        else if (g.files[file]) {
          const f = g.files[file];
          remote = JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content);
        }
      }
      const local = readLocal(), merged = merge(local, remote);
      if (canon(merged) !== canon(local)) { writeLocal(merged); onChange(); }
      if (canon(merged) !== canon(remote)) {
        const body = { files: { [file]: { content: JSON.stringify(merged, null, 1) } } };
        if (gid) await api('PATCH', '/gists/' + gid, body);
        else gid = (await api('POST', '/gists', { ...body, description: DESC, public: false })).id;
      }
      set('study-sync-gist', gid);
      last = Date.now();
      status('ok', 'Synced at ' + new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      status('err', e.message === 'Failed to fetch' ? 'Offline. Will retry when you come back.' : e.message);
    }
    busy = false;
    if (again) { again = false; sync(); }
  }

  const schedule = (ms = 1500) => { if (!token()) return; clearTimeout(timer); timer = setTimeout(sync, ms); };

  function status(s, msg) {
    state = s; message = msg;
    const b = $('#sync');
    if (b) { b.className = 'sync-' + s; b.title = msg; }
    const p = $('#sync-status');
    if (p) p.textContent = msg;
  }

  function dialog() {
    let d = $('#sync-dialog');
    if (!d) { d = document.createElement('dialog'); d.id = 'sync-dialog'; document.body.appendChild(d); }
    const gid = get('study-sync-gist');
    d.innerHTML = token() ? `
      <h3>☁ Sync is on</h3>
      <p>Notes, completed topics and quiz scores sync with a private gist${gid ? ` (<a href="https://gist.github.com/${esc(gid)}" target="_blank" rel="noopener">view it</a>)` : ''}. Changes upload a moment after you make them, and download when you open or come back to a page.</p>
      <p class="meta" id="sync-status">${esc(message)}</p>
      <div class="sync-actions"><button id="sync-now">Sync now</button><button id="sync-off">Disconnect this browser</button><button id="sync-close">Close</button></div>
      <p class="meta">Disconnecting removes the token from this browser only. Your notes stay here and in the gist.</p>` : `
      <h3>☁ Sync across devices</h3>
      <p>Keep your notes, completed topics and quiz scores the same on your phone and laptop. They're saved to a private gist in your GitHub account.</p>
      <ol>
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a GitHub token</a> with only the <b>gist</b> scope ticked. Pick an expiry you're happy with.</li>
        <li>Paste it below and press Connect. Do the same once on each device; they all find the same gist.</li>
      </ol>
      <input id="sync-token" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false">
      <p class="meta" id="sync-status">${state === 'err' ? esc(message) : ''}</p>
      <div class="sync-actions"><button id="sync-connect">Connect</button><button id="sync-close">Close</button></div>
      <p class="meta">The token is stored in this browser and only sent to api.github.com. A gist-only token can't touch your repositories.</p>`;
    d.querySelector('#sync-close').onclick = () => d.close();
    const on = (sel, fn) => { const b = d.querySelector(sel); if (b) b.onclick = fn; };
    on('#sync-now', sync);
    on('#sync-off', () => { set('study-sync-token', null); set('study-sync-gist', null); status('off', 'Sync is off'); dialog(); });
    on('#sync-connect', async () => {
      const t = d.querySelector('#sync-token').value.trim();
      if (!t) return;
      set('study-sync-token', t);
      await sync();
      if (state === 'err') set('study-sync-token', null);
      dialog();
    });
    if (!d.open) d.showModal();
  }

  window.SYNC = {
    // onChange runs after a download changed this browser's data, so the page can reload it.
    init(courseId, changed) {
      id = courseId; file = courseId + '.json'; onChange = changed;
      const b = document.createElement('button');
      b.id = 'sync'; b.textContent = '☁'; b.setAttribute('aria-label', 'Sync across devices'); b.onclick = dialog;
      const theme = $('#theme');
      theme.parentNode.insertBefore(b, theme);
      status('off', 'Sync is off');
      if (token()) sync();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { if (timer) sync(); }
        else if (Date.now() - last > 10000) sync();
      });
      window.addEventListener('online', () => schedule(0));
    },
    // Call after saving a change. kind 'd' (completed) and 'n' (note) are timestamped so the newest edit wins.
    touch(kind, topicId) {
      if (kind === 'd' || kind === 'n') {
        const s = json(id + '-stamps'); s[kind + ':' + topicId] = Date.now();
        set(id + '-stamps', JSON.stringify(s));
      }
      schedule();
    },
    merge
  };
})();
