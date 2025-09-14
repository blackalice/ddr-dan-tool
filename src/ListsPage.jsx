import React, { useState, useEffect } from 'react';
import SongCard from './components/SongCard.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faPalette, faPlus, faPen, faSort, faGripLines } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CreateListModal from './components/CreateListModal.jsx';
import EditChartModal from './components/EditChartModal.jsx';
import { storage } from './utils/remoteStorage.js';
import './App.css';
import './VegaPage.css';
import './ListsPage.css';
import { getSongMeta } from './utils/cachedFetch.js';

const GroupSection = ({
  group,
  removeChart,
  deleteGroup,
  updateColor,
  updateName,
  resetFilters,
  onEditChart,
  highlightKey,
  // DnD props
  reorderMode,
  dragAttributes = {},
  dragListeners = {},
  setNodeRef,
  transform,
  transition,
  isDragging = false,
}) => {
  const { scores } = useScores();
  const { reorderGroupCharts } = useGroups();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const keyNew = `collapsed:list:${group.name}`;
      const keyOld = `dan-header-collapsed-${group.name}`;
      const vNew = storage.getItem(keyNew);
      const vOld = storage.getItem(keyOld);
      const parsed = vNew != null ? JSON.parse(vNew) : (vOld != null ? JSON.parse(vOld) : false);
      return !!parsed;
    } catch {
      return false;
    }
  });
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [showActions, setShowActions] = useState(false);
  const [chartOrder, setChartOrder] = useState(() => group.charts.map(c => `${c.title}::${c.mode}::${c.difficulty}`));
  const chartSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );
  // Collapse should only toggle via the explicit button, matching other pages.

  useEffect(() => {
    const keyNew = `collapsed:list:${group.name}`;
    const keyOld = `dan-header-collapsed-${group.name}`; // legacy
    storage.setItem(keyNew, JSON.stringify(isCollapsed));
    storage.setItem(keyOld, JSON.stringify(isCollapsed));
  }, [isCollapsed, group.name]);

  useEffect(() => {
    setName(group.name);
  }, [group.name]);

  useEffect(() => {
    setChartOrder(group.charts.map(c => `${c.title}::${c.mode}::${c.difficulty}`));
  }, [group.charts]);

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

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
  };

  return (
    <section ref={setNodeRef} className={`dan-section${isDragging ? ' is-dragging' : ''}`} style={style}>
      <h2
        className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`}
        style={{ backgroundColor: group.color }}
      >
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
        {reorderMode ? (
          <button
            className="drag-handle"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            {...dragAttributes}
            {...dragListeners}
          >
            <FontAwesomeIcon icon={faGripLines} />
          </button>
        ) : (
          <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
            <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
          </button>
        )}
      </h2>
      {!isCollapsed && (
        <div className="song-grid">
          {showActions ? (
            <DndContext
              sensors={chartSensors}
              collisionDetection={closestCenter}
              autoScroll
              onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) return;
                const oldIndex = chartOrder.indexOf(active.id);
                const newIndex = chartOrder.indexOf(over.id);
                if (oldIndex === -1 || newIndex === -1) return;
                const newOrder = arrayMove(chartOrder, oldIndex, newIndex);
                setChartOrder(newOrder);
                reorderGroupCharts(group.name, newOrder);
              }}
            >
              <SortableContext items={chartOrder} strategy={rectSortingStrategy}>
                {chartOrder.map(id => {
                  const chart = group.charts.find(c => `${c.title}::${c.mode}::${c.difficulty}` === id);
                  if (!chart) return null;
                  const highlightId = `${group.name}-${chart.title}-${chart.mode}-${chart.difficulty}`;
                  const keyNew = chart.artist ? `${chart.title.toLowerCase()}::${chart.artist.toLowerCase()}::${chart.difficulty.toLowerCase()}` : null;
                  const keyLegacy = `${chart.title.toLowerCase()}-${chart.difficulty.toLowerCase()}`;
                  const hit = (keyNew && scores[chart.mode]?.[keyNew]) || scores[chart.mode]?.[keyLegacy];
                  const score = hit?.score;
                  return (
                    <SortableSongCard
                      key={id}
                      id={id}
                      song={chart}
                      resetFilters={resetFilters}
                      onRemove={() => removeChart(group.name, chart)}
                      onEdit={() => onEditChart(group.name, chart)}
                      highlight={highlightKey === highlightId}
                      score={score}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          ) : (
          group.charts.map((chart, idx) => {
            const highlightId = `${group.name}-${chart.title}-${chart.mode}-${chart.difficulty}`;
            const keyNew = chart.artist ? `${chart.title.toLowerCase()}::${chart.artist.toLowerCase()}::${chart.difficulty.toLowerCase()}` : null;
            const keyLegacy = `${chart.title.toLowerCase()}-${chart.difficulty.toLowerCase()}`;
            const hit = (keyNew && scores[chart.mode]?.[keyNew]) || scores[chart.mode]?.[keyLegacy];
            const score = hit?.score;
            return (
              <SongCard
                key={idx}
                song={chart}
                resetFilters={resetFilters}
                onRemove={undefined}
                onEdit={undefined}
                highlight={highlightKey === highlightId}
                score={score}
              />
            );
          })
          )}
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
    setGroups,
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
  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState([]);

  useEffect(() => {
    getSongMeta()
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

  const groupsToShow = activeGroup === 'All' ? groups : groups.filter(g => g.name === activeGroup);
  const visibleNames = React.useMemo(() => groupsToShow.map(g => g.name), [groupsToShow]);

  useEffect(() => {
    setLocalOrder(visibleNames);
  }, [visibleNames]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragEndDnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localOrder.indexOf(active.id);
    const newIndex = localOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(localOrder, oldIndex, newIndex);
    setLocalOrder(newOrder);
    const reordered = newOrder.map(name => groups.find(g => g.name === name)).filter(Boolean);
    setGroups(reordered);
  };

  // (Legacy custom drag logic removed in favor of dnd-kit)

  return (
    <div className={`app-container${reorderMode ? ' reorder-mode' : ''}`}>
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
              className={`filter-button${reorderMode ? ' active' : ''}`}
            onClick={() => setReorderMode(m => !m)}
              aria-pressed={reorderMode}
              title={reorderMode ? 'Exit reorder mode' : 'Reorder lists'}
            >
              <FontAwesomeIcon icon={faSort} />
            </button>
            <button
              className="filter-button"
              onClick={() => setShowCreateModal(true)}
              title="Add list"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
        </div>
        {reorderMode && activeGroup === 'All' ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndDnd}>
            <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
              {localOrder.map(id => {
                const g = groupsToShow.find(x => x.name === id);
                if (!g) return null;
                return (
                  <SortableGroupSection
                    key={g.name}
                    id={g.name}
                    group={g}
                    removeChart={removeChartFromGroup}
                    deleteGroup={deleteGroup}
                    updateColor={updateGroupColor}
                    updateName={updateGroupName}
                    resetFilters={resetFilters}
                    onEditChart={(groupName, chart) => setEditInfo({ groupName, chart })}
                    highlightKey={highlightKey}
                    reorderMode={true}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        ) : (
          groupsToShow.map(g => (
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
              reorderMode={false}
            />
          ))
        )}
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

// Sortable wrapper for GroupSection using dnd-kit
function SortableGroupSection({ id, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <GroupSection
      {...props}
      dragAttributes={attributes}
      dragListeners={listeners}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
      isDragging={isDragging}
      reorderMode
    />
  );
}

// Sortable wrapper for SongCard
function SortableSongCard({ id, song, resetFilters, onRemove, onEdit, highlight, score }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    zIndex: isDragging ? 2 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SongCard
        song={song}
        resetFilters={resetFilters}
        onRemove={onRemove}
        onEdit={onEdit}
        highlight={highlight}
        score={score}
        showDragHandle
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
}
