import React, { useState, useMemo, useContext } from 'react';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import './Multiplier.css';

function Multiplier() {
  const { targetBPM, setTargetBPM, multipliers } = useContext(SettingsContext);
  const [songBPM, setSongBPM] = useState(150);
  const [showAlternative, setShowAlternative] = useState(false);

  const calculation = useMemo(() => {
    const numericTarget = Number(targetBPM) || 0;
    const numericSongBPM = Number(songBPM) || 0;
    
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
  }, [songBPM, targetBPM, multipliers]);

  const currentDisplay = calculation ? (showAlternative && calculation.alternative ? calculation.alternative : calculation.primary) : { modifier: 'N/A', speed: 'N/A' };

  return (
    <main className="app-container">
        <div className="multiplier-content">
          <div className="multiplier-inner-container">
            <div className="input-group">
              <label htmlFor="targetBPM">Your Target Scroll Speed</label>
              <input
                id="targetBPM"
                type="number"
                value={targetBPM}
                onChange={(e) => setTargetBPM(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="bpm-input"
                placeholder="e.g. 300"
              />
            </div>
            <div className="input-group">
              <label htmlFor="songBPM">Song BPM</label>
              <input
                id="songBPM"
                type="number"
                value={songBPM}
                onChange={(e) => setSongBPM(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="bpm-input"
                placeholder="e.g. 150"
              />
            </div>
            <div className="result">
              <h2>Recommended Multiplier</h2>
              <p className="modifier">{currentDisplay.modifier}x</p>
              <p className="speed">{currentDisplay.speed} scroll speed</p>
              {calculation && calculation.alternative && (
                <button 
                  className={`toggle-button ${showAlternative && calculation.alternative ? (calculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`}
                  onClick={() => setShowAlternative(!showAlternative)}
                >
                  <i className={`fa-solid ${calculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
  );
}

export default Multiplier;
