import React, { useState, useEffect } from 'react';
import SongCard from './components/SongCard.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faPalette, faPlus, faPen } from '@fortawesome/free-solid-svg-icons';
import CreateListModal from './components/CreateListModal.jsx';
import EditChartModal from './components/EditChartModal.jsx';
import './App.css';
import './VegaPage.css';
import './ListsPage.css';

const GroupSection = ({ group, removeChart, deleteGroup, updateColor, updateName, resetFilters, onEditChart, highlightKey }) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`dan-header-collapsed-${group.name}`)) || false;
    } catch {
      return false;
    }
  });
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    localStorage.setItem(`dan-header-collapsed-${group.name}`, JSON.stringify(isCollapsed));
  }, [isCollapsed, group.name]);

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
      <h2 className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: group.color }}>
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
          <button
            className={`edit-charts-button${showActions ? ' active' : ''}`}
            onClick={() => setShowActions(prev => !prev)}
            title="Edit charts"
          >
            <FontAwesomeIcon icon={faPen} />
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
          {group.charts.map((chart, idx) => {
            const key = `${group.name}-${chart.title}-${chart.mode}-${chart.difficulty}`;
            return (
              <SongCard
                key={idx}
                song={chart}
                resetFilters={resetFilters}
                onRemove={showActions ? () => removeChart(group.name, chart) : undefined}
                onEdit={showActions ? () => onEditChart(group.name, chart) : undefined}
                highlight={highlightKey === key}
              />
            );
          })}
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
    updateChartDifficulty,
    activeGroup,
    setActiveGroup,
  } = useGroups();
  const { resetFilters } = useFilters();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [songMeta, setSongMeta] = useState([]);
  const [editInfo, setEditInfo] = useState(null); // { groupName, chart }
  const [highlightKey, setHighlightKey] = useState(null);

  const BASE = import.meta.env.BASE_URL

  useEffect(() => {
    fetch(`${BASE}song-meta.json`)
      .then(res => res.json())
      .then(setSongMeta)
      .catch(err => console.error('Failed to load song meta:', err));
  }, []);

  const handleCreate = (name) => {
    if (name.trim()) {
      createGroup(name.trim());
    }
  };

  const handleEditSave = (newDiff) => {
    if (editInfo) {
      updateChartDifficulty(editInfo.groupName, editInfo.chart, newDiff);
      const key = `${editInfo.groupName}-${editInfo.chart.title}-${editInfo.chart.mode}-${newDiff.difficulty.toLowerCase()}`;
      setHighlightKey(key);
      setTimeout(() => setHighlightKey(null), 1500);
    }
  };

  const editOptions = React.useMemo(() => {
    if (!editInfo) return [];
    const meta = songMeta.find(
      m => m.title === editInfo.chart.title && m.game === editInfo.chart.game
    );
    if (!meta) return [];
    return meta.difficulties.filter(d => d.mode === editInfo.chart.mode);
  }, [editInfo, songMeta]);

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
            onEditChart={(groupName, chart) => setEditInfo({ groupName, chart })}
            highlightKey={highlightKey}
          />
        ))}
        <CreateListModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
        <EditChartModal
          isOpen={!!editInfo}
          onClose={() => setEditInfo(null)}
          chart={editInfo?.chart}
          options={editOptions}
          onSave={handleEditSave}
        />
      </main>
    </div>
  );
};

export default ListsPage;
