import React, { useState, useMemo, useEffect, useContext } from 'react';
import SongCard from './components/SongCard.jsx';
import { loadDanData } from './utils/course-loader.js';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { storage } from './utils/remoteStorage.js';
import './App.css';
import './components/SongCard.css';

const DanSection = ({ danCourse, playMode, setSelectedGame, resetFilters }) => {
  const { scores } = useScores();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return JSON.parse(storage.getItem(`dan-header-collapsed-${danCourse.name}`)) || false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    storage.setItem(`dan-header-collapsed-${danCourse.name}`, JSON.stringify(isCollapsed));
  }, [isCollapsed, danCourse.name]);

  return (
    <section className="dan-section">
      <h2 className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: danCourse.color }}>
        {danCourse.name}
        <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
          <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
        </button>
      </h2>
      {!isCollapsed && (
        <div className="dan-song-grid song-grid">
          {danCourse.songs.map((song, index) => {
            const chartKey = `${song.title.toLowerCase()}-${song.difficulty.toLowerCase()}`;
            const score = scores[song.mode]?.[chartKey]?.score;
            return (
              <SongCard
                key={`${danCourse.name}-${song.title}-${index}`}
                song={song}
                playMode={playMode}
                setSelectedGame={setSelectedGame}
                resetFilters={resetFilters}
                score={score}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

const FilterBar = ({ activeDan, setDan, danLevels }) => (
    <div className="filter-bar">
        <div className="filter-group">
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

const DanPage = ({ activeDan, setActiveDan, setSelectedGame }) => {
  const [danCourses, setDanCourses] = useState({ single: [], double: [] });
  const [isLoading, setIsLoading] = useState(true);
  const { playStyle, setPlayStyle } = useContext(SettingsContext);
  const { resetFilters } = useFilters();

  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoading(true);
      const courseData = await loadDanData();
      if (courseData) {
        setDanCourses(courseData);
      }
      setIsLoading(false);
    };
    fetchCourses();
  }, []);

  const coursesToShow = useMemo(() => {
    const courses = danCourses[playStyle] || [];
    if (activeDan === 'All') return courses;
    return courses.filter(course => course.name === activeDan);
  }, [playStyle, activeDan, danCourses]);
  
  const danLevels = useMemo(() => (danCourses[playStyle] || []).map(d => d.name), [playStyle, danCourses]);

  useEffect(() => {
    setActiveDan('All');
  }, [playStyle, setActiveDan]);

  return (
    <>
      
      <div className="app-container">
        <main>
          <FilterBar 
            activeMode={playStyle}
            setMode={setPlayStyle}
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
                  playMode={playStyle}
                  setSelectedGame={setSelectedGame}
                  resetFilters={resetFilters}
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
