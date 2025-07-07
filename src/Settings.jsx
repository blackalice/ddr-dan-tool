import React, { useState } from 'react';
import './Settings.css';

const Settings = ({ apiKey, setApiKey, targetBPM, setTargetBPM }) => {
    const [newApiKey, setNewApiKey] = useState(apiKey);

    const handleSave = () => {
        setApiKey(newApiKey);
    };

    return (
        <div className="app-container">
            <div className="settings-content">
                <div className="settings-inner-container">
                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Target Scroll Speed</h3>
                            <p>
                                Set your preferred scroll speed (e.g., 300) to calculate the best multiplier for each song.
                            </p>
                        </div>
                        <div className="setting-control">
                            <input
                                id="targetBPM"
                                type="number"
                                value={targetBPM}
                                onChange={(e) => setTargetBPM(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                                className="settings-input"
                                placeholder="e.g. 300"
                            />
                        </div>
                    </div>
                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Google AI Studio API Key</h3>
                            <p>
                                Used for the experimental camera feature to identify songs. Your key is stored only in your browser's session storage and is sent directly to Google.
                            </p>
                        </div>
                        <div className="setting-control">
                            <input
                                type="password"
                                value={newApiKey}
                                onChange={(e) => setNewApiKey(e.target.value)}
                                placeholder="Enter your Google AI API Key"
                                className="settings-input"
                            />
                            <button onClick={handleSave} className="settings-button">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
