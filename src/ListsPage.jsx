import React, { useState, useEffect } from 'react';
import SongCard from './components/SongCard.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faPalette, faPlus } from '@fortawesome/free-solid-svg-icons';
import CreateListModal from './components/CreateListModal.jsx';
import './App.css';
import './VegaPage.css';
import './ListsPage.css';

const GroupSection = ({ group, removeChart, deleteGroup, updateColor, updateName, resetFilters }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);

  useEffect(() => {
    setName(group.name);
  }, [group.name]);

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete the list "${group.name}"?`)) {
      deleteGroup(group.name);
    }
  };

  const saveName = () => {
    const newName = name.trim();
    if (newName && newName !== group.name) {
      const success = updateName(group.name, newName);
      if (!success) {
        setName(group.name);
      }
    }
    setIsEditing(false);
  };

  return (
    <section className="dan-section">
      <h2 className="dan-header" style={{ backgroundColor: group.color }}>
        <div className="dan-header-title">
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
          {isEditing ? (
            <input
              className="list-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
              autoFocus
            />
          ) : (
            <span onDoubleClick={() => setIsEditing(true)}>{group.name}</span>
          )}
        </div>
        <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
          <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
        </button>
      </h2>
      {!isCollapsed && (
        <div className="song-grid">
          {group.charts.map((chart, idx) => (
            <SongCard key={idx} song={chart} resetFilters={resetFilters} onRemove={() => removeChart(group.name, chart)} />
          ))}
          {group.charts.length === 0 && (
            <p style={{ padding: '1rem', color: 'var(--text-muted-color)' }}>No charts in this list.</p>
          )}
        </div>
      )}
    </section>
  );
};

const ListsPage = () => {
  const {
    groups,
    createGroup,
    removeChartFromGroup,
    deleteGroup,
    updateGroupColor,
    updateGroupName,
    activeGroup,
    setActiveGroup,
  } = useGroups();
  const { resetFilters } = useFilters();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = (name) => {
    if (name.trim()) {
      createGroup(name.trim());
    }
  };

  const groupsToShow =
    activeGroup === 'All' ? groups : groups.filter(g => g.name === activeGroup);

  return (
    <div className="app-container">
      <main>
        <div className="filter-bar">
          <div className="filter-group list-page-filter-group">
            <div className="dan-select-wrapper">
              <select
                value={activeGroup}
                onChange={e => setActiveGroup(e.target.value)}
                className="dan-select"
              >
                <option value="All">All Lists</option>
                {groups.map(g => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="filter-button"
              onClick={() => setShowCreateModal(true)}
              title="Add list"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
        </div>
        {groupsToShow.map(g => (
          <GroupSection
            key={g.name}
            group={g}
            removeChart={removeChartFromGroup}
            deleteGroup={deleteGroup}
            updateColor={updateGroupColor}
            updateName={updateGroupName}
            resetFilters={resetFilters}
          />
        ))}
        <CreateListModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      </main>
    </div>
  );
};

export default ListsPage;
