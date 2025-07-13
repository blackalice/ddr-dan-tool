import React, { useState, useMemo, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Multiplier from './Multiplier';
import BPMTool from './BPMTool';
import Tabs from './Tabs';
import Settings from './Settings';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { StepchartPage } from './components/StepchartPage';
import { parseSm } from './utils/smParser.js';
import SongPicker from './components/SongPicker.jsx';
import DanPage from './DanPage.jsx';
import VegaPage from './VegaPage.jsx';
import './App.css';
import './Tabs.css';

function AppRoutes({
  playMode, setPlayMode,
  activeDan, setActiveDan,
  activeVegaCourse, setActiveVegaCourse,
  selectedGame, setSelectedGame,
  selectedSong, setSelectedSong,
  smData,
  simfileData,
  songOptions,
  inputValue,
  setInputValue,
  currentChart, setCurrentChart,
}) {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash;
    const queryParams = new URLSearchParams(location.search);
    const difficulty = queryParams.get('difficulty');

    if (hash) {
      const songTitle = decodeURIComponent(hash.substring(1));
      if (songTitle && smData.files.length > 0) {
        const currentSongTitle = selectedSong ? selectedSong.title : null;
        const currentSongTitleTranslit = selectedSong ? selectedSong.titleTranslit : null;

        if (currentSongTitle?.toLowerCase() === songTitle.toLowerCase() || currentSongTitleTranslit?.toLowerCase() === songTitle.toLowerCase()) {
          return; // Already selected
        }

        const matchedSong = smData.files.find(option =>
          option.title.toLowerCase() === songTitle.toLowerCase() ||
          (option.titleTranslit && option.titleTranslit.toLowerCase() === songTitle.toLowerCase())
        );

        if (matchedSong) {
          setSelectedSong({
            value: matchedSong.path,
            label: matchedSong.title,
            title: matchedSong.title,
            titleTranslit: matchedSong.titleTranslit,
            difficulty,
          });
        }
      }
    }
  }, [location.hash, location.search, smData, selectedSong, setSelectedSong]);

  return (
    <Routes>
      <Route path="/dan" element={<DanPage playMode={playMode} setPlayMode={setPlayMode} activeDan={activeDan} setActiveDan={setActiveDan} setSelectedGame={setSelectedGame} />} />
      <Route path="/vega" element={<VegaPage activeVegaCourse={activeVegaCourse} setActiveVegaCourse={setActiveVegaCourse} setSelectedGame={setSelectedGame} />} />
      <Route path="/multiplier" element={<Multiplier />} />
      <Route path="/" element={<BPMTool selectedGame={selectedGame} setSelectedGame={setSelectedGame} selectedSong={selectedSong} setSelectedSong={setSelectedSong} smData={smData} songOptions={songOptions} inputValue={inputValue} setInputValue={setInputValue} simfileData={simfileData} currentChart={currentChart} setCurrentChart={setCurrentChart} />} />
      <Route path="/bpm" element={<BPMTool selectedGame={selectedGame} setSelectedGame={setSelectedGame} selectedSong={selectedSong} setSelectedSong={setSelectedSong} smData={smData} songOptions={songOptions} inputValue={inputValue} setInputValue={setInputValue} simfileData={simfileData} currentChart={currentChart} setCurrentChart={setCurrentChart} />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/stepchart" element={
        <div>
          <SongPicker 
            selectedGame={selectedGame}
            setSelectedGame={setSelectedGame}
            selectedSong={selectedSong}
            setSelectedSong={setSelectedSong}
            smData={smData}
            songOptions={songOptions}
            inputValue={inputValue}
            setInputValue={setInputValue}
          />
          <StepchartPage 
            simfile={simfileData} 
            currentType={currentChart ? currentChart.slug : (simfileData?.availableTypes?.[0]?.slug)}
            setCurrentChart={setCurrentChart}
            selectedGame={selectedGame}
            setSelectedGame={setSelectedGame}
            selectedSong={selectedSong}
            setSelectedSong={setSelectedSong}
            smData={smData}
            songOptions={songOptions}
            inputValue={inputValue}
            setInputValue={setInputValue}
          />
        </div>
      } />
    </Routes>
  );
}

