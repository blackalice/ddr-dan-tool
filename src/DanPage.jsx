import React, { useState, useMemo, useEffect, useContext } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import SongCard from './components/SongCard.jsx';
import { loadDanData } from './utils/course-loader.js';
import { resolveScore } from './utils/scoreKey.js';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { storage } from './utils/remoteStorage.js';
import { normalizeString } from './utils/stringSimilarity.js';
import './App.css';
import './components/SongCard.css';
import { shouldHighlightScore } from './utils/scoreHighlight.js';

const DanSection = ({ danCourse, danVersion, playMode, setSelectedGame, resetFilters, titleLookup }) => {
  const { scores } = useScores();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const keyNew = `collapsed:dan:${danVersion}:${danCourse.name}`;
      const keyOld = `dan-header-collapsed-${danVersion}-${danCourse.name}`;
      const vNew = storage.getItem(keyNew);
      const vOld = storage.getItem(keyOld);
      const parsed = vNew != null ? JSON.parse(vNew) : (vOld != null ? JSON.parse(vOld) : false);
      return !!parsed;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const keyNew = `collapsed:dan:${danVersion}:${danCourse.name}`;
    const keyOld = `dan-header-collapsed-${danVersion}-${danCourse.name}`; // legacy
    storage.setItem(keyNew, JSON.stringify(isCollapsed));
    storage.setItem(keyOld, JSON.stringify(isCollapsed));
  }, [isCollapsed, danCourse.name, danVersion]);

  return (
    <section className="dan-section">
      <h2 className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: danCourse.color }}>
        {danCourse.name}
        <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
          <FontAwesomeIcon icon={isCollapsed ? faChevronDown : faChevronUp} />
        </button>
      </h2>
      {!isCollapsed && (
        <div className={`dan-song-grid song-grid${danVersion === 'WORLD' ? ' world-dan-song-grid' : ''}`}>
          {danCourse.songs.map((song, index) => {
            const hit = resolveScore(scores, song.mode, {
              chartId: song.chartId,
              songId: song.songId,
              title: song.title,
              artist: song.artist,
              difficulty: song.difficulty,
            });
            const score = hit?.score;
            const scoreHighlight = shouldHighlightScore(score);
            const lamp = hit?.lamp;
            const matchedMeta = titleLookup.get(normalizeString(song.title)) || null;
            const songWithMeta = matchedMeta
              ? {
                  ...song,
                  path: matchedMeta.path || song.path,
                  songId: song.songId || matchedMeta.id,
                  jacket: song.jacket || matchedMeta.jacket,
                  titleTranslit: song.titleTranslit || matchedMeta.titleTranslit || undefined,
                }
              : song;
            const songForCard = lamp ? { ...songWithMeta, lamp } : songWithMeta;
            return (
              <SongCard
                key={`${danVersion}-${danCourse.name}-${song.chartId || `${song.title}-${index}`}`}
                song={songForCard}
                playMode={playMode}
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

const FilterBar = ({ activeVersion, setVersion, activeDan, setDan, danLevels }) => (
    <div className="filter-bar">
        <div className="filter-group">
            <div className="dan-select-wrapper">
                <select
                    value={activeVersion}
                    onChange={(e) => setVersion(e.target.value)}
                    className="dan-select"
                    aria-label="Dan course version"
                >
                    <option value="WORLD">DDR WORLD</option>
                    <option value="A3">DDR A3</option>
                    <option value="A20 Plus">DDR A20 PLUS</option>
                    <option value="A20">DDR A20</option>
                </select>
            </div>
            <div className="dan-select-wrapper">
                <select
                    value={activeDan}
                    onChange={(e) => setDan(e.target.value)}
                    className="dan-select"
                    aria-label="Dan level"
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

const DanPage = ({ smData, activeDan, setActiveDan, setSelectedGame }) => {
  const [danCourses, setDanCourses] = useState({ A20: { single: [], double: [] }, 'A20 Plus': { single: [], double: [] }, A3: { single: [], double: [] }, WORLD: { single: [], double: [] } });
  const [activeVersion, setActiveVersion] = useState(() => storage.getItem('dan:version') || 'WORLD');
  const [isLoading, setIsLoading] = useState(true);
  const { playStyle } = useContext(SettingsContext);
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
    const courses = danCourses[activeVersion]?.[playStyle] || [];
    if (activeDan === 'All') return courses;
    return courses.filter(course => course.name === activeDan);
  }, [playStyle, activeDan, activeVersion, danCourses]);
  
  const danLevels = useMemo(() => (danCourses[activeVersion]?.[playStyle] || []).map(d => d.name), [activeVersion, playStyle, danCourses]);

  useEffect(() => {
    setActiveDan('All');
  }, [playStyle, activeVersion, setActiveDan]);

  useEffect(() => {
    storage.setItem('dan:version', activeVersion);
  }, [activeVersion]);

  const titleLookup = useMemo(() => {
    const map = new Map();
    for (const f of smData.files || []) {
      if (f.title) map.set(normalizeString(f.title), f);
      if (f.titleTranslit) map.set(normalizeString(f.titleTranslit), f);
    }
    return map;
  }, [smData.files]);

  return (
    <>
      
      <div className="app-container">
        <main>
          <FilterBar 
            activeVersion={activeVersion}
            setVersion={setActiveVersion}
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
                  key={`${activeVersion}:${course.name}`}
                  danCourse={course}
                  danVersion={activeVersion}
                  playMode={playStyle}
                  setSelectedGame={setSelectedGame}
                  resetFilters={resetFilters}
                  titleLookup={titleLookup}
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
