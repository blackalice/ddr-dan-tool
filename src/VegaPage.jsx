import React, { useState, useEffect, useMemo } from 'react';
import SongCard from './components/SongCard.jsx';
import './App.css';
import './VegaPage.css';

// --- Data Structure ---
const vegaData = [
  {
    dan: "LIGHT COURSE",
    color: "#46aadc",
    songs: [
      { title: "Din Don Dan", level: 10, bpm: "140", difficulty: "expert" },
      { title: "虹色", level: 11, bpm: "160", difficulty: "expert" },
      { title: "HAPPY☆ANGEL", level: 12, bpm: "180", difficulty: "expert" },
    ],
  },
  {
    dan: "HEAVY COURSE",
    color: "#e6413a",
    songs: [
      { title: "Romancing Layer", level: 14, bpm: "150", difficulty: "expert" },
      { title: "Debug Dance", level: 15, bpm: "151", difficulty: "expert" },
      { title: "GROOVE 04", level: 16, bpm: "155", difficulty: "expert" },
    ],
  },
  {
    dan: "EXTRA CHALLENGE",
    color: "#c846a6",
    songs: [
      { title: "MAX 360", level: 18, bpm: "180-720", difficulty: "challenge" },
    ],
  },
];

const difficultyMap = {
    basic: { name: "BSP", color: "#f8d45a", textColor: "#000000" },
    difficult: { name: "DSP", color: "#d4504e", textColor: "#ffffff" },
    expert: { name: "ESP", color: "#6fbe44", textColor: "#ffffff" },
    challenge: { name: "CSP", color: "#c846a6", textColor: "#ffffff" },
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

const FilterBar = ({ activeCourse, setCourse, courseLevels }) => (
    <div className="filter-bar">
        <div className="filter-group">
            <h2 className="target-bpm-label vega-header-title">VEGA London DDR July 2025 Rankings</h2>
            <div className="dan-select-wrapper vega-header-selector">
                <select
                    value={activeCourse}
                    onChange={(e) => setCourse(e.target.value)}
                    className="dan-select"
                >
                    <option value="All">All Courses</option>
                    {courseLevels.map(course => (
                        <option key={course} value={course}>{course}</option>
                    ))}
                </select>
            </div>
        </div>
    </div>
);

const VegaPage = ({ activeVegaCourse, setActiveVegaCourse, setSelectedGame }) => {
  const [smData, setSmData] = useState({ files: [] });

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  const coursesToShow = useMemo(() => {
    let courses = vegaData.map(course => ({
      ...course,
      songs: course.songs.map(song => {
        const file = smData.files.find(f => f.title.toLowerCase() === song.title.toLowerCase());
        const game = file ? file.path.split('/')[1] : null;
        return { ...song, game };
      })
    }));

    if (activeVegaCourse !== 'All') {
      courses = courses.filter(course => course.dan.startsWith(activeVegaCourse));
    }
    
    return courses;
  }, [smData, activeVegaCourse]);

  const courseLevels = useMemo(() => ["LIGHT", "HEAVY", "EXTRA"], []);

  return (
    <>
      
      <div className="app-container">
        <main>
            <FilterBar
                activeCourse={activeVegaCourse}
                setCourse={setActiveVegaCourse}
                courseLevels={courseLevels}
            />
          
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
            <div className="vega-footer">
                <a href="https://close.your.3y3s.net" target="_blank" rel="noopener noreferrer" className="vega-button">
                    CLOSE.YOUR.3Y3S.NET
                </a>
            </div>
        </main>
      </div>
    </>
  );
}

export default VegaPage;
