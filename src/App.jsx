import React, { useState, useMemo, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Multiplier from './Multiplier';
import BPMTool from './BPMTool';
import Tabs from './Tabs';
import Settings from './Settings';
import { SettingsProvider, SettingsContext } from './contexts/SettingsContext.jsx';
import { StepchartPage } from './components/StepchartPage';
import { parseSm } from './utils/smParser.js';
import './App.css';
import './Tabs.css';

// --- Data Structure ---
const ddrDanData = {
  single: [
    {
      dan: "1st Dan (初段)",
      color: "#6fbe44",
      songs: [
        { title: "Love You More", level: 9, bpm: "175", difficulty: "basic" },
        { title: "Starry Sky", level: 9, bpm: "150", difficulty: "difficult" },
        { title: "Bang Pad(Werk Mix)", level: 9, bpm: "180", difficulty: "difficult" },
        { title: "LEVEL UP", level: 10, bpm: "180", difficulty: "difficult" },
      ],
    },
    {
      dan: "2nd Dan (二段)",
      color: "#6fbe44",
      songs: [
        { title: "Electric Dance System Music", level: 10, bpm: "190", difficulty: "difficult" },
        { title: "十二���座の聖域", level: 10, bpm: "164", difficulty: "difficult" },
        { title: "Liberate", level: 10, bpm: "128", difficulty: "difficult" },
        { title: "Show Me Your Moves", level: 11, bpm: "155", difficulty: "expert" },
      ],
    },
    {
      dan: "3rd Dan (三段)",
      color: "#6fbe44",
      songs: [
        { title: "This Beat is.....", level: 11, bpm: "128", difficulty: "expert" },
        { title: "Starlight in the Snow", level: 11, bpm: "150", difficulty: "difficult" },
        { title: "Stay 4 Ever", level: 11, bpm: "140", difficulty: "expert" },
        { title: "Astrogazer", level: 12, bpm: "154", difficulty: "expert" },
      ],
    },
    {
      dan: "4th Dan (四段)",
      color: "#46aadc",
      songs: [
        { title: "out of focus", level: 12, bpm: "84-167", difficulty: "difficult" },
        { title: "SODA GALAXY", level: 12, bpm: "178", difficulty: "expert" },
        { title: "In the Past", level: 12, bpm: "81-162", difficulty: "difficult" },
        { title: "Deadlock -out of reach-", level: 13, bpm: "205", difficulty: "difficult" },
      ],
    },
    {
      dan: "5th Dan (五段)",
      color: "#46aadc",
      songs: [
        { title: "aftershock!!", level: 13, bpm: "157", difficulty: "expert" },
        { title: "mythomane", level: 13, bpm: "140-180", difficulty: "expert" },
        { title: "DeStRuCtIvE FoRcE", level: 13, bpm: "89-177", difficulty: "expert" },
        { title: "London EVOLVED ver.C", level: 14, bpm: "43-340", difficulty: "expert" },
      ],
    },
    {
      dan: "6th Dan (六段)",
      color: "#e6413a",
      songs: [
        { title: "Dead Heat", level: 14, bpm: "177", difficulty: "expert" },
        { title: "IRON HEART", level: 14, bpm: "155", difficulty: "expert" },
        { title: "STEP MACHINE", level: 14, bpm: "160", difficulty: "expert" },
        { title: "MAX 300", level: 15, bpm: "100-200", difficulty: "expert" },
      ],
    },
    {
      dan: "7th Dan (七段)",
      color: "#e6413a",
      songs: [
        { title: "Neverland", level: 15, bpm: "160", difficulty: "expert" },
        { title: "Next Phase", level: 15, bpm: "174", difficulty: "expert" },
        { title: "Last Card", level: 15, bpm: "85-170", difficulty: "expert" },
        { title: "Cosy Catastrophe", level: 16, bpm: "90-360", difficulty: "expert" },
      ],
    },
    {
      dan: "8th Dan (八段)",
      color: "#e6413a",
      songs: [
        { title: "Rave Accelerator", level: 16, bpm: "170", difficulty: "expert" },
        { title: "Golden Arrow", level: 16, bpm: "170", difficulty: "expert" },
        { title: "Splash Gold", level: 16, bpm: "75-300", difficulty: "expert" },
        { title: "The History of the Future", level: 17, bpm: "100-200", difficulty: "expert" },
      ],
    },
    {
      dan: "9th Dan (九段)",
      color: "#c846a6",
      songs: [
        { title: "DIGITALIZER", level: 17, bpm: "180", difficulty: "expert" },
        { title: "東京神話", level: 17, bpm: "96-196", difficulty: "expert" },
        { title: "Avenger", level: 17, bpm: "100-400", difficulty: "expert" },
        { title: "EGOISM 440", level: 18, bpm: "55-879", difficulty: "expert" },
      ],
    },
    {
      dan: "10th Dan (十段)",
      color: "#c846a6",
      songs: [
        { title: "び", level: 18, bpm: "169", difficulty: "challenge" },
        { title: "HyperTwist", level: 18, bpm: "190", difficulty: "challenge" },
        { title: "Neutrino", level: 18, bpm: "75-300", difficulty: "challenge" },
        { title: "PARANOiA Revolution", level: 19, bpm: "180-360", difficulty: "challenge" },
      ],
    },
    {
      dan: "Kaiden (皆伝)",
      color: "#f8d45a",
      songs: [
        { title: "Lachryma《Re:Queen’M》", level: 19, bpm: "236", difficulty: "challenge" },
        { title: "Over the “Period”", level: 19, bpm: "25-838", difficulty: "challenge" },
        { title: "Valkyrie Dimension", level: 19, bpm: "47-742", difficulty: "challenge" },
        { title: "ENDYMION", level: 19, bpm: "110-880", difficulty: "challenge" },
      ],
    },
  ],
  double: [
    {
      dan: "1st Dan (初段)",
      color: "#6fbe44",
      songs: [
        { title: "さよならトリップ ～夏陽 EDM edition～", level: 9, bpm: "135", difficulty: "difficult" },
        { title: "Second Heaven", level: 9, bpm: "149", difficulty: "difficult" },
        { title: "Snow prism", level: 9, bpm: "196", difficulty: "difficult" },
        { title: "TRIP MACHINE", level: 10, bpm: "160", difficulty: "difficult" },
      ],
    },
    {
      dan: "2nd Dan (二段)",
      color: "#6fbe44",
      songs: [
        { title: "bass 2 bass", level: 10, bpm: "140", difficulty: "difficult" },
        { title: "Anthurium", level: 10, bpm: "142", difficulty: "difficult" },
        { title: "SEXY PLANET", level: 10, bpm: "180", difficulty: "expert" },
        { title: "sakura storm", level: 11, bpm: "184", difficulty: "expert" },
      ],
    },
    {
      dan: "3rd Dan (三段)",
      color: "#6fbe44",
      songs: [
        { title: "starmine", level: 11, bpm: "182", difficulty: "difficult" },
        { title: "The Lonely Streets", level: 11, bpm: "115", difficulty: "expert" },
        { title: "SUNKiSS♥DROP", level: 11, bpm: "185", difficulty: "expert" },
        { title: "Dance Dance Revolution", level: 12, bpm: "150", difficulty: "expert" },
      ],
    },
    {
      dan: "4th Dan (四段)",
      color: "#46aadc",
      songs: [
        { title: "Private Eye", level: 12, bpm: "160", difficulty: "expert" },
        { title: "CENTAUR", level: 12, bpm: "140", difficulty: "expert" },
        { title: "DOLL", level: 12, bpm: "170", difficulty: "expert" },
        { title: "MARS WAR 3", level: 13, bpm: "200", difficulty: "expert" },
      ],
    },
    {
      dan: "5th Dan (五段)",
      color: "#46aadc",
      songs: [
        { title: "TECH-NOID", level: 13, bpm: "146", difficulty: "expert" },
        { title: "exotic ethnic", level: 13, bpm: "190", difficulty: "expert" },
        { title: "デッドボヲルdeホームラン", level: 13, bpm: "145", difficulty: "expert" },
        { title: "Ishtar", level: 14, bpm: "156", difficulty: "expert" },
      ],
    },
    {
      dan: "6th Dan (六段)",
      color: "#e6413a",
      songs: [
        { title: "on the bounce", level: 14, bpm: "150", difficulty: "expert" },
        { title: "Let's DANCE aROUND!!", level: 14, bpm: "155", difficulty: "expert" },
        { title: "Pierce The Sky", level: 14, bpm: "85-173", difficulty: "expert" },
        { title: "PARANOiA survivor", level: 15, bpm: "135-270", difficulty: "expert" },
      ],
    },
    {
      dan: "7th Dan (七段)",
      color: "#e6413a",
      songs: [
        { title: "Going Hypersonic", level: 15, bpm: "156", difficulty: "expert" },
        { title: "out of focus", level: 15, bpm: "84-167", difficulty: "expert" },
        { title: "Skywalking", level: 15, bpm: "90-180", difficulty: "expert" },
        { title: "UNBELIEVABLE (Sparky remix)", level: 16, bpm: "88-175", difficulty: "expert" },
      ],
    },
    {
      dan: "8th Dan (八段)",
      color: "#e6413a",
      songs: [
        { title: "Sand Blow", level: 16, bpm: "83-165", difficulty: "expert" },
        { title: "Helios", level: 16, bpm: "182", difficulty: "expert" },
        { title: "KIMONO♥PRINCESS", level: 16, bpm: "95-190", difficulty: "expert" },
        { title: "The legend of MAX(X-Special)", level: 17, bpm: "83-333", difficulty: "challenge" },
      ],
    },
    {
      dan: "9th Dan (九段)",
      color: "#c846a6",
      songs: [
        { title: "New Era", level: 17, bpm: "98-346", difficulty: "expert" },
        { title: "Fascination ～eternal love mix～", level: 17, bpm: "100-400", difficulty: "challenge" },
        { title: "RISING FIRE HAWK", level: 17, bpm: "180", difficulty: "challenge" },
        { title: "PARANOiA Rebirth", level: 18, bpm: "180-360", difficulty: "expert" },
      ],
    },
    {
      dan: "10th Dan (十段)",
      color: "#c846a6",
      songs: [
        { title: "Spanish Snowy Dance", level: 18, bpm: "180", difficulty: "challenge" },
        { title: "Astrogazer", level: 18, bpm: "154", difficulty: "challenge" },
        { title: "New Decade", level: 18, bpm: "100-400", difficulty: "challenge" },
        { title: "PARANOiA ～HADES～", level: 18, bpm: "75-300", difficulty: "challenge" },
      ],
    },
    {
      dan: "Kaiden (皆伝)",
      color: "#f8d45a",
      songs: [
        { title: "Blow My Mind", level: 18, bpm: "95-380", difficulty: "challenge" },
        { title: "Tohoku EVOLVED", level: 18, bpm: "42-1021", difficulty: "challenge" },
        { title: "Valkyrie Dimension", level: 19, bpm: "47-742", difficulty: "challenge" },
        { title: "POSSESSION", level: 19, bpm: "183-370", difficulty: "challenge" },
      ],
    },
  ],
};

const difficultyMap = {
    basic: { name: "BSP", color: "#f8d45a", textColor: "#000000" },
    difficult: { name: "DSP", color: "#d4504e", textColor: "#ffffff" },
    expert: { name: "ESP", color: "#6fbe44", textColor: "#ffffff" },
    challenge: { name: "CSP", color: "#c846a6", textColor: "#ffffff" },
};
const difficultyMapDouble = {
    basic: { name: "BDP", color: "#f8d45a", textColor: "#000000" },
    difficult: { name: "DDP", color: "#d4504e", textColor: "#ffffff" },
    expert: { name: "EDP", color: "#6fbe44", textColor: "#ffffff" },
    challenge: { name: "CDP", color: "#c846a6", textColor: "#ffffff" },
};

const getBpmRange = (bpm) => {
  if (typeof bpm !== 'string') return { min: 0, max: 0 };
  const parts = bpm.split('-').map(Number);
  if (parts.length === 1) {
    return { min: parts[0], max: parts[0] };
  }
  return { min: Math.min(...parts), max: Math.max(...parts) };
};

// --- React Components ---

const SongCard = ({ song, playMode, setSelectedGame }) => {
  const { targetBPM, multipliers } = useContext(SettingsContext);

  const calculation = useMemo(() => {
    const numericTarget = Number(targetBPM) || 0;
    const bpmRange = getBpmRange(song.bpm);
    
    if (bpmRange.max === 0) return { modifier: 'N/A', minSpeed: 'N/A', maxSpeed: 'N/A', isRange: false };

    const idealMultiplier = numericTarget / bpmRange.max;
    const closestMultiplier = multipliers.reduce((prev, curr) => 
      Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
    );

    const minSpeed = (bpmRange.min * closestMultiplier).toFixed(0);
    const maxSpeed = (bpmRange.max * closestMultiplier).toFixed(0);

    return {
      modifier: closestMultiplier,
      minSpeed: minSpeed,
      maxSpeed: maxSpeed,
      isRange: bpmRange.min !== bpmRange.max
    };
  }, [song.bpm, targetBPM, multipliers]);

  const difficultyInfo = playMode === 'single' ? difficultyMap[song.difficulty] : difficultyMapDouble[song.difficulty];

  return (
    <Link to={`/bpm?song=${encodeURIComponent(song.title)}`} className="song-card-link" onClick={() => setSelectedGame('all')}>
      <div className="song-card">
        <h3 className="song-title">{song.title}</h3>
        <div className="song-details">
          <div>
            <span className="song-bpm">BPM: {song.bpm}</span>
            <div className="song-calculation">
              <span className="song-speed">
                {calculation.isRange ? `${calculation.minSpeed}-${calculation.maxSpeed}` : calculation.maxSpeed}
              </span>
              <span className="song-separator">@</span>
              <span className="song-modifier">{calculation.modifier}x</span>
            </div>
          </div>
          <div className="song-level-container">
              <span className="song-level">Lv.{song.level}</span>
              {difficultyInfo && (
                   <span 
                      className="difficulty-badge"
                      style={{ backgroundColor: difficultyInfo.color, color: difficultyInfo.textColor }}
                  >
                      {difficultyInfo.name}
                  </span>
              )}
          </div>
        </div>
      </div>
    </Link>
  );
};


const DanSection = ({ danCourse, playMode, setSelectedGame }) => (
  <section className="dan-section">
    <h2 className="dan-header" style={{ backgroundColor: danCourse.color }}>
      {danCourse.dan}
    </h2>
    <div className="song-grid">
      {danCourse.songs.map((song) => (
        <SongCard key={`${danCourse.dan}-${song.title}`} song={song} playMode={playMode} setSelectedGame={setSelectedGame} />
      ))}
    </div>
  </section>
);

const FilterBar = ({ activeMode, setMode, activeDan, setDan, danLevels }) => (
  <div className="filter-bar">
    <div className="filter-group">
      <div className="play-mode-toggle">
        <button
          onClick={() => setMode('single')}
          className={activeMode === 'single' ? 'active' : ''}
        >
          Single
        </button>
        <button
          onClick={() => setMode('double')}
          className={activeMode === 'double' ? 'active' : ''}
        >
          Double
        </button>
      </div>

      <div className="dan-select-wrapper">
         <select
            value={activeDan}
            onChange={(e) => setDan(e.target.value)}
            className="dan-select"
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

function MainPage({ playMode, setPlayMode, activeDan, setActiveDan, setSelectedGame }) {
  const coursesToShow = useMemo(() => {
    const courses = ddrDanData[playMode];
    if (activeDan === 'All') return courses;
    return courses.filter(course => course.dan === activeDan);
  }, [playMode, activeDan]);
  
  const danLevels = useMemo(() => ddrDanData[playMode].map(d => d.dan), [playMode]);

  return (
    <>
      
      <div className="app-container">
        <main>
          <FilterBar 
            activeMode={playMode} 
            setMode={(mode) => {
              setPlayMode(mode);
              setActiveDan('All');
            }}
            activeDan={activeDan}
            setDan={setActiveDan}
            danLevels={danLevels}
          />
          
          {coursesToShow.length > 0 ? (
             coursesToShow.map((course) => (
                <DanSection 
                  key={course.dan} 
                  danCourse={course} 
                  playMode={playMode}
                  setSelectedGame={setSelectedGame}
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

function AppRoutes({
  playMode, setPlayMode,
  activeDan, setActiveDan,
  selectedGame, setSelectedGame,
  selectedSong, setSelectedSong,
  smData,
  simfileData
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
      <Route path="/dan" element={<MainPage playMode={playMode} setPlayMode={setPlayMode} activeDan={activeDan} setActiveDan={setActiveDan} setSelectedGame={setSelectedGame} />} />
      <Route path="/multiplier" element={<Multiplier />} />
      <Route path="/" element={<BPMTool selectedGame={selectedGame} setSelectedGame={setSelectedGame} selectedSong={selectedSong} setSelectedSong={setSelectedSong} smData={smData} />} />
      <Route path="/bpm" element={<BPMTool selectedGame={selectedGame} setSelectedGame={setSelectedGame} selectedSong={selectedSong} setSelectedSong={setSelectedSong} smData={smData} />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/stepchart" element={simfileData ? <StepchartPage simfile={simfileData} currentType="single-challenge" /> : <div>Loading...</div>} />
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

  useEffect(() => {
    fetch('/sm/Supernova 2/TRIP MACHINE PhoeniX.sm')
      .then(response => response.text())
      .then(text => {
        const parsed = parseSm(text, 'TRIP MACHINE PhoeniX');
        const simfile = {
          ...parsed,
          title: {
            titleName: parsed.title,
            translitTitleName: parsed.titletranslit,
            titleDir: 'TRIP MACHINE PhoeniX',
            banner: parsed.banner,
          },
          mix: {
            mixName: 'Supernova 2',
            mixDir: 'Supernova 2',
          },
        };
        setSimfileData(simfile);
      })
      .catch(error => console.error('Error fetching sm file:', error));
  }, []);

  useEffect(() => {
    fetch('/sm-files.json')
        .then(response => response.json())
        .then(data => setSmData(data))
        .catch(error => console.error('Error fetching sm-files.json:', error));
  }, []);

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
