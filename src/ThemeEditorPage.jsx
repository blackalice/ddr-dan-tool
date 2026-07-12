import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import './ThemeEditorPage.css';

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'dark-pink', label: 'Dark (Pink)' },
  { value: 'light', label: 'Light' },
  { value: 'cg', label: 'CG' },
  { value: 'mhe2026', label: 'Manor House Evolved 2026' },
  { value: 'ddr-world', label: 'DDR World' },
  { value: 'new', label: 'New' },
];

const COLOR_FIELDS = [
  { cssVar: '--bg-color', label: 'Background' },
  { cssVar: '--bg-color-light', label: 'Background Light' },
  { cssVar: '--bg-color-dark', label: 'Background Dark' },
  { cssVar: '--card-bg-color', label: 'Card Background' },
  { cssVar: '--card-hover-bg-color', label: 'Card Hover' },
  { cssVar: '--border-color', label: 'Border' },
  { cssVar: '--text-color', label: 'Text' },
  { cssVar: '--text-muted-color', label: 'Muted Text' },
  { cssVar: '--accent-color', label: 'Accent' },
  { cssVar: '--accent-color-light', label: 'Accent Light' },
  { cssVar: '--button-bg', label: 'Button Background' },
  { cssVar: '--cyan-color', label: 'Cyan' },
  { cssVar: '--green-color', label: 'Green' },
  { cssVar: '--pink-color', label: 'Pink' },
  { cssVar: '--blue-color', label: 'Blue' },
  { cssVar: '--yellow-color', label: 'Yellow' },
];

