import React, { useState, useEffect, useContext, useCallback, useMemo, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useSearchParams, Navigate, useNavigate } from 'react-router-dom';
import Tabs from './Tabs';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { ScoresProvider } from './contexts/ScoresContext.jsx';
import { FilterProvider } from './contexts/FilterContext.jsx';
import { GroupsProvider } from './contexts/GroupsContext.jsx';
import { findSongByTitle, loadSimfileData } from './utils/simfile-loader.js';
import { applyWorldNewChallengeChartsToSimfile } from './utils/worldNewChallengeCharts.js';
import { parseSelection } from './utils/urlState.js';
import { parseChartId } from './utils/chartIds.js';
import DebugOverlay from './components/DebugOverlay.jsx';
// import SyncBanner from './components/SyncBanner.jsx';
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
const CoursesPage = lazy(() => import('./CoursesPage.jsx'));
const ListsPage = lazy(() => import('./ListsPage.jsx'));
const StatsPage = lazy(() => import('./StatsPage.jsx'));
const RankingsPage = lazy(() => import('./RankingsPage.jsx'));
const CardDrawPage = lazy(() => import('./CardDrawPage.jsx'));
const LoginPage = lazy(() => import('./LoginPage.jsx'));
const SignupPage = lazy(() => import('./SignupPage.jsx'));

