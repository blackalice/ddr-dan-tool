import React, { useState, useEffect } from 'react';
import { useFilters } from '../contexts/FilterContext.jsx';
import '../BPMTool.css';

const FilterModal = ({ isOpen, onClose, games }) => {
  const { filters, setFilters } = useFilters();
  const [localFilters, setLocalFilters] = useState(filters);

  useEffect(() => {
    if (isOpen) setLocalFilters(filters);
  }, [isOpen, filters]);

  const toggleGame = (game) => {
    setLocalFilters((prev) => {
      const has = prev.games.includes(game);
      return { ...prev, games: has ? prev.games.filter(g => g !== game) : [...prev.games, game] };
    });
  };

  const apply = () => {
    setFilters(localFilters);
    onClose();
  };

  const reset = () => {
    setLocalFilters({
      bpmMin: '',
      bpmMax: '',
      difficultyMin: '',
      difficultyMax: '',
      games: [],
      artist: '',
      multiBpm: 'any',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="api-key-modal" onClick={onClose}>
      <div className="api-key-modal-content" onClick={e => e.stopPropagation()}>
        <h3>Song Filters</h3>
        <label>BPM Range</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="number" placeholder="Min" value={localFilters.bpmMin} onChange={e => setLocalFilters(f => ({ ...f, bpmMin: e.target.value }))} />
          <input type="number" placeholder="Max" value={localFilters.bpmMax} onChange={e => setLocalFilters(f => ({ ...f, bpmMax: e.target.value }))} />
        </div>
        <label>Difficulty Range</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="number" placeholder="Min" value={localFilters.difficultyMin} onChange={e => setLocalFilters(f => ({ ...f, difficultyMin: e.target.value }))} />
          <input type="number" placeholder="Max" value={localFilters.difficultyMax} onChange={e => setLocalFilters(f => ({ ...f, difficultyMax: e.target.value }))} />
        </div>
        <label>Artist</label>
        <input type="text" value={localFilters.artist} onChange={e => setLocalFilters(f => ({ ...f, artist: e.target.value }))} />
        <label>Game Versions</label>
        <div className="game-checkboxes">
          {games.map(game => (
            <label key={game} style={{ display: 'block' }}>
              <input type="checkbox" checked={localFilters.games.includes(game)} onChange={() => toggleGame(game)} /> {game}
            </label>
          ))}
        </div>
        <label>Multiple BPMs</label>
        <select value={localFilters.multiBpm} onChange={e => setLocalFilters(f => ({ ...f, multiBpm: e.target.value }))}>
          <option value="any">Any</option>
          <option value="single">Single BPM only</option>
          <option value="multiple">Multiple BPM only</option>
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button onClick={reset}>Reset</button>
          <button onClick={onClose}>Cancel</button>
          <button onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default FilterModal;

