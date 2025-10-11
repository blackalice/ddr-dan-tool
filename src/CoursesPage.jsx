import React, { useState, useEffect, useMemo, useContext } from 'react';
import SongCard from './components/SongCard.jsx';
import { resolveScore } from './utils/scoreKey.js';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { storage } from './utils/remoteStorage.js';
import { normalizeString } from './utils/stringSimilarity.js';
import './App.css';
import './components/SongCard.css';
import './VegaPage.css';
import { shouldHighlightScore } from './utils/scoreHighlight.js';
import { loadCoursesData } from './utils/course-loader.js';

const CourseSection = ({ course, setSelectedGame, resetFilters, titleToPath }) => {
  const { scores } = useScores();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const key = `collapsed:courses:${course.name}`;
      const v = storage.getItem(key);
      const parsed = v != null ? JSON.parse(v) : false;
      return !!parsed;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const key = `collapsed:courses:${course.name}`;
    storage.setItem(key, JSON.stringify(isCollapsed));
  }, [isCollapsed, course.name]);

  return (
    <section className="dan-section">
      <h2 className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: course.color || '#46aadc' }}>
        {course.name}
        <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
          <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
        </button>
      </h2>
      {!isCollapsed && (
        <div className="dan-song-grid song-grid">
          {course.songs.map((song, index) => {
            const hit = resolveScore(scores, song.mode, {
              chartId: song.chartId,
              songId: song.songId,
              title: song.title,
              artist: song.artist,
              difficulty: song.difficulty,
            });
            const score = hit?.score;
            const lamp = hit?.lamp;
            const scoreHighlight = shouldHighlightScore(score);
            const path = titleToPath.get(normalizeString(song.title)) || null;
            const songWithPath = path ? { ...song, path } : song;
            const songForCard = lamp ? { ...songWithPath, lamp } : songWithPath;
            return (
              <SongCard
                key={`${course.name}-${song.chartId || `${song.title}-${index}`}`}
                song={songForCard}
                setSelectedGame={setSelectedGame}
                resetFilters={resetFilters}
                score={score}
                scoreHighlight={scoreHighlight}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

const FilterBar = ({ activeGame, setGame, gameOptions, activeCourse, setCourse, courseOptions }) => (
  <div className="filter-bar">
    <div className="filter-group">
      <h2 className="target-bpm-label vega-header-title">DDR Courses</h2>
      <div className="dan-select-wrapper vega-header-selector">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={activeGame}
            onChange={(e) => setGame(e.target.value)}
            className="dan-select"
          >
            {gameOptions.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            value={activeCourse}
            onChange={(e) => setCourse(e.target.value)}
            className="dan-select"
          >
            {courseOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  </div>
);

const CoursesPage = ({ smData, setSelectedGame }) => {
  const [coursesByGame, setCoursesByGame] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const { playStyle } = useContext(SettingsContext);
  const { resetFilters } = useFilters();
  const [activeGame, setActiveGame] = useState(() => storage.getItem('courses:game') || '');
  const [activeCourse, setActiveCourse] = useState(() => storage.getItem('courses:course') || 'All');

  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoading(true);
      const data = await loadCoursesData();
      setCoursesByGame(data || {});
      setIsLoading(false);
    };
    fetchCourses();
  }, []);

  const gameOptions = useMemo(() => Object.keys(coursesByGame).sort(), [coursesByGame]);

  // Ensure active game selection
  useEffect(() => {
    if (!activeGame) {
      const first = gameOptions[0] || '';
      if (first) setActiveGame(first);
    } else if (!gameOptions.includes(activeGame) && gameOptions.length > 0) {
      setActiveGame(gameOptions[0]);
    }
  }, [activeGame, gameOptions]);

  const courseOptions = useMemo(() => {
    const list = (coursesByGame[activeGame] || [])
      .filter(c => (c.style || c.songs?.[0]?.mode || playStyle) === playStyle)
      .map(c => c.name);
    const base = (list.length > 0 ? list : (coursesByGame[activeGame] || []).map(c => c.name));
    return ['All', ...base];
  }, [coursesByGame, activeGame, playStyle]);

  // Ensure active course selection
  useEffect(() => {
    if (!activeCourse || !courseOptions.includes(activeCourse)) {
      const first = courseOptions[0] || '';
      if (first) setActiveCourse(first);
    }
  }, [activeCourse, courseOptions]);

  useEffect(() => {
    storage.setItem('courses:game', activeGame || '');
  }, [activeGame]);
  useEffect(() => {
    storage.setItem('courses:course', activeCourse || '');
  }, [activeCourse]);

  const titleToPath = useMemo(() => {
    const map = new Map();
    for (const f of smData.files || []) {
      if (f.title) map.set(normalizeString(f.title), f.path);
      if (f.titleTranslit) map.set(normalizeString(f.titleTranslit), f.path);
    }
    return map;
  }, [smData.files]);

  return (
    <>
      <div className="app-container">
        <main>
          <FilterBar
            activeGame={activeGame}
            setGame={setActiveGame}
            gameOptions={gameOptions}
            activeCourse={activeCourse}
            setCourse={setActiveCourse}
            courseOptions={courseOptions}
          />

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: 'var(--text-muted-color)' }}>Loading courses...</p>
            </div>
          ) : (activeGame && (coursesByGame[activeGame] || []).length > 0) ? (
            (() => {
              const allCourses = (coursesByGame[activeGame] || []).filter(c => (c.style || c.songs?.[0]?.mode || playStyle) === playStyle);
              if (activeCourse === 'All') {
                if (allCourses.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                      <p style={{ color: 'var(--text-muted-color)' }}>No courses found.</p>
                    </div>
                  );
                }
                return allCourses.map(course => (
                  <CourseSection
                    key={`${activeGame}:${course.name}`}
                    course={course}
                    setSelectedGame={setSelectedGame}
                    resetFilters={resetFilters}
                    titleToPath={titleToPath}
                  />
                ));
              }
              const one = allCourses.find(c => c.name === activeCourse) || allCourses[0];
              if (!one) {
                return (
                  <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <p style={{ color: 'var(--text-muted-color)' }}>No courses found.</p>
                  </div>
                );
              }
              return (
                <CourseSection
                  course={one}
                  setSelectedGame={setSelectedGame}
                  resetFilters={resetFilters}
                  titleToPath={titleToPath}
                />
              );
            })()
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

export default CoursesPage;
