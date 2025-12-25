import React, { useState, useMemo, useContext, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faArrowUp, faDeleteLeft } from '@fortawesome/free-solid-svg-icons';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import './Multiplier.css';

function Multiplier() {
  const { targetBPM, multipliers } = useContext(SettingsContext);
  const [targetInput, setTargetInput] = useState(() => String(targetBPM ?? ''));
  const [songInput, setSongInput] = useState('150');
  const [activeField, setActiveField] = useState('song');
  const [showAlternative, setShowAlternative] = useState(false);

  useEffect(() => {
    if (targetBPM === undefined || targetBPM === null) return;
    setTargetInput(String(targetBPM));
  }, [targetBPM]);

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
                <label htmlFor="targetBPM">Your Target Scroll Speed</label>
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
          </div>
        </div>
      </main>
  );
}

export default Multiplier;
