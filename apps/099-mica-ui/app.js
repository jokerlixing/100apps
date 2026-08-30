(function startMicaDocs() {
  'use strict';

  const core = window.MicaCore;
  const root = document.documentElement;
  const storageKey = 'mica-ui-docs-v1';
  const accentNames = {
    '#3157D5': 'Cobalt',
    '#D9734D': 'Clay',
    '#19724F': 'Moss',
    '#704F8A': 'Plum',
  };

  const demos = {
    button: '<div class="demo-row"><mica-button>Save changes</mica-button><mica-button variant="quiet">Preview</mica-button><mica-button variant="danger">Remove</mica-button></div>',
    input: '<div class="demo-stack"><mica-input label="Project name" value="Mica specimen" hint="Visible to collaborators"></mica-input><mica-input label="Package scope" value="unscoped" error="Use an organization scope"></mica-input></div>',
    select: '<mica-select label="Release channel" options="Stable|Preview|Nightly" value="Preview"></mica-select>',
    checkbox: '<div class="demo-stack"><mica-checkbox checked>Include release notes</mica-checkbox><mica-checkbox>Notify maintainers</mica-checkbox></div>',
    switch: '<div class="demo-stack"><mica-switch checked>Automatic updates</mica-switch><mica-switch>Anonymous diagnostics</mica-switch></div>',
    badge: '<div class="demo-row"><mica-badge>Draft</mica-badge><mica-badge tone="positive">Ready</mica-badge><mica-badge tone="warning">Review</mica-badge><mica-badge tone="critical">Blocked</mica-badge></div>',
    alert: '<div class="demo-stack"><mica-alert tone="positive" title="Tokens compiled">The package is ready for its browser checks.</mica-alert><mica-alert tone="warning" title="Review needed" dismissible>Two examples still use placeholder copy.</mica-alert></div>',
    progress: '<div class="demo-stack"><mica-progress id="catalogProgress" value="68" label="Package readiness"></mica-progress><label class="progress-control"><input type="range" min="0" max="100" value="68" data-progress-control><output>68%</output></label></div>',
    tabs: '<mica-tabs tabs="Preview:Rendered component behavior|API:Attributes, methods, and events|Notes:When to use this element"></mica-tabs>',
    accordion: '<div class="demo-stack"><mica-accordion summary="When should I use this?" open>Use disclosure for optional implementation detail, never for the page’s primary action.</mica-accordion><mica-accordion summary="Does it support the keyboard?">The native details element supplies enter and space behavior.</mica-accordion></div>',
    dialog: '<div class="demo-stack"><p>Confirm a focused decision without routing to another page.</p><button class="native-demo-button" type="button" data-open-dialog>Open publish dialog</button></div>',
    toast: '<div class="demo-stack"><p>Return lightweight feedback without stealing focus.</p><button class="native-demo-button" type="button" data-show-toast>Run notification</button></div>',
  };

  function loadTokens() {
    try {
      return core.normalizeTokens(JSON.parse(localStorage.getItem(storageKey) || '{}'));
    } catch (error) {
      return { ...core.DEFAULT_TOKENS };
    }
  }

  let tokens = loadTokens();

  function applyTokens(next, shouldSave = true) {
    tokens = core.normalizeTokens({ ...tokens, ...next });
    root.dataset.micaTheme = tokens.theme;
    root.style.setProperty('--mica-accent', tokens.accent);
    root.style.setProperty('--mica-radius', tokens.radius);
    root.style.setProperty('--mica-scale', tokens.scale);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.theme === 'dark' ? '#171a18' : '#f4f5f2');

    document.querySelectorAll('[data-accent]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.accent === tokens.accent)));
    document.querySelectorAll('[data-radius]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.radius === tokens.radius)));
    document.querySelectorAll('[data-scale]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.scale === tokens.scale)));

    const accentOutput = document.querySelector('[data-accent-output]');
    if (accentOutput) accentOutput.textContent = `${tokens.accent} / ${accentNames[tokens.accent] || 'Custom'}`;
    const summary = document.querySelector('[data-token-summary]');
    if (summary) summary.textContent = `${tokens.theme.toUpperCase()} · ${tokens.accent} · ${tokens.radius.toUpperCase()} · ${Math.round(Number(tokens.scale) * 100)}%`;

    const themeButton = document.querySelector('[data-theme-toggle]');
    if (themeButton) {
      const dark = tokens.theme === 'dark';
      themeButton.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      themeButton.querySelector('b').textContent = dark ? 'Light room' : 'Dark room';
    }

    if (shouldSave) {
      try { localStorage.setItem(storageKey, JSON.stringify(tokens)); } catch (error) { /* Storage is optional. */ }
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character]);
  }

  function renderCatalog() {
    const grid = document.querySelector('[data-specimen-grid]');
    const nav = document.querySelector('[data-component-nav]');
    grid.innerHTML = core.COMPONENTS.map((component, index) => `
      <article class="specimen-card ${['alert', 'tabs'].includes(component.id) ? 'is-wide' : ''}" id="component-${component.id}" data-component-card="${component.id}">
        <header>
          <span class="specimen-index">${String(index + 1).padStart(2, '0')}</span>
          <div><h3>${escapeHTML(component.name)}</h3><code>&lt;${component.tag}&gt;</code></div>
          <span class="category">${escapeHTML(component.category)}</span>
        </header>
        <div class="demo-stage">${demos[component.id]}</div>
        <div class="code-row"><code>${escapeHTML(component.snippet)}</code><button type="button" data-copy-component="${component.id}">Copy code</button></div>
      </article>`).join('');
    nav.innerHTML = core.COMPONENTS.map((component, index) => `<a href="#component-${component.id}" data-component-link="${component.id}"><span>${String(index + 1).padStart(2, '0')} · ${escapeHTML(component.name)}</span><code>${component.category}</code></a>`).join('');
  }

  function showToast(message, tone = 'positive') {
    document.querySelector('#docsToast')?.show(message, tone);
  }

  async function copyText(text, successMessage) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      showToast(copied ? successMessage : 'Select the visible code and copy it manually', copied ? 'positive' : 'critical');
    }
  }

  function filterCatalog(query) {
    const matches = core.filterComponents(query);
    const ids = new Set(matches.map((component) => component.id));
    document.querySelectorAll('[data-component-card]').forEach((card) => { card.hidden = !ids.has(card.dataset.componentCard); });
    document.querySelectorAll('[data-component-link]').forEach((link) => { link.hidden = !ids.has(link.dataset.componentLink); });
    document.querySelector('[data-no-results]').hidden = matches.length > 0;
    document.querySelector('[data-result-count]').textContent = String(matches.length).padStart(2, '0');
  }

  renderCatalog();
  applyTokens(tokens, false);

  document.querySelectorAll('[data-accent]').forEach((button) => button.addEventListener('click', () => applyTokens({ accent: button.dataset.accent })));
  document.querySelectorAll('[data-radius]').forEach((button) => button.addEventListener('click', () => applyTokens({ radius: button.dataset.radius })));
  document.querySelectorAll('[data-scale]').forEach((button) => button.addEventListener('click', () => applyTokens({ scale: button.dataset.scale })));
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => applyTokens({ theme: tokens.theme === 'dark' ? 'light' : 'dark' }));

  const search = document.querySelector('[data-component-search]');
  search.addEventListener('input', () => filterCatalog(search.value));
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
      event.preventDefault();
      search.focus();
    }
  });
  document.querySelector('[data-clear-search]').addEventListener('click', () => { search.value = ''; filterCatalog(''); search.focus(); });

  document.querySelectorAll('[data-copy-component]').forEach((button) => button.addEventListener('click', () => copyText(core.getSnippet(button.dataset.copyComponent), `${button.dataset.copyComponent} snippet copied`)));
  document.querySelector('[data-copy-install]').addEventListener('click', () => copyText('npm i @hundred-apps/mica-ui', 'Install command copied'));
  document.querySelector('[data-copy-setup]').addEventListener('click', () => copyText(`<link rel="stylesheet" href="./node_modules/@hundred-apps/mica-ui/mica-ui.css">\n<script src="./node_modules/@hundred-apps/mica-ui/mica-ui.js"><\/script>`, 'Setup copied'));
  document.querySelector('[data-open-dialog]').addEventListener('click', () => document.querySelector('#docsDialog').show());
  document.querySelector('[data-show-toast]').addEventListener('click', () => showToast('Specimen notification delivered'));

  const progressControl = document.querySelector('[data-progress-control]');
  progressControl.addEventListener('input', () => {
    document.querySelector('#catalogProgress').setAttribute('value', progressControl.value);
    progressControl.nextElementSibling.value = `${progressControl.value}%`;
  });

  document.body.dataset.ready = 'true';
})();
