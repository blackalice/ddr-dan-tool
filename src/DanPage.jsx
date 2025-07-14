import React, { useState, useMemo, useEffect } from 'react';
import SongCard from './components/SongCard.jsx';
import { loadCourseData } from './utils/course-loader.js';
import './App.css';
import './components/SongCard.css';

const DanSection = ({ danCourse, playMode, setSelectedGame }) => (
  <section className="dan-section">
    <h2 className="dan-header" style={{ backgroundColor: danCourse.color }}>
      {danCourse.name}
    </h2>
    <div className="song-grid">
      {danCourse.songs.map((song, index) => (
        <SongCard key={`${danCourse.name}-${song.title}-${index}`} song={song} playMode={playMode} setSelectedGame={setSelectedGame} />
      ))}
    </div>
  </section>
);

const FilterBar = ({ activeMode, setMode, activeDan, setDan, danLevels }) => (
  <div className="filter-bar">
    <div className="filter-group">
      <div className="play-mode-toggle dan-toggle">
        <button
          onClick={() => setMode('single')}
          className={activeMode === 'single' ? 'active' : ''}
        >
          Single
        </button>
        <button
          onClick={() => setMode('double')}
          className={activeMode === 'double' ? 'active' : ''}
        >
          Double
        </button>
      </div>

      <div className="dan-select-wrapper">
         <select
            value={activeDan}
            onChange={(e) => setDan(e.target.value)}
            className="dan-select"
        >
            <option value="All">All Dan Levels</option>
            {danLevels.map(dan => (
                <option key={dan} value={dan}>{dan}</option>
            ))}
        </select>
      </div>
    </div>
  </div>
);

const DanPage = ({ playMode, setPlayMode, activeDan, setActiveDan, setSelectedGame }) => {
  const [danCourses, setDanCourses] = useState({ single: [], double: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoading(true);
      const courseData = await loadCourseData();
      if (courseData && courseData.dan) {
        setDanCourses(courseData.dan);
      }
      setIsLoading(false);
    };
    fetchCourses();
  }, []);

  const coursesToShow = useMemo(() => {
    const courses = danCourses[playMode] || [];
    if (activeDan === 'All') return courses;
    return courses.filter(course => course.name === activeDan);
  }, [playMode, activeDan, danCourses]);
  
  const danLevels = useMemo(() => (danCourses[playMode] || []).map(d => d.name), [playMode, danCourses]);

  return (
    <>
      
      <div className="app-container">
        <main>
          <FilterBar 
            activeMode={playMode} 
            setMode={(mode) => {
              setPlayMode(mode);
              setActiveDan('All');
            }}
            activeDan={activeDan}
            setDan={setActiveDan}
            danLevels={danLevels}
          />
          
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: 'var(--text-muted-color)' }}>Loading courses...</p>
            </div>
          ) : coursesToShow.length > 0 ? (
             coursesToShow.map((course) => (
                <DanSection 
                  key={course.name} 
                  danCourse={course} 
                  playMode={playMode}
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

export default DanPage;