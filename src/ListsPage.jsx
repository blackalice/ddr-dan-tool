import React, { useState } from 'react';
import SongCard from './components/SongCard.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import './App.css';
import './VegaPage.css';

const GroupSection = ({ group, removeChart }) => (
  <section className="dan-section">
    <h2 className="dan-header">{group.name}</h2>
    <div className="song-grid">
      {group.charts.map((chart, idx) => (
        <SongCard key={idx} song={chart} onRemove={() => removeChart(group.name, chart)} />
      ))}
      {group.charts.length === 0 && (
        <p style={{ padding: '1rem', color: 'var(--text-muted-color)' }}>No charts in this list.</p>
      )}
    </div>
  </section>
);

const ListsPage = () => {
  const { groups, createGroup, removeChartFromGroup } = useGroups();
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (name) {
      createGroup(name);
      setNewName('');
    }
  };

  return (
    <div className="app-container">
      <main>
        <div className="filter-bar">
          <div className="filter-group">
            <input
              className="dan-select"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New list name"
            />
            <button className="vega-button" onClick={handleCreate}>Create</button>
          </div>
        </div>
        {groups.map(g => (
          <GroupSection key={g.name} group={g} removeChart={removeChartFromGroup} />
        ))}
      </main>
    </div>
  );
};

export default ListsPage;