function AppRoutes() {
  const { theme, setPlayStyle, playStyle, worldRemoveChallengeCharts } = useContext(SettingsContext);
  const { user } = useAuth();
  const [smData, setSmData] = useState({ games: [], files: [] });
  const [rawSimfileData, setRawSimfileData] = useState(null);
  const simfileData = useMemo(
    () => applyWorldNewChallengeChartsToSimfile(rawSimfileData, !worldRemoveChallengeCharts),
    [rawSimfileData, worldRemoveChallengeCharts],
  );
  const [currentChart, setCurrentChart] = useState(null);
  const [selectedGame, setSelectedGame] = useState('all');
  const [activeDan, setActiveDan] = useState(() => storage.getItem('activeDan') || 'All');
  const [activeVegaCourse, setActiveVegaCourse] = useState(() => storage.getItem('activeVegaCourse') || 'All');
  const [view, setView] = useState('bpm');
  const previousLocationRef = React.useRef('');
  const debugChartSelection = typeof window !== 'undefined'
    && window.localStorage?.getItem('debugChartSelection') === '1';

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const debugEnabled = searchParams.get('debug') === '1' || (typeof window !== 'undefined' && window.localStorage.getItem('debugRouting') === '1');
  const hideFooterOnMobile = location.pathname.startsWith('/multiplier');

  const pickChartForPlayStyle = useCallback((availableTypes, style) => {
    if (!Array.isArray(availableTypes) || availableTypes.length === 0) return null;
    const defaultOrder = ['Expert', 'Hard', 'Heavy', 'Challenge', 'Difficult', 'Standard', 'Medium', 'Basic', 'Easy', 'Light', 'Beginner'];
    const preferred = availableTypes.filter(c => c.mode === style);
    const fallback = availableTypes.filter(c => c.mode !== style);
    for (const d of defaultOrder) {
      const match = preferred.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
      if (match) return match;
    }
    for (const d of defaultOrder) {
      const match = fallback.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
      if (match) return match;
    }
    return availableTypes[0] || null;
  }, []);

  // Scores availability is handled within pages (e.g., StatsPage)

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  useEffect(() => {
    const locationKey = `${location.pathname}${location.search}${location.hash}`;
    const locationChanged = previousLocationRef.current !== locationKey;
    previousLocationRef.current = locationKey;
    const loadFromUrl = async () => {
      const sel = parseSelection({ search: location.search, hash: location.hash });
      if (debugChartSelection) {
        console.debug('[Route] parseSelection', {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          sel,
          filesCount: smData.files.length,
        });
      }
      // New format: ?song=<songId>&chart=<chartId>
      if (sel.songId) {
        const songFile = smData.files.find(f => f.id === sel.songId || f.path === sel.songId) || null;
        if (debugChartSelection) {
          console.debug('[Route] resolve song', {
            songId: sel.songId,
            found: Boolean(songFile),
            fileId: songFile?.id,
            filePath: songFile?.path,
          });
        }
        if (!songFile) {
          setRawSimfileData(null); setCurrentChart(null);
          return;
        }
        const data = await loadSimfileData(songFile);
        const filteredData = applyWorldNewChallengeChartsToSimfile(data, !worldRemoveChallengeCharts);
        if (debugChartSelection) {
          console.debug('[Route] loaded simfile', {
            title: data?.title?.titleName,
            availableTypes: filteredData?.availableTypes?.map(t => t.slug),
          });
        }
        setRawSimfileData(data);
        let chart = null;
        if (sel.chartId) {
          chart = filteredData.availableTypes.find(c => c.slug === sel.chartId) || null;
          if (!chart) {
            const parsedChart = parseChartId(sel.chartId);
            if (parsedChart?.mode && parsedChart?.difficulty) {
              const slug = [parsedChart.mode, parsedChart.difficulty].filter(Boolean).join('-');
              chart = filteredData.availableTypes.find(c => c.slug === slug) || null;
            }
          }
          if (debugChartSelection && !chart) {
            console.debug('[Route] chart not found in song', {
              chartId: sel.chartId,
              parsed: parseChartId(sel.chartId),
            });
          }
        }
        if (!chart) {
          chart = pickChartForPlayStyle(filteredData.availableTypes, playStyle);
        }
        if (debugChartSelection) {
          console.debug('[Route] picked chart', {
            chartSlug: chart?.slug,
            chartMode: chart?.mode,
            playStyle,
          });
        }
        if (chart?.mode && chart.mode !== playStyle) {
          if (locationChanged) {
            setPlayStyle(chart.mode);
          } else {
            const preferredChart = pickChartForPlayStyle(filteredData.availableTypes, playStyle);
            if (preferredChart) chart = preferredChart;
          }
        }
        setCurrentChart(chart);
        const identifier = songFile.id || songFile.path || sel.songId || data?.songId || '';
        if (identifier) {
          storage.setItem('bpmSelectedSong', identifier);
        }
        storage.setItem('bpmSelectedChart', chart?.slug || '');
        // Ensure URL reflects selected chart (replace to avoid history spam)
        const curSong = searchParams.get('song');
        const curChart = searchParams.get('chart');
        const hasLegacyParams = searchParams.has('s') || searchParams.has('c') || searchParams.has('m');
        if (identifier && chart?.slug && (curSong !== identifier || curChart !== chart.slug || hasLegacyParams)) {
          const next = new URLSearchParams(searchParams);
          next.set('song', identifier);
          next.set('chart', chart.slug);
          next.delete('s');
          next.delete('c');
          next.delete('m');
          const nextQuery = next.toString();
          if (debugEnabled) { try { console.log('[Route] replace song/chart ->', nextQuery); } catch { /* noop */ } }
          // If arriving on root, also ensure pathname is /bpm so the view loads
          if (location.pathname === '/') {
            navigate(`/bpm${nextQuery ? `?${nextQuery}` : ''}`, { replace: true });
          } else {
            setSearchParams(next, { replace: true });
          }
        }
        return;
      }

      // Legacy format: #<title> or ?t=<title> with optional ?mode=&difficulty=
      if (sel.legacy && sel.legacy.title) {
        const songFile = await findSongByTitle(sel.legacy.title);
        if (!songFile) { setRawSimfileData(null); setCurrentChart(null); return; }
        const data = await loadSimfileData(songFile);
        const filteredData = applyWorldNewChallengeChartsToSimfile(data, !worldRemoveChallengeCharts);
        setRawSimfileData(data);
        let chart = null;
        if (sel.legacy.difficulty && sel.legacy.mode) {
          chart = filteredData.availableTypes.find(c => c.difficulty.toLowerCase() === sel.legacy.difficulty.toLowerCase() && c.mode.toLowerCase() === sel.legacy.mode.toLowerCase()) || null;
        }
        if (!chart) {
          chart = pickChartForPlayStyle(filteredData.availableTypes, playStyle);
        }
        if (chart?.mode && chart.mode !== playStyle) {
          if (locationChanged) {
            setPlayStyle(chart.mode);
          } else {
            const preferredChart = pickChartForPlayStyle(filteredData.availableTypes, playStyle);
            if (preferredChart) chart = preferredChart;
          }
        }
        setCurrentChart(chart);
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
        const legacyQuery = next.toString();
        if (debugEnabled) { try { console.log('[Route] upgrade legacy ->', legacyQuery); } catch { /* noop */ } }
        if (location.pathname === '/') {
          navigate(`/bpm${legacyQuery ? `?${legacyQuery}` : ''}`, { replace: true });
        } else {
          setSearchParams(next, { replace: true });
        }
      } else {
        const storedSongId = storage.getItem('bpmSelectedSong');
        const storedChartSlug = storage.getItem('bpmSelectedChart');
        const hasStoredSong = !!(storedSongId && smData.files.some(f => f.id === storedSongId || f.path === storedSongId));
        if (hasStoredSong) {
          const next = new URLSearchParams(searchParams);
          next.set('song', storedSongId);
          if (storedChartSlug) {
            next.set('chart', storedChartSlug);
          } else {
            next.delete('chart');
          }
          next.delete('s');
          next.delete('c');
          next.delete('m');
          const restoredQuery = next.toString();
          if (debugEnabled) { try { console.log('[Route] restore stored selection ->', restoredQuery); } catch { /* noop */ } }
          if (location.pathname === '/') {
            navigate(`/bpm${restoredQuery ? `?${restoredQuery}` : ''}`, { replace: true });
          } else {
            setSearchParams(next, { replace: true });
          }
        } else {
          setRawSimfileData(null); setCurrentChart(null);
          if (storedSongId || storedChartSlug) {
            storage.setItem('bpmSelectedSong', '');
            storage.setItem('bpmSelectedChart', '');
          }
        }
      }
    };
    if (smData.files.length > 0) loadFromUrl();
  }, [location.search, location.hash, location.pathname, smData, playStyle, searchParams, setPlayStyle, setSearchParams, debugEnabled, navigate, pickChartForPlayStyle, worldRemoveChallengeCharts]);

  useEffect(() => {
    if (!simfileData) {
      if (currentChart) setCurrentChart(null);
      return;
    }
    if (!Array.isArray(simfileData.availableTypes)) return;
    if (!currentChart) {
      const next = pickChartForPlayStyle(simfileData.availableTypes, playStyle);
      if (next) setCurrentChart(next);
      return;
    }
    const match = simfileData.availableTypes.find(c => c.slug === currentChart.slug) || null;
    if (!match) {
      if (debugChartSelection) {
        console.debug('[Route] current chart missing, picking fallback', {
          currentSlug: currentChart?.slug,
          available: simfileData.availableTypes.map(c => c.slug),
        });
      }
      const next = pickChartForPlayStyle(simfileData.availableTypes, playStyle);
      setCurrentChart(next);
      return;
    }
    if (match !== currentChart) setCurrentChart(match);
  }, [simfileData, currentChart, playStyle, pickChartForPlayStyle]);

  const handleSongSelect = useCallback((song) => {
    if (debugChartSelection) {
      console.debug('[Route] handleSongSelect', {
        song,
        currentPath: location.pathname,
        currentSearch: location.search,
      });
    }
    if (song) {
      const songId = song.id || song.songId || song.value || song.path || null;
      if (songId) {
        storage.setItem('bpmSelectedSong', songId);
        storage.setItem('bpmSelectedChart', '');
        const next = new URLSearchParams(searchParams);
        next.set('song', songId);
        next.delete('chart'); // let the effect pick default chart for new song
        next.delete('s');
        next.delete('c');
        next.delete('m');
        setSearchParams(next);
      }
    } else if (location.pathname.startsWith('/bpm')) {
      storage.setItem('bpmSelectedSong', '');
      storage.setItem('bpmSelectedChart', '');
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
    if (debugChartSelection) {
      console.debug('[Route] handleChartSelect', {
        chartSlug: chart?.slug,
        chartMode: chart?.mode,
        chartDifficulty: chart?.difficulty,
      });
    }
    const songIdFromUrl = searchParams.get('song');
    const songIdCandidates = [simfileData?.songId, simfileData?.path, simfileData?.filePath].filter(Boolean);
    const matchesUrl = !songIdFromUrl || songIdCandidates.includes(songIdFromUrl);
    if (!matchesUrl) {
      if (debugChartSelection) {
        console.debug('[Route] skip chart select (song mismatch)', {
          songIdFromUrl,
          songIdCandidates,
          chartSlug: chart?.slug,
        });
      }
      return;
    }

    setCurrentChart(chart);
    if (chart && chart.mode) {
      setPlayStyle(chart.mode);
    }
    const songId = songIdFromUrl || songIdCandidates[0] || null;
    if (songId) {
      storage.setItem('bpmSelectedSong', songId);
      storage.setItem('bpmSelectedChart', chart?.slug || '');
    }
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
                {/* <SyncBanner /> */}
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
            <Route path="/courses" element={<CoursesPage smData={smData} setSelectedGame={setSelectedGame} />} />
            <Route path="/vega" element={<VegaPage smData={smData} activeVegaCourse={activeVegaCourse} setActiveVegaCourse={setActiveVegaCourse} setSelectedGame={setSelectedGame} />} />
            <Route path="/multiplier" element={<Multiplier />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/card-draw" element={<CardDrawPage smData={smData} />} />
            {user && <Route path="/lists" element={<ListsPage />} />}
            <Route path="/" element={<Navigate to="/bpm" replace />} />
            <Route path="/bpm" element={<BPMTool smData={smData} simfileData={simfileData} currentChart={currentChart} setCurrentChart={handleChartSelect} onSongSelect={handleSongSelect} selectedGame={selectedGame} setSelectedGame={setSelectedGame} view={view} setView={setView} />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />
          </Routes>
          </Suspense>
        </div>
        <footer className={`footer${hideFooterOnMobile ? ' footer-hide-mobile' : ''}`}>
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
