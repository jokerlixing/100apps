(function bootstrapMicaCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MicaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMicaCore() {
  'use strict';

  const COMPONENTS = Object.freeze([
    {
      id: 'button',
      name: 'Button',
      tag: 'mica-button',
      category: 'action',
      description: 'A focused action control with primary, quiet, and destructive visual priorities.',
      snippet: '<mica-button variant="primary">Save changes</mica-button>',
    },
    {
      id: 'input',
      name: 'Input',
      tag: 'mica-input',
      category: 'form',
      description: 'A labeled text field with supporting copy, error state, and native input events.',
      snippet: '<mica-input label="Project name" hint="Visible to your team"></mica-input>',
    },
    {
      id: 'select',
      name: 'Select',
      tag: 'mica-select',
      category: 'form',
      description: 'A compact native selection control configured through a simple options attribute.',
      snippet: '<mica-select label="Release channel" options="Stable|Preview|Nightly"></mica-select>',
    },
    {
      id: 'checkbox',
      name: 'Checkbox',
      tag: 'mica-checkbox',
      category: 'form',
      description: 'A native checkbox for independent choices with a generous pointer and focus target.',
      snippet: '<mica-checkbox checked>Include release notes</mica-checkbox>',
    },
    {
      id: 'switch',
      name: 'Switch',
      tag: 'mica-switch',
      category: 'form',
      description: 'An immediate on or off setting that preserves native checkbox keyboard behavior.',
      snippet: '<mica-switch checked>Automatic updates</mica-switch>',
    },
    {
      id: 'badge',
      name: 'Badge',
      tag: 'mica-badge',
      category: 'status',
      description: 'A short semantic label for neutral, positive, warning, and critical states.',
      snippet: '<mica-badge tone="positive">Ready</mica-badge>',
    },
    {
      id: 'alert',
      name: 'Alert',
      tag: 'mica-alert',
      category: 'feedback',
      description: 'A persistent feedback message with a clear tone, title, and optional dismissal action.',
      snippet: '<mica-alert tone="warning" title="Review needed">Two tokens use fallback values.</mica-alert>',
    },
    {
      id: 'progress',
      name: 'Progress',
      tag: 'mica-progress',
      category: 'feedback',
      description: 'A determinate progress indicator that clamps input and exposes its value to assistive tech.',
      snippet: '<mica-progress value="68" label="Package readiness"></mica-progress>',
    },
    {
      id: 'tabs',
      name: 'Tabs',
      tag: 'mica-tabs',
      category: 'navigation',
      description: 'A keyboard-operable tab set generated from labeled panels in one declarative attribute.',
      snippet: '<mica-tabs tabs="Preview:Live component|API:Attributes and events|Notes:Usage guidance"></mica-tabs>',
    },
    {
      id: 'accordion',
      name: 'Accordion',
      tag: 'mica-accordion',
      category: 'disclosure',
      description: 'A native disclosure section for secondary guidance without hiding essential actions.',
      snippet: '<mica-accordion summary="When should I use this?">Use it for optional implementation notes.</mica-accordion>',
    },
    {
      id: 'dialog',
      name: 'Dialog',
      tag: 'mica-dialog',
      category: 'overlay',
      description: 'A modal confirmation surface built on the native dialog element with focus restoration.',
      snippet: '<mica-dialog title="Publish package">Confirm the package details before continuing.</mica-dialog>',
    },
    {
      id: 'toast',
      name: 'Toast',
      tag: 'mica-toast',
      category: 'feedback',
      description: 'A polite live-region notification for short feedback that never blocks the current task.',
      snippet: '<mica-toast message="Snippet copied" tone="positive"></mica-toast>',
    },
  ]);

  const DEFAULT_TOKENS = Object.freeze({
    theme: 'light',
    accent: '#3157D5',
    radius: '14px',
    scale: '1',
  });

  const SUPPORTED = Object.freeze({
    theme: ['light', 'dark'],
    radius: ['0px', '14px', '999px'],
    scale: ['0.9', '1', '1.1'],
  });

  function normalizeTokens(input) {
    const value = input && typeof input === 'object' ? input : {};
    const accent = typeof value.accent === 'string' && /^#[\da-f]{6}$/i.test(value.accent)
      ? value.accent.toUpperCase()
      : DEFAULT_TOKENS.accent;

    return {
      theme: SUPPORTED.theme.includes(value.theme) ? value.theme : DEFAULT_TOKENS.theme,
      accent,
      radius: SUPPORTED.radius.includes(value.radius) ? value.radius : DEFAULT_TOKENS.radius,
      scale: SUPPORTED.scale.includes(String(value.scale)) ? String(value.scale) : DEFAULT_TOKENS.scale,
    };
  }

  function filterComponents(query) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return COMPONENTS.slice();
    return COMPONENTS.filter((component) => [
      component.id,
      component.name,
      component.tag,
      component.category,
      component.description,
    ].some((field) => field.toLowerCase().includes(needle)));
  }

  function clampProgress(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(100, Math.max(0, number));
  }

  function getSnippet(id) {
    const component = COMPONENTS.find((item) => item.id === id);
    return component ? component.snippet : '';
  }

  return Object.freeze({
    COMPONENTS,
    DEFAULT_TOKENS,
    SUPPORTED,
    normalizeTokens,
    filterComponents,
    clampProgress,
    getSnippet,
  });
});
