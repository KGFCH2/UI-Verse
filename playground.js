(function () {
  const drawer = document.getElementById("playgroundDrawer");
  if (!drawer) return;

  const preview = document.getElementById("playgroundPreview");
  const code = document.getElementById("playgroundCode");
  const title = document.getElementById("playgroundTitle");
  const resetBtn = document.getElementById("playgroundReset");
  const closeBtn = document.getElementById("playgroundClose");
  const backdrop = document.getElementById("playgroundBackdrop");

  const controls = Array.from(drawer.querySelectorAll("[data-control]"));
  const valueLabels = Array.from(drawer.querySelectorAll("[data-value]"));
  const headerActions = drawer.querySelector('.playground-header-actions');

  const defaultsByType = {
    button: {
      size: 160,
      radius: 10,
      padding: 12,
      fontSize: 14,
      background: "#eb6835",
      textColor: "#ffffff",
      shadow: 12
    },
    card: {
      size: 260,
      radius: 16,
      padding: 20,
      fontSize: 14,
      background: "#ffffff",
      textColor: "#111111",
      shadow: 16
    },
    input: {
      size: 260,
      radius: 10,
      padding: 10,
      fontSize: 14,
      background: "#ffffff",
      textColor: "#111111",
      shadow: 8
    }
  };

  let activeType = document.body.dataset.playgroundType || "button";
  let activeTarget = null;

  function openDrawer() {
    drawer.classList.add("open");
    backdrop.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    if (window.FocusTrap) {
      window.FocusTrap.activate(drawer);
    }
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("active");
    drawer.setAttribute("aria-hidden", "true");
    drawer.removeAttribute("role");
    drawer.removeAttribute("aria-modal");
    if (window.FocusTrap) {
      window.FocusTrap.deactivate();
    }
  }

  function setValueLabel(name, value) {
    valueLabels.forEach((label) => {
      if (label.dataset.value === name) {
        label.textContent = value;
      }
    });
  }

  function setControls(values) {
    controls.forEach((input) => {
      const key = input.dataset.control;
      if (!key || values[key] === undefined) return;
      input.value = values[key];
      setValueLabel(key, values[key]);
    });
  }

  function updateControlsVisibility(type) {
    const keys = Object.keys(defaultsByType[type] || {});
    controls.forEach((input) => {
      const key = input.dataset.control;
      const label = input.previousElementSibling && input.previousElementSibling.tagName.toLowerCase() === 'label' ? input.previousElementSibling : null;
      if (keys.includes(key)) {
        input.style.display = '';
        if (label) label.style.display = '';
      } else {
        input.style.display = 'none';
        if (label) label.style.display = 'none';
      }
    });
  }

  function getControlValues() {
    const next = {};
    controls.forEach((input) => {
      const key = input.dataset.control;
      if (!key) return;
      if (input.type === "range") {
        next[key] = Number(input.value);
      } else {
        next[key] = input.value;
      }
    });
    return next;
  }

  function styleForType(type, values) {
    const shadowValue = values.shadow
      ? "0 " + values.shadow + "px " + (values.shadow * 2) + "px rgba(0,0,0,0.18)"
      : "none";

    const base = {
      borderRadius: values.radius + "px",
      padding: values.padding + "px",
      fontSize: values.fontSize + "px",
      background: values.background,
      color: values.textColor,
      boxShadow: shadowValue
    };

    if (type === "button") {
      base.minWidth = values.size + "px";
    } else {
      base.width = values.size + "px";
    }

    return base;
  }

  function applyStyles() {
    if (!activeTarget) return;

    const values = getControlValues();
    const styles = styleForType(activeType, values);

    // Generate CSS class-based output
    const className = 'uiv-component';
    activeTarget.classList.add(className);
    
    // Remove inline styles and use CSS classes
    Object.keys(styles).forEach((prop) => {
      activeTarget.style[prop] = '';
    });

    const cssOutput = generateCSS(className, styles, activeType);
    activeTarget.setAttribute('class', activeTarget.className.replace('uiv-component', '').trim());
    
    const htmlOutput = `<div class="${className}">\n  ${activeTarget.outerHTML}\n</div>\n\n<style>\n${cssOutput}</style>`;
    code.textContent = htmlOutput;
  }

  function generateCSS(className, styles, type) {
    const rules = [];
    
    rules.push(`.${className} {`);
    Object.keys(styles).forEach((prop) => {
      const cssKey = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      rules.push(`  ${cssKey}: ${styles[prop]};`);
    });
    rules.push('}');
    
    return rules.join('\n');
  }

  function findPreviewElement(card) {
    const preview = card.querySelector(".card-preview");
    if (preview && preview.firstElementChild) return preview.firstElementChild;

    const candidates = Array.from(card.querySelectorAll("input, textarea, select, button, .profile-card, .simple-card, .product-card, .pricing-card, .image-card, .blog-card, .notif-card, .social-card"));
    return candidates.find((el) => !el.closest(".actions")) || null;
  }

  function openFromCard(card) {
    if (!card) return;

    const type = card.dataset.playgroundType || document.body.dataset.playgroundType || "button";
    const previewEl = findPreviewElement(card);
    if (!previewEl) return;

    activeType = type;
    preview.innerHTML = "";

    const clone = previewEl.cloneNode(true);
    clone.classList.add("playground-target");
    preview.appendChild(clone);

    activeTarget = clone;

    const defaults = defaultsByType[activeType] || defaultsByType.button;
    setControls(defaults);
    updateControlsVisibility(activeType);
    applyStyles();
    openDrawer();

    const cardTitle = card.querySelector("h3")?.textContent || "Component";
    if (title) title.textContent = cardTitle;
  }

  // Export / copy button
  async function copyPlaygroundCode() {
    try {
      const text = code.textContent || '';
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const success = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!success) throw new Error('Fallback copy failed');
      }
      
      if (typeof showToastSafe === 'function') showToastSafe('Playground code copied ✓');
    } catch (e) {
      console.error('copyPlaygroundCode', e);
      if (typeof showToastSafe === 'function') showToastSafe('Failed to copy');
    }
  }

  // add export button to header actions (if present)
  if (headerActions && !headerActions.querySelector('.playground-export-btn')) {
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'playground-export-btn';
    exportBtn.textContent = 'Export/Copy';
    exportBtn.addEventListener('click', (e) => { e.preventDefault(); copyPlaygroundCode(); });
    // insert before Close button if present
    const closeButton = headerActions.querySelector('#playgroundClose');
    if (closeButton) headerActions.insertBefore(exportBtn, closeButton);
    else headerActions.appendChild(exportBtn);
  }

  function injectPlaygroundButtons() {
    document.querySelectorAll(".component-card .actions").forEach((actions) => {
      if (actions.querySelector(".playground-open-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "playground-open-btn";
      btn.textContent = "Playground";
      actions.appendChild(btn);
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFromCard(actions.closest(".component-card"));
      });
    });
  }

  controls.forEach((input) => {
    input.addEventListener("input", () => {
      setValueLabel(input.dataset.control, input.value);
      applyStyles();
    });
  });

  resetBtn?.addEventListener("click", () => {
    const defaults = defaultsByType[activeType] || defaultsByType.button;
    setControls(defaults);
    applyStyles();
  });

  closeBtn?.addEventListener("click", closeDrawer);
  backdrop?.addEventListener("click", closeDrawer);

  function init() {
    injectPlaygroundButtons();
    closeDrawer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
