(function installMicaUI(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MicaUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMicaUI(root) {
  'use strict';

  const canRegister = Boolean(root && root.HTMLElement && root.customElements && root.document);
  if (!canRegister) return Object.freeze({ defineMicaElements: function defineMicaElements() {} });

  let sequence = 0;

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clampProgress(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, number));
  }

  function emit(host, name, detail) {
    host.dispatchEvent(new root.CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail: detail || {},
    }));
  }

  const BASE = `
    :host{box-sizing:border-box;color:var(--mica-ink,#202321);font-family:var(--mica-font-body,"Segoe UI",sans-serif);font-size:calc(16px * var(--mica-scale,1))}
    *,*::before,*::after{box-sizing:border-box}
    button,input,select{font:inherit;color:inherit}
    button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid color-mix(in srgb,var(--mica-accent,#3157d5) 72%,white);outline-offset:3px}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
  `;

  class MicaElement extends root.HTMLElement {
    constructor() {
      super();
      this._uid = `mica-${++sequence}`;
      this._suppressRender = false;
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected && !this._suppressRender) this.render();
    }

    reflect(name, enabled) {
      this._suppressRender = true;
      if (enabled) this.setAttribute(name, '');
      else this.removeAttribute(name);
      this._suppressRender = false;
    }
  }

  class MicaButton extends MicaElement {
    static get observedAttributes() { return ['variant', 'disabled']; }
    render() {
      const variant = ['primary', 'quiet', 'danger'].includes(this.getAttribute('variant'))
        ? this.getAttribute('variant')
        : 'primary';
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:inline-block}
          button{min-height:44px;border:1px solid var(--mica-ink);border-radius:var(--mica-radius);padding:.7em 1.05em;background:var(--mica-accent);color:var(--mica-accent-ink,#fff);box-shadow:3px 3px 0 var(--mica-ink);font-weight:750;cursor:pointer;transition:transform .16s,box-shadow .16s,background .16s}
          button:hover:not(:disabled){transform:translate(1px,1px);box-shadow:2px 2px 0 var(--mica-ink)}
          button:active:not(:disabled){transform:translate(3px,3px);box-shadow:none}
          button.quiet{background:var(--mica-surface);color:var(--mica-ink);box-shadow:none}
          button.danger{background:var(--mica-critical);color:#fff}
          button:disabled{cursor:not-allowed;opacity:.48;box-shadow:none}
        </style>
        <button part="button" class="${variant}" ${this.hasAttribute('disabled') ? 'disabled' : ''}><slot></slot></button>`;
    }
  }

  class MicaInput extends MicaElement {
    static get observedAttributes() { return ['label', 'hint', 'error', 'value', 'placeholder', 'type', 'disabled']; }
    get value() { return this.shadowRoot.querySelector('input')?.value || this.getAttribute('value') || ''; }
    set value(next) {
      this.setAttribute('value', next == null ? '' : String(next));
      const field = this.shadowRoot.querySelector('input');
      if (field) field.value = next == null ? '' : String(next);
    }
    render() {
      const label = this.getAttribute('label') || 'Text field';
      const hint = this.getAttribute('error') || this.getAttribute('hint') || '';
      const describedBy = hint ? `${this._uid}-help` : '';
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:block}
          label>span{display:block;margin-bottom:7px;font-size:.78em;font-weight:800;letter-spacing:.02em}
          input{width:100%;min-height:46px;border:1px solid ${this.hasAttribute('error') ? 'var(--mica-critical)' : 'var(--mica-border)'};border-radius:var(--mica-radius);background:var(--mica-surface);padding:.72em .82em}
          small{display:block;margin-top:7px;color:${this.hasAttribute('error') ? 'var(--mica-critical)' : 'var(--mica-muted)'};font-size:.72em;line-height:1.4}
        </style>
        <label for="${this._uid}-input"><span>${escapeHTML(label)}</span></label>
        <input id="${this._uid}-input" part="input" type="${escapeHTML(this.getAttribute('type') || 'text')}" value="${escapeHTML(this.getAttribute('value') || '')}" placeholder="${escapeHTML(this.getAttribute('placeholder') || '')}" ${describedBy ? `aria-describedby="${describedBy}"` : ''} ${this.hasAttribute('error') ? 'aria-invalid="true"' : ''} ${this.hasAttribute('disabled') ? 'disabled' : ''}>
        ${hint ? `<small id="${describedBy}">${escapeHTML(hint)}</small>` : ''}`;
      const field = this.shadowRoot.querySelector('input');
      field.addEventListener('input', () => emit(this, 'mica-input', { value: field.value }));
      field.addEventListener('change', () => emit(this, 'mica-change', { value: field.value }));
    }
  }

  class MicaSelect extends MicaElement {
    static get observedAttributes() { return ['label', 'options', 'value', 'disabled']; }
    get value() { return this.shadowRoot.querySelector('select')?.value || ''; }
    set value(next) { this.setAttribute('value', next == null ? '' : String(next)); }
    render() {
      const options = String(this.getAttribute('options') || '').split('|').map((item) => item.trim()).filter(Boolean);
      const value = this.getAttribute('value') || options[0] || '';
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:block}
          label{display:block;margin-bottom:7px;font-size:.78em;font-weight:800}
          select{width:100%;min-height:46px;border:1px solid var(--mica-border);border-radius:var(--mica-radius);background:var(--mica-surface);padding:.65em 2.2em .65em .82em}
        </style>
        <label for="${this._uid}-select">${escapeHTML(this.getAttribute('label') || 'Select an option')}</label>
        <select id="${this._uid}-select" part="select" ${this.hasAttribute('disabled') ? 'disabled' : ''}>
          ${options.map((option) => `<option ${option === value ? 'selected' : ''}>${escapeHTML(option)}</option>`).join('')}
        </select>`;
      this.shadowRoot.querySelector('select').addEventListener('change', (event) => {
        this._suppressRender = true;
        this.setAttribute('value', event.target.value);
        this._suppressRender = false;
        emit(this, 'mica-change', { value: event.target.value });
      });
    }
  }

  class MicaCheckbox extends MicaElement {
    static get observedAttributes() { return ['checked', 'disabled']; }
    get checked() { return Boolean(this.shadowRoot.querySelector('input')?.checked); }
    set checked(next) { this.reflect('checked', Boolean(next)); this.render(); }
    render() {
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:inline-block}
          label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;line-height:1.4}
          input{width:20px;height:20px;margin:0;accent-color:var(--mica-accent);flex:0 0 auto}
        </style>
        <label><input part="input" type="checkbox" ${this.hasAttribute('checked') ? 'checked' : ''} ${this.hasAttribute('disabled') ? 'disabled' : ''}><span><slot></slot></span></label>`;
      this.shadowRoot.querySelector('input').addEventListener('change', (event) => {
        this.reflect('checked', event.target.checked);
        emit(this, 'mica-change', { checked: event.target.checked });
      });
    }
  }

  class MicaSwitch extends MicaCheckbox {
    render() {
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:inline-block}
          label{display:flex;align-items:center;gap:11px;cursor:pointer;line-height:1.35}
          input{position:absolute;opacity:0;pointer-events:none}
          i{position:relative;width:44px;height:25px;border:1px solid var(--mica-border);border-radius:999px;background:var(--mica-surface-muted);flex:0 0 auto;transition:background .18s}
          i::after{content:"";position:absolute;left:3px;top:3px;width:17px;height:17px;border-radius:50%;background:var(--mica-surface);box-shadow:0 1px 4px rgba(0,0,0,.28);transition:transform .18s}
          input:checked+i{background:var(--mica-accent);border-color:var(--mica-accent)}
          input:checked+i::after{transform:translateX(19px)}
          input:focus-visible+i{outline:3px solid color-mix(in srgb,var(--mica-accent) 72%,white);outline-offset:3px}
        </style>
        <label><input part="input" type="checkbox" role="switch" ${this.hasAttribute('checked') ? 'checked' : ''} ${this.hasAttribute('disabled') ? 'disabled' : ''}><i aria-hidden="true"></i><span><slot></slot></span></label>`;
      this.shadowRoot.querySelector('input').addEventListener('change', (event) => {
        this.reflect('checked', event.target.checked);
        emit(this, 'mica-change', { checked: event.target.checked });
      });
    }
  }

  class MicaBadge extends MicaElement {
    static get observedAttributes() { return ['tone']; }
    render() {
      const tone = ['neutral', 'positive', 'warning', 'critical'].includes(this.getAttribute('tone')) ? this.getAttribute('tone') : 'neutral';
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:inline-block}
          span{display:inline-flex;align-items:center;gap:6px;border:1px solid currentColor;border-radius:999px;padding:.35em .65em;font-size:.72em;font-weight:800;line-height:1}
          span::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
          .neutral{color:var(--mica-muted)}.positive{color:var(--mica-positive)}.warning{color:var(--mica-warning)}.critical{color:var(--mica-critical)}
        </style><span part="badge" class="${tone}"><slot></slot></span>`;
    }
  }

  class MicaAlert extends MicaElement {
    static get observedAttributes() { return ['tone', 'title', 'dismissible']; }
    render() {
      const tone = ['info', 'positive', 'warning', 'critical'].includes(this.getAttribute('tone')) ? this.getAttribute('tone') : 'info';
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:block}
          section{display:grid;grid-template-columns:6px 1fr auto;gap:14px;border:1px solid var(--mica-border);border-radius:var(--mica-radius);background:var(--mica-surface);padding:14px}
          i{border-radius:999px;background:var(--mica-accent)}.positive i{background:var(--mica-positive)}.warning i{background:var(--mica-warning)}.critical i{background:var(--mica-critical)}
          strong{display:block;margin-bottom:4px}.copy{color:var(--mica-muted);font-size:.86em;line-height:1.5}
          button{align-self:start;border:0;background:transparent;padding:2px 5px;color:var(--mica-muted);cursor:pointer;font-size:1.1em}
        </style>
        <section role="${tone === 'critical' ? 'alert' : 'status'}" class="${tone}"><i aria-hidden="true"></i><div><strong>${escapeHTML(this.getAttribute('title') || 'Notice')}</strong><div class="copy"><slot></slot></div></div>${this.hasAttribute('dismissible') ? '<button aria-label="Dismiss">×</button>' : ''}</section>`;
      this.shadowRoot.querySelector('button')?.addEventListener('click', () => {
        this.hidden = true;
        emit(this, 'mica-dismiss');
      });
    }
  }

  class MicaProgress extends MicaElement {
    static get observedAttributes() { return ['value', 'label']; }
    render() {
      const value = clampProgress(this.getAttribute('value'));
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:block}
          header{display:flex;justify-content:space-between;gap:20px;margin-bottom:8px;font-size:.78em;font-weight:800}
          strong{font-family:var(--mica-font-code,monospace)}
          .track{height:12px;overflow:hidden;border:1px solid var(--mica-border);border-radius:999px;background:var(--mica-surface-muted)}
          .bar{height:100%;width:${value}%;background:var(--mica-accent);transition:width .24s ease}
        </style>
        <div role="progressbar" aria-label="${escapeHTML(this.getAttribute('label') || 'Progress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
          <header><span>${escapeHTML(this.getAttribute('label') || 'Progress')}</span><strong>${value}%</strong></header>
          <div class="track"><div class="bar"></div></div>
        </div>`;
    }
  }

  class MicaTabs extends MicaElement {
    static get observedAttributes() { return ['tabs', 'active']; }
    parseTabs() {
      return String(this.getAttribute('tabs') || '').split('|').map((entry) => {
        const separator = entry.indexOf(':');
        return separator < 0 ? { label: entry.trim(), content: '' } : {
          label: entry.slice(0, separator).trim(),
          content: entry.slice(separator + 1).trim(),
        };
      }).filter((tab) => tab.label);
    }
    select(index, moveFocus) {
      const tabs = this.parseTabs();
      const next = Math.max(0, Math.min(tabs.length - 1, index));
      this.setAttribute('active', String(next));
      emit(this, 'mica-change', { index: next, label: tabs[next]?.label || '' });
      if (moveFocus) this.shadowRoot.querySelectorAll('[role="tab"]')[next]?.focus();
    }
    render() {
      const tabs = this.parseTabs();
      const active = Math.max(0, Math.min(tabs.length - 1, Number(this.getAttribute('active')) || 0));
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:block}
          [role=tablist]{display:flex;gap:4px;border-bottom:1px solid var(--mica-border)}
          [role=tab]{border:0;border-bottom:3px solid transparent;background:transparent;padding:.75em .9em;color:var(--mica-muted);font-weight:800;cursor:pointer}
          [role=tab][aria-selected=true]{border-bottom-color:var(--mica-accent);color:var(--mica-ink)}
          [role=tabpanel]{min-height:84px;padding:18px 4px;color:var(--mica-muted);line-height:1.6}
        </style>
        <div role="tablist" aria-label="Component information">${tabs.map((tab, index) => `<button id="${this._uid}-tab-${index}" role="tab" aria-controls="${this._uid}-panel" aria-selected="${index === active}" tabindex="${index === active ? '0' : '-1'}" data-index="${index}">${escapeHTML(tab.label)}</button>`).join('')}</div>
        <div id="${this._uid}-panel" role="tabpanel" aria-labelledby="${this._uid}-tab-${active}">${escapeHTML(tabs[active]?.content || '')}</div>`;
      const buttons = [...this.shadowRoot.querySelectorAll('[role="tab"]')];
      buttons.forEach((button) => button.addEventListener('click', () => this.select(Number(button.dataset.index), false)));
      this.shadowRoot.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => {
        const current = buttons.findIndex((button) => button === root.document.activeElement || button === this.shadowRoot.activeElement);
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        this.select(next, true);
      });
    }
  }

  class MicaAccordion extends MicaElement {
    static get observedAttributes() { return ['summary', 'open']; }
    render() {
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{display:block}
          details{border-top:1px solid var(--mica-border);border-bottom:1px solid var(--mica-border);background:var(--mica-surface)}
          summary{cursor:pointer;padding:15px 4px;font-weight:800;list-style:none}
          summary::-webkit-details-marker{display:none}
          summary::after{content:"+";float:right;font-family:var(--mica-font-code,monospace);font-size:1.2em}
          details[open] summary::after{content:"−"}
          .panel{padding:0 4px 17px;color:var(--mica-muted);line-height:1.6}
        </style>
        <details ${this.hasAttribute('open') ? 'open' : ''}><summary>${escapeHTML(this.getAttribute('summary') || 'More information')}</summary><div class="panel"><slot></slot></div></details>`;
      this.shadowRoot.querySelector('details').addEventListener('toggle', (event) => {
        this.reflect('open', event.target.open);
        emit(this, 'mica-toggle', { open: event.target.open });
      });
    }
  }

  class MicaDialog extends MicaElement {
    static get observedAttributes() { return ['title']; }
    render() {
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          dialog{width:min(92vw,480px);border:1px solid var(--mica-ink);border-radius:var(--mica-radius);background:var(--mica-surface);color:var(--mica-ink);padding:0;box-shadow:var(--mica-shadow)}
          dialog::backdrop{background:color-mix(in srgb,var(--mica-ink) 52%,transparent);backdrop-filter:blur(3px)}
          header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--mica-border);padding:17px 20px}
          h2{margin:0;font:800 1.1em/1.2 var(--mica-font-body)}
          header button{border:0;background:transparent;padding:5px;cursor:pointer;font-size:1.25em}
          .content{padding:22px 20px;color:var(--mica-muted);line-height:1.6}
          footer{display:flex;justify-content:flex-end;border-top:1px solid var(--mica-border);padding:14px 20px}
          footer button{border:1px solid var(--mica-ink);border-radius:var(--mica-radius);background:var(--mica-accent);color:var(--mica-accent-ink,#fff);padding:.65em 1em;font-weight:800;cursor:pointer}
        </style>
        <dialog aria-labelledby="${this._uid}-title"><header><h2 id="${this._uid}-title">${escapeHTML(this.getAttribute('title') || 'Dialog')}</h2><button data-close aria-label="Close dialog">×</button></header><div class="content"><slot></slot></div><footer><button data-close>Close</button></footer></dialog>`;
      this.shadowRoot.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => this.close()));
      this.shadowRoot.querySelector('dialog').addEventListener('cancel', () => emit(this, 'mica-close'));
    }
    show() {
      const dialog = this.shadowRoot.querySelector('dialog');
      if (!dialog) this.render();
      const target = this.shadowRoot.querySelector('dialog');
      if (!target.open) target.showModal();
      emit(this, 'mica-open');
    }
    close() {
      const dialog = this.shadowRoot.querySelector('dialog');
      if (dialog?.open) dialog.close();
      emit(this, 'mica-close');
    }
  }

  class MicaToast extends MicaElement {
    static get observedAttributes() { return ['message', 'tone', 'duration']; }
    constructor() {
      super();
      this._visible = false;
      this._timer = null;
    }
    connectedCallback() {
      this.render();
      if (this.getAttribute('message')) root.setTimeout(() => this.show(), 0);
    }
    disconnectedCallback() { root.clearTimeout(this._timer); }
    render() {
      const tone = ['neutral', 'positive', 'critical'].includes(this.getAttribute('tone')) ? this.getAttribute('tone') : 'neutral';
      this.shadowRoot.innerHTML = `
        <style>${BASE}
          :host{position:fixed;z-index:1000;right:clamp(14px,3vw,34px);bottom:clamp(14px,3vw,34px);display:block;pointer-events:none}
          div{max-width:min(88vw,390px);border:1px solid var(--mica-ink);border-radius:var(--mica-radius);background:var(--mica-ink);color:var(--mica-surface);padding:13px 16px;box-shadow:var(--mica-shadow);font-weight:750;opacity:0;transform:translateY(12px);transition:opacity .18s,transform .18s}
          div.show{opacity:1;transform:none}.positive{border-left:6px solid var(--mica-positive)}.critical{border-left:6px solid var(--mica-critical)}
        </style><div class="${tone} ${this._visible ? 'show' : ''}" role="status" aria-live="polite">${escapeHTML(this.getAttribute('message') || '')}</div>`;
    }
    show(message, tone) {
      this._suppressRender = true;
      if (message != null) this.setAttribute('message', String(message));
      if (tone) this.setAttribute('tone', tone);
      this._suppressRender = false;
      this._visible = true;
      this.render();
      root.clearTimeout(this._timer);
      const duration = Math.max(1000, Number(this.getAttribute('duration')) || 2800);
      this._timer = root.setTimeout(() => {
        this._visible = false;
        this.render();
        emit(this, 'mica-hide');
      }, duration);
      emit(this, 'mica-show', { message: this.getAttribute('message') || '' });
    }
  }

  const definitions = [
    ['mica-button', MicaButton],
    ['mica-input', MicaInput],
    ['mica-select', MicaSelect],
    ['mica-checkbox', MicaCheckbox],
    ['mica-switch', MicaSwitch],
    ['mica-badge', MicaBadge],
    ['mica-alert', MicaAlert],
    ['mica-progress', MicaProgress],
    ['mica-tabs', MicaTabs],
    ['mica-accordion', MicaAccordion],
    ['mica-dialog', MicaDialog],
    ['mica-toast', MicaToast],
  ];

  function defineMicaElements() {
    definitions.forEach(([name, constructor]) => {
      if (!root.customElements.get(name)) root.customElements.define(name, constructor);
    });
  }

  defineMicaElements();
  return Object.freeze({ defineMicaElements, version: '1.0.0', elements: definitions.map(([name]) => name) });
});