const FALLBACK_COLOR = '#000000';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    const [r, g, b] = withHash.slice(1).split('');
    return `#${(r + r + g + g + b + b).toUpperCase()}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash.toUpperCase();
  }
  return null;
}

function parseCssColor(value) {
  if (typeof value !== 'string') return null;
  const normalizedHex = normalizeHex(value);
  if (normalizedHex) {
    const int = Number.parseInt(normalizedHex.slice(1), 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (!rgbMatch) return null;
  const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) {
    return null;
  }
  return {
    r: clamp(Math.round(parts[0]), 0, 255),
    g: clamp(Math.round(parts[1]), 0, 255),
    b: clamp(Math.round(parts[2]), 0, 255),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return { r: 0, g: 0, b: 0 };
  const int = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHsb({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const brightness = max * 100;

  return {
    h: Math.round(h),
    s: Math.round(s),
    b: Math.round(brightness),
  };
}

function hsbToRgb({ h, s, b }) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(b, 0, 100) / 100;

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (hue < 60) {
    rn = c;
    gn = x;
  } else if (hue < 120) {
    rn = x;
    gn = c;
  } else if (hue < 180) {
    gn = c;
    bn = x;
  } else if (hue < 240) {
    gn = x;
    bn = c;
  } else if (hue < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

function normalizeHexForCompare(value) {
  return normalizeHex(value)?.toUpperCase() || '';
}

function ThemeEditorPage() {
  const settings = useContext(SettingsContext) || {};
  const { theme = 'dark' } = settings;
  const [targetTheme, setTargetTheme] = useState(theme);
  const [baseColors, setBaseColors] = useState({});
  const [editedColors, setEditedColors] = useState({});
  const [draftHex, setDraftHex] = useState({});
  const [copied, setCopied] = useState(false);

  const loadCurrentThemeColors = useCallback(() => {
    if (typeof window === 'undefined') return;
    const themeRoot = document.querySelector('#root > [data-theme]') || document.documentElement;
    const computedStyles = window.getComputedStyle(themeRoot);
    const nextColors = {};

    COLOR_FIELDS.forEach(({ cssVar }) => {
      const rawValue = computedStyles.getPropertyValue(cssVar).trim();
      const rgb = parseCssColor(rawValue);
      nextColors[cssVar] = rgb ? rgbToHex(rgb) : FALLBACK_COLOR;
    });

    setBaseColors(nextColors);
    setEditedColors(nextColors);
    setDraftHex({});
    setCopied(false);
  }, []);

  useEffect(() => {
    setTargetTheme(theme);
    loadCurrentThemeColors();
  }, [theme, loadCurrentThemeColors]);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const changedFields = useMemo(
    () =>
      COLOR_FIELDS.filter(
        ({ cssVar }) =>
          normalizeHexForCompare(editedColors[cssVar]) !== normalizeHexForCompare(baseColors[cssVar]),
      ),
    [baseColors, editedColors],
  );

  const previewStyle = useMemo(() => {
    const style = {};
    COLOR_FIELDS.forEach(({ cssVar }) => {
      if (editedColors[cssVar]) {
        style[cssVar] = editedColors[cssVar];
      }
    });
    if (editedColors['--accent-color']) {
      const accentRgb = hexToRgb(editedColors['--accent-color']);
      style['--accent-color-rgb'] = `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`;
    }
    return style;
  }, [editedColors]);

  const cssOutput = useMemo(() => {
    if (!targetTheme) return '';
    const lines = changedFields.map(({ cssVar }) => `  ${cssVar}: ${editedColors[cssVar]};`);
    if (
      changedFields.some(({ cssVar }) => cssVar === '--accent-color') &&
      normalizeHex(editedColors['--accent-color'])
    ) {
      const accentRgb = hexToRgb(editedColors['--accent-color']);
      lines.push(`  --accent-color-rgb: ${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b};`);
    }
    const body = lines.length > 0 ? lines.join('\n') : '  /* No changes yet */';
    return `[data-theme='${targetTheme}'] {\n${body}\n}`;
  }, [changedFields, editedColors, targetTheme]);

  const handleSliderChange = useCallback((cssVar, channel, value) => {
    const numericValue = Number.parseInt(value, 10);
    if (Number.isNaN(numericValue)) return;

    setEditedColors((previous) => {
      const currentRgb = hexToRgb(previous[cssVar] || FALLBACK_COLOR);
      const currentHsb = rgbToHsb(currentRgb);
      const nextHsb = { ...currentHsb, [channel]: numericValue };
      return {
        ...previous,
        [cssVar]: rgbToHex(hsbToRgb(nextHsb)),
      };
    });

    setDraftHex((previous) => {
      const next = { ...previous };
      delete next[cssVar];
      return next;
    });
  }, []);

  const handleHexDraftChange = useCallback((cssVar, value) => {
    setDraftHex((previous) => ({ ...previous, [cssVar]: value }));
  }, []);

  const commitHexDraft = useCallback((cssVar) => {
    const currentDraft = draftHex[cssVar];
    if (typeof currentDraft !== 'string') return;
    const normalized = normalizeHex(currentDraft);
    if (!normalized) {
      setDraftHex((previous) => {
        const next = { ...previous };
        delete next[cssVar];
        return next;
      });
      return;
    }
    setEditedColors((previous) => ({ ...previous, [cssVar]: normalized }));
    setDraftHex((previous) => {
      const next = { ...previous };
      delete next[cssVar];
      return next;
    });
  }, [draftHex]);

  const handleResetColor = useCallback(
    (cssVar) => {
      const base = normalizeHex(baseColors[cssVar]) || FALLBACK_COLOR;
      setEditedColors((previous) => ({ ...previous, [cssVar]: base }));
      setDraftHex((previous) => {
        const next = { ...previous };
        delete next[cssVar];
        return next;
      });
    },
    [baseColors],
  );

  const handleResetAll = useCallback(() => {
    setEditedColors(baseColors);
    setDraftHex({});
    setCopied(false);
  }, [baseColors]);

  const handleCopyCss = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cssOutput);
      setCopied(true);
    } catch (error) {
      console.warn('Failed to copy CSS output', error);
    }
  }, [cssOutput]);

  return (
    <div className="app-container">
      <div className="theme-editor-page" style={previewStyle}>
        <section className="theme-editor-panel theme-editor-header">
          <div>
            <h1>Theme Editor</h1>
            <p>
              Tune multiple theme colors at once with HSB sliders, preview the result, then copy the generated CSS.
            </p>
          </div>
          <div className="theme-editor-header-controls">
            <label className="theme-editor-theme-select">
              <span>Generate CSS for theme</span>
              <select value={targetTheme} onChange={(event) => setTargetTheme(event.target.value)}>
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="theme-editor-reset-all" onClick={handleResetAll}>
              Reset All to Current Theme
            </button>
          </div>
        </section>

        <div className="theme-editor-layout">
          <section className="theme-editor-panel theme-editor-controls">
            <h2>Color Controls</h2>
            <p className="theme-editor-subtext">Each row is independent so you can tune several colors in one pass.</p>

            <div className="theme-editor-control-list">
              {COLOR_FIELDS.map(({ cssVar, label }) => {
                const currentHex = normalizeHex(editedColors[cssVar]) || FALLBACK_COLOR;
                const hsb = rgbToHsb(hexToRgb(currentHex));
                const fieldChanged =
                  normalizeHexForCompare(currentHex) !== normalizeHexForCompare(baseColors[cssVar]);
                const visibleHex = draftHex[cssVar] ?? currentHex;

                return (
                  <article key={cssVar} className="theme-editor-control-row">
                    <div className="theme-editor-control-header">
                      <div className="theme-editor-control-title">
                        <span className="theme-editor-swatch" style={{ backgroundColor: currentHex }} />
                        <div>
                          <h3>{label}</h3>
                          <code>{cssVar}</code>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="theme-editor-reset-button"
                        onClick={() => handleResetColor(cssVar)}
                        disabled={!fieldChanged}
                      >
                        Reset
                      </button>
                    </div>

                    <div className="theme-editor-hex-row">
                      <label>
                        <span>Hex</span>
                        <input
                          type="text"
                          value={visibleHex}
                          onChange={(event) => handleHexDraftChange(cssVar, event.target.value)}
                          onBlur={() => commitHexDraft(cssVar)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            commitHexDraft(cssVar);
                            event.currentTarget.blur();
                          }}
                          spellCheck="false"
                          autoCapitalize="off"
                          autoComplete="off"
                        />
                      </label>
                    </div>

                    <div className="theme-editor-slider-grid">
                      <label>
                        <span>Hue: {hsb.h}</span>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={hsb.h}
                          onChange={(event) => handleSliderChange(cssVar, 'h', event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Saturation: {hsb.s}%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={hsb.s}
                          onChange={(event) => handleSliderChange(cssVar, 's', event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Brightness: {hsb.b}%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={hsb.b}
                          onChange={(event) => handleSliderChange(cssVar, 'b', event.target.value)}
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="theme-editor-panel theme-editor-output">
            <h2>Generated CSS</h2>
            <p className="theme-editor-subtext">
              {changedFields.length} variable{changedFields.length === 1 ? '' : 's'} changed.
            </p>
            <textarea value={cssOutput} readOnly rows={Math.max(10, changedFields.length + 5)} />
            <button type="button" className="theme-editor-copy-button" onClick={handleCopyCss}>
              {copied ? 'Copied' : 'Copy CSS'}
            </button>
          </aside>
        </div>

        <section className="theme-editor-panel theme-editor-demo">
          <h2>Live Demo</h2>
          <p className="theme-editor-subtext">These sample elements are tied to the same CSS variables you are editing.</p>
          <div className="theme-editor-demo-grid">
            <article className="theme-editor-demo-card">
              <h3>Panel Surface</h3>
              <p>Body copy using <code>--text-color</code> and muted copy using <code>--text-muted-color</code>.</p>
              <p className="theme-editor-demo-muted">This line mirrors secondary text contrast.</p>
            </article>
            <article className="theme-editor-demo-card">
              <h3>Buttons and Badges</h3>
              <div className="theme-editor-demo-actions">
                <button type="button" className="theme-editor-demo-button theme-editor-demo-button-primary">
                  Accent Action
                </button>
                <button type="button" className="theme-editor-demo-button theme-editor-demo-button-neutral">
                  Neutral Action
                </button>
              </div>
              <div className="theme-editor-demo-tags">
                <span className="theme-editor-tag accent">Accent</span>
                <span className="theme-editor-tag cyan">Cyan</span>
                <span className="theme-editor-tag green">Green</span>
                <span className="theme-editor-tag pink">Pink</span>
                <span className="theme-editor-tag blue">Blue</span>
                <span className="theme-editor-tag yellow">Yellow</span>
              </div>
            </article>
            <article className="theme-editor-demo-card">
              <h3>State List</h3>
              <ul>
                <li>Border tone preview on list separators.</li>
                <li>Card hover tone preview on raised surfaces.</li>
                <li>Background depth check for readable layering.</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ThemeEditorPage;
