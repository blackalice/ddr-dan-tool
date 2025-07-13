import React, { useState, useEffect, useMemo } from 'react';
import SongCard from './components/SongCard.jsx';
import { loadCourseData } from './utils/course-loader.js';
import './App.css';
import './VegaPage.css';

const DanSection = ({ danCourse, setSelectedGame }) => {
    const songGridClasses = `song-grid ${
        danCourse.songs.length === 3 ? 'three-items' : ''
    } ${danCourse.songs.length === 1 ? 'one-item' : ''}`;

    return (
        <section className="dan-section">
            <h2 className="dan-header" style={{ backgroundColor: danCourse.color }}>
                {danCourse.name}
            </h2>
            <div className={songGridClasses}>
                {danCourse.songs.map((song, index) => (
                    <SongCard key={`${danCourse.name}-${song.title}-${index}`} song={song} setSelectedGame={setSelectedGame} />
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
  const [vegaCourses, setVegaCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      setIsLoading(true);
      const courseData = await loadCourseData();
      if (courseData && courseData.vega) {
        setVegaCourses(courseData.vega);
      }
      setIsLoading(false);
    };
    fetchCourses();
  }, []);

  const coursesToShow = useMemo(() => {
    if (activeVegaCourse === 'All') return vegaCourses;
    return vegaCourses.filter(course => course.name.startsWith(activeVegaCourse));
  }, [vegaCourses, activeVegaCourse]);

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
