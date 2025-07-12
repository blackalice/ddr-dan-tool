import React, { useState, useMemo, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Multiplier from './Multiplier';
import BPMTool from './BPMTool';
import Tabs from './Tabs';
import Settings from './Settings';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { StepchartPage } from './components/StepchartPage';
import { parseSm } from './utils/smParser.js';
import SongPicker from './components/SongPicker.jsx';
import DanPage from './DanPage.jsx';
import './App.css';
import './Tabs.css';

function AppRoutes({
  playMode, setPlayMode,
  activeDan, setActiveDan,
  selectedGame, setSelectedGame,
  selectedSong, setSelectedSong,
  smData,
  simfileData,
  songOptions,
  inputValue,
  setInputValue,
}) {
  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const songTitle = queryParams.get('song');

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
          titleTranslit: matchedSong.titleTranslit
        });
      }
    }
  }, [location, smData, selectedSong, setSelectedSong]);

  return (
    <Routes>
      <Route path="/dan" element={<DanPage playMode={playMode} setPlayMode={setPlayMode} activeDan={activeDan} setActiveDan={setActiveDan} setSelectedGame={setSelectedGame} />} />
      <Route path="/multiplier" element={<Multiplier />} />
      <Route path="/" element={<BPMTool selectedGame={selectedGame} setSelectedGame={setSelectedGame} selectedSong={selectedSong} setSelectedSong={setSelectedSong} smData={smData} songOptions={songOptions} inputValue={inputValue} setInputValue={setInputValue} />} />
      <Route path="/bpm" element={<BPMTool selectedGame={selectedGame} setSelectedGame={setSelectedGame} selectedSong={selectedSong} setSelectedSong={setSelectedSong} smData={smData} songOptions={songOptions} inputValue={inputValue} setInputValue={setInputValue} />} />
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
          {simfileData && simfileData.availableTypes && simfileData.availableTypes.length > 0 ? <StepchartPage 
            simfile={simfileData} 
            currentType={simfileData.availableTypes[0].slug}
            selectedGame={selectedGame}
            setSelectedGame={setSelectedGame}
            selectedSong={selectedSong}
            setSelectedSong={setSelectedSong}
            smData={smData}
            songOptions={songOptions}
            inputValue={inputValue}
            setInputValue={setInputValue}
          /> : <div>Loading...</div>}
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
  const [selectedSong, setSelectedSong] = useState(null);
  const [smData, setSmData] = useState({ games: [], files: [] });
  const [simfileData, setSimfileData] = useState(null);
  const [songOptions, setSongOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');

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
      const pathParts = selectedSong.value.split('?difficulty=');
      const filePath = pathParts[0];

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
        })
        .catch(error => console.error('Error fetching sm file:', error));
    }
  }, [selectedSong]);

  useEffect(() => {
    localStorage.setItem('playMode', playMode);
  }, [playMode]);

  useEffect(() => {
    localStorage.setItem('activeDan', activeDan);
  }, [activeDan]);

  return (
    <div data-theme={theme}>
      <Router>
        <div className="app-container">
          <div className="app-content">
            <Tabs />
            <AppRoutes
              playMode={playMode} setPlayMode={setPlayMode}
              activeDan={activeDan} setActiveDan={setActiveDan}
              selectedGame={selectedGame} setSelectedGame={setSelectedGame}
              selectedSong={selectedSong} setSelectedSong={setSelectedSong}
              smData={smData}
              simfileData={simfileData}
              songOptions={songOptions}
              inputValue={inputValue}
              setInputValue={setInputValue}
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
