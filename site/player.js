/* RunLock step player: plays the 3D animation one step at a time and pauses on the step's last frame.
   Drag the slider to scrub, Slow halves the speed, Play all runs the whole animation. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RATE_STEP = 0.75, RATE_ALL = 1, RATE_SLOW = 0.4;
  document.querySelectorAll('.player').forEach(function (el) {
    var block = el.closest('.lockblock') || el, list = block.querySelector('.plist'),
        v = el.querySelector('video'), items = list ? Array.prototype.slice.call(list.children) : [],
        times = el.dataset.times.split(',').map(Number), dur = Number(el.dataset.dur) || 0,
        scrub = el.querySelector('.scrub'), marks = el.querySelector('.marks'),
        bPrev = el.querySelector('.b-prev'), bNext = el.querySelector('.b-next'), bPlay = el.querySelector('.b-play'),
        bAll = el.querySelector('.b-all'), bSlow = el.querySelector('.b-slow'),
        n = times.length, cur = 0, mode = 'step', started = false, slow = false, dragging = false;
    function start(i) { return i === 0 ? 0 : times[i - 1]; }
    function end(i) { return i < n - 1 ? times[i] : (dur || v.duration || times[i]); }
    function rate() { return slow ? RATE_SLOW : (mode === 'all' ? RATE_ALL : RATE_STEP); }
    function setLabel(t) { bPlay.textContent = t; }
    function atEnd(i) { return v.paused && v.currentTime >= end(i) - 0.1; }
    /* caption under the timeline: the current step's text, for screens where the list is out of view */
    var cap = document.createElement('p'); cap.className = 'cap'; cap.setAttribute('aria-hidden', 'true');
    var bar = el.querySelector('.bar'); if (bar && items.length) bar.parentNode.insertBefore(cap, bar.nextSibling);
    function mark(i) {
      cur = i;
      items.forEach(function (li, j) { li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
      if (items[i]) cap.innerHTML = '<b>' + (i + 1) + '/' + n + '</b>' + items[i].textContent.trim();
      bPrev.disabled = i === 0;
    }
    function tryPlay() {
      v.playbackRate = rate(); var p = v.play();
      if (p && p.catch) p.catch(function (err) {
        /* autoplay refused (low power mode, data saver): fall back to a plain play button, the next tap is a user gesture */
        if (err && err.name === 'AbortError') return;
        el.classList.remove('playing'); started = false; setLabel('Play step ' + (cur + 1));
      });
    }
    /* seeking before the metadata is in (phones ignore preload) stalls some browsers: wait for it */
    function seek(t) { try { v.currentTime = t; } catch (e) {} if (v.readyState < 1) v.addEventListener('loadedmetadata', function h() { v.removeEventListener('loadedmetadata', h); try { v.currentTime = t; } catch (e) {} }); }
    var segs = [];
    if (marks && dur) times.forEach(function (t, i) {
      var sg = document.createElement('b'); var a = start(i), z = end(i);
      sg.style.left = (a / dur * 100) + '%'; sg.style.setProperty('--w', ((z - a) / dur * 100) + '%');
      sg.innerHTML = '<span>' + (i + 1) + '</span>'; sg.setAttribute('aria-hidden', 'true'); marks.appendChild(sg); segs.push(sg);
    });
    function paint(t) {
      segs.forEach(function (sg, i) {
        var a = start(i), z = end(i), f = t <= a ? 0 : t >= z ? 100 : (t - a) / (z - a) * 100;
        sg.style.setProperty('--f', f + '%'); sg.classList.toggle('cur', i === cur); sg.classList.toggle('done', t >= z - 0.05);
      });
    }
    if (scrub) {
      scrub.style.setProperty('--p', '0%');
      scrub.addEventListener('pointerdown', function () { dragging = true; v.pause(); });
      var pending = null, seeking = false;
      function seekTo(t) { if (seeking) { pending = t; return; } seeking = true; pending = null; v.currentTime = t; }
      v.addEventListener('seeked', function () { seeking = false; if (pending !== null) { var t = pending; pending = null; seekTo(t); } });
      scrub.addEventListener('input', function () {
        var t = Number(scrub.value); seekTo(t); started = true; mode = 'scrub';
        scrub.style.setProperty('--p', (t / (dur || 1) * 100) + '%');
        var i = 0; for (var k = 0; k < n; k++) if (t >= start(k) - 0.05) i = k; mark(i); paint(t);
        setLabel('Play from here');
      });
      ['pointerup', 'pointercancel', 'change'].forEach(function (e) { scrub.addEventListener(e, function () { dragging = false; }); });
    }
    function go(i, m) {
      if (!loaded) { ensure(function () { go(i, m); }); return; }
      mode = m || 'step'; started = true;
      seek(start(i)); mark(i); paint(start(i)); tryPlay();
      setLabel('Pause');
    }
    var raf = null;
    function tick() {
      raf = null;
      if (!dragging) {
        var t = v.currentTime, d = dur || v.duration || 1;
        if (scrub) { scrub.value = t; scrub.style.setProperty('--p', (t / d * 100) + '%'); }
        var i = 0; for (var k = 0; k < n; k++) if (t >= start(k) - 0.05) i = k;
        if (i !== cur) mark(i);
        paint(t);
        if (mode === 'step' && !v.paused && cur < n - 1 && t >= end(cur) - 0.04) {
          v.pause(); v.currentTime = end(cur); setLabel('Play step ' + (cur + 2));
        }
      }
      if (!v.paused && !v.ended) raf = requestAnimationFrame(tick);
    }
    v.addEventListener('play', function () { if (!raf) raf = requestAnimationFrame(tick); });
    v.addEventListener('seeked', function () { if (v.paused) tick(); });
    v.addEventListener('timeupdate', function () { if (v.paused && !raf) tick(); });
    v.addEventListener('ended', function () { setLabel('Replay'); mode = 'step'; });
    v.addEventListener('pause', function () { el.classList.remove('playing', 'buffering'); });
    v.addEventListener('play', function () { el.classList.add('playing'); });
    v.addEventListener('playing', function () { el.classList.remove('buffering'); if (!v.paused) setLabel('Pause'); });
    v.addEventListener('waiting', function () { if (!v.paused) el.classList.add('buffering'); });
    v.addEventListener('stalled', function () { if (!v.paused) el.classList.add('buffering'); });
    v.addEventListener('error', function () { el.classList.remove('buffering'); setLabel('Video failed to load'); });
    items.forEach(function (li, i) { li.querySelector('button').addEventListener('click', function () { go(i, 'step'); }); });
    bPrev.addEventListener('click', function () { go(Math.max(0, cur - 1), 'step'); });
    bNext.addEventListener('click', function () { go(Math.min(n - 1, cur + 1), 'step'); });
    bPlay.addEventListener('click', function () {
      if (!started || v.ended) { go(0, 'step'); return; }
      if (v.paused) {
        if (mode === 'step' && atEnd(cur) && cur < n - 1) { go(cur + 1, 'step'); }
        else { if (mode === 'scrub') mode = 'step'; tryPlay(); setLabel('Pause'); }
      } else { v.pause(); setLabel('Continue'); }
    });
    bAll.addEventListener('click', function () { go(0, 'all'); bAll.blur(); });
    if (bSlow) bSlow.addEventListener('click', function () { slow = !slow; bSlow.setAttribute('aria-pressed', slow ? 'true' : 'false'); bSlow.classList.toggle('on', slow); v.playbackRate = rate(); });
    setLabel('Play step 1'); mark(0); paint(0);
    /* the film is fetched when the player comes near, so the first step can start at once */
    var loaded = false, loading = false;
    function ensure(cb) { if (loaded) { cb(); return; } if (!window.rlLoadVideo) { loaded = true; cb(); return; } if (loading) return; loading = true; el.classList.add('buffering');
      window.rlLoadVideo(v, null, function () { loaded = true; loading = false; el.classList.remove('buffering'); cb(); }); }
    if ('IntersectionObserver' in window) {
      var pre = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { pre.disconnect(); ensure(function () {}); } }, { rootMargin: '600px' });
      pre.observe(el);
    } else ensure(function () {});
    if (!reduce && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; }) && !started) { io.disconnect(); ensure(function () { if (!started) go(0, 'step'); }); } }, { threshold: 0.6 });
      io.observe(el);
    }
  });
})();
