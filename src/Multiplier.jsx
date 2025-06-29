import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './Multiplier.css';

const multipliers = [
  ...Array.from({ length: 16 }, (_, i) => 0.25 + i * 0.25), // 0.25 to 4.0 in 0.25 steps
  ...Array.from({ length: 8 }, (_, i) => 4.5 + i * 0.5),   // 4.5 to 8.0 in 0.5 steps
];

function Multiplier({ targetBPM, setTargetBPM }) {
  const [songBPM, setSongBPM] = useState(150);

  const calculation = useMemo(() => {
    const numericTarget = Number(targetBPM) || 0;
    const numericSongBPM = Number(songBPM) || 0;
    
    if (numericSongBPM === 0) return { modifier: 'N/A', speed: 'N/A' };

    const idealMultiplier = numericTarget / numericSongBPM;
    const closestMultiplier = multipliers.reduce((prev, curr) => 
      Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
    );

    const speed = (numericSongBPM * closestMultiplier).toFixed(0);

    return {
      modifier: closestMultiplier,
      speed: speed,
    };
  }, [songBPM, targetBPM]);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <h1>
            Multiplier <span>Calculator</span>
          </h1>
          <nav>
            <Link to="/" className="nav-link">Return to Dan Courses</Link>
          </nav>
        </div>
      </header>
      <main>
        <div className="multiplier-content">
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
            <p className="modifier">{calculation.modifier}x</p>
            <p className="speed">~{calculation.speed} scroll speed</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Multiplier;