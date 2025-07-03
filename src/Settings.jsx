import React, { useState } from 'react';
import './Settings.css';

const Settings = ({ apiKey, setApiKey }) => {
    const [newApiKey, setNewApiKey] = useState(apiKey);

    const handleSave = () => {
        setApiKey(newApiKey);
    };

    return (
        <div className="settings-container">
            <div className="settings-content">
                <h1>Settings</h1>
                <div className="setting-item">
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
    );
};

export default Settings;
