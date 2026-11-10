/* Callback Line: залишити повідомлення -> озвучений AI-"передзвін" зі субтитрами й нотатками.
   Озвучення: Web Speech API (голос пристрою). Текст приходить потоком із Cloudflare Worker. */
(function () {
  'use strict';
  var app = document.getElementById('cbl-app');
  if (!app) return;

  var LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ENDPOINT = (LOCAL ? 'http://127.0.0.1:' + (new URLSearchParams(location.search).get('cbport') || '8831') : '') + app.getAttribute('data-endpoint');
  var MAX_TRIES = 3;
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    form: $('cbl-form'), msg: $('cbl-msg'), count: $('cbl-count'), err: $('cbl-error'), dial: $('cbl-dial'),
    sound: $('cbl-sound'), mic: $('cbl-mic'), voice: $('cbl-voice'), voiceWrap: $('cbl-voice-wrap'),
    lcdLine: $('cbl-lcd-line'), lcdState: $('cbl-lcd-state'), timer: $('cbl-timer'),
    call: $('cbl-call'), callerImg: $('cbl-caller-img'), callerName: $('cbl-caller-name'), caps: $('cbl-captions'),
    pause: $('cbl-pause'), speed: $('cbl-speed'), hang: $('cbl-hang'),
    notes: $('cbl-notes'), notesList: $('cbl-notes-list'), today: $('cbl-today'),
    replay: $('cbl-replay'), copy: $('cbl-copy'), again: $('cbl-again')
  };
  var keys = Array.prototype.slice.call(app.querySelectorAll('.cbl-key'));
  var synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var S = {
    state: 'idle', run: 0, ctrl: null, raw: '', cut: false, streamDone: false, tries: 0,
    sentences: [], consumed: 0, idx: 0, speaking: false, paused: false, ringDone: false,
    t0: 0, tick: null, timeout: null, remain: 0, audio: null, voices: [], chosenVoice: '', notes: null
  };

  /* ---------- допоміжне ---------- */
  function setState(st, label) {
    S.state = st;
    app.setAttribute('data-state', st);
    if (label) el.lcdState.textContent = label;
  }
  function curKey() { return keys.filter(function (k) { return k.querySelector('input').checked; })[0] || keys[0]; }
  function lineLabel() {
    var k = curKey();
    return 'Line ' + (keys.indexOf(k) + 1) + ' · ' + k.getAttribute('data-name') + ' · AI voice';
  }
  function showError(t) { el.err.textContent = t; el.err.hidden = !t; }
  function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); }
  function startTimer() {
    stopTimer(); S.t0 = Date.now(); el.timer.textContent = '0:00';
    S.tick = setInterval(function () { if (!S.paused) el.timer.textContent = fmt((Date.now() - S.t0) / 1000); }, 500);
  }
  function stopTimer() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }
  function soundOn() { return el.sound.checked; }

  /* ---------- голоси пристрою ---------- */
  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices() || [];
    S.voices = all.filter(function (v) { return /^en/i.test(v.lang); });
    if (!S.voices.length) S.voices = all;
    el.voice.innerHTML = '';
    var auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Voice: auto'; el.voice.appendChild(auto);
    S.voices.forEach(function (v, i) { var o = document.createElement('option'); o.value = String(i); o.textContent = v.name.replace(/Microsoft |Google /g, ''); el.voice.appendChild(o); });
    el.voiceWrap.hidden = S.voices.length < 2;
  }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); }

  function pickVoice(key) {
    if (!S.voices.length) return null;
    if (el.voice.value !== '') return S.voices[Number(el.voice.value)] || null;
    var g = key.getAttribute('data-gender');
    var fem = /female|zira|aria|jenny|samantha|susan|hazel|karen|moira|tessa|libby|sonia|natasha|emma|ava\b|serena|fiona|victoria|catherine/i;
    var mal = /\bmale\b|david|guy|mark|daniel|george|alex|fred|ryan|thomas|james|oliver|brian|eric|christopher|roger/i;
    var pool = S.voices.filter(function (v) { return g === 'f' ? fem.test(v.name) : (mal.test(v.name) && !fem.test(v.name)); });
    if (!pool.length) pool = S.voices;
    var slugs = keys.map(function (k) { return k.getAttribute('data-slug'); });
    var same = keys.filter(function (k) { return k.getAttribute('data-gender') === g; });
    return pool[same.indexOf(key) % pool.length] || pool[0];
  }

  /* ---------- звук дзвінка ---------- */
  function ring(rings, done) {
    var ms = rings * 1400;
    if (soundOn()) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          S.audio = S.audio || new AC();
          if (S.audio.state === 'suspended') S.audio.resume();
          var ctx = S.audio, t = ctx.currentTime + 0.05;
          for (var r = 0; r < rings; r++) {
            [440, 480].forEach(function (f) {
              var o = ctx.createOscillator(), g = ctx.createGain();
              o.type = 'sine'; o.frequency.value = f;
              var s = t + r * 1.4;
              g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.07, s + 0.04);
              g.gain.setValueAtTime(0.07, s + 0.85); g.gain.linearRampToValueAtTime(0, s + 0.9);
              o.connect(g); g.connect(ctx.destination); o.start(s); o.stop(s + 0.95);
            });
          }
        }
      } catch (e) { /* без дзвінка */ }
    }
    S.ringTimer = setTimeout(done, reduceMotion ? 800 : ms);
  }

  /* ---------- розбір тексту ---------- */
  function spokenPart(raw) {
    var i = raw.search(/\n\s*\**\s*NOTES\s*\**\s*:/i);
    var t = i >= 0 ? raw.slice(0, i) : raw;
    // якщо потік обірвався на початку блоку NOTES
    t = t.replace(/\n\s*\**\s*N(O(T(E(S)?)?)?)?\s*$/i, '');
    return t.replace(/[*_#`]/g, '');
  }
  function parseNotes(raw) {
    var i = raw.search(/\n\s*\**\s*NOTES\s*\**\s*:/i);
    if (i < 0) return { points: [], today: '' };
    var block = raw.slice(i), points = [], today = '';
    block.split(/\n/).forEach(function (ln) {
      var m = ln.match(/^\s*[-•*]\s+(.+)$/);
      if (m && points.length < 3) points.push(m[1].replace(/[*_`]/g, '').trim());
      var t = ln.match(/^\s*\**\s*TODAY\s*\**\s*:\s*(.+)$/i);
      if (t) today = t[1].replace(/[*_`]/g, '').trim();
    });
    return { points: points, today: today };
  }
  function complete(raw) {
    var n = parseNotes(raw);
    return !S.cut && n.points.length >= 2 && n.today.length > 3;
  }

  function addSentence(text, newPara) {
    var wt = $('cbl-wait'); if (wt) wt.remove();
    var p = el.caps.lastElementChild;
    if (!p || newPara) { p = document.createElement('p'); el.caps.appendChild(p); }
    var span = document.createElement('span'); span.className = 'cbl-s';
    var words = [], re = /\S+/g, m, last = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) span.appendChild(document.createTextNode(text.slice(last, m.index)));
      var w = document.createElement('span'); w.className = 'cbl-w'; w.textContent = m[0];
      span.appendChild(w); words.push({ s: m.index, e: m.index + m[0].length, el: w }); last = m.index + m[0].length;
    }
    p.appendChild(span); p.appendChild(document.createTextNode(' '));
    S.sentences.push({ text: text, el: span, words: words });
  }
  function absorb(final) {
    var sp = spokenPart(S.raw), rest = sp.slice(S.consumed);
    for (;;) {
      var m = rest.match(/^(\s*)([\s\S]*?[.!?]["')\]]*)(?=\s|$)/);
      if (!m) break;
      if (!final && m[0].length === rest.length) break; // кінець буфера: речення може бути неповним
      var t = m[2].trim();
      if (t) addSentence(t, m[1].indexOf('\n\n') >= 0 && S.sentences.length > 0);
      S.consumed += m[0].length;
      rest = sp.slice(S.consumed);
    }
    if (final) {
      var tail = rest.trim();
      if (tail) { addSentence(tail, rest.indexOf('\n\n') >= 0 && S.sentences.length > 0); S.consumed = sp.length; }
    }
  }

  /* ---------- озвучення черги ---------- */
  function markNow(i) {
    S.sentences.forEach(function (s, j) {
      s.el.classList.toggle('is-said', j < i); s.el.classList.toggle('is-now', j === i);
      if (j !== i) s.words.forEach(function (w) { w.el.classList.remove('is-w'); });
    });
    var s = S.sentences[i];
    if (s) { var c = el.caps; c.scrollTop = Math.max(0, s.el.offsetTop - c.clientHeight / 2 + s.el.offsetHeight / 2); }
  }
  function speed() { return Number(el.speed.value) || 1; }
  function estimate(text) { return Math.max(900, text.split(/\s+/).length * 330 / speed()); }

  function pump(run) {
    if (run !== S.run || S.paused || S.speaking) return;
    if (!S.ringDone || S.state === 'ringing') return;
    if (S.idx >= S.sentences.length) {
      if (S.streamDone) finishCall(run);
      return;
    }
    var i = S.idx, s = S.sentences[i];
    S.speaking = true; markNow(i);
    var advanced = false;
    function next() {
      if (advanced || run !== S.run) return; advanced = true;
      clearTimeout(S.timeout); S.speaking = false; S.idx = i + 1; pump(run);
    }
    var key = curKey();
    if (synth && soundOn()) {
      try {
        var u = new SpeechSynthesisUtterance(s.text);
        var v = pickVoice(key); if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
        u.pitch = Number(key.getAttribute('data-pitch')) || 1;
        u.rate = (Number(key.getAttribute('data-rate')) || 1) * speed();
        u.onboundary = function (e) {
          if (typeof e.charIndex !== 'number') return;
          s.words.forEach(function (w) { w.el.classList.toggle('is-w', e.charIndex >= w.s && e.charIndex < w.e); });
        };
        u.onend = next; u.onerror = next;
        S.curUtter = u; synth.speak(u);
        S.timeout = setTimeout(next, estimate(s.text) * 2 + 3000); // запобіжник, якщо подія end не прийде
        return;
      } catch (e) { /* падаємо на таймер */ }
    }
    // без звуку: темп читання за таймером, слова підсвічуються за часом
    var total = estimate(s.text), per = total / Math.max(1, s.words.length), k = 0;
    S.remain = total;
    (function stepWord() {
      if (run !== S.run || advanced) return;
      if (S.paused) { S.resumeFn = stepWord; return; }
      s.words.forEach(function (w, j) { w.el.classList.toggle('is-w', j === k); });
      k++;
      if (k > s.words.length) return next();
      S.timeout = setTimeout(stepWord, per);
    })();
  }

  /* ---------- запит до Worker ---------- */
  function readStream(resp, run) {
    var reader = resp.body.getReader(), dec = new TextDecoder(), buf = '';
    function loop() {
      return reader.read().then(function (r) {
        if (run !== S.run) { try { reader.cancel(); } catch (e) { /* ok */ } return false; }
        if (r.done) { return true; }
        buf += dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
          if (line.indexOf('data:') !== 0) continue;
          var p = line.slice(5).trim();
          if (p === '[DONE]') { return true; }
          try {
            var o = JSON.parse(p);
            if (o.cut) S.cut = true;
            if (typeof o.t === 'string') { S.raw += o.t; absorb(false); pump(run); }
          } catch (e) { /* неповний рядок */ }
        }
        return loop();
      });
    }
    return loop();
  }

  function attempt(run) {
    S.raw = ''; S.cut = false; S.streamDone = false; S.consumed = 0; S.idx = 0; S.speaking = false;
    S.sentences = []; el.caps.innerHTML = '';
    var wait = document.createElement('p'); wait.className = 'cbl-wait'; wait.id = 'cbl-wait';
    wait.textContent = 'Connecting your callback…'; el.caps.appendChild(wait);
    S.ctrl = new AbortController();
    var body = JSON.stringify({ advisor: curKey().getAttribute('data-slug'), topic: app.querySelector('input[name="cbl-topic"]:checked').value, message: el.msg.value.trim() });
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: S.ctrl.signal })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.error || 'The line is unavailable right now.'); e.fatal = resp.status < 500 && resp.status !== 429 ? true : (resp.status === 429); throw e; });
        }
        return readStream(resp, run);
      })
      .then(function (ok) {
        if (run !== S.run) return;
        var w = $('cbl-wait'); if (w) w.remove();
        absorb(true);
        S.streamDone = true;
        var hasText = S.sentences.length > 0;
        if (!complete(S.raw) && S.tries < MAX_TRIES && !(S.state === 'idle')) {
          // обрив потоку: повторний набір
          S.tries++;
          stopSpeech(); S.run++; var nr = S.run;
          setState('ringing', 'Line dropped. Redialing…');
          S.ringDone = false;
          ring(1, function () { S.ringDone = true; setState('speaking', 'Connected'); attempt(nr); pump(nr); });
          return;
        }
        if (!hasText) throw new Error('The line is unavailable right now. Please try again in a moment.');
        pump(run);
      })
      .catch(function (e) {
        if (run !== S.run || (e && e.name === 'AbortError')) return;
        if (!e.fatal && S.tries < MAX_TRIES && !S.sentences.length) {
          S.tries++; setState('ringing', 'Line busy. Redialing…'); S.ringDone = false; S.run++; var nr = S.run;
          ring(1, function () { S.ringDone = true; setState('speaking', 'Connected'); attempt(nr); });
          return;
        }
        failCall(e && e.message ? e.message : 'The line is unavailable right now.');
      });
  }

  /* ---------- сценарій дзвінка ---------- */
  function stopSpeech() {
    clearTimeout(S.timeout); clearTimeout(S.ringTimer); S.speaking = false;
    if (synth) { try { synth.cancel(); } catch (e) { /* ok */ } }
    S.resumeFn = null;
  }
  function resetUI(toState, label) {
    stopSpeech(); stopTimer(); S.run++; S.paused = false; app.removeAttribute('data-paused');
    if (S.ctrl) { try { S.ctrl.abort(); } catch (e) { /* ok */ } }
    el.call.hidden = true; el.notes.hidden = true; el.form.hidden = false;
    setState(toState || 'idle', label || 'Ready'); el.lcdLine.textContent = lineLabel();
    el.dial.disabled = false;
  }
  function failCall(msg) {
    resetUI('idle', 'No answer'); showError(msg);
  }
  function finishCall(run) {
    if (run !== S.run) return;
    stopTimer(); S.notes = parseNotes(S.raw);
    S.sentences.forEach(function (s) { s.el.classList.remove('is-now'); s.el.classList.add('is-said'); s.words.forEach(function (w) { w.el.classList.remove('is-w'); }); });
    setState('done', 'Call ended · ' + el.timer.textContent);
    el.pause.disabled = true; el.hang.disabled = true;
    el.notesList.innerHTML = '';
    var pts = S.notes.points.length ? S.notes.points : ['Take a quiet minute to note what stood out for you.'];
    pts.forEach(function (p) { var li = document.createElement('li'); li.textContent = p; el.notesList.appendChild(li); });
    el.today.textContent = S.notes.today || 'Write down one question you would like to sit with this week.';
    el.notes.hidden = false;
    try { el.notes.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ok */ }
  }

  function begin() {
    showError('');
    var m = el.msg.value.trim();
    if (m.length < 5) { showError('Please leave a short message of at least a few words.'); el.msg.focus(); return; }
    if (m.length > 400) { showError('Please keep your message under 400 characters.'); return; }
    if (synth) { try { synth.cancel(); synth.resume(); } catch (e) { /* ok */ } }
    S.run++; var run = S.run; S.tries = 0; S.ringDone = false; S.paused = false; S.notes = null;
    var key = curKey();
    el.callerImg.src = key.querySelector('img').src; el.callerName.textContent = 'Advisor ' + key.getAttribute('data-name');
    el.lcdLine.textContent = lineLabel();
    el.form.hidden = true; el.notes.hidden = true; el.call.hidden = false;
    el.pause.disabled = true; el.hang.disabled = false; el.pause.querySelector('span:last-child').textContent = 'Pause';
    el.pause.querySelector('.material-symbols-outlined').textContent = 'pause';
    el.caps.innerHTML = '';
    setState('ringing', 'Calling you back…'); startTimer();
    try { el.call.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ok */ }
    ring(2, function () {
      if (run !== S.run) return;
      S.ringDone = true; el.pause.disabled = false; setState('speaking', 'Connected · speaking'); pump(run);
    });
    attempt(run);
  }

  /* ---------- події ---------- */
  el.form.addEventListener('submit', function (e) { e.preventDefault(); el.dial.disabled = true; begin(); });
  el.msg.addEventListener('input', function () { el.count.textContent = el.msg.value.length + ' / 400'; if (el.err.textContent) showError(''); });
  app.addEventListener('change', function (e) {
    if (e.target.name === 'cbl-line') { el.lcdLine.textContent = lineLabel(); }
  });
  el.hang.addEventListener('click', function () { var had = S.sentences.length; resetUI('idle', had ? 'Call ended' : 'Cancelled'); });
  el.pause.addEventListener('click', function () {
    S.paused = !S.paused;
    app.setAttribute('data-paused', S.paused ? '1' : '0');
    var icon = el.pause.querySelector('.material-symbols-outlined'), lab = el.pause.querySelector('span:last-child');
    icon.textContent = S.paused ? 'play_arrow' : 'pause'; lab.textContent = S.paused ? 'Resume' : 'Pause';
    if (synth && S.speaking && soundOn()) { try { S.paused ? synth.pause() : synth.resume(); } catch (e) { /* ok */ } }
    if (!S.paused) { var f = S.resumeFn; S.resumeFn = null; if (f) f(); else if (!S.speaking) pump(S.run); }
    setState(S.state, S.paused ? 'On hold' : 'Connected · speaking');
  });
  el.sound.addEventListener('change', function () { if (!soundOn() && synth) { try { synth.cancel(); } catch (e) { /* ok */ } } });
  el.replay.addEventListener('click', function () {
    stopSpeech(); S.run++; var run = S.run; S.idx = 0; S.paused = false; S.ringDone = true;
    el.notes.hidden = true; el.call.hidden = false; el.hang.disabled = false; el.pause.disabled = false;
    el.pause.querySelector('.material-symbols-outlined').textContent = 'pause'; el.pause.querySelector('span:last-child').textContent = 'Pause';
    S.streamDone = true; startTimer(); setState('speaking', 'Replaying message');
    S.sentences.forEach(function (s) { s.el.classList.remove('is-said', 'is-now'); });
    pump(run);
  });
  el.again.addEventListener('click', function () {
    resetUI('idle', 'Ready'); el.msg.value = ''; el.count.textContent = '0 / 400'; el.caps.innerHTML = ''; S.sentences = []; S.notes = null;
    try { $('cbl-form').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ok */ }
  });
  el.copy.addEventListener('click', function () {
    if (!S.notes) return;
    var t = 'Callback notes (AI-generated, for reflection)\n- ' + S.notes.points.join('\n- ') + '\nToday: ' + S.notes.today;
    var label = el.copy.querySelector('span:last-child');
    function ok() { label.textContent = 'Copied'; setTimeout(function () { label.textContent = 'Copy notes'; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () {});
  });
  window.addEventListener('pagehide', function () { stopSpeech(); });

  /* ---------- диктування (де підтримується) ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    el.mic.hidden = false;
    var rec = null, base = '';
    el.mic.addEventListener('click', function () {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
      base = el.msg.value ? el.msg.value.replace(/\s*$/, ' ') : '';
      el.mic.setAttribute('aria-pressed', 'true');
      rec.onresult = function (ev) {
        var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        el.msg.value = (base + t).slice(0, 400); el.count.textContent = el.msg.value.length + ' / 400';
      };
      rec.onend = rec.onerror = function () { el.mic.setAttribute('aria-pressed', 'false'); rec = null; };
      try { rec.start(); } catch (e) { rec = null; el.mic.setAttribute('aria-pressed', 'false'); }
    });
  }

  /* ---------- початковий стан з ?advisor= ---------- */
  var pre = new URLSearchParams(location.search).get('advisor');
  if (pre) keys.forEach(function (k) { if (k.getAttribute('data-slug') === pre) k.querySelector('input').checked = true; });
  el.lcdLine.textContent = lineLabel();
})();
