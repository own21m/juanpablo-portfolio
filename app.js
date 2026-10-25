(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  // Insert inside the app IIFE after root, $ and $$ are defined.
  // HTML: #theme-picker contains radio inputs named "theme" (auto, light, dark).
  // #theme-status is the optional polite live status. isLightTheme() reads the
  // resolved theme for canvas particles and other consumers inside the IIFE.
  const themePicker = $('#theme-picker');
  const themeRadios = themePicker ? $$('input[name="theme"]', themePicker) : [];
  const themeStatus = $('#theme-status');
  const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
  const validThemePreference = value => value === 'auto' || value === 'light' || value === 'dark';
  let themePreference = 'auto';

  try {
    const saved = localStorage.getItem('jp-theme');
    if (validThemePreference(saved)) themePreference = saved;
  } catch (_) { /* Storage is optional; the system theme remains the default. */ }

  function isLightTheme() {
    return root.dataset.theme === 'light';
  }

  function applyThemePreference() {
    const resolved = themePreference === 'auto'
      ? (systemTheme.matches ? 'light' : 'dark')
      : themePreference;
    root.dataset.themePreference = themePreference;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    themeRadios.forEach(radio => { radio.checked = radio.value === themePreference; });
    const label = resolved === 'light' ? 'claro' : 'oscuro';
    const message = themePreference === 'auto' ? `Siguiendo el sistema: ${label}` : `Tema ${label}`;
    if (themeStatus && themeStatus.textContent !== message) themeStatus.textContent = message;
    $$('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', resolved === 'light' ? '#f1f1f2' : '#000000');
    });
  }

  if (themePicker) {
    themePicker.addEventListener('change', event => {
      const radio = event.target;
      if (!themeRadios.includes(radio) || !radio.checked || !validThemePreference(radio.value)) return;
      themePreference = radio.value;
      applyThemePreference();
      // Persist only a deliberate choice. Changing themes keeps radio focus.
      try { localStorage.setItem('jp-theme', themePreference); } catch (_) { /* Keep the in-memory choice. */ }
    });
  }

  const followSystemTheme = () => {
    if (themePreference === 'auto') applyThemePreference();
  };
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', followSystemTheme);
  else if (systemTheme.addListener) systemTheme.addListener(followSystemTheme);

  window.addEventListener('storage', event => {
    if (event.key !== 'jp-theme' && event.key !== null) return;
    themePreference = validThemePreference(event.newValue) ? event.newValue : 'auto';
    applyThemePreference();
  });

  applyThemePreference();

  const motionButton = $('#motion-toggle');
  const motionLabel = $('.motion-label', motionButton || document);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const hero = $('#hero-art-wrap');
  const heroArea = $('#inicio') || (hero && hero.closest('section')) || hero;
  const cursor = $('#cursor');
  const canvas = $('#dust');
  const context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const contactEmail = 'juannnnpaaaabloooo@gmail.com';
  let savedMotion = null;
  try { savedMotion = localStorage.getItem('jp-motion'); } catch (_) { /* Storage is optional. */ }
  let motionEnabled = savedMotion === 'on' || (savedMotion !== 'off' && !reducedMotion.matches);
  let frame = 0;
  let lastFrame = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let dust = [];
  let heroInView = true;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, ready: false, visible: false, down: false, baseState: 'default' };
  const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };

  // Insert inside the main IIFE; the existing animation loop drives this orbit.
  const orbitTitle = $('#hero-title');
  const orbitLetters = orbitTitle ? $$('.orbit-letter', orbitTitle) : [];
  const orbitMeasureCanvas = document.createElement('canvas');
  const orbitMeasureContext = orbitMeasureCanvas.getContext('2d');
  let nameOrbitPhase = 0;
  let nameOrbitMetrics = null;

  function renderNameOrbit() {
    if (!nameOrbitMetrics) return;
    const { rx, ry, letters } = nameOrbitMetrics;
    // A complete turn still takes 36 seconds, with more reading time up front.
    const phase = nameOrbitPhase - 0.2 * Math.sin(nameOrbitPhase * 2);
    for (const letter of letters) {
      const angle = phase + letter.angle;
      const depth = Math.cos(angle);
      const x = Math.sin(angle) * rx;
      const y = depth * ry - x * 0.06;
      const scale = 0.88 + 0.12 * (depth + 1) / 2;
      const horizontalScale = 0.78 + 0.22 * Math.abs(depth);
      const rotation = -3 - Math.sin(angle) * 4;
      letter.element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg) scale(${(scale * horizontalScale).toFixed(3)}, ${scale.toFixed(3)})`;
      letter.element.style.zIndex = depth >= 0 ? '4' : '1';
      letter.element.style.opacity = (0.42 + 0.58 * (depth + 1) / 2).toFixed(3);
    }
  }

  function resizeNameOrbit() {
    if (!hero || !orbitTitle || !orbitLetters.length) return;
    const width = hero.clientWidth;
    const height = hero.clientHeight;
    if (!width || !height) return;
    const mobileComposition = window.matchMedia('(max-width: 900px)').matches;
    const titleStyle = getComputedStyle(orbitTitle);
    const fontSize = parseFloat(titleStyle.fontSize) || 48;
    let rx = width * 0.43;
    const ry = Math.min(height * 0.17, mobileComposition ? 132 : 110);
    const tracking = fontSize * 0.04;
    const firstCopy = orbitLetters
      .filter(element => element.dataset.orbitCopy === '0')
      .sort((a, b) => Number(a.dataset.orbitIndex) - Number(b.dataset.orbitIndex));
    let totalWidth = 0;
    const measured = firstCopy.map(element => {
      const glyph = $('.orbit-glyph', element) || element;
      const glyphStyle = getComputedStyle(glyph);
      if (orbitMeasureContext) {
        // Measure the CSS target size, independently of the previous fit.
        orbitMeasureContext.font = `${glyphStyle.fontStyle} ${glyphStyle.fontWeight} ${fontSize}px ${glyphStyle.fontFamily}`;
      }
      const glyphWidth = orbitMeasureContext
        ? orbitMeasureContext.measureText(glyph.textContent || '').width
        : fontSize * 0.65;
      const measuredGlyph = { index: Number(element.dataset.orbitIndex), center: totalWidth + glyphWidth / 2 };
      totalWidth += glyphWidth + tracking;
      return measuredGlyph;
    });
    if (measured.length) totalWidth -= tracking;
    let fontFit = 1;
    if (mobileComposition) {
      // Keep the larger capitals and their spacing. Enlarge the orbit rather
      // than shrinking the name to the viewport; .hero crops the outer sweep.
      rx = Math.max(rx, totalWidth / 1.9);
    } else {
      // Desktop retains the existing fit beside the introductory copy.
      fontFit = totalWidth > 0 ? Math.min(1, rx * 1.9 / totalWidth) : 1;
      rx = Math.max(1, Math.min(rx, width / 2 - fontSize * fontFit * 0.35 - 8));
      fontFit = totalWidth > 0 ? Math.min(1, rx * 1.9 / totalWidth) : 1;
    }
    const fittedFontSize = fontSize * fontFit;
    const angleByIndex = new Map(measured.map(glyph => [
      glyph.index,
      // At the front, projected positions retain the measured glyph spacing.
      Math.asin(Math.max(-0.98, Math.min(0.98, (glyph.center - totalWidth / 2) * fontFit / rx)))
    ]));
    nameOrbitMetrics = {
      rx,
      ry,
      letters: orbitLetters.map(element => {
        element.style.left = '50%';
        element.style.top = '51%';
        element.style.fontSize = `${fittedFontSize.toFixed(3)}px`;
        return {
          element,
          angle: (angleByIndex.get(Number(element.dataset.orbitIndex)) || 0) + (element.dataset.orbitCopy === '1' ? Math.PI : 0)
        };
      })
    };
    renderNameOrbit();
    hero.classList.add('orbit-ready');
  }

  function updateNameOrbit(dt) {
    if (!nameOrbitMetrics || !motionEnabled) return;
    const seconds = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 0.05);
    nameOrbitPhase = (nameOrbitPhase + seconds * Math.PI * 2 / 36) % (Math.PI * 2);
    renderNameOrbit();
  }

  function resetNameOrbit() {
    nameOrbitPhase = 0;
    renderNameOrbit();
  }

  function cursorStateFor(target) {
    if (!(target instanceof Element)) return 'default';
    if (target.closest('[disabled], [aria-disabled="true"]')) return 'default';
    if (target.closest('[data-cursor="grab"]')) return 'grab';
    if (target.closest('a[href], button, summary, select, [role="button"], .theme-option')) return 'link';
    if (target.closest('input, textarea, [contenteditable="true"], p, h1, h2, h3, h4, li, figcaption, label')) return 'text';
    return 'default';
  }

  function hasTextSelection() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      if (typeof active.selectionStart === 'number' && active.selectionEnd > active.selectionStart) return true;
    }
    const selected = window.getSelection();
    return Boolean(selected && !selected.isCollapsed);
  }

  function updateCursorState(target) {
    if (target) pointer.baseState = cursorStateFor(target);
    let state = pointer.baseState;
    if (pointer.down) state = state === 'text' ? 'selecting' : state === 'grab' ? 'grabbing' : 'pressed';
    else if (state === 'text' && hasTextSelection()) state = 'selected';
    root.dataset.cursorState = state;
    if (cursor) cursor.dataset.state = state;
  }

  function resizeDust() {
    if (!context) return;
    canvasWidth = canvas.clientWidth || window.innerWidth;
    canvasHeight = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(canvasWidth * ratio);
    canvas.height = Math.round(canvasHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(24, Math.max(9, Math.round(canvasWidth / 70)));
    dust = Array.from({ length: count }, () => ({
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      radius: 0.45 + Math.random() * 0.85,
      speed: 2 + Math.random() * 5,
      drift: Math.random() * Math.PI * 2,
      alpha: 0.06 + Math.random() * 0.12
    }));
  }

  function clearDust() {
    if (context) context.clearRect(0, 0, canvasWidth, canvasHeight);
  }

  function canAnimate() {
    return motionEnabled && !document.hidden;
  }

  function render(now) {
    frame = 0;
    if (!canAnimate()) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60;
    lastFrame = now;
    const ease = 1 - Math.pow(0.001, dt);
    if (heroInView) updateNameOrbit(dt);

    if (cursor && finePointer.matches && pointer.ready) {
      pointer.x += (pointer.targetX - pointer.x) * ease;
      pointer.y += (pointer.targetY - pointer.y) * ease;
      cursor.style.left = `${pointer.x.toFixed(2)}px`;
      cursor.style.top = `${pointer.y.toFixed(2)}px`;
    }

    if (hero && finePointer.matches) {
      parallax.x += (parallax.targetX - parallax.x) * ease;
      parallax.y += (parallax.targetY - parallax.y) * ease;
      hero.style.setProperty('--mx', `${parallax.x.toFixed(2)}px`);
      hero.style.setProperty('--my', `${parallax.y.toFixed(2)}px`);
    }

    if (context && heroInView) {
      clearDust();
      for (const particle of dust) {
        particle.y -= particle.speed * dt;
        particle.x += Math.sin(now / 7000 + particle.drift) * dt * 2;
        if (particle.y < -3) particle.y = canvasHeight + 3;
        if (particle.x < -3) particle.x = canvasWidth + 3;
        if (particle.x > canvasWidth + 3) particle.x = -3;
        context.beginPath();
        context.fillStyle = isLightTheme() ? `rgba(63, 69, 82, ${particle.alpha})` : `rgba(224, 215, 241, ${particle.alpha})`;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    if ((heroInView && (context || orbitLetters.length)) || (finePointer.matches && (cursor || hero))) frame = requestAnimationFrame(render);
  }

  function startAnimation() {
    if (!frame && canAnimate()) {
      lastFrame = 0;
      frame = requestAnimationFrame(render);
    }
  }

  function stopAnimation() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    clearDust();
  }

  function resetPointerEffects() {
    $$('.magnetic').forEach(resetMagnetic);
    $$('.tilt-wrap .project-art').forEach(element => { element.style.transform = ''; });
    if (hero) {
      hero.style.setProperty('--mx', '0px');
      hero.style.setProperty('--my', '0px');
    }
    parallax.x = parallax.y = parallax.targetX = parallax.targetY = 0;
    pointer.down = false;
    pointer.baseState = 'default';
    root.removeAttribute('data-cursor-state');
    if (cursor) { cursor.classList.remove('is-active', 'is-hovering'); cursor.dataset.state = 'default'; }
  }

  function applyMotion() {
    root.classList.toggle('motion-off', !motionEnabled);
    root.classList.toggle('motion-on', motionEnabled);
    if (motionButton) {
      motionButton.setAttribute('aria-pressed', String(!motionEnabled));
      motionButton.setAttribute('aria-label', motionEnabled ? 'Pausar animaciones' : 'Activar animaciones');
      motionButton.title = motionEnabled ? 'Pausar animaciones' : 'Activar animaciones';
    }
    if (motionLabel) motionLabel.textContent = motionEnabled ? 'Pausar animaciones' : 'Activar animaciones';
    if (motionEnabled) {
      if (cursor && pointer.visible && finePointer.matches) cursor.classList.add('is-active');
      startAnimation();
    } else {
      stopAnimation();
      resetNameOrbit();
      resetPointerEffects();
      $$('.reveal').forEach(element => element.classList.add('is-visible'));
    }
  }

  if (motionButton) {
    motionButton.addEventListener('click', () => {
      motionEnabled = !motionEnabled;
      savedMotion = motionEnabled ? 'on' : 'off';
      try { localStorage.setItem('jp-motion', savedMotion); } catch (_) { /* Storage is optional. */ }
      applyMotion();
    });
  }

  const onMediaChange = (media, callback) => {
    if (media.addEventListener) media.addEventListener('change', callback);
    else if (media.addListener) media.addListener(callback);
  };
  onMediaChange(reducedMotion, () => {
    if (!savedMotion) { motionEnabled = !reducedMotion.matches; applyMotion(); }
  });
  onMediaChange(finePointer, () => {
    root.classList.toggle('has-fine-pointer', finePointer.matches);
    if (!finePointer.matches) resetPointerEffects();
    startAnimation();
  });
  root.classList.toggle('has-fine-pointer', finePointer.matches);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAnimation();
    else startAnimation();
  });

  window.addEventListener('pointermove', event => {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    pointer.visible = true;
    if (!pointer.ready) {
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
      pointer.ready = true;
    }
    if (cursor && motionEnabled) {
      cursor.classList.add('is-active');
    }
    updateCursorState(event.target);
  }, { passive: true });
  window.addEventListener('pointerdown', event => {
    if (!finePointer.matches || event.pointerType === 'touch' || event.button !== 0) return;
    pointer.down = true;
    updateCursorState(event.target);
  }, { passive: true });
  window.addEventListener('pointerup', event => {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    pointer.down = false;
    updateCursorState(event.target);
  }, { passive: true });
  window.addEventListener('pointercancel', () => { pointer.down = false; updateCursorState(); });
  document.addEventListener('selectionchange', () => {
    if (finePointer.matches && pointer.baseState === 'text') updateCursorState();
  });
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) {
      pointer.visible = false;
      pointer.down = false;
      updateCursorState();
      if (cursor) cursor.classList.remove('is-active');
    }
  });
  window.addEventListener('blur', () => {
    pointer.visible = false;
    if (cursor) cursor.classList.remove('is-active');
    resetPointerEffects();
  });

  if (hero && heroArea) {
    heroArea.addEventListener('pointermove', event => {
      if (!motionEnabled || !finePointer.matches || event.pointerType === 'touch') return;
      const bounds = heroArea.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      parallax.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 28;
      parallax.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 28;
    }, { passive: true });
    heroArea.addEventListener('pointerleave', () => { parallax.targetX = parallax.targetY = 0; });
  }

  if ((context || orbitLetters.length) && heroArea && 'IntersectionObserver' in window) {
    const dustObserver = new IntersectionObserver(entries => {
      heroInView = entries[0].isIntersecting;
      if (heroInView) startAnimation();
      else clearDust();
    }, { threshold: 0 });
    dustObserver.observe(heroArea);
  }

  function resetMagnetic(element) {
    element.style.removeProperty('--magnetic-x');
    element.style.removeProperty('--magnetic-y');
  }
  $$('.magnetic').forEach(element => {
    element.addEventListener('pointermove', event => {
      if (!motionEnabled || !finePointer.matches || event.pointerType === 'touch' || element.disabled) {
        resetMagnetic(element);
        return;
      }
      const bounds = element.getBoundingClientRect();
      const currentX = parseFloat(element.style.getPropertyValue('--magnetic-x')) || 0;
      const currentY = parseFloat(element.style.getPropertyValue('--magnetic-y')) || 0;
      const x = Math.max(-8, Math.min(8, (event.clientX - (bounds.left - currentX) - bounds.width / 2) * .12));
      const y = Math.max(-6, Math.min(6, (event.clientY - (bounds.top - currentY) - bounds.height / 2) * .12));
      element.style.setProperty('--magnetic-x', `${x.toFixed(2)}px`);
      element.style.setProperty('--magnetic-y', `${y.toFixed(2)}px`);
    }, { passive: true });
    element.addEventListener('pointerleave', () => resetMagnetic(element));
    element.addEventListener('pointercancel', () => resetMagnetic(element));
    element.addEventListener('blur', () => resetMagnetic(element));
  });

  $$('.tilt-wrap').forEach(element => {
    const art = $('.project-art', element);
    if (!art) return;
    element.addEventListener('pointermove', event => {
      if (!motionEnabled || !finePointer.matches || event.pointerType === 'touch') return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      art.style.transform = `perspective(1100px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg) scale(1.015)`;
    }, { passive: true });
    element.addEventListener('pointerleave', () => { art.style.transform = ''; });
    element.addEventListener('blur', () => { art.style.transform = ''; });
  });

  const revealElements = $$('.reveal');
  root.classList.add('js-ready');
  if ('IntersectionObserver' in window && motionEnabled) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
    revealElements.forEach((element, index) => {
      if (!element.style.getPropertyValue('--reveal-delay')) element.style.setProperty('--reveal-delay', `${(index % 4) * 65}ms`);
      revealObserver.observe(element);
    });
  } else revealElements.forEach(element => element.classList.add('is-visible'));

  const menuButton = $('#menu-toggle');
  const mobileNav = $('#mobile-nav');
  const menuClose = $('#menu-close');
  let menuClosing = false;
  let menuFallback = false;
  let menuEnterTimer = 0;
  let menuCloseTimer = 0;
  let menuRestoreFocus = true;
  let menuReturnFocus = null;

  function menuIsOpen() {
    return Boolean(mobileNav && mobileNav.hasAttribute('open'));
  }

  function finishMenuEnter() {
    clearTimeout(menuEnterTimer);
    menuEnterTimer = 0;
    if (mobileNav) mobileNav.classList.remove('is-entering');
  }

  function highlightMenuLink(link, event) {
    if (!mobileNav) return;
    $$('nav a', mobileNav).forEach(item => item.classList.toggle('is-lit', item === link));
    mobileNav.classList.toggle('has-highlight', Boolean(link));
    if (!link) return;
    const bounds = mobileNav.getBoundingClientRect();
    const row = link.getBoundingClientRect();
    const x = event ? Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)) : bounds.width * 0.82;
    mobileNav.style.setProperty('--menu-glow-y', `${(row.top - bounds.top + row.height / 2 + mobileNav.scrollTop).toFixed(1)}px`);
    mobileNav.style.setProperty('--menu-glow-x', `${x.toFixed(1)}px`);
  }

  function finishMenuClose() {
    if (!mobileNav || menuIsOpen()) return;
    clearTimeout(menuCloseTimer);
    menuCloseTimer = 0;
    finishMenuEnter();
    menuClosing = false;
    mobileNav.classList.remove('is-closing');
    mobileNav.removeAttribute('aria-modal');
    root.classList.remove('menu-open');
    highlightMenuLink(null);
    const remainingDialog = $('dialog[open]');
    if (!remainingDialog) root.classList.remove('dialog-open');
    if (cursor) (remainingDialog || document.body).append(cursor);
    if (menuRestoreFocus && !remainingDialog && menuReturnFocus && menuReturnFocus.isConnected && menuReturnFocus.getClientRects().length) {
      menuReturnFocus.focus({ preventScroll: true });
    }
    menuReturnFocus = null;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
  }

  function closeMenuNow() {
    if (!mobileNav) return;
    clearTimeout(menuCloseTimer);
    menuCloseTimer = 0;
    if (menuIsOpen()) {
      if (!menuFallback && typeof mobileNav.close === 'function') mobileNav.close();
      else mobileNav.removeAttribute('open');
    }
    finishMenuClose();
  }

  function setMenu(open, restoreFocus = true, immediate = false) {
    if (!menuButton || !mobileNav) return;
    if (open) {
      clearTimeout(menuCloseTimer);
      menuCloseTimer = 0;
      finishMenuEnter();
      menuClosing = false;
      mobileNav.classList.remove('is-closing');
      if (motionEnabled && !reducedMotion.matches) {
        mobileNav.classList.add('is-entering');
        menuEnterTimer = window.setTimeout(finishMenuEnter, 460);
      }
      if (!menuIsOpen()) {
        menuReturnFocus = menuButton;
        menuFallback = typeof mobileNav.showModal !== 'function';
        if (!menuFallback) {
          try { mobileNav.showModal(); }
          catch (_) { menuFallback = true; }
        }
        if (menuFallback) mobileNav.setAttribute('open', '');
      }
      menuRestoreFocus = true;
      mobileNav.setAttribute('aria-modal', 'true');
      menuButton.setAttribute('aria-expanded', 'true');
      menuButton.setAttribute('aria-label', 'Cerrar menú');
      root.classList.add('menu-open');
      if (cursor) { mobileNav.append(cursor); cursor.classList.remove('is-active'); }
      const first = menuClose || $('nav a[href]', mobileNav);
      if (first) first.focus({ preventScroll: true });
      return;
    }
    menuRestoreFocus = restoreFocus;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
    if (!menuIsOpen()) { finishMenuClose(); return; }
    if (immediate || !motionEnabled || reducedMotion.matches) { closeMenuNow(); return; }
    if (menuClosing) return;
    menuClosing = true;
    mobileNav.classList.add('is-closing');
    finishMenuEnter();
    // Keep the modal and its focus trap active until the exit animation finishes.
    menuCloseTimer = window.setTimeout(closeMenuNow, 300);
  }
  if (menuButton && mobileNav) {
    mobileNav.removeAttribute('hidden');
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    if (menuClose) menuClose.addEventListener('click', () => setMenu(false));
    mobileNav.addEventListener('cancel', event => { event.preventDefault(); setMenu(false); });
    mobileNav.addEventListener('close', finishMenuClose);
    mobileNav.addEventListener('animationend', event => {
      if (event.target !== mobileNav) return;
      if (event.animationName === 'menuDrawerIn') finishMenuEnter();
      else if (event.animationName === 'menuDrawerOut' && menuClosing) closeMenuNow();
    });
    mobileNav.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest('a[href], [data-contact]')) { setMenu(false); return; }
      if (target !== mobileNav) return;
      const bounds = mobileNav.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setMenu(false);
    });
    mobileNav.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const target = event.target instanceof Element ? event.target.closest('nav a') : null;
      if (target && mobileNav.contains(target)) highlightMenuLink(target, event);
      else highlightMenuLink(document.activeElement instanceof Element ? document.activeElement.closest('#mobile-nav nav a') : null);
    }, { passive: true });
    mobileNav.addEventListener('pointerleave', () => {
      highlightMenuLink(document.activeElement instanceof Element ? document.activeElement.closest('#mobile-nav nav a') : null);
    });
    mobileNav.addEventListener('focusin', event => {
      highlightMenuLink(event.target instanceof Element ? event.target.closest('nav a') : null);
    });
    mobileNav.addEventListener('keydown', event => {
      if (!menuFallback) return;
      if (event.key === 'Escape') { event.preventDefault(); setMenu(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = $$('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]', mobileNav).filter(item => item.getClientRects().length && (item.type !== 'radio' || item.checked));
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('focusin', event => {
      if (menuFallback && menuIsOpen() && !mobileNav.contains(event.target)) {
        const first = menuClose || $('nav a[href]', mobileNav);
        if (first) first.focus({ preventScroll: true });
      }
    });
    onMediaChange(reducedMotion, () => {
      if (!reducedMotion.matches) return;
      finishMenuEnter();
      if (menuClosing) closeMenuNow();
    });
    window.addEventListener('resize', () => {
      if (menuIsOpen()) highlightMenuLink($('nav a.is-lit', mobileNav));
    }, { passive: true });
  }

  const progress = $('#progress');
  let progressQueued = false;
  function updateProgress() {
    progressQueued = false;
    if (!progress) return;
    const max = Math.max(0, root.scrollHeight - window.innerHeight);
    const value = max ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progress.style.transform = `scaleX(${value.toFixed(4)})`;
  }
  window.addEventListener('scroll', () => {
    if (!progressQueued) { progressQueued = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });

  const filters = $$('.filter[data-filter]');
  const projectCards = $$('[data-project][data-category]');
  const projectCount = $('#project-count');
  const projectGrid = $('.projects-grid');
  const repositoryArchive = $('#repository-archive');
  const archiveCount = $('#archive-count');
  const projectDetails = window.portfolioProjects || {};
  function filterProjects(category) {
    let count = 0, featuredCount = 0, archivedCount = 0;
    filters.forEach(button => {
      const active = button.dataset.filter === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    projectCards.forEach(card => {
      const matches = category === 'all' || card.dataset.category === category;
      card.hidden = !matches;
      if (matches) {
        count++;
        card.classList.add('is-visible');
        if (card.classList.contains('project-card')) featuredCount++;
        else archivedCount++;
      }
    });
    if (projectGrid) projectGrid.hidden = featuredCount === 0;
    if (repositoryArchive) {
      repositoryArchive.hidden = archivedCount === 0;
      if (category !== 'all' && archivedCount) repositoryArchive.open = true;
    }
    if (archiveCount) archiveCount.textContent = `${String(archivedCount).padStart(2, '0')} repositorios`;
    if (projectCount) projectCount.textContent = `${String(count).padStart(2, '0')} / REPOSITORIOS${category === 'all' ? ' PÚBLICOS' : ' EN ESTA CATEGORÍA'}`;
    updateProgress();
  }
  filters.forEach(button => button.addEventListener('click', () => filterProjects(button.dataset.filter)));
  if (filters.length) filterProjects((filters.find(button => button.classList.contains('active')) || filters[0]).dataset.filter);

  const projectDialog = $('#project-dialog');
  const projectDialogContent = $('#project-dialog-content');
  const contactDialog = $('#contact-dialog');
  const returnFocus = new WeakMap();
  const dialogFallback = new WeakSet();

  function focusFirst(dialog) {
    const first = $('[autofocus], button:not([disabled]), a[href], summary, input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]', dialog);
    if (first) first.focus({ preventScroll: true });
    else { dialog.setAttribute('tabindex', '-1'); dialog.focus({ preventScroll: true }); }
  }

  function openDialog(dialog, trigger) {
    if (!dialog) return;
    setMenu(false, false, true);
    $$('dialog[open]').forEach(open => { if (open !== dialog && open !== mobileNav) closeDialog(open, false); });
    returnFocus.set(dialog, trigger || document.activeElement);
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') {
        try { dialog.showModal(); }
        catch (_) { dialog.setAttribute('open', ''); dialogFallback.add(dialog); }
      } else { dialog.setAttribute('open', ''); dialogFallback.add(dialog); }
    }
    dialog.setAttribute('aria-modal', 'true');
    root.classList.add('dialog-open');
    if (cursor) dialog.append(cursor);
    focusFirst(dialog);
    if (cursor) cursor.classList.remove('is-active');
  }

  function finishClose(dialog, restore = true) {
    if (dialog.id === 'project-lightbox') resetImageZoom();
    dialog.removeAttribute('aria-modal');
    const remainingDialog = $('dialog[open]');
    if (!remainingDialog) root.classList.remove('dialog-open');
    if (cursor) (remainingDialog || document.body).append(cursor);
    if (restore) {
      const previous = returnFocus.get(dialog);
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
    }
  }

  function closeDialog(dialog, restore = true) {
    if (!dialog || !dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function' && !dialogFallback.has(dialog)) {
      if (!restore) returnFocus.delete(dialog);
      dialog.close();
    } else {
      dialog.removeAttribute('open');
      finishClose(dialog, restore);
    }
  }

  $$('dialog').filter(dialog => dialog !== mobileNav).forEach(dialog => {
    dialog.addEventListener('close', () => finishClose(dialog));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
    dialog.addEventListener('keydown', event => {
      if (!dialogFallback.has(dialog)) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(dialog); return; }
      if (event.key !== 'Tab') return;
      const focusable = $$('button:not([disabled]), a[href], summary, input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]', dialog).filter(element => !element.hidden && element.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function projectIcon(symbol) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'icon'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${symbol}`); icon.append(use); return icon;
  }
  const imageViewer = $('#project-lightbox');
  let currentCase = null;
  let currentMediaIndex = 0;

  function caseSection(title, className) {
    const section = element('section', className);
    section.append(element('h3', 'case-section-label', title)); return section;
  }
  function imageNavigation(direction, className, attribute) {
    const button = element('button', className); button.type = 'button';
    button.setAttribute(attribute, String(direction));
    button.setAttribute('aria-label', direction < 0 ? 'Imagen anterior' : 'Imagen siguiente');
    button.append(projectIcon('arrow')); return button;
  }
  function selectCaseStep(index) {
    if (!currentCase || !currentCase.workflow[index]) return;
    $$('.case-step', projectDialogContent).forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    const description = $('.case-step-description', projectDialogContent);
    if (description) description.textContent = currentCase.workflow[index].description;
  }
  function setCaseImage(index) {
    if (!currentCase || !currentCase.images.length) return;
    const count = currentCase.images.length;
    currentMediaIndex = ((Number(index) % count) + count) % count;
    const media = currentCase.images[currentMediaIndex];
    const gallery = $('.case-gallery', projectDialogContent);
    const image = $('.case-main-image', projectDialogContent);
    if (image) { image.src = media.src; image.alt = media.alt; image.width = media.width; image.height = media.height; }
    if (gallery) { gallery.classList.toggle('is-plot', media.kind === 'plot'); gallery.classList.toggle('is-resource', media.kind === 'resource'); }
    const opener = $('.case-image-open', projectDialogContent);
    if (opener) opener.setAttribute('aria-label', `Ampliar: ${media.title}`);
    const caption = $('.case-media-caption', projectDialogContent);
    if (caption) caption.textContent = media.caption;
    const counter = $('.case-media-count', projectDialogContent);
    if (counter) counter.textContent = `${currentMediaIndex + 1} / ${count} · ${media.title}`;
    $$('.case-thumb', projectDialogContent).forEach((button, i) => button.setAttribute('aria-pressed', String(i === currentMediaIndex)));
    if (imageViewer && imageViewer.hasAttribute('open')) renderImageViewer();
  }
  function resetImageZoom() {
    if (!imageViewer) return;
    imageViewer.classList.remove('is-zoomed');
    const zoom = $('#lightbox-zoom'); if (zoom) zoom.setAttribute('aria-pressed', 'false');
    const label = $('#lightbox-zoom-label'); if (label) label.textContent = 'Tamaño real';
    const scroller = $('.lightbox-scroller', imageViewer);
    if (scroller) { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
  }
  function renderImageViewer() {
    if (!imageViewer || !currentCase || !currentCase.images.length) return;
    const media = currentCase.images[currentMediaIndex];
    const image = $('#lightbox-image');
    if (image) { image.src = media.src; image.alt = media.alt; image.width = media.width; image.height = media.height; }
    const title = $('#lightbox-title'); if (title) title.textContent = `${currentCase.title} / ${media.title}`;
    const caption = $('#lightbox-caption'); if (caption) caption.textContent = media.caption;
    const count = $('#lightbox-count'); if (count) count.textContent = `${currentMediaIndex + 1} / ${currentCase.images.length}`;
    $$('[data-lightbox-nav]', imageViewer).forEach(button => { button.hidden = currentCase.images.length < 2; });
    resetImageZoom();
  }
  function openProjectImage(trigger) {
    if (!imageViewer || !currentCase || !currentCase.images.length) return;
    renderImageViewer(); returnFocus.set(imageViewer, trigger || document.activeElement);
    if (!imageViewer.hasAttribute('open')) {
      if (typeof imageViewer.showModal === 'function') {
        try { imageViewer.showModal(); }
        catch (_) { imageViewer.setAttribute('open', ''); dialogFallback.add(imageViewer); }
      } else { imageViewer.setAttribute('open', ''); dialogFallback.add(imageViewer); }
    }
    imageViewer.setAttribute('aria-modal', 'true'); root.classList.add('dialog-open');
    if (cursor) { imageViewer.append(cursor); cursor.classList.remove('is-active'); }
    focusFirst(imageViewer);
  }
  function showProject(card) {
    const detail = projectDetails[card.dataset.project];
    if (!detail || !projectDialog || !projectDialogContent) return;
    currentCase = detail; currentMediaIndex = 0;
    const fragment = document.createDocumentFragment();
    const article = element('article', 'case-study');
    const header = element('header', 'case-header');
    header.append(element('p', 'eyebrow dialog-kicker', `${detail.number} / ${detail.categoryLabel}`));
    const title = element('h2', 'dialog-title', detail.title); title.id = 'project-dialog-title';
    header.append(title, element('p', 'case-question', detail.question), element('p', 'project-context', detail.status)); article.append(header);
    const lead = element('div', 'case-lead-grid');
    const gallery = caseSection(detail.images.length ? 'Dentro del proyecto' : 'Así se conecta', 'case-gallery');
    if (detail.images.length) {
      const opener = element('button', 'case-image-open'); opener.type = 'button'; opener.setAttribute('data-open-case-image', '');
      const image = element('img', 'case-main-image'); image.decoding = 'async';
      const hint = element('span', 'case-image-hint', 'Ampliar'); hint.prepend(projectIcon('icon-enlarge')); opener.append(image, hint);
      const bar = element('div', 'case-gallery-bar');
      const previous = imageNavigation(-1, 'case-prev', 'data-gallery-nav'), next = imageNavigation(1, 'case-next', 'data-gallery-nav');
      previous.hidden = next.hidden = detail.images.length < 2;
      const count = element('span', 'case-media-count'); count.setAttribute('aria-live', 'polite'); bar.append(previous, count, next);
      const thumbnails = element('div', 'case-thumbnails'); thumbnails.setAttribute('role', 'group'); thumbnails.setAttribute('aria-label', 'Vistas del proyecto'); thumbnails.hidden = detail.images.length < 2;
      detail.images.forEach((media, index) => {
        const button = element('button', 'case-thumb'); button.type = 'button'; button.setAttribute('data-media-index', String(index));
        button.setAttribute('aria-label', `Ver imagen ${index + 1}: ${media.title}`); button.setAttribute('aria-pressed', String(index === 0));
        const thumb = element('img'); thumb.src = media.src; thumb.alt = ''; thumb.loading = 'lazy'; thumb.decoding = 'async'; thumb.width = media.width; thumb.height = media.height;
        button.append(thumb, element('span', '', String(index + 1).padStart(2, '0'))); thumbnails.append(button);
      });
      gallery.append(opener, bar, element('p', 'case-media-caption'), thumbnails);
    } else {
      gallery.classList.add('case-gallery--diagram'); const preview = element('div', 'case-diagram-preview');
      preview.append(element('span', 'case-diagram-label', 'DIAGRAMA DEL PROYECTO'), element('h4', 'case-diagram-title', detail.title));
      const path = element('ol', 'case-diagram-path');
      detail.workflow.forEach((step, index) => { const item = element('li'); item.append(element('span', '', String(index + 1).padStart(2, '0')), element('span', '', step.title)); path.append(item); });
      preview.append(path, element('p', 'case-media-caption', 'Flujo basado en el código del repositorio.')); gallery.append(preview);
    }
    const overview = element('aside', 'case-overview');
    overview.append(element('h3', 'case-section-label', 'Qué hace'), element('p', 'case-overview-text', detail.overview));
    const actions = element('div', 'dialog-project-actions');
    const repository = element('a', 'dialog-repo-link', 'Ver código en GitHub'); repository.href = detail.repoUrl; repository.target = '_blank'; repository.rel = 'noopener noreferrer'; repository.prepend(projectIcon('icon-github')); actions.append(repository);
    if (detail.demoUrl) { const demo = element('a', 'dialog-repo-link', 'Abrir demo'); demo.href = detail.demoUrl; demo.target = '_blank'; demo.rel = 'noopener noreferrer'; demo.append(projectIcon('arrow')); actions.append(demo); }
    const tags = element('div', 'case-tech-tags'); detail.tags.forEach(tag => tags.append(element('span', '', tag)));
    overview.append(actions, tags); lead.append(gallery, overview); article.append(lead);
    const highlights = caseSection('Lo que puedes explorar', 'case-highlights'), highlightGrid = element('div', 'case-highlight-grid');
    detail.highlights.forEach((text, index) => { const item = element('article', 'case-highlight'); item.append(element('span', 'case-feature-number', String(index + 1).padStart(2, '0')), element('p', '', text)); highlightGrid.append(item); }); highlights.append(highlightGrid); article.append(highlights);
    const workflow = caseSection('Del inicio al resultado', 'case-workflow'), flow = element('ol', 'case-flow');
    detail.workflow.forEach((step, index) => {
      const item = element('li'), button = element('button', 'case-step'); button.type = 'button'; button.setAttribute('data-case-step', String(index)); button.setAttribute('aria-pressed', String(index === 0));
      button.append(element('span', 'step-number', String(index + 1).padStart(2, '0')), element('span', 'step-title', step.title)); item.append(button); flow.append(item);
    });
    const stepDescription = element('p', 'case-step-description', detail.workflow[0].description); stepDescription.setAttribute('role', 'status'); stepDescription.setAttribute('aria-live', 'polite'); workflow.append(flow, stepDescription);
    const technologies = caseSection('Tecnologías, con una función', 'case-technologies'), techGrid = element('dl', 'case-tech-grid');
    detail.technologyRoles.forEach(technology => { const item = element('div'); item.append(element('dt', '', technology.name), element('dd', '', technology.role)); techGrid.append(item); });
    technologies.append(techGrid);
    const more = element('details', 'case-more-details');
    const summary = element('summary');
    summary.append(element('span', '', 'Proceso y detalles técnicos'), element('span', 'case-more-count', `${detail.workflow.length} pasos / ${detail.technologyRoles.length} herramientas`), projectIcon('icon-plus'));
    const extra = element('div', 'case-extra-body');
    extra.append(workflow, technologies, element('p', 'case-learning', detail.learning), element('p', 'case-scope', detail.context));
    if (detail.credits) extra.append(element('p', 'project-credits', detail.credits));
    more.append(summary, extra); article.append(more); fragment.append(article);
    projectDialogContent.replaceChildren(fragment); projectDialog.scrollTop = 0; projectDialog.setAttribute('aria-labelledby', title.id); setCaseImage(0); openDialog(projectDialog, card);
  }
  if (projectDialogContent) {
    projectDialogContent.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null; if (!target) return;
      const thumb = target.closest('[data-media-index]'), navigation = target.closest('[data-gallery-nav]'), opener = target.closest('[data-open-case-image]'), step = target.closest('[data-case-step]');
      if (thumb) setCaseImage(Number(thumb.getAttribute('data-media-index')));
      else if (navigation) setCaseImage(currentMediaIndex + Number(navigation.getAttribute('data-gallery-nav')));
      else if (opener) openProjectImage(opener); else if (step) selectCaseStep(Number(step.getAttribute('data-case-step')));
    });
    projectDialogContent.addEventListener('keydown', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !target.closest('.case-gallery') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); setCaseImage(currentMediaIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
  }
  if (imageViewer) {
    imageViewer.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null, navigation = target && target.closest('[data-lightbox-nav]');
      if (navigation) setCaseImage(currentMediaIndex + Number(navigation.getAttribute('data-lightbox-nav')));
      const zoom = target && target.closest('#lightbox-zoom');
      if (zoom) { const enlarged = !imageViewer.classList.contains('is-zoomed'); imageViewer.classList.toggle('is-zoomed', enlarged); zoom.setAttribute('aria-pressed', String(enlarged)); const label = $('#lightbox-zoom-label'); if (label) label.textContent = enlarged ? 'Ajustar a pantalla' : 'Tamaño real'; if (enlarged) { const scroller = $('.lightbox-scroller', imageViewer); if (scroller) scroller.focus({ preventScroll: true }); } }
    });
    imageViewer.addEventListener('keydown', event => { if (imageViewer.classList.contains('is-zoomed') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); setCaseImage(currentMediaIndex + (event.key === 'ArrowRight' ? 1 : -1)); });
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const close = target.closest('[data-close-dialog]');
    if (close) {
      event.preventDefault();
      const dialog = close.closest('dialog');
      if (dialog === mobileNav) setMenu(false);
      else closeDialog(dialog);
      return;
    }
    const contact = target.closest('[data-contact]');
    if (contact && contactDialog) { event.preventDefault(); setMenu(false); openDialog(contactDialog, contact); return; }
    const card = target.closest('[data-project]');
    if (card) { event.preventDefault(); showProject(card); }
  });



  const contactForm = $('#contact-form');
  const contactStatus = $('#contact-status');
  function showContactStatus(message) {
    if (contactStatus) {
      contactStatus.setAttribute('role', 'status');
      contactStatus.setAttribute('aria-live', 'polite');
      contactStatus.textContent = message;
    }
  }
  if (contactForm) {
    contactForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;
      const data = new FormData(contactForm);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const message = String(data.get('message') || '').trim();
      const subject = `Hablemos de un proyecto${name ? ` — ${name}` : ''}`;
      const body = `Hola, Juanpablo.\n\n${message}\n\nNombre: ${name}\nCorreo de contacto: ${email}`;
      showContactStatus(`Tu aplicación de correo abrirá la consulta. Si no se abre, escribe a ${contactEmail}.`);
      window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const temporary = document.createElement('textarea');
    temporary.value = value;
    temporary.setAttribute('readonly', '');
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand('copy');
    temporary.remove();
    if (!copied) throw new Error('Copy unavailable');
  }
  $$('[data-copy-contact]').forEach(button => {
    button.addEventListener('click', async event => {
      event.preventDefault();
      const configured = (button.dataset.copyContact || '').trim();
      let value = configured;
      if (configured.startsWith('#')) {
        try { value = ($(configured)?.textContent || '').trim(); } catch (_) { value = ''; }
      }
      if (!value) value = contactEmail;
      try {
        await copyText(value.replace(/^mailto:/i, ''));
        showContactStatus('Correo copiado al portapapeles.');
        const label = $('.copy-label', button);
        if (label) {
          const previous = label.textContent;
          label.textContent = 'Copiado';
          setTimeout(() => { label.textContent = previous; }, 2200);
        }
      } catch (_) {
        showContactStatus(`Puedes escribir a ${contactEmail}.`);
      }
    });
  });

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
  window.addEventListener('resize', () => { resizeDust(); resizeNameOrbit(); }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resizeNameOrbit);
  resizeNameOrbit();
  resizeDust();
  updateProgress();
  applyMotion();
})();
