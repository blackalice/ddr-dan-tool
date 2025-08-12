import React, { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVideo } from '@fortawesome/free-solid-svg-icons';
import SongCard from './components/SongCard.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { loadVegaData, loadVegaResults } from './utils/course-loader.js';
import './App.css';
import './VegaPage.css';

const DanSection = ({ danCourse, setSelectedGame, resetFilters }) => {
    const { scores } = useScores();
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(`dan-header-collapsed-${danCourse.name}`)) || false;
        } catch {
            return false;
        }
    });

    useEffect(() => {
        localStorage.setItem(`dan-header-collapsed-${danCourse.name}`, JSON.stringify(isCollapsed));
    }, [isCollapsed, danCourse.name]);

    const songGridClasses = `song-grid ${
        danCourse.songs.length === 3 ? 'three-items' : ''
    } ${danCourse.songs.length === 1 ? 'one-item' : ''}`;

    return (
        <section className="dan-section">
            <h2 className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: danCourse.color }}>
                {danCourse.name}
                <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
                  <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
                </button>
            </h2>
            {!isCollapsed && (
              <div className={songGridClasses}>
                  {danCourse.songs.map((song, index) => {
                      const chartKey = `${song.title.toLowerCase()}-${song.difficulty.toLowerCase()}`;
                      const score = scores[song.mode]?.[chartKey]?.score;
                      return (
                          <SongCard
                              key={`${danCourse.name}-${song.title}-${index}`}
                              song={song}
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

const FilterBar = ({ activeCourse, setCourse, courseLevels, selectedMonth, setSelectedMonth, availableMonths }) => (
    <div className="filter-bar">
        <div className="filter-group">
            <h2 className="target-bpm-label vega-header-title">VEGA London DDR Rankings</h2>
            <div className="dan-select-wrapper vega-header-selector">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="dan-select"
                    >
                        {availableMonths.map(month => (
                            <option key={month} value={month}>{new Date(month).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</option>
                        ))}
                    </select>
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
    </div>
);

const ResultsSection = ({ results, selectedMonth }) => {
    if (!results || Object.keys(results).length === 0) return null;
    const monthLabel = new Date(selectedMonth).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
    return (
        <section className="results-section">
            <h2 className="results-header">Ranking Results – {monthLabel}</h2>
            <div className="results-container">
                {Object.entries(results).map(([category, data]) => (
                    <div key={category} className="results-category">
                        <h3>
                            {category}
                            {data.video && (
                                <a href={data.video} target="_blank" rel="noopener noreferrer" className="results-video-link">
                                    <FontAwesomeIcon icon={faVideo} />
                                </a>
                            )}
                        </h3>
                        <ol>
                            {data.results.map((entry) => (
                                <li key={entry.position}>
                                    <span className="result-name">{entry.position}. {entry.name}</span>
                                    <span className="result-score">{entry.score}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                ))}
            </div>
        </section>
    );
};

const VegaPage = ({ activeVegaCourse, setActiveVegaCourse, setSelectedGame }) => {
  const [vegaData, setVegaData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [vegaResults, setVegaResults] = useState({});
  const { resetFilters } = useFilters();

  const availableMonths = useMemo(() => {
    const courseMonths = Object.keys(vegaData);
    const resultMonths = Object.keys(vegaResults);
    const months = [...new Set([...courseMonths, ...resultMonths])];
    return months.sort((a, b) => new Date(b) - new Date(a));
  }, [vegaData, vegaResults]);

  useEffect(() => {
    if (availableMonths.length > 0) {
      const latest = availableMonths[0];
      if (!selectedMonth || new Date(selectedMonth) < new Date(latest)) {
        setSelectedMonth(latest);
      }
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoading(true);
      const courseData = await loadVegaData();
      if (courseData) {
        setVegaData(courseData);
        const latestMonth = Object.keys(courseData).sort((a, b) => new Date(b) - new Date(a))[0];
        if (latestMonth) {
            setSelectedMonth(latestMonth);
        }
      }
      setIsLoading(false);
    };
    const fetchResults = async () => {
      const resultsData = await loadVegaResults();
      if (resultsData) {
        setVegaResults(resultsData);
      }
    };
    fetchCourses();
    fetchResults();
  }, []);

  const coursesToShow = useMemo(() => {
    const coursesForMonth = vegaData[selectedMonth] || [];
    if (activeVegaCourse === 'All') return coursesForMonth;
    return coursesForMonth.filter(course => course.name.startsWith(activeVegaCourse));
  }, [vegaData, selectedMonth, activeVegaCourse]);

  const courseLevels = useMemo(() => ["LIGHT", "HEAVY", "EXTRA"], []);

  return (
    <>
      <div className="app-container">
        <main>
            <FilterBar
                activeCourse={activeVegaCourse}
                setCourse={setActiveVegaCourse}
                courseLevels={courseLevels}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                availableMonths={availableMonths}
            />

          <ResultsSection results={vegaResults[selectedMonth]} selectedMonth={selectedMonth} />

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: 'var(--text-muted-color)' }}>Loading courses...</p>
            </div>
          ) : coursesToShow.length > 0 ? (
             coursesToShow.map((course) => (
                <DanSection
                  key={course.name}
                  danCourse={course}
                  setSelectedGame={setSelectedGame}
                  resetFilters={resetFilters}
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
      <div className="mobile-record-buttons">
        <a href="https://close.your.3y3s.net/export/replay-ddr-01-main" target="_blank" rel="noopener noreferrer" className="record-button">
            <FontAwesomeIcon icon={faVideo} /> Upstairs
        </a>
        <a href="https://close.your.3y3s.net/export/replay-ddr-02-main" target="_blank" rel="noopener noreferrer" className="record-button">
            <FontAwesomeIcon icon={faVideo} /> Downstairs
        </a>
      </div>
    </>
  );
}

export default VegaPage;
