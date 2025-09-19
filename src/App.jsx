import React, { useState, useEffect, useContext, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import Tabs from './Tabs';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { ScoresProvider } from './contexts/ScoresContext.jsx';
import { FilterProvider } from './contexts/FilterContext.jsx';
import { GroupsProvider } from './contexts/GroupsContext.jsx';
import { findSongByTitle, loadSimfileData } from './utils/simfile-loader.js';
import { parseSelection } from './utils/urlState.js';
import { parseChartId } from './utils/chartIds.js';
import DebugOverlay from './components/DebugOverlay.jsx';
import './App.css';
import './Tabs.css';
import { storage } from './utils/remoteStorage.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';

// Route-level code splitting
const Multiplier = lazy(() => import('./Multiplier'));
const BPMTool = lazy(() => import('./BPMTool'));
const Settings = lazy(() => import('./Settings'));
const DanPage = lazy(() => import('./DanPage.jsx'));
const VegaPage = lazy(() => import('./VegaPage.jsx'));
const ListsPage = lazy(() => import('./ListsPage.jsx'));
const StatsPage = lazy(() => import('./StatsPage.jsx'));
const RankingsPage = lazy(() => import('./RankingsPage.jsx'));
const LoginPage = lazy(() => import('./LoginPage.jsx'));
const SignupPage = lazy(() => import('./SignupPage.jsx'));

function AppRoutes() {
  const { theme, setPlayStyle, playStyle } = useContext(SettingsContext);
  const { user } = useAuth();
  const [smData, setSmData] = useState({ games: [], files: [] });
  const [simfileData, setSimfileData] = useState(null);
  const [currentChart, setCurrentChart] = useState(null);
  const [selectedGame, setSelectedGame] = useState('all');
  const [activeDan, setActiveDan] = useState(() => storage.getItem('activeDan') || 'All');
  const [activeVegaCourse, setActiveVegaCourse] = useState(() => storage.getItem('activeVegaCourse') || 'All');
  const [view, setView] = useState('bpm');

  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const debugEnabled = searchParams.get('debug') === '1' || (typeof window !== 'undefined' && window.localStorage.getItem('debugRouting') === '1');

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  useEffect(() => {
    const loadFromUrl = async () => {
      const sel = parseSelection({ search: location.search, hash: location.hash });
      // New format: ?song=<songId>&chart=<chartId>
      if (sel.songId) {
        const songFile = smData.files.find(f => f.id === sel.songId || f.path === sel.songId) || null;
        if (!songFile) {
          setSimfileData(null); setCurrentChart(null);
          return;
        }
        const data = await loadSimfileData(songFile);
        setSimfileData(data);
        let chart = null;
        if (sel.chartId) {
          chart = data.availableTypes.find(c => c.slug === sel.chartId) || null;
          if (!chart) {
            const parsedChart = parseChartId(sel.chartId);
            if (parsedChart?.mode && parsedChart?.difficulty) {
              const slug = [parsedChart.mode, parsedChart.difficulty].filter(Boolean).join('-');
              chart = data.availableTypes.find(c => c.slug === slug) || null;
            }
          }
        }
        if (!chart) {
          // choose default chart in current playStyle
          const defaultOrder = ['Expert', 'Hard', 'Heavy', 'Challenge', 'Difficult', 'Standard', 'Medium', 'Basic', 'Easy', 'Light', 'Beginner'];
          const preferred = data.availableTypes.filter(c => c.mode === playStyle);
          const fallback = data.availableTypes.filter(c => c.mode !== playStyle);
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
        if (chart?.mode && chart.mode !== playStyle) {
          setPlayStyle(chart.mode);
        }
        // Ensure URL reflects selected chart (replace to avoid history spam)
        const curSong = searchParams.get('song');
        const curChart = searchParams.get('chart');
        const hasLegacyParams = searchParams.has('s') || searchParams.has('c') || searchParams.has('m');
        const identifier = songFile.id || songFile.path;
        if (identifier && chart?.slug && (curSong !== identifier || curChart !== chart.slug || hasLegacyParams)) {
          const next = new URLSearchParams(searchParams);
          next.set('song', identifier);
          next.set('chart', chart.slug);
          next.delete('s');
          next.delete('c');
          next.delete('m');
          if (debugEnabled) { try { console.log('[Route] replace song/chart ->', next.toString()); } catch { /* noop */ } }
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
        if (chart?.mode && chart.mode !== playStyle) {
          setPlayStyle(chart.mode);
        }
        // Upgrade legacy to new search params (clear legacy keys)
        const next = new URLSearchParams(searchParams);
        const identifier = songFile.id || songFile.path;
        if (identifier) next.set('song', identifier);
        if (chart?.slug) next.set('chart', chart.slug);
        next.delete('s');
        next.delete('c');
        next.delete('m');
        next.delete('difficulty');
        next.delete('mode');
        next.delete('t');
        if (debugEnabled) { try { console.log('[Route] upgrade legacy ->', next.toString()); } catch { /* noop */ } }
        setSearchParams(next, { replace: true });
      } else {
        // No selection in URL
        setSimfileData(null); setCurrentChart(null);
      }
    };
    if (smData.files.length > 0) loadFromUrl();
  }, [location.search, location.hash, smData, playStyle, searchParams, setPlayStyle, setSearchParams, debugEnabled]);

  const handleSongSelect = useCallback((song) => {
    if (song) {
      const songId = song.id || song.songId || song.value || song.path || null;
      if (songId) {
        const next = new URLSearchParams(searchParams);
        next.set('song', songId);
        next.delete('chart'); // let the effect pick default chart for new song
        next.delete('s');
        next.delete('c');
        next.delete('m');
        setSearchParams(next);
      }
    } else if (location.pathname.startsWith('/bpm')) {
      const next = new URLSearchParams(searchParams);
      next.delete('song'); next.delete('chart');
      next.delete('s');
      next.delete('c');
      next.delete('m');
      setSearchParams(next);
    }
  }, [searchParams, setSearchParams, location.pathname]);

  // Avoid modifying the URL or selection when songlistOverride changes to prevent flicker.

  const handleChartSelect = useCallback((chart) => {
    setCurrentChart(chart);
    if (chart && chart.mode) {
      setPlayStyle(chart.mode);
    }
    const songId = simfileData?.songId || simfileData?.path || simfileData?.filePath || searchParams.get('song') || null;
    if (songId && chart?.slug) {
      const next = new URLSearchParams(searchParams);
      next.set('song', songId);
      next.set('chart', chart.slug);
      next.delete('s');
      next.delete('c');
      next.delete('m');
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
        }} />
        <div className="app-content">
          <Suspense fallback={<div className="app-loading">Loading…</div>}>
          <Routes>
            <Route path="/dan" element={<DanPage smData={smData} activeDan={activeDan} setActiveDan={setActiveDan} setSelectedGame={setSelectedGame} />} />
            <Route path="/vega" element={<VegaPage smData={smData} activeVegaCourse={activeVegaCourse} setActiveVegaCourse={setActiveVegaCourse} setSelectedGame={setSelectedGame} />} />
            <Route path="/multiplier" element={<Multiplier />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            {user && <Route path="/lists" element={<ListsPage />} />}
            <Route path="/" element={<Navigate to="/bpm" replace />} />
            <Route path="/bpm" element={<BPMTool smData={smData} simfileData={simfileData} currentChart={currentChart} setCurrentChart={handleChartSelect} onSongSelect={handleSongSelect} selectedGame={selectedGame} setSelectedGame={setSelectedGame} view={view} setView={setView} />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />
          </Routes>
          </Suspense>
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

