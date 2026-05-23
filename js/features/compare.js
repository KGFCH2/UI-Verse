(function () {
  const MAX_COMPARE = 3;
  const STORAGE_KEY = 'uiVerseCompare.selectedComponentIds.v1';

  const CARD_SELECTOR = '.component-card';
  const CARD_ID_ATTR = 'data-compare-id';

  const OVERLAY_ID = 'uiverse-compare-overlay';
  const OVERLAY_GRID_ID = 'uiverse-compare-grid';

  let state = {
    selectedIds: [],
    overlayOpen: false,
  };

  let cardsObserver = null;
  let reconcileQueued = false;
  let pendingActiveCell = undefined;
  let syncRetryQueued = false;
  let keyDownBound = false;
  let cachedCards = [];
  let cachedCheckboxInputs = [];
  let cachedOverlayGrid = null;

  function getCardElements() {
    return Array.from(document.querySelectorAll(CARD_SELECTOR));
  }

  function rebuildCompareCaches(cards = getCardElements()) {
    cachedCards = cards;
    cachedCheckboxInputs = Array.from(document.querySelectorAll('.uiverse-compare-checkbox'));
    cachedOverlayGrid = document.getElementById(OVERLAY_GRID_ID);
  }

  function ensureCompareId(cardEl) {
    if (!cardEl || !(cardEl instanceof HTMLElement)) return null;
    if (cardEl.getAttribute(CARD_ID_ATTR)) return cardEl.getAttribute(CARD_ID_ATTR);

    // Prefer stable-ish identifier
    const name = (cardEl.getAttribute('data-name') || '').trim();
    const cat = (cardEl.getAttribute('data-cat') || '').trim();

    // Fallback: index within grid
    const all = cachedCards.length ? cachedCards : getCardElements();
    const idx = all.indexOf(cardEl);

    const metaKey = [name, cat].filter(Boolean).join('__');
    const raw = metaKey || `card__${idx}`;
    const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

    // Keep metadata-backed IDs stable across DOM re-renders.
    const id = metaKey ? safe : `${safe}__${idx}`;

    cardEl.setAttribute(CARD_ID_ATTR, id);
    return id;
  }

  function loadSelection() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, MAX_COMPARE).filter((x) => typeof x === 'string' && x.length > 0);
    } catch (e) {
      return [];
    }
  }

  function persistSelection() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.selectedIds));
    } catch (e) {
      // ignore
    }
  }

  function getSelectedCards() {
    if (!state.selectedIds.length) return [];
    const byId = new Map();
    (cachedCards.length ? cachedCards : getCardElements()).forEach((el) => {
      const id = ensureCompareId(el);
      if (id) byId.set(id, el);
    });

    return state.selectedIds.map((id) => byId.get(id)).filter(Boolean);
  }

  function createCheckbox(cardEl) {
    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'uiverse-compare-checkbox-wrap';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'uiverse-compare-checkbox';
    input.setAttribute('aria-label', 'Select component for compare');

    const id = ensureCompareId(cardEl);
    if (id) input.dataset.compareId = id;

    input.checked = state.selectedIds.includes(id);
    if (!input.checked && state.selectedIds.length >= MAX_COMPARE) {
      input.disabled = true;
    }

    input.addEventListener('change', () => {
      const compareId = input.dataset.compareId;
      if (!compareId) return;

      if (input.checked) {
        if (state.selectedIds.length >= MAX_COMPARE) {
          input.checked = false;
          return;
        }
        if (!state.selectedIds.includes(compareId)) state.selectedIds.push(compareId);
      } else {
        state.selectedIds = state.selectedIds.filter((x) => x !== compareId);
      }

      persistSelection();
      refreshCheckboxStates();

      // open overlay automatically once we have at least 2 selections
      if (state.selectedIds.length >= 2) {
        openOverlay();
      } else {
        closeOverlayKeepSelection();
      }
    });

    checkboxWrap.appendChild(input);
    cardEl.appendChild(checkboxWrap);
  }

  function refreshCheckboxStates() {
    const inputs = cachedCheckboxInputs.length ? cachedCheckboxInputs : Array.from(document.querySelectorAll('.uiverse-compare-checkbox'));
    if (!cachedCheckboxInputs.length && inputs.length) cachedCheckboxInputs = inputs;

    // sync selected -> inputs
    inputs.forEach((input) => {
      const id = input.dataset.compareId;
      input.checked = state.selectedIds.includes(id);
    });

    // enforce max=3
    inputs.forEach((input) => {
      const id = input.dataset.compareId;
      const isSelected = state.selectedIds.includes(id);
      input.disabled = !isSelected && state.selectedIds.length >= MAX_COMPARE;
    });
  }

  function buildPreviewCell(cardEl) {
    const cell = document.createElement('div');
    cell.className = 'uiverse-compare-cell';
    cell.tabIndex = 0;
    cell.setAttribute('aria-current', 'false');

    const label = document.createElement('div');
    label.className = 'uiverse-compare-cell-label';

    const name = cardEl.getAttribute('data-name') || '';
    const cat = cardEl.getAttribute('data-cat') || '';
    label.textContent = `${name}${cat ? ' · ' + cat : ''}`;

    const preview = cardEl.querySelector('.card-preview');

    const previewWrap = document.createElement('div');
    previewWrap.className = 'uiverse-compare-cell-preview';

    // Clone ONLY preview area if possible
    if (preview) {
      previewWrap.appendChild(preview.cloneNode(true));
    } else {
      // fallback: clone whole card
      previewWrap.appendChild(cardEl.cloneNode(true));
      // remove checkbox from clone if present
      const cloned = previewWrap.querySelector('.uiverse-compare-checkbox-wrap');
      if (cloned) cloned.remove();
    }

    cell.appendChild(label);
    cell.appendChild(previewWrap);

    // Sync hover/focus
    // - mouseenter: for pointer users
    // - focus/focusin: for keyboard + focus within cloned content
    cell.addEventListener('mouseenter', () => syncActive(cell));
    cell.addEventListener('focus', () => syncActive(cell));
    cell.addEventListener('focusin', () => syncActive(cell));

    return cell;
  }

  function syncActive(activeCell) {
    const grid = cachedOverlayGrid || document.getElementById(OVERLAY_GRID_ID);
    if (!grid) {
      pendingActiveCell = activeCell;
      if (!syncRetryQueued) {
        syncRetryQueued = true;
        const retry = () => {
          syncRetryQueued = false;
          if (pendingActiveCell === undefined) return;
          const queuedCell = pendingActiveCell;
          pendingActiveCell = undefined;
          syncActive(queuedCell);
        };

        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(retry);
        } else {
          setTimeout(retry, 0);
        }
      }
      return;
    }

    cachedOverlayGrid = grid;

    // Grid is available now; any queued state has been superseded.
    pendingActiveCell = undefined;

    const cells = Array.from(grid.querySelectorAll('.uiverse-compare-cell'));
    const isActiveCell = (cell) => !!activeCell && cell === activeCell;

    cells.forEach((c) => {
      const active = isActiveCell(c);
      if (active) c.classList.add('uiverse-compare-cell--active');
      else c.classList.remove('uiverse-compare-cell--active');
      c.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function openOverlay() {
    const selectedCards = getSelectedCards();
    if (selectedCards.length < 2) return;

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.className = 'uiverse-compare-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      overlay.innerHTML = `
        <div class="uiverse-compare-overlay__panel">
          <div class="uiverse-compare-overlay__header">
            <div class="uiverse-compare-overlay__title">
              Multi-Component Compare
              <span class="uiverse-compare-overlay__hint">(hover/focus sync)</span>
            </div>
            <div class="uiverse-compare-overlay__actions">
              <button type="button" class="uiverse-compare-clear" id="uiverse-compare-clear">Clear Compare</button>
              <button type="button" class="uiverse-compare-close" id="uiverse-compare-close">Close</button>
            </div>
          </div>
          <div class="uiverse-compare-overlay__body">
            <div class="uiverse-compare-grid" id="${OVERLAY_GRID_ID}"></div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target instanceof Element && !e.target.closest('.uiverse-compare-overlay__panel')) {
          closeOverlayKeepSelection();
        }
      });

      const clearBtn = document.getElementById('uiverse-compare-clear');
      const closeBtn = document.getElementById('uiverse-compare-close');

      clearBtn.addEventListener('click', () => closeOverlayClearSelection());

      closeBtn.addEventListener('click', () => closeOverlayKeepSelection());

      bindOverlayKeydown();
    }

    const grid = cachedOverlayGrid || document.getElementById(OVERLAY_GRID_ID);
    cachedOverlayGrid = grid;
    if (grid) {
      grid.innerHTML = '';
      selectedCards.slice(0, MAX_COMPARE).forEach((cardEl) => {
        grid.appendChild(buildPreviewCell(cardEl));
      });
    }

    overlay.classList.add('uiverse-compare-overlay--open');
    state.overlayOpen = true;

    // initial active styling based on first cell
    const first = grid && grid.querySelector('.uiverse-compare-cell');
    if (first) {
      syncActive(first);
      if (typeof first.focus === 'function') {
        try {
          first.focus({ preventScroll: true });
        } catch {
          first.focus();
        }
      }
    }
  }

  function bindOverlayKeydown() {
    if (keyDownBound) return;
    document.addEventListener('keydown', onKeyDown);
    keyDownBound = true;
  }

  function unbindOverlayKeydown() {
    if (!keyDownBound) return;
    document.removeEventListener('keydown', onKeyDown);
    keyDownBound = false;
  }

  function closeOverlayKeepSelection() {
    unbindOverlayKeydown();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      state.overlayOpen = false;
      cachedOverlayGrid = null;
      return;
    }
    syncActive(null);
    overlay.classList.remove('uiverse-compare-overlay--open');
    state.overlayOpen = false;
    cachedOverlayGrid = overlay.querySelector(`#${OVERLAY_GRID_ID}`);
  }

  function closeOverlayClearSelection() {
    state.selectedIds = [];
    persistSelection();
    refreshCheckboxStates();
    closeOverlayKeepSelection();
  }

  function onKeyDown(e) {
    if (e.key !== 'Escape' || !state.overlayOpen) return;

    // Escape exits compare mode completely.
    e.preventDefault();
    closeOverlayClearSelection();
  }

  function maybeInit() {
    const cards = getCardElements();
    if (!cards.length) return;

    const restoredIds = loadSelection();

    // Keep only IDs that are present on this page load.
    const validIds = new Set(cards.map((card) => ensureCompareId(card)).filter(Boolean));
    state.selectedIds = restoredIds.filter((id) => validIds.has(id)).slice(0, MAX_COMPARE);
    persistSelection();

    // Inject checkboxes once
    cards.forEach((card) => {
      if (card.querySelector('.uiverse-compare-checkbox-wrap')) return;
      createCheckbox(card);
    });

    rebuildCompareCaches(cards);

    refreshCheckboxStates();

    // Restore overlay open state when we have >=2 selections
    if (state.selectedIds.length >= 2) {
      openOverlay();
    }
  }

  function mutationTouchesCards(mutations) {
    const hasCard = (node) => {
      if (!(node instanceof Element)) return false;
      return node.matches(CARD_SELECTOR) || !!node.querySelector(CARD_SELECTOR);
    };

    return mutations.some((mutation) => {
      if (mutation.type !== 'childList') return false;
      return Array.from(mutation.addedNodes).some(hasCard) || Array.from(mutation.removedNodes).some(hasCard);
    });
  }

  function scheduleCardReconcile() {
    if (reconcileQueued) return;
    reconcileQueued = true;

    const run = () => {
      reconcileQueued = false;
      maybeInit();
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }
    setTimeout(run, 0);
  }

  function observeDynamicCards() {
    if (cardsObserver || typeof MutationObserver === 'undefined' || !document.body) return;

    cardsObserver = new MutationObserver((mutations) => {
      if (!mutationTouchesCards(mutations)) return;
      scheduleCardReconcile();
    });

    cardsObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Styles injected only when needed (so compare doesn't affect other pages too much)
  function injectStylesOnce() {
    if (document.getElementById('uiverse-compare-styles')) return;
    const link = document.createElement('link');
    link.id = 'uiverse-compare-styles';
    link.rel = 'stylesheet';
    link.href = 'css/compare.css';
    document.head.appendChild(link);
  }

  // Only init on pages that contain cards
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectStylesOnce();
      maybeInit();
      observeDynamicCards();
    });
  } else {
    injectStylesOnce();
    maybeInit();
    observeDynamicCards();
  }
})();

