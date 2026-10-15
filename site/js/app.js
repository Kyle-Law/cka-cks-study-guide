// Course-agnostic study-guide app. Each page sets window.COURSE (see js/data/course.js) and loads that course's data.
(function () {
  const course = window.COURSE;
  const domains = window.COURSE_DOMAINS = window.COURSE_DOMAINS || [];
  const basics = window.COURSE_BASICS || {};
  const quizzes = window.COURSE_QUIZZES || {};
  const order = course.order;
  domains.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const all = domains.flatMap(d => d.topics.map(t => ({ ...t, domain: d })));
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  const load = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const key = k => `${course.id}-${k}`;
  let done = load(key('done'));
  let scores = load(key('quiz')); // { topicId: { best, total } }
  let notes = load(key('notes')); // { topicId: text }

  // Stable shuffle so options keep their order across re-renders of the same attempt.
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0; return h; };
  const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const shuffled = (n, seed) => { const a = [...Array(n).keys()], r = rng(seed); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const searchText = t => {
    const b = basics[t.id] || {};
    return [t.title, b.summary, ...(b.ideas || []), ...t.points].join(' ').toLowerCase();
  };

  function renderNav(filter = '') {
    const f = filter.toLowerCase();
    const cur = location.hash.replace('#/', '');
    $('#nav').innerHTML = domains.map(d => {
      const ts = d.topics.filter(t => !f || searchText(t).includes(f));
      if (!ts.length) return '';
      const n = d.topics.filter(t => done[t.id]).length;
      return `<h4>${esc(d.title)} <span>${d.weight}% · ${n}/${d.topics.length}</span></h4>` +
        ts.map(t => {
          const s = scores[t.id];
          return `<a href="#/${t.id}" class="${t.id === cur ? 'active' : ''} ${done[t.id] ? 'done' : ''}">${esc(t.title)}${notes[t.id] ? '<span title="Has notes"> ✎</span>' : ''}${s ? `<small title="Best quiz score">${s.best}/${s.total}</small>` : ''}</a>`;
        }).join('');
    }).join('');
    const quizzed = Object.keys(scores).length;
    $('#progress').textContent = `${Object.keys(done).filter(k => done[k]).length}/${all.length} done · ${quizzed}/${all.length} quizzes`;
  }

  function home() {
    $('#main').innerHTML = `
      <h1>${course.title}</h1>
      <p>${course.intro || `Every topic of the ${course.name} curriculum, each with <b>key learning points</b>, a <b>diagram</b>, <b>hands-on labs</b>, a <b>quiz</b>, and <b>links to the official docs</b>.`}</p>
      <div class="grid">${domains.map(d => `
        <a class="card" href="#/${d.topics[0].id}">
          <div class="weight">${d.weight}%</div><b>${esc(d.title)}</b>
          <div class="meta">${d.topics.length} topics</div></a>`).join('')}
      </div>
      <h2>How each topic works</h2>
      <div class="card"><ol class="points">${course.howto || `
        <li><b>Read "In a nutshell" and the key ideas.</b> They explain the topic in plain language. Open "Exam details" once the basics make sense.</li>
        <li><b>Do the lab</b> on a practice cluster. Run the steps in order, then check the "Verify" line.</li>
        <li><b>Take the quiz.</b> You get instant feedback and an explanation for every answer. Your best score appears in the sidebar.</li>
        <li><b>Skim the official docs</b>. On the exam, kubernetes.io is the only reference you're allowed.</li>`}
      </ol></div>
      ${course.home}
      <h2>My notes</h2>
      <p>Each topic has a notes box at the top of the page. Notes are stored in this browser only, so download a copy now and then.</p>
      <button id="export">⬇ Download all notes (.md)</button>
      <p class="meta">${course.footer}</p>`;
  }

  function afterHome() { const b = $('#export'); if (b) b.onclick = exportNotes; }

  function lab(l, i) {
    return `<div class="card lab"><h3>Lab ${i + 1}: ${esc(l.title)} ${(l.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</h3>
      <div class="meta">${inline(l.goal)}</div>
      ${l.steps.map(s => `<div class="step"><div>${inline(s[0])}</div>${s[1] ? `<pre><code>${esc(s[1])}</code></pre>` : ''}</div>`).join('')}
      ${l.verify ? `<div class="verify"><b>Verify:</b> ${inline(l.verify)}</div>` : ''}
      ${l.cleanup ? `<div class="meta">Cleanup: <code>${esc(l.cleanup)}</code></div>` : ''}</div>`;
  }

  function visual(t) {
    const v = (window.COURSE_VISUALS || {})[t.id];
    // The caption names the diagram for screen readers (role="img" needs an accessible name).
    return v ? `<figure class="visual"><div class="visual-scroll">${v.svg.replace('<svg ', '<svg aria-labelledby="visual-caption" ')}</div><figcaption id="visual-caption">${inline(v.caption)}</figcaption></figure>` : '';
  }

  function learn(t) {
    const b = basics[t.id];
    const intro = b ? `
      <div class="nutshell"><div class="label">In a nutshell</div><p>${inline(b.summary)}</p></div>
      ${visual(t)}
      <h3>Key ideas</h3>
      <ul class="ideas">${b.ideas.map(x => `<li>${inline(x)}</li>`).join('')}</ul>` : '';
    return `${intro}
      <details class="deep"${b ? '' : ' open'}>
        <summary>${course.detailsLabel || 'Exam details'}: ${t.points.length} points to know once the basics make sense</summary>
        <ul class="points">${t.points.map(p => `<li>${inline(p)}</li>`).join('')}</ul>
      </details>`;
  }

  // In the data, option 0 is always the correct answer; display order is shuffled.
  function renderQuiz(t, attempt) {
    const quiz = quizzes[t.id] || [];
    const el = $('#quiz');
    if (!quiz.length) { el.innerHTML = '<p class="meta">No quiz for this topic yet.</p>'; return; }
    const state = quiz.map(() => null);
    el.innerHTML = quiz.map((q, i) => `
      <div class="q" data-i="${i}">
        <p class="qtext"><b>Q${i + 1}.</b> ${inline(q.q)}</p>
        <div class="opts">${shuffled(q.o.length, hash(t.id + i) + attempt).map(k => `<button class="opt" data-k="${k}">${inline(q.o[k])}</button>`).join('')}</div>
        <div class="why" hidden></div>
      </div>`).join('') + '<div class="score" id="score"></div>';

    const update = () => {
      const answered = state.filter(s => s !== null).length;
      const right = state.filter(Boolean).length;
      const s = $('#score');
      if (answered < quiz.length) { s.innerHTML = `<span class="meta">Answered ${answered} of ${quiz.length}</span>`; return; }
      const prev = scores[t.id];
      if (!prev || right > prev.best) { scores[t.id] = { best: right, total: quiz.length }; save(key('quiz'), scores); renderNav($('#search').value); }
      const msg = right === quiz.length ? 'Perfect. You know this topic.'
        : right / quiz.length >= 0.6 ? 'Good. Re-read the explanations for the ones you missed.'
        : 'Re-read the key ideas, try the lab, then take the quiz again.';
      s.innerHTML = `<div class="card"><b>You scored ${right}/${quiz.length}.</b> ${msg}
        <div class="meta">Best score: ${scores[t.id].best}/${quiz.length}</div>
        <button id="retry">Retry with shuffled answers</button></div>`;
      $('#retry').onclick = () => { renderQuiz(t, attempt + 1); el.scrollIntoView({ behavior: 'smooth' }); };
    };

    el.querySelectorAll('.q').forEach(div => {
      const i = +div.dataset.i, q = quiz[i];
      div.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
        if (state[i] !== null) return;
        const ok = +btn.dataset.k === 0;
        state[i] = ok;
        div.querySelectorAll('.opt').forEach(o => { o.disabled = true; if (+o.dataset.k === 0) o.classList.add('right'); });
        if (!ok) btn.classList.add('wrong');
        const w = div.querySelector('.why');
        w.hidden = false;
        w.className = 'why ' + (ok ? 'ok' : 'no');
        w.innerHTML = `<b>${ok ? '✓ Correct.' : '✗ Not quite.'}</b> ${inline(q.why)}`;
        update();
      });
    });
    update();
  }

  function topic(id) {
    const i = all.findIndex(t => t.id === id);
    if (i < 0) return home();
    const t = all[i], prev = all[i - 1], next = all[i + 1];
    const nq = (quizzes[t.id] || []).length;
    $('#main').innerHTML = `
      <div class="meta">${esc(t.domain.title)} · ${t.domain.weight}% ${course.weightLabel || 'of exam'}</div>
      <h1>${esc(t.title)}</h1>
      <div class="toc">
        <button data-go="s-learn">1. Learn</button>
        <button data-go="s-labs">2. Labs (${t.labs.length})</button>
        <button data-go="s-docs">3. Docs</button>
        <button data-go="s-quiz">4. Quiz (${nq})</button>
      </div>
      <div class="notes">
        <label for="note"><b>✎ My notes</b> <span class="meta" id="note-status">Saved in this browser as you type</span></label>
        <textarea id="note" placeholder="Write what you learned, things that confused you, commands to remember…"></textarea>
      </div>
      <h2 id="s-learn">1. Key learning points</h2>
      ${learn(t)}
      <h2 id="s-labs">2. Hands-on labs</h2>
      ${t.labs.map(lab).join('')}
      <h2 id="s-docs">3. Official documentation</h2>
      <ul>${t.refs.map(r => `<li><a href="${r[1]}" target="_blank" rel="noopener">${esc(r[0])}</a></li>`).join('')}</ul>
      <h2 id="s-quiz">4. Quiz</h2>
      <div id="quiz"></div>
      <button class="done-btn" id="done">${done[t.id] ? '✓ Completed (click to undo)' : 'Mark as completed'}</button>
      <div class="pager">${prev ? `<a href="#/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="#/${next.id}">${esc(next.title)} →</a>` : ''}</div>`;
    $('#done').onclick = () => {
      done[t.id] = !done[t.id]; save(key('done'), done);
      $('#done').textContent = done[t.id] ? '✓ Completed (click to undo)' : 'Mark as completed';
      renderNav($('#search').value);
    };
    document.querySelectorAll('.toc button').forEach(b => b.onclick = () => document.getElementById(b.dataset.go).scrollIntoView({ behavior: 'smooth' }));
    document.querySelectorAll('pre').forEach(pre => {
      const b = document.createElement('button'); b.textContent = 'Copy';
      b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(pre.innerText.replace(/Copy$/, '').trimEnd()); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1200); };
      pre.appendChild(b);
    });
    const box = $('#note'), status = $('#note-status');
    box.value = notes[t.id] || '';
    const fit = () => { box.style.height = 'auto'; box.style.height = Math.max(120, box.scrollHeight + 2) + 'px'; };
    fit();
    let timer;
    box.oninput = () => {
      fit();
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (box.value.trim()) notes[t.id] = box.value; else delete notes[t.id];
        save(key('notes'), notes);
        status.textContent = 'Saved ✓';
        renderNav($('#search').value);
      }, 400);
    };
    renderQuiz(t, 0);
  }

  function exportNotes() {
    const text = all.filter(t => notes[t.id]).map(t => `## ${t.title}\n(${t.domain.title})\n\n${notes[t.id]}\n`).join('\n');
    if (!text) { alert('No notes yet.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`# My ${course.name} notes\n\n${text}`], { type: 'text/markdown' }));
    a.download = `${course.id}-notes.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function route() {
    const id = location.hash.replace('#/', '');
    id ? topic(id) : (home(), afterHome());
    renderNav($('#search').value);
    $('#nav').classList.remove('open');
    window.scrollTo(0, 0);
  }

  $('#search').oninput = e => renderNav(e.target.value);
  $('#menu').onclick = () => $('#nav').classList.toggle('open');
  $('#theme').onclick = () => {
    const r = document.documentElement, dark = getComputedStyle(r).getPropertyValue('--bg').trim() === '#0e1420';
    r.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('cka-theme', r.dataset.theme); } catch (e) {}
  };
  window.addEventListener('hashchange', route);
  route();
})();
