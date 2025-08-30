import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import Multiplier from './Multiplier';
import BPMTool from './BPMTool';
import Tabs from './Tabs';
import Settings from './Settings';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { ScoresProvider } from './contexts/ScoresContext.jsx';
import { FilterProvider, useFilters } from './contexts/FilterContext.jsx';
import { GroupsProvider } from './contexts/GroupsContext.jsx';
import { findSongByTitle, loadSimfileData } from './utils/simfile-loader.js';
import { parseSelection, buildBpmUrl, replaceLegacyUrl } from './utils/urlState.js';
import DebugOverlay from './components/DebugOverlay.jsx';
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
  const { theme, setPlayStyle, songlistOverride, playStyle } = useContext(SettingsContext);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const debugEnabled = searchParams.get('debug') === '1' || (typeof window !== 'undefined' && window.localStorage.getItem('debugRouting') === '1');
  const [lastAction, setLastAction] = useState('');

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  useEffect(() => {
    const loadFromUrl = async () => {
      const sel = parseSelection({ search: location.search, hash: location.hash });
      // New format: ?s=<songId>&c=<chartId>&m=<mode>
      if (sel.mode) setPlayStyle(sel.mode);
      if (sel.songId) {
        const songFile = smData.files.find(f => f.path === sel.songId) || null;
        if (!songFile) {
          setSimfileData(null); setCurrentChart(null);
          return;
        }
        const data = await loadSimfileData(songFile);
        setSimfileData(data);
        let chart = null;
        if (sel.chartId) {
          chart = data.availableTypes.find(c => c.slug === sel.chartId) || null;
        }
        if (!chart) {
          // choose default chart in current playStyle
          const defaultOrder = ['Expert', 'Hard', 'Heavy', 'Challenge', 'Difficult', 'Standard', 'Medium', 'Basic', 'Easy', 'Light', 'Beginner'];
          const preferred = data.availableTypes.filter(c => c.mode === (sel.mode || playStyle));
          const fallback = data.availableTypes.filter(c => c.mode !== (sel.mode || playStyle));
          for (const d of defaultOrder) {
            chart = preferred.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
            if (chart) break;
          }
          if (!chart) {
            for (const d of defaultOrder) {
              chart = fallback.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
              if (chart) break;
            }
          }
          if (!chart) chart = data.availableTypes[0];
        }
        setCurrentChart(chart);
        // Ensure URL reflects selected chart (replace to avoid history spam)
        const curS = searchParams.get('s');
        const curC = searchParams.get('c');
        const curM = searchParams.get('m');
        if (songFile.path && chart?.slug && (curS !== songFile.path || curC !== chart.slug || curM !== chart.mode)) {
          const next = new URLSearchParams(searchParams);
          next.set('s', songFile.path);
          next.set('c', chart.slug);
          next.set('m', chart.mode);
          if (debugEnabled) { try { console.log('[Route] replace s/c/m ->', next.toString()); } catch {} }
          setSearchParams(next, { replace: true });
        }
        return;
      }

      // Legacy format: #<title> or ?t=<title> with optional ?mode=&difficulty=
      if (sel.legacy && sel.legacy.title) {
        const songFile = await findSongByTitle(sel.legacy.title);
        if (!songFile) { setSimfileData(null); setCurrentChart(null); return; }
        const data = await loadSimfileData(songFile);
        setSimfileData(data);
        let chart = null;
        if (sel.legacy.difficulty && sel.legacy.mode) {
          chart = data.availableTypes.find(c => c.difficulty.toLowerCase() === sel.legacy.difficulty.toLowerCase() && c.mode.toLowerCase() === sel.legacy.mode.toLowerCase()) || null;
        }
        if (!chart && data.availableTypes.length) chart = data.availableTypes[0];
        setCurrentChart(chart);
        // Upgrade legacy to new search params (clear legacy keys)
        const next = new URLSearchParams(searchParams);
        next.set('s', songFile.path);
        if (chart?.slug) next.set('c', chart.slug);
        if (chart?.mode) next.set('m', chart.mode);
        next.delete('difficulty');
        next.delete('mode');
        next.delete('t');
        if (debugEnabled) { try { console.log('[Route] upgrade legacy ->', next.toString()); } catch {} }
        setSearchParams(next, { replace: true });
      } else {
        // No selection in URL
        setSimfileData(null); setCurrentChart(null);
      }
    };
    if (smData.files.length > 0) loadFromUrl();
  }, [location.search, location.hash, smData]);

  const handleSongSelect = useCallback((song) => {
    if (song) {
      const songId = song.path || song.value || null;
      const mode = playStyle; // keep current mode for now
      if (songId) {
        const next = new URLSearchParams(searchParams);
        next.set('s', songId);
        next.delete('c'); // let the effect pick default chart for new song
        next.set('m', mode);
        setSearchParams(next);
      }
    } else if (location.pathname.startsWith('/bpm')) {
      const next = new URLSearchParams(searchParams);
      next.delete('s'); next.delete('c');
      setSearchParams(next);
    }
  }, [searchParams, setSearchParams, playStyle, location.pathname]);

  // Avoid modifying the URL or selection when songlistOverride changes to prevent flicker.

  const handleChartSelect = useCallback((chart) => {
    setCurrentChart(chart);
    if (chart && chart.mode) {
      setPlayStyle(chart.mode);
    }
    const songId = simfileData?.path || simfileData?.filePath || searchParams.get('s') || null;
    if (songId && chart?.slug) {
      const next = new URLSearchParams(searchParams);
      next.set('s', songId);
      next.set('c', chart.slug);
      next.set('m', chart.mode);
      setSearchParams(next);
    }
  }, [setPlayStyle, simfileData, searchParams, setSearchParams]);

  useEffect(() => { storage.setItem('activeDan', activeDan); }, [activeDan]);
  useEffect(() => { storage.setItem('activeVegaCourse', activeVegaCourse); }, [activeVegaCourse]);

  return (
    <div data-theme={theme}>
                <Tabs />

      <div className="app-container">
        <DebugOverlay info={{
          enabled: debugEnabled,
          search: location.search,
          hash: location.hash,
          sel: parseSelection({ search: location.search, hash: location.hash }),
          filesCount: smData.files?.length || 0,
          simfilePath: simfileData?.path,
          simfileTitle: simfileData?.title?.titleName,
          chartSlug: currentChart?.slug,
          chartMode: currentChart?.mode,
          chartDiff: currentChart?.difficulty,
          playStyle,
          lastAction,
        }} />
        <div className="app-content">
          <Routes>
            <Route path="/dan" element={<DanPage smData={smData} activeDan={activeDan} setActiveDan={setActiveDan} setSelectedGame={setSelectedGame} />} />
            <Route path="/vega" element={<VegaPage smData={smData} activeVegaCourse={activeVegaCourse} setActiveVegaCourse={setActiveVegaCourse} setSelectedGame={setSelectedGame} />} />
          <Route path="/multiplier" element={<Multiplier />} />
          <Route path="/rankings" element={<RankingsPage />} />
          {user && <Route path="/lists" element={<ListsPage />} />}
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

