import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BPMTool from './BPMTool';
import Multiplier from './Multiplier';
import Tabs from './Tabs';
import ReloadPrompt from './ReloadPrompt';
import './App.css';

function App() {
    const [smData, setSmData] = useState({ games: [], files: [] });
    const [selectedGame, setSelectedGame] = useState('all');
    const [targetBPM, setTargetBPM] = useState(() => localStorage.getItem('targetBPM') || 300);
    const [selectedSong, setSelectedSong] = useState(null);

    useEffect(() => {
        fetch('/sm-files.json')
            .then(response => response.json())
            .then(data => {
                setSmData(data);
                const urlParams = new URLSearchParams(window.location.search);
                const songTitle = urlParams.get('song');
                if (songTitle) {
                    const foundSong = data.files.find(f => f.title === songTitle);
                    if (foundSong) {
                        setSelectedSong({
                            value: foundSong.path,
                            label: foundSong.title,
                            title: foundSong.title,
                            titleTranslit: foundSong.titleTranslit
                        });
                    }
                }
            })
            .catch(error => console.error('Error fetching sm-files.json:', error));
    }, []);

    useEffect(() => {
        localStorage.setItem('targetBPM', targetBPM);
    }, [targetBPM]);

    return (
        <Router>
            <div className="App">
                <ReloadPrompt />
                <header>
                    <h1>DDR Dan Tool</h1>
                    <Tabs />
                </header>
                <main>
                    <Routes>
                        <Route path="/" element={<Navigate to="/bpm" />} />
                        <Route path="/bpm" element={
                            <BPMTool 
                                selectedGame={selectedGame}
                                setSelectedGame={setSelectedGame}
                                targetBPM={targetBPM}
                                selectedSong={selectedSong}
                                setSelectedSong={setSelectedSong}
                                smData={smData}
                            />
                        } />
                        <Route path="/dan" element={<div>Dan Courses page is under construction.</div>} />
                        <Route path="/multiplier" element={
                            <Multiplier 
                                targetBPM={targetBPM}
                                setTargetBPM={setTargetBPM}
                            />
                        } />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;

