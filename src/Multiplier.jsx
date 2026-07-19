import React, { useState, useMemo, useContext, useCallback, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faArrowUp, faDeleteLeft } from '@fortawesome/free-solid-svg-icons';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { MULTIPLIER_MODES } from './utils/multipliers';
import './Multiplier.css';

function Multiplier() {
  const {
    targetBPM,
    multipliers,
    multiplierMode,
    setMultiplierMode,
    showMultiplierIncrementVersion,
  } = useContext(SettingsContext);
  const [targetInput, setTargetInput] = useState(() => String(targetBPM ?? ''));
  const [songInput, setSongInput] = useState('150');
  const [activeField, setActiveField] = useState('song');
  const [showAlternative, setShowAlternative] = useState(false);
  const mobileLockActiveRef = useRef(false);

  useEffect(() => {
    if (targetBPM === undefined || targetBPM === null) return;
    setTargetInput(String(targetBPM));
  }, [targetBPM]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 640px)').matches) return;
    setActiveField('song');
    setSongInput('');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const className = 'multiplier-mobile-lock';
    const root = document.documentElement;
    const body = document.body;
    const media = window.matchMedia('(max-width: 640px)');

    const applyLock = (shouldLock) => {
      if (shouldLock && !mobileLockActiveRef.current) {
        window.scrollTo(0, 0);
      }
      root.classList.toggle(className, shouldLock);
      body.classList.toggle(className, shouldLock);
      mobileLockActiveRef.current = shouldLock;
    };

    applyLock(media.matches);

    const handleChange = (event) => applyLock(event.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
    } else {
      media.addListener(handleChange);
    }

    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleChange);
      } else {
        media.removeListener(handleChange);
      }
      applyLock(false);
    };
  }, []);

  const sanitizeInput = useCallback((value) => value.replace(/[^\d]/g, ''), []);

  const updateTargetInput = useCallback(
    (value) => {
      const sanitized = sanitizeInput(value);
      setTargetInput(sanitized);
    },
    [sanitizeInput],
  );

  const updateSongInput = useCallback(
    (value) => {
      const sanitized = sanitizeInput(value);
      setSongInput(sanitized);
    },
    [sanitizeInput],
  );

  const appendDigit = useCallback(
    (digit) => {
      if (!/^\d$/.test(digit)) return;
      if (activeField === 'target') {
        updateTargetInput((targetInput + digit).slice(0, 4));
      } else {
        updateSongInput((songInput + digit).slice(0, 4));
      }
    },
    [activeField, songInput, targetInput, updateSongInput, updateTargetInput],
  );

  const backspaceDigit = useCallback(() => {
    if (activeField === 'target') {
      updateTargetInput(targetInput.slice(0, -1));
    } else {
      updateSongInput(songInput.slice(0, -1));
    }
  }, [activeField, songInput, targetInput, updateSongInput, updateTargetInput]);

  const clearInput = useCallback(() => {
    if (activeField === 'target') {
      updateTargetInput('');
    } else {
      updateSongInput('');
    }
  }, [activeField, updateSongInput, updateTargetInput]);

  const calculation = useMemo(() => {
    const numericTarget = Number(targetInput) || 0;
    const numericSongBPM = Number(songInput) || 0;
    
    if (numericSongBPM === 0 || numericTarget === 0) return null;

    const idealMultiplier = numericTarget / numericSongBPM;
    
    const closestMultiplier = multipliers.reduce((prev, curr) => 
      Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
    );
    
    const closestIndex = multipliers.indexOf(closestMultiplier);
    const primarySpeed = (numericSongBPM * closestMultiplier).toFixed(0);

    let alternativeMultiplier = null;
    if (primarySpeed > numericTarget) {
      if (closestIndex > 0) {
        alternativeMultiplier = multipliers[closestIndex - 1];
      }
    } else {
      if (closestIndex < multipliers.length - 1) {
        alternativeMultiplier = multipliers[closestIndex + 1];
      }
    }

    const result = {
      primary: {
        modifier: closestMultiplier,
        speed: Math.round(primarySpeed),
      },
      previous: closestIndex > 0 ? {
        modifier: multipliers[closestIndex - 1],
        speed: Math.round(numericSongBPM * multipliers[closestIndex - 1]),
      } : null,
      next: closestIndex < multipliers.length - 1 ? {
        modifier: multipliers[closestIndex + 1],
        speed: Math.round(numericSongBPM * multipliers[closestIndex + 1]),
      } : null,
      alternative: null,
    };

    if (alternativeMultiplier) {
      const alternativeSpeed = (numericSongBPM * alternativeMultiplier);
      result.alternative = {
        modifier: alternativeMultiplier,
        speed: Math.round(alternativeSpeed),
        direction: alternativeSpeed > primarySpeed ? 'up' : 'down',
      };
    }
    
    if (result.alternative && result.primary.speed === result.alternative.speed) {
        result.alternative = null;
    }

    return result;
  }, [songInput, targetInput, multipliers]);

  const currentDisplay = calculation ? (showAlternative && calculation.alternative ? calculation.alternative : calculation.primary) : { modifier: 'N/A', speed: 'N/A' };

  return (
    <main className="app-container multiplier-page">
        <div className="multiplier-content">
          <div className="multiplier-inner-container">
            <div className="multiplier-desktop-inputs">
              <div className="input-group">
                <label htmlFor="targetBPM">Target BPM</label>
                <input
                  id="targetBPM"
                  type="number"
                  value={targetInput}
                  onChange={(e) => updateTargetInput(e.target.value)}
                  className="bpm-input"
                  placeholder="e.g. 300"
                />
              </div>
              <div className="input-group">
                <label htmlFor="songBPM">Song BPM</label>
                <input
                  id="songBPM"
                  type="number"
                  value={songInput}
                  onChange={(e) => updateSongInput(e.target.value)}
                  className="bpm-input"
                  placeholder="e.g. 150"
                />
              </div>
            </div>
            <div className="multiplier-mobile-calc" aria-label="Multiplier keypad">
              <div className="multiplier-display">
                <button
                  type="button"
                  className={`multiplier-display-row${activeField === 'target' ? ' active' : ''}`}
                  onClick={() => setActiveField('target')}
                >
                  <span className="multiplier-display-label">Target Speed</span>
                  <span className="multiplier-display-value">{targetInput || '—'}</span>
                </button>
                <button
                  type="button"
                  className={`multiplier-display-row${activeField === 'song' ? ' active' : ''}`}
                  onClick={() => setActiveField('song')}
                >
                  <span className="multiplier-display-label">Song BPM</span>
                  <span className="multiplier-display-value">{songInput || '—'}</span>
                </button>
              </div>
              <div className="result multiplier-result-compact multiplier-result-mobile">
                <div className="multiplier-result-box">
                  <span className="multiplier-result-label">Recommended Multiplier</span>
                  <div className="multiplier-result-grid">
                    <div className="multiplier-result-calculation">
                      <span className="song-speed">{currentDisplay.speed}</span>
                      <span className="song-separator">@</span>
                      <span className="song-modifier">{currentDisplay.modifier}x</span>
                    </div>
                    {calculation && calculation.alternative && (
                      <button 
                        className={`toggle-button multiplier-result-toggle ${showAlternative && calculation.alternative ? (calculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`}
                        onClick={() => setShowAlternative(!showAlternative)}
                        aria-label="Toggle alternative multiplier"
                      >
                        <FontAwesomeIcon icon={calculation.alternative.direction === 'up' ? faArrowUp : faArrowDown} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {showMultiplierIncrementVersion && (
                <div className="multiplier-result-compact multiplier-mode-compact">
                  <select
                    className="multiplier-mode-select"
                    value={multiplierMode}
                    onChange={(e) => setMultiplierMode(e.target.value)}
                    aria-label="Multiplier increment version"
                  >
                    {Object.values(MULTIPLIER_MODES).map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="multiplier-keypad">
                {['1','2','3','4','5','6','7','8','9'].map((digit) => {
                  const cornerClass = digit === '1'
                    ? ' keypad-corner-tl'
                    : digit === '3'
                      ? ' keypad-corner-tr'
                      : '';
                  return (
                    <button
                      key={digit}
                      type="button"
                      className={`multiplier-keypad-button${cornerClass}`}
                      onClick={() => appendDigit(digit)}
                    >
                      {digit}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="multiplier-keypad-button multiplier-keypad-action keypad-corner-bl"
                  onClick={backspaceDigit}
                  aria-label="Backspace"
                >
                  <FontAwesomeIcon icon={faDeleteLeft} />
                </button>
                <button
                  type="button"
                  className="multiplier-keypad-button"
                  onClick={() => appendDigit('0')}
                >
                  0
                </button>
                <button
                  type="button"
                  className="multiplier-keypad-button multiplier-keypad-action keypad-corner-br"
                  onClick={clearInput}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="result multiplier-result-compact multiplier-result-desktop">
              <span className="multiplier-result-label-desktop">Recommended Multiplier</span>
              <div className="multiplier-desktop-options" aria-live="polite">
                <div className="multiplier-option multiplier-option-secondary">
                  <span className="multiplier-option-label">Lower</span>
                  <strong className="multiplier-option-modifier">
                    {calculation?.previous ? `${calculation.previous.modifier}x` : '—'}
                  </strong>
                  <span className="multiplier-option-speed">
                    {calculation?.previous ? `${calculation.previous.speed} BPM` : 'No lower option'}
                  </span>
                </div>
                <div className="multiplier-option multiplier-option-recommended">
                  <span className="multiplier-option-label">Recommended</span>
                  <strong className="multiplier-option-modifier">
                    {calculation ? `${calculation.primary.modifier}x` : 'N/A'}
                  </strong>
                  <span className="multiplier-option-speed">
                    {calculation ? `${calculation.primary.speed} BPM` : 'Enter a song BPM'}
                  </span>
                </div>
                <div className="multiplier-option multiplier-option-secondary">
                  <span className="multiplier-option-label">Higher</span>
                  <strong className="multiplier-option-modifier">
                    {calculation?.next ? `${calculation.next.modifier}x` : '—'}
                  </strong>
                  <span className="multiplier-option-speed">
                    {calculation?.next ? `${calculation.next.speed} BPM` : 'No higher option'}
                  </span>
                </div>
              </div>
              {showMultiplierIncrementVersion && (
                <div className="multiplier-mode-compact">
                  <select
                    className="multiplier-mode-select"
                    value={multiplierMode}
                    onChange={(e) => setMultiplierMode(e.target.value)}
                    aria-label="Multiplier increment version"
                  >
                    {Object.values(MULTIPLIER_MODES).map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
  );
}

export default Multiplier;