function App() {
  const { theme } = useContext(SettingsContext);
  const [selectedGame, setSelectedGame] = useState('all');
  const [playMode, setPlayMode] = useState(() => {
    return localStorage.getItem('playMode') || 'single';
  });
  const [activeDan, setActiveDan] = useState(() => {
    return localStorage.getItem('activeDan') || 'All';
  });
  const [activeVegaCourse, setActiveVegaCourse] = useState(() => {
    return localStorage.getItem('activeVegaCourse') || 'All';
  });
  const [selectedSong, setSelectedSong] = useState(null);
  const [smData, setSmData] = useState({ games: [], files: [] });
  const [simfileData, setSimfileData] = useState(null);
  const [songOptions, setSongOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [currentChart, setCurrentChart] = useState(null);

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

  useEffect(() => {
    let filteredFiles = smData.files;
    if (selectedGame !== 'all') {
        filteredFiles = smData.files.filter(file => file.path.startsWith(`sm/${selectedGame}/`));
    }
    
    const options = filteredFiles.map(file => ({
        value: file.path,
        label: file.title,
        title: file.title,
        titleTranslit: file.titleTranslit
    }));

    setSongOptions(options);
  }, [selectedGame, smData]);

  useEffect(() => {
    if (selectedSong) {
      setSimfileData(null);
      setCurrentChart(null);
      const filePath = selectedSong.value;

      fetch(encodeURI(filePath))
        .then(response => response.text())
        .then(text => {
          const parsed = parseSm(text);
          const gamePathParts = filePath.split('/');
          const mixName = gamePathParts.length > 1 ? gamePathParts[1] : 'Unknown Mix';
          const simfile = {
            ...parsed,
            title: {
              titleName: parsed.title,
              translitTitleName: parsed.titletranslit,
              titleDir: parsed.title,
              banner: parsed.banner,
            },
            mix: {
              mixName: mixName,
              mixDir: mixName,
            },
          };
          setSimfileData(simfile);

          if (parsed.availableTypes && parsed.availableTypes.length > 0) {
            let chartToSelect = null;
            if (selectedSong.difficulty) {
              chartToSelect = parsed.availableTypes.find(c => c.difficulty.toLowerCase() === selectedSong.difficulty.toLowerCase());
            }
            
            if (chartToSelect) {
              setCurrentChart(chartToSelect);
            } else {
              const defaultDifficultyOrder = ['Expert', 'Hard', 'Heavy', 'Challenge', 'Difficult', 'Standard', 'Medium', 'Basic', 'Easy', 'Light', 'Beginner'];
              let defaultChart = null;
              for (const d of defaultDifficultyOrder) {
                  defaultChart = parsed.availableTypes.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
                  if (defaultChart) break;
              }
              if (!defaultChart) {
                  defaultChart = parsed.availableTypes[0];
              }
              setCurrentChart(defaultChart);
            }
          }
        })
        .catch(error => console.error('Error fetching sm file:', error));
    } else {
        setSimfileData(null);
        setCurrentChart(null);
    }
  }, [selectedSong]);

  useEffect(() => {
    localStorage.setItem('playMode', playMode);
  }, [playMode]);

  useEffect(() => {
    localStorage.setItem('activeDan', activeDan);
  }, [activeDan]);

  useEffect(() => {
    localStorage.setItem('activeVegaCourse', activeVegaCourse);
  }, [activeVegaCourse]);

  return (
    <div data-theme={theme}>
      <Router>
        <div className="app-container">
          <div className="app-content">
            <Tabs />
            <AppRoutes
              playMode={playMode} setPlayMode={setPlayMode}
              activeDan={activeDan} setActiveDan={setActiveDan}
              activeVegaCourse={activeVegaCourse} setActiveVegaCourse={setActiveVegaCourse}
              selectedGame={selectedGame} setSelectedGame={setSelectedGame}
              selectedSong={selectedSong} setSelectedSong={setSelectedSong}
              smData={smData}
              simfileData={simfileData}
              songOptions={songOptions}
              inputValue={inputValue}
              setInputValue={setInputValue}
              currentChart={currentChart}
              setCurrentChart={setCurrentChart}
            />
          </div>
          <footer className="footer">
              <p>Built by <a className="footer-link" href="https://stua.rtfoy.co.uk">stu :)</a> • Inspired by the work of <a className="footer-link" href="https://halninethousand.neocities.org/">hal nine thousand</a> </p>
          </footer>
        </div>
      </Router>
    </div>
  );
}

function AppWrapper() {
  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}

export default AppWrapper;
