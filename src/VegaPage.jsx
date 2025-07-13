import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import './App.css';
import './VegaPage.css';

// --- Data Structure ---
const vegaData = [
  {
    dan: "LIGHT COURSE",
    color: "#46aadc",
    songs: [
      { title: "Din Don Dan", level: 10, bpm: "175", difficulty: "difficult" },
      { title: "虹色", level: 11, bpm: "160", difficulty: "expert" },
      { title: "HAPPY☆ANGEL", level: 12, bpm: "180", difficulty: "expert" },
    ],
  },
  {
    dan: "HEAVY COURSE",
    color: "#e6413a",
    songs: [
      { title: "Romancing Layer", level: 14, bpm: "175", difficulty: "expert" },
      { title: "Debug Dance", level: 15, bpm: "155", difficulty: "expert" },
      { title: "GROOVE 04", level: 16, bpm: "170", difficulty: "expert" },
    ],
  },
  {
    dan: "EXTRA CHALLENGE",
    color: "#c846a6",
    songs: [
      { title: "MAX 360", level: 18, bpm: "360", difficulty: "challenge" },
    ],
  },
];

const difficultyMap = {
    basic: { name: "BSP", color: "#f8d45a", textColor: "#000000" },
    difficult: { name: "DSP", color: "#d4504e", textColor: "#ffffff" },
    expert: { name: "ESP", color: "#6fbe44", textColor: "#ffffff" },
    challenge: { name: "CSP", color: "#c846a6", textColor: "#ffffff" },
};

const getBpmRange = (bpm) => {
  if (typeof bpm !== 'string') return { min: 0, max: 0 };
  const parts = bpm.split('-').map(Number);
  if (parts.length === 1) {
    return { min: parts[0], max: parts[0] };
  }
  return { min: Math.min(...parts), max: Math.max(...parts) };
};

const SongCard = ({ song, setSelectedGame }) => {
  const { targetBPM, multipliers } = useContext(SettingsContext);
  const navigate = useNavigate();

  const calculation = useMemo(() => {
    const numericTarget = Number(targetBPM) || 0;
    const bpmRange = getBpmRange(song.bpm);
    
    if (bpmRange.max === 0) return { modifier: 'N/A', minSpeed: 'N/A', maxSpeed: 'N/A', isRange: false };

    const idealMultiplier = numericTarget / bpmRange.max;
    const closestMultiplier = multipliers.reduce((prev, curr) => 
      Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
    );

    const minSpeed = (bpmRange.min * closestMultiplier).toFixed(0);
    const maxSpeed = (bpmRange.max * closestMultiplier).toFixed(0);

    return {
      modifier: closestMultiplier,
      minSpeed: minSpeed,
      maxSpeed: maxSpeed,
      isRange: bpmRange.min !== bpmRange.max
    };
  }, [song.bpm, targetBPM, multipliers]);

  const difficultyInfo = difficultyMap[song.difficulty];

  return (
    <div className="song-card-link" onClick={() => {
      setSelectedGame('all');
      navigate(`/bpm?difficulty=${song.difficulty}#${encodeURIComponent(song.title)}`);
    }}>
      <div className="song-card">
        <div className="song-card-header">
          <h3 className="song-title">{song.title}</h3>
          {song.game && <div className="game-chip">{song.game}</div>}
        </div>
        <div className="song-details">
          <div>
            <span className="song-bpm">BPM: {song.bpm}</span>
            <div className="song-calculation">
              <span className="song-speed">
                {calculation.isRange ? `${calculation.minSpeed}-${calculation.maxSpeed}` : calculation.maxSpeed}
              </span>
              <span className="song-separator">@</span>
              <span className="song-modifier">{calculation.modifier}x</span>
            </div>
          </div>
          <div className="song-level-container">
              <span className="song-level">Lv.{song.level}</span>
              {difficultyInfo && (
                   <span 
                      className="difficulty-badge"
                      style={{ backgroundColor: difficultyInfo.color, color: difficultyInfo.textColor }}
                  >
                      {difficultyInfo.name}
                  </span>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};


const DanSection = ({ danCourse, setSelectedGame }) => {
    const songGridClasses = `song-grid ${
        danCourse.songs.length === 3 ? 'three-items' : ''
    } ${danCourse.songs.length === 1 ? 'one-item' : ''}`;

    return (
        <section className="dan-section">
            <h2 className="dan-header" style={{ backgroundColor: danCourse.color }}>
                {danCourse.dan}
            </h2>
            <div className={songGridClasses}>
                {danCourse.songs.map((song) => (
                    <SongCard key={`${danCourse.dan}-${song.title}`} song={song} setSelectedGame={setSelectedGame} />
                ))}
            </div>
        </section>
    );
};

const VegaPage = ({ setSelectedGame }) => {
  const [smData, setSmData] = useState({ files: [] });

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  const coursesToShow = useMemo(() => {
    if (smData.files.length === 0) return vegaData;

    return vegaData.map(course => ({
      ...course,
      songs: course.songs.map(song => {
        const file = smData.files.find(f => f.title.toLowerCase() === song.title.toLowerCase());
        const game = file ? file.path.split('/')[1] : null;
        return { ...song, game };
      })
    }));
  }, [smData]);

  return (
    <>
      
      <div className="app-container">
        <main>
            <h1 style={{textAlign: 'center', marginTop: '1rem'}}>DDR A3 July 2025 Rankings</h1>
          
          {coursesToShow.length > 0 ? (
             coursesToShow.map((course) => (
                <DanSection 
                  key={course.dan} 
                  danCourse={course} 
                  setSelectedGame={setSelectedGame}
                />
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: 'var(--text-muted-color)' }}>No courses found for this filter.</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default VegaPage;