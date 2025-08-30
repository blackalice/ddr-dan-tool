import React, { useState, useEffect, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Multiplier from './Multiplier';
import BPMTool from './BPMTool';
import Tabs from './Tabs';
import Settings from './Settings';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { ScoresProvider } from './contexts/ScoresContext.jsx';
import { FilterProvider, useFilters } from './contexts/FilterContext.jsx';
import { GroupsProvider } from './contexts/GroupsContext.jsx';
import { findSongByTitle, loadSimfileData } from './utils/simfile-loader.js';
import DanPage from './DanPage.jsx';
import VegaPage from './VegaPage.jsx';
import ListsPage from './ListsPage.jsx';
import RankingsPage from './RankingsPage.jsx';
import './App.css';
import './Tabs.css';
import { storage } from './utils/remoteStorage.js';
import LoginPage from './LoginPage.jsx';
import SignupPage from './SignupPage.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';

function AppRoutes() {
  const { theme, showLists, setPlayStyle, songlistOverride, playStyle } = useContext(SettingsContext);
  const { user } = useAuth();
  const [smData, setSmData] = useState({ games: [], files: [] });
  const [simfileData, setSimfileData] = useState(null);
  const [currentChart, setCurrentChart] = useState(null);
  const [selectedGame, setSelectedGame] = useState('all');
  const [activeDan, setActiveDan] = useState(() => storage.getItem('activeDan') || 'All');
  const [activeVegaCourse, setActiveVegaCourse] = useState(() => storage.getItem('activeVegaCourse') || 'All');
  const [view, setView] = useState('bpm');

  const { resetFilters } = useFilters();
  const firstOverride = useRef(true);
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  useEffect(() => {
    const loadDataFromUrl = async () => {
      const hash = location.hash;
      if (!hash) {
        setSimfileData(null);
        setCurrentChart(null);
        return;
      };

      const songTitle = decodeURIComponent(hash.substring(1));
      
      const queryParams = new URLSearchParams(location.search);
      const difficulty = queryParams.get('difficulty');
      const mode = queryParams.get('mode');

      if (mode === 'single' || mode === 'double') {
        setPlayStyle(mode);
      }

      if (simfileData && simfileData.title.titleName.toLowerCase() === songTitle.toLowerCase()) {
        // If song is the same, check if we need to update the chart
        if (currentChart && difficulty && mode && (currentChart.difficulty.toLowerCase() !== difficulty.toLowerCase() || currentChart.mode.toLowerCase() !== mode.toLowerCase())) {
            const chartToSelect = simfileData.availableTypes.find(c => c.difficulty.toLowerCase() === difficulty.toLowerCase() && c.mode.toLowerCase() === mode.toLowerCase());
            if (chartToSelect) {
                setCurrentChart(chartToSelect);
                if (chartToSelect.mode) {
                  setPlayStyle(chartToSelect.mode);
                }
            }
        }
        return;
      }

      const songFile = await findSongByTitle(songTitle);
      if (songFile) {
        const data = await loadSimfileData(songFile);
        setSimfileData(data);

        if (data && data.availableTypes.length > 0) {
          let chartToSelect = null;
          if (difficulty && mode) {
            chartToSelect = data.availableTypes.find(c => c.difficulty.toLowerCase() === difficulty.toLowerCase() && c.mode.toLowerCase() === mode.toLowerCase());
          }
          
          if (!chartToSelect) {
            const defaultDifficultyOrder = ['Expert', 'Hard', 'Heavy', 'Challenge', 'Difficult', 'Standard', 'Medium', 'Basic', 'Easy', 'Light', 'Beginner'];
            // Prioritize current play style
            const preferredCharts = data.availableTypes.filter(c => c.mode === (mode || playStyle));
            const otherCharts = data.availableTypes.filter(c => c.mode !== (mode || playStyle));

            for (const d of defaultDifficultyOrder) {
                chartToSelect = preferredCharts.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
                if (chartToSelect) break;
            }
            if (!chartToSelect) {
                for (const d of defaultDifficultyOrder) {
                    chartToSelect = otherCharts.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
                    if (chartToSelect) break;
                }
            }
            if (!chartToSelect) {
                chartToSelect = data.availableTypes[0];
            }
          }
          setCurrentChart(chartToSelect);
          if (chartToSelect && chartToSelect.mode) {
            setPlayStyle(chartToSelect.mode);
          }
        }
      }
    };
    
    if (smData.files.length > 0) {
      loadDataFromUrl();
    }
  }, [location.hash, location.search, smData]);

  const handleSongSelect = (song) => {
    if (song) {
      navigate(`/bpm#${encodeURIComponent(song.title)}`);
    } else {
      // Only adjust the URL if we're already on the BPM view; otherwise leave the current route unchanged
      if (location.pathname.startsWith('/bpm')) {
        navigate('/bpm');
      }
    }
  };

  useEffect(() => {
    if (firstOverride.current) {
      firstOverride.current = false;
      return;
    }
    resetFilters();
    // Avoid forcing a redirect to /bpm when the user is elsewhere; just clear selection if on the BPM page
    if (location.pathname.startsWith('/bpm')) {
      handleSongSelect(null);
    }
  }, [songlistOverride]);

  const handleChartSelect = (chart) => {
    setCurrentChart(chart);
    if (chart && chart.mode) {
      setPlayStyle(chart.mode);
    }
    const queryParams = new URLSearchParams(location.search);
    queryParams.set('difficulty', chart.difficulty);
    queryParams.set('mode', chart.mode);
    navigate(`${location.pathname}?${queryParams.toString()}${location.hash}`);
  };

  useEffect(() => { storage.setItem('activeDan', activeDan); }, [activeDan]);
  useEffect(() => { storage.setItem('activeVegaCourse', activeVegaCourse); }, [activeVegaCourse]);

  return (
    <div data-theme={theme}>
                <Tabs />

      <div className="app-container">
        <div className="app-content">
          <Routes>
            <Route path="/dan" element={<DanPage activeDan={activeDan} setActiveDan={setActiveDan} setSelectedGame={setSelectedGame} />} />
            <Route path="/vega" element={<VegaPage activeVegaCourse={activeVegaCourse} setActiveVegaCourse={setActiveVegaCourse} setSelectedGame={setSelectedGame} />} />
          <Route path="/multiplier" element={<Multiplier />} />
          <Route path="/rankings" element={<RankingsPage />} />
          {showLists && <Route path="/lists" element={<ListsPage />} />}
          <Route path="/" element={<Navigate to="/bpm" replace />} />
            <Route path="/bpm" element={<BPMTool smData={smData} simfileData={simfileData} currentChart={currentChart} setCurrentChart={handleChartSelect} onSongSelect={handleSongSelect} selectedGame={selectedGame} setSelectedGame={setSelectedGame} view={view} setView={setView} />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />
          </Routes>
        </div>
        <footer className="footer">
            <p>Built by <a className="footer-link" href="https://stua.rtfoy.co.uk">stu :)</a> • Inspired by the work of <a className="footer-link" href="https://halninethousand.neocities.org/">hal nine thousand</a> </p>
        </footer>
      </div>
    </div>
  );
}

function AppWrapper() {
  return (
    <SettingsProvider>
      <ScoresProvider>
        <FilterProvider>
          <GroupsProvider>
            <Router>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </Router>
          </GroupsProvider>
        </FilterProvider>
      </ScoresProvider>
    </SettingsProvider>
  );
}

export default AppWrapper;

