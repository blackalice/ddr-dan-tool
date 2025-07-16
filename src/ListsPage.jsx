import React, { useState } from 'react';
import SongCard from './components/SongCard.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faPalette } from '@fortawesome/free-solid-svg-icons';
import './App.css';
import './VegaPage.css';
import './ListsPage.css';

const GroupSection = ({ group, removeChart, deleteGroup, updateColor }) => {
  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete the list "${group.name}"?`)) {
      deleteGroup(group.name);
    }
  };

  return (
    <section className="dan-section">
      <h2 className="dan-header" style={{ backgroundColor: group.color }}>
        <span className="dan-header-title">{group.name}</span>
        <div className="dan-header-controls">
          <label className="color-picker-label">
            <FontAwesomeIcon icon={faPalette} />
            <input
              type="color"
              value={group.color}
              onChange={(e) => updateColor(group.name, e.target.value)}
              className="color-picker"
            />
          </label>
          <button onClick={handleDelete} className="delete-list-button">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </h2>
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
};

const ListsPage = () => {
  const { groups, createGroup, removeChartFromGroup, deleteGroup, updateGroupColor } = useGroups();
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
          <div className="filter-group list-page-filter-group">
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
          <GroupSection
            key={g.name}
            group={g}
            removeChart={removeChartFromGroup}
            deleteGroup={deleteGroup}
            updateColor={updateGroupColor}
          />
        ))}
      </main>
    </div>
  );
};

export default ListsPage;
