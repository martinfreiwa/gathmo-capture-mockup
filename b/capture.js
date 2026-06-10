/* Shared capture-flow interactions — delegated, no inline handlers.
   Contract via data-attributes:
   [data-wave="N"]            build N waveform bars (add data-tall for taller)
   [data-action="consent"]    toggle .on; sets consentOK
   [data-action="goto" data-target=VIEW data-settab?=TAB]  show .view[data-view=VIEW]
   [data-action="overlay" data-target=ID]   add .show to #ID
   [data-action="tab" data-tab=TAB]         switch segmented control + panes
   [data-action="add" data-kind=photo|video] mark media present (photo shows thumbs)
   [data-action="remove" data-kind=KIND]    clear media
   [data-action="rec"]        toggle voice recording (mic element)
   [data-action="reset" data-target?=VIEW]  reset state
   [data-send]                send button, enabled when active tab has content
   [data-gate-consent]        element enabled only once consent given
*/
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // when shown inside the portal preview (iframe), hide the dev label
  if (window.top !== window.self) {
    const s = document.createElement('style');
    s.textContent = '.mocktag{display:none!important}';
    document.head.appendChild(s);
  }

  let state = { photo: false, video: false, voice: false };
  let activeTab = 'photo';
  let consentOK = false;

  // build waveforms
  $$('[data-wave]').forEach(el => {
    const n = +el.dataset.wave || 24;
    const tall = el.hasAttribute('data-tall');
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      b.style.height = (tall ? 6 + Math.random() * 46 : 4 + Math.random() * 24) + 'px';
      el.appendChild(b);
    }
  });

  function refresh() {
    $$('[data-gate-consent],[data-send]').forEach(el => {
      let ok = true;
      if (el.hasAttribute('data-send')) ok = ok && !!state[activeTab];
      if (el.hasAttribute('data-gate-consent')) ok = ok && consentOK;
      el.disabled = !ok;
    });
  }
  function showView(name) {
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  }
  function setTab(tab) {
    activeTab = tab;
    $$('[data-action=tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $$('[data-pane]').forEach(p => p.classList.toggle('on', p.dataset.pane === tab));
    refresh();
  }

  let recording = false, recTimer = null;
  function setMicIcon(mic, name) {
    const u = mic.querySelector('use'); if (!u) return;
    const id = name === 'stop' ? '#ic-stop' : '#ic-mic';
    u.setAttribute('href', id); u.setAttribute('xlink:href', id);
  }
  function resetVoice() {
    $$('.voice').forEach(v => {
      v.classList.remove('recording');
      const mic = $('[data-action=rec]', v); if (mic) { mic.classList.remove('rec'); setMicIcon(mic, 'mic'); }
      const hint = $('.hint', v); if (hint) hint.textContent = 'Tap to record · up to 2 minutes';
    });
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    recording = false;
  }
  function toggleRec(mic) {
    const wrap = mic.closest('.voice'), hint = $('.hint', wrap), time = $('.time', wrap);
    recording = !recording;
    if (recording) {
      mic.classList.add('rec'); setMicIcon(mic, 'stop'); wrap.classList.add('recording');
      if (hint) hint.textContent = 'Recording… tap to stop';
      let t = 0; recTimer = setInterval(() => { t++; if (time) time.textContent = '0:' + String(t).padStart(2, '0'); }, 1000);
    } else {
      mic.classList.remove('rec'); setMicIcon(mic, 'mic');
      if (hint) hint.textContent = 'Recorded · tap to re-record';
      clearInterval(recTimer); recTimer = null;
      state.voice = true; refresh();
    }
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]'); if (!t) return;
    const a = t.dataset.action;
    if (a === 'consent') { t.classList.toggle('on'); consentOK = t.classList.contains('on'); refresh(); }
    else if (a === 'goto') { if (t.dataset.settab) setTab(t.dataset.settab); showView(t.dataset.target); }
    else if (a === 'overlay') { const el = document.getElementById(t.dataset.target); if (el) el.classList.add('show'); }
    else if (a === 'tab') { setTab(t.dataset.tab); }
    else if (a === 'add') {
      const k = t.dataset.kind; state[k] = true;
      const pane = t.closest('[data-pane]'); const th = pane && $('[data-thumbs]', pane);
      if (k === 'photo' && th) th.classList.add('show');
      refresh();
    }
    else if (a === 'remove') {
      e.stopPropagation();
      const k = t.dataset.kind; state[k] = false;
      const pane = t.closest('[data-pane]'); const th = pane && $('[data-thumbs]', pane);
      if (th) th.classList.remove('show');
      refresh();
    }
    else if (a === 'rec') { toggleRec(t); }
    else if (a === 'reset') {
      state = { photo: false, video: false, voice: false };
      $$('[data-thumbs]').forEach(x => x.classList.remove('show'));
      resetVoice(); setTab('photo');
      $$('.show').forEach(x => x.classList.remove('show'));
      if (t.dataset.target) showView(t.dataset.target);
    }
  });

  // ---- live text customization (driven by the portal via postMessage) ----
  function emphasize(str) {
    const esc = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\*([^*]+)\*/g, '<em>$1</em>');   // *word* -> italic accent
  }
  function applyText(values) {
    if (!values) return;
    Object.keys(values).forEach(key => {
      const v = values[key];
      $$('[data-edit="' + key + '"]').forEach(el => {
        if (key === 'headline') el.innerHTML = emphasize(v);
        else el.textContent = v;
      });
    });
  }
  function applyImage(url) {
    // swap the cover photo on the photo variants; '' reverts to the built-in default
    $$('[data-cover]').forEach(el => { el.style.backgroundImage = url ? 'url("' + url + '")' : ''; });
  }
  function applyTheme(vars) {
    // recolor the accent system (event-type preset or custom colour)
    if (!vars) return;
    const root = document.documentElement;
    Object.keys(vars).forEach(k => vars[k] ? root.style.setProperty(k, vars[k]) : root.style.removeProperty(k));
  }
  window.addEventListener('message', e => {
    const d = e.data; if (!d) return;
    if (d.type === 'gathmo:text') applyText(d.values);
    else if (d.type === 'gathmo:image') applyImage(d.value);
    else if (d.type === 'gathmo:theme') applyTheme(d.vars);
  });
  // tell the portal we're ready to receive text overrides
  if (window.top !== window.self) {
    try { window.parent.postMessage({ type: 'gathmo:ready' }, '*'); } catch (_) {}
  }

  setTab('photo');
  refresh();
})();
