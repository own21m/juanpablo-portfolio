/* Local montage gallery: videos are loaded only after a deliberate opening. */
(() => {
  'use strict';
  const section = document.getElementById('robotica');
  const opener = document.getElementById('robot-gallery-open');
  const dialog = document.getElementById('robot-gallery');
  const video = document.getElementById('robot-gallery-video');
  const closer = document.getElementById('robot-gallery-close');
  if (!section || !opener || !dialog || !video || !closer) return;

  const root = document.documentElement;
  const cursor = document.getElementById('cursor');
  const caption = document.getElementById('robot-gallery-caption');
  const count = document.getElementById('robot-gallery-count');
  const previous = document.getElementById('robot-video-prev');
  const next = document.getElementById('robot-video-next');
  const allowed = ['assets/robotics/montaje-01.mp4', 'assets/robotics/montaje-02.mp4', 'assets/robotics/montaje-03.mp4'];
  const buttons = [...dialog.querySelectorAll('[data-robot-video]')];
  const entries = allowed.map((src, index) => {
    const button = buttons.find(item => item.dataset.robotVideo === String(index) && item.dataset.videoSrc === src);
    return button ? { button, src, title: button.dataset.videoTitle || `Montaje ${index + 1}`, caption: button.dataset.videoCaption || 'Video original de mi brazo robótico.' } : null;
  }).filter(Boolean);
  let selected = 0;
  let active = false;
  let fallback = false;
  let restoreAfterClose = true;
  let returnFocus = null;
  let cursorParent = null;
  const originalRole = dialog.getAttribute('role');
  const outside = new Map();

  const open = () => dialog.hasAttribute('open');
  function stopVideo(unload = false) {
    try { video.pause(); } catch (_) { /* A media backend can be unavailable. */ }
    if (!unload) return;
    try { video.currentTime = 0; } catch (_) { /* Metadata may not have loaded yet. */ }
    video.removeAttribute('src');
    try { video.load(); } catch (_) { /* The absent-source state is sufficient. */ }
  }

  function updateSelection() {
    entries.forEach((entry, index) => entry.button.setAttribute('aria-pressed', String(index === selected)));
    if (count) count.textContent = `${selected + 1} / ${entries.length}`;
    if (caption) caption.textContent = entries[selected].caption;
    if (previous) previous.disabled = entries.length < 2;
    if (next) next.disabled = entries.length < 2;
  }

  function select(index) {
    if (!active || !open() || !Number.isInteger(index) || index < 0 || index >= entries.length) return;
    stopVideo(true);
    selected = index;
    const entry = entries[index];
    video.setAttribute('src', entry.src);
    video.setAttribute('aria-label', entry.title);
    updateSelection();
    try { video.load(); } catch (_) { /* Native controls retain the local file URL. */ }
  }

  function lockOutside() {
    let branch = dialog;
    while (branch.parentElement && branch.parentElement !== root) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || outside.has(sibling)) continue;
        outside.set(sibling, { inert: sibling.inert, inertAttribute: sibling.getAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') });
        if ('inert' in sibling) sibling.inert = true;
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = branch.parentElement;
    }
  }

  function unlockOutside() {
    outside.forEach((state, element) => {
      if ('inert' in element) element.inert = state.inert;
      if (state.inertAttribute === null) element.removeAttribute('inert');
      else element.setAttribute('inert', state.inertAttribute);
      if (state.hidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', state.hidden);
    });
    outside.clear();
  }

  function finishClose(restore = true) {
    if (!active) return;
    active = false;
    stopVideo(true);
    unlockOutside();
    root.classList.remove('robot-gallery-open');
    section.dataset.galleryOpen = 'false';
    opener.setAttribute('aria-expanded', 'false');
    dialog.removeAttribute('aria-modal');
    dialog.classList.remove('robot-gallery-fallback');
    delete dialog.dataset.galleryFallback;
    if (originalRole === null) dialog.removeAttribute('role');
    else dialog.setAttribute('role', originalRole);
    fallback = false;
    const remaining = document.querySelector('dialog[open]');
    if (cursor) {
      const destination = remaining || (cursorParent && cursorParent.isConnected && cursorParent !== dialog ? cursorParent : document.body);
      destination.append(cursor);
      cursor.classList.remove('is-active');
    }
    if (restore && returnFocus && (!remaining || remaining.contains(returnFocus)) && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    cursorParent = null;
  }

  function close(restore = true) {
    if (!active) return;
    restoreAfterClose = restore;
    stopVideo(true);
    if (open()) {
      if (!fallback && typeof dialog.close === 'function') {
        try { dialog.close(); } catch (_) { dialog.removeAttribute('open'); }
      } else dialog.removeAttribute('open');
    }
    finishClose(restore);
  }

  function show() {
    if (active || !entries.length) return;
    active = true;
    restoreAfterClose = true;
    returnFocus = document.activeElement || opener;
    cursorParent = cursor ? cursor.parentElement : null;
    fallback = typeof dialog.showModal !== 'function';
    if (!fallback) {
      try { dialog.showModal(); } catch (_) { fallback = true; }
    }
    if (fallback) {
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.classList.add('robot-gallery-fallback');
      dialog.dataset.galleryFallback = 'true';
    }
    dialog.setAttribute('aria-modal', 'true');
    root.classList.add('robot-gallery-open');
    section.dataset.galleryOpen = 'true';
    opener.setAttribute('aria-expanded', 'true');
    if (cursor) { dialog.append(cursor); cursor.classList.remove('is-active'); }
    if (fallback) lockOutside();
    select(selected);
    closer.focus({ preventScroll: true });
  }

  for (const button of buttons) {
    const index = entries.findIndex(entry => entry.button === button);
    if (index < 0) { button.disabled = true; continue; }
    button.addEventListener('click', () => select(index));
  }
  opener.disabled = !entries.length;
  opener.setAttribute('aria-expanded', 'false');
  video.preload = 'none';
  video.playsInline = true;
  video.autoplay = false;
  video.removeAttribute('autoplay');
  // Do not call load() here: the unopened gallery must not request any video.
  video.removeAttribute('src');
  if (entries.length) updateSelection();

  opener.addEventListener('click', show);
  closer.addEventListener('click', () => close());
  if (previous) previous.addEventListener('click', () => select((selected - 1 + entries.length) % entries.length));
  if (next) next.addEventListener('click', () => select((selected + 1) % entries.length));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!open()) finishClose(restoreAfterClose); });
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (active && !open()) finishClose(restoreAfterClose); })
      .observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
  // Capture only backdrop clicks, ahead of the portfolio's generic dialog binding.
  dialog.addEventListener('click', event => {
    if (!active || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    }
  }, true);
  dialog.addEventListener('keydown', event => {
    if (!active || !fallback) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
  });
  document.addEventListener('focusin', event => {
    if (active && fallback && !dialog.contains(event.target)) closer.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVideo(); });
  window.addEventListener('pagehide', () => close(false));
})();
