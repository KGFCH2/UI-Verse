/**
 * Theme Feature
 * Manages dark mode toggling and persistence
 */

const Theme = {
  _state: {
    initialized: false,
    listener: null
  },

  updateToggleState(themeToggle, isDark) {
    if (!themeToggle) return;

    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('aria-pressed', String(isDark));

    const icon = themeToggle.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  },

  /**
   * Load and apply saved theme
   */
  load() {
    const themeToggle = getElement("theme-toggle") || getElement("darkModeToggle");
    const saved = localStorage.getItem("theme");

    if (saved === "dark") {
      document.body.classList.add("dark-mode");
      this.updateToggleState(themeToggle, true);
    } else {
      document.body.classList.remove("dark-mode");
      this.updateToggleState(themeToggle, false);
    }
  },

  /**
   * Initialize theme feature
   */
  init() {
    if (this._state.initialized) return;

    // Apply system preference on first visit
    if (!localStorage.getItem("theme")) {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.body.classList.add("dark-mode");
      }
    }

    this.load();

    const themeToggle = getElement("theme-toggle") || getElement("darkModeToggle");
    if (themeToggle) {
      if (this._state.listener) {
        themeToggle.removeEventListener("click", this._state.listener);
      }

      const onClick = () => {
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("theme", isDark ? "dark" : "light");

        this.updateToggleState(themeToggle, isDark);
      };

      themeToggle.addEventListener("click", onClick);
      this._state.listener = onClick;
    }

    this._state.initialized = true;
  },

  destroy() {
    const themeToggle = getElement("theme-toggle") || getElement("darkModeToggle");
    if (themeToggle && this._state.listener) {
      themeToggle.removeEventListener("click", this._state.listener);
    }
    this._state.listener = null;
    this._state.initialized = false;
  }
};

// Export for use in bootstrap
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Theme;
}
