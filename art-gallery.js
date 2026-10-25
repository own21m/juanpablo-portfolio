/* Juanpablo's drawings: reversible live negatives, original photographs on demand. */
(() => {
  'use strict';
  const section = document.getElementById('arte');
  const dialog = document.getElementById('art-lightbox');
  const image = document.getElementById('art-lightbox-image');
  const closer = document.getElementById('art-lightbox-close');
  if (!section || !dialog || !image || !closer) return;

  const root = document.documentElement;
  const cursor = document.getElementById('cursor');
  const title = document.getElementById('art-lightbox-title');
  const caption = document.getElementById('art-lightbox-caption');
  const count = document.getElementById('art-lightbox-count');
  const previous = document.getElementById('art-lightbox-prev');
  const next = document.getElementById('art-lightbox-next');
  const zoomButton = document.getElementById('art-lightbox-zoom');
  const scroller = dialog.querySelector('.art-lightbox-scroller');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const validSource = value => typeof value === 'string' && /^assets\/art\/[a-z0-9-]+-original\.webp$/.test(value);
  const buttons = [...section.querySelectorAll('[data-drawing]')];
  const entries = buttons.map(button => ({
    button,
    src: button.dataset.artSrc,
    title: button.dataset.artTitle || 'Dibujo de mi cuaderno',
    alt: button.dataset.artAlt || button.dataset.artTitle || 'Dibujo original de Juanpablo.',
    caption: button.dataset.artCaption || 'Dibujo original sobre papel. Fotografía de mi archivo personal.',
    surface: button.querySelector('.drawing-surface'),
    frame: button.closest('.drawing-entry') || button,
  })).filter(entry => validSource(entry.src));
  let selected = 0;
  let active = false;
  let fallback = false;
  let zoomed = false;
  let restoreAfterClose = true;
  let returnFocus = null;
  let cursorParent = null;
  let revealFrame = 0;
  let pendingReveal = null;
  let closing = false;
  let closeTimer = 0;
  let openingTimer = 0;
  let imageTimer = 0;
  let zoomTimer = 0;
  let imageDirection = 'open';
  let entryObserver = null;
  const originalRole = dialog.getAttribute('role');
  const outside = new Map();
  const open = () => dialog.hasAttribute('open');
  const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value));
  const motionEnabled = () => !reducedMotion.matches && !root.classList.contains('motion-off') && !document.hidden;

  function resetTilt(button) {
    if (!button) return;
    button.style.removeProperty('--art-tilt-x');
    button.style.removeProperty('--art-tilt-y');
  }

  function clearTransientMotion() {
    clearTimeout(openingTimer); clearTimeout(imageTimer); clearTimeout(zoomTimer);
    openingTimer = imageTimer = zoomTimer = 0;
    dialog.classList.remove('art-is-opening', 'art-is-zooming');
    if (scroller) scroller.classList.remove('art-image-enter');
  }

  function animateImage() {
    if (!scroller || !active || closing || !motionEnabled()) return;
    clearTimeout(imageTimer);
    scroller.dataset.artDirection = imageDirection;
    scroller.classList.remove('art-image-enter');
    // Restart a finite CSS entrance, including when the selected image is cached.
    void image.offsetWidth;
    scroller.classList.add('art-image-enter');
    imageTimer = window.setTimeout(() => { scroller.classList.remove('art-image-enter'); imageTimer = 0; }, 520);
  }

  function animateZoom() {
    if (!active || closing || !motionEnabled()) return;
    clearTimeout(zoomTimer);
    dialog.classList.remove('art-is-zooming');
    void image.offsetWidth;
    dialog.classList.add('art-is-zooming');
    zoomTimer = window.setTimeout(() => { dialog.classList.remove('art-is-zooming'); zoomTimer = 0; }, 260);
  }

  function reveal(surface, x, y) {
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    surface.style.setProperty('--reveal-x', `${clamp(x, 0, rect.width).toFixed(2)}px`);
    surface.style.setProperty('--reveal-y', `${clamp(y, 0, rect.height).toFixed(2)}px`);
    surface.style.setProperty('--reveal-active', '1');
  }

  function resetReveal(surface) {
    if (!surface) return;
    if (pendingReveal && pendingReveal.surface === surface) {
      pendingReveal = null;
      if (revealFrame) cancelAnimationFrame(revealFrame);
      revealFrame = 0;
    }
    surface.style.setProperty('--reveal-active', '0');
    surface.style.removeProperty('--reveal-x');
    surface.style.removeProperty('--reveal-y');
    const entry = entries.find(item => item.surface === surface);
    if (entry) resetTilt(entry.button);
  }

  function resetAllReveals() {
    if (revealFrame) cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    pendingReveal = null;
    for (const entry of entries) resetReveal(entry.surface);
  }

  function queueReveal(entry, event) {
    const surface = entry.surface;
    if (!surface || active || !finePointer.matches || event.pointerType === 'touch') return;
    const rect = surface.getBoundingClientRect();
    const frame = entry.frame.getBoundingClientRect();
    pendingReveal = { surface, button: entry.button, x: event.clientX - rect.left, y: event.clientY - rect.top,
      tiltX: clamp((.5 - (event.clientY - frame.top) / Math.max(frame.height, 1)) * 5, -2.5, 2.5),
      tiltY: clamp(((event.clientX - frame.left) / Math.max(frame.width, 1) - .5) * 5, -2.5, 2.5) };
    if (revealFrame) return;
    revealFrame = requestAnimationFrame(() => {
      revealFrame = 0;
      const pending = pendingReveal;
      pendingReveal = null;
      if (pending && !active && finePointer.matches) {
        reveal(pending.surface, pending.x, pending.y);
        if (motionEnabled()) {
          pending.button.style.setProperty('--art-tilt-x', `${pending.tiltX.toFixed(2)}deg`);
          pending.button.style.setProperty('--art-tilt-y', `${pending.tiltY.toFixed(2)}deg`);
        } else resetTilt(pending.button);
      }
    });
  }

  function resetZoom() {
    zoomed = false;
    clearTimeout(zoomTimer); zoomTimer = 0;
    dialog.classList.remove('art-is-zooming');
    if (scroller) {
      scroller.classList.remove('is-zoomed');
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    }
    if (zoomButton) {
      zoomButton.setAttribute('aria-pressed', 'false');
      const label = zoomButton.querySelector('span');
      if (label) label.textContent = 'Ampliar';
    }
  }

  function select(index, direction = 'open') {
    if (!active || closing || !open() || !Number.isInteger(index) || index < 0 || index >= entries.length) return;
    selected = index;
    imageDirection = direction;
    clearTimeout(imageTimer);
    if (scroller) { scroller.classList.remove('art-image-enter'); scroller.dataset.artDirection = direction; }
    resetZoom();
    const entry = entries[index];
    image.setAttribute('src', entry.src);
    image.setAttribute('alt', entry.alt);
    if (title) title.textContent = entry.title;
    if (caption) caption.textContent = entry.caption;
    if (count) count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')}`;
    if (previous) previous.disabled = entries.length < 2;
    if (next) next.disabled = entries.length < 2;
    if (image.complete && image.naturalWidth > 0) animateImage();
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
    clearTimeout(closeTimer); closeTimer = 0;
    clearTransientMotion();
    closing = false;
    dialog.classList.remove('art-is-closing');
    active = false;
    image.removeAttribute('src');
    image.setAttribute('alt', '');
    resetZoom();
    unlockOutside();
    root.classList.remove('art-lightbox-open');
    section.dataset.lightboxOpen = 'false';
    dialog.removeAttribute('aria-modal');
    dialog.classList.remove('art-lightbox-fallback');
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

  function completeClose() {
    if (!active) return;
    clearTimeout(closeTimer); closeTimer = 0;
    if (open()) {
      if (!fallback && typeof dialog.close === 'function') {
        try { dialog.close(); } catch (_) { dialog.removeAttribute('open'); }
      } else dialog.removeAttribute('open');
    }
    finishClose(restoreAfterClose);
  }

  function close(restore = true, immediate = false) {
    if (!active) return;
    restoreAfterClose = restore;
    if (immediate || !motionEnabled() || !open()) { completeClose(); return; }
    if (closing) return;
    closing = true;
    clearTransientMotion();
    dialog.classList.add('art-is-closing');
    closeTimer = window.setTimeout(completeClose, 230);
  }

  function show(index, trigger) {
    if (active || !entries[index]) return;
    active = true;
    closing = false;
    resetAllReveals();
    restoreAfterClose = true;
    returnFocus = trigger || document.activeElement;
    cursorParent = cursor ? cursor.parentElement : null;
    fallback = typeof dialog.showModal !== 'function';
    if (!fallback) {
      try { dialog.showModal(); } catch (_) { fallback = true; }
    }
    if (fallback) {
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.classList.add('art-lightbox-fallback');
    }
    dialog.setAttribute('aria-modal', 'true');
    root.classList.add('art-lightbox-open');
    section.dataset.lightboxOpen = 'true';
    if (cursor) { dialog.append(cursor); cursor.classList.remove('is-active'); }
    if (fallback) lockOutside();
    select(index);
    closer.focus({ preventScroll: true });
    if (motionEnabled()) {
      dialog.classList.add('art-is-opening');
      openingTimer = window.setTimeout(() => { dialog.classList.remove('art-is-opening'); openingTimer = 0; }, 520);
    }
  }

  for (const button of buttons) {
    const index = entries.findIndex(entry => entry.button === button);
    if (index < 0) { button.disabled = true; continue; }
    const surface = entries[index].surface;
    button.addEventListener('pointermove', event => queueReveal(entries[index], event), { passive: true });
    button.addEventListener('pointerleave', () => resetReveal(surface), { passive: true });
    button.addEventListener('pointercancel', () => resetReveal(surface), { passive: true });
    button.addEventListener('focus', () => {
      if (!surface || active) return;
      const rect = surface.getBoundingClientRect();
      reveal(surface, rect.width / 2, rect.height / 2);
    });
    button.addEventListener('blur', () => resetReveal(surface));
    button.addEventListener('click', () => show(index, button));
  }
  const pointerChanged = () => { if (!finePointer.matches) resetAllReveals(); };
  if (finePointer.addEventListener) finePointer.addEventListener('change', pointerChanged);
  else if (finePointer.addListener) finePointer.addListener(pointerChanged);
  closer.addEventListener('click', () => close());
  if (previous) previous.addEventListener('click', () => select((selected - 1 + entries.length) % entries.length, 'previous'));
  if (next) next.addEventListener('click', () => select((selected + 1) % entries.length, 'next'));
  if (zoomButton && scroller) zoomButton.addEventListener('click', () => {
    if (!active || closing) return;
    zoomed = !zoomed;
    scroller.classList.toggle('is-zoomed', zoomed);
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    const label = zoomButton.querySelector('span');
    if (label) label.textContent = zoomed ? 'Ajustar' : 'Ampliar';
    if (zoomed) scroller.focus({ preventScroll: true });
    else { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
    animateZoom();
  });
  image.addEventListener('load', animateImage);
  image.addEventListener('animationend', () => {
    clearTimeout(imageTimer); clearTimeout(zoomTimer); imageTimer = zoomTimer = 0;
    if (scroller) scroller.classList.remove('art-image-enter');
    dialog.classList.remove('art-is-zooming');
  });
  dialog.addEventListener('animationend', event => {
    if (event.target !== dialog) return;
    if (closing && /close|out/i.test(event.animationName || '')) completeClose();
    else if (!closing) { clearTimeout(openingTimer); openingTimer = 0; dialog.classList.remove('art-is-opening'); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!open()) finishClose(restoreAfterClose); });
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (active && !open()) finishClose(restoreAfterClose); })
      .observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
  dialog.addEventListener('click', event => {
    if (!active || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    }
  }, true);
  dialog.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape' && fallback) { event.preventDefault(); close(); return; }
    if (closing && event.key !== 'Tab') return;
    const target = event.target;
    const onControl = target && typeof target.closest === 'function' && target.closest('input, select, textarea');
    if (!zoomed && !onControl && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      select((selected + (event.key === 'ArrowLeft' ? -1 : 1) + entries.length) % entries.length, event.key === 'ArrowLeft' ? 'previous' : 'next');
      return;
    }
    if (!zoomed && !onControl && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); select(event.key === 'Home' ? 0 : entries.length - 1, event.key === 'Home' ? 'previous' : 'next'); return;
    }
    if (!fallback || event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
  });
  document.addEventListener('focusin', event => {
    if (active && fallback && !dialog.contains(event.target)) closer.focus({ preventScroll: true });
  });
  function updateEntryMotion() {
    const enabled = motionEnabled();
    if (!enabled || !('IntersectionObserver' in window)) {
      if (entryObserver) entryObserver.disconnect();
      entryObserver = null;
      section.classList.remove('art-motion-ready');
      for (const entry of entries) { entry.frame.classList.add('art-is-visible'); resetTilt(entry.button); }
      if (!enabled) { clearTransientMotion(); if (closing) completeClose(); }
      return;
    }
    if (entryObserver) return;
    try {
      entryObserver = new IntersectionObserver(changes => {
        for (const change of changes) if (change.isIntersecting) {
          change.target.classList.add('art-is-visible');
          if (entryObserver) entryObserver.unobserve(change.target);
        }
      }, { threshold: .1, rootMargin: '0px 0px -20px 0px' });
      section.classList.add('art-motion-ready');
      for (const entry of entries) if (!entry.frame.classList.contains('art-is-visible')) entryObserver.observe(entry.frame);
    } catch (_) {
      entryObserver = null;
      section.classList.remove('art-motion-ready');
      for (const entry of entries) entry.frame.classList.add('art-is-visible');
    }
  }
  if (typeof MutationObserver === 'function') new MutationObserver(updateEntryMotion)
    .observe(root, { attributes: true, attributeFilter: ['class'] });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', updateEntryMotion);
  else if (reducedMotion.addListener) reducedMotion.addListener(updateEntryMotion);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resetAllReveals(); clearTransientMotion(); if (closing) completeClose(); }
  });
  window.addEventListener('pagehide', () => { resetAllReveals(); close(false, true); });
  image.removeAttribute('src');
  image.setAttribute('alt', '');
  resetZoom();
  updateEntryMotion();
})();
