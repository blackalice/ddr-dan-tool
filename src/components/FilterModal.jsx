import React, { useState, useEffect } from 'react';
import { useFilters } from '../contexts/FilterContext.jsx';
import styles from './FilterModal.module.css';

const difficultyNames = ['Beginner', 'Basic', 'Difficult', 'Expert', 'Challenge'];

const FilterModal = ({ isOpen, onClose, games, showLists, onCreateList }) => {
  const { filters, setFilters } = useFilters();
  const [localFilters, setLocalFilters] = useState(filters);


  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setLocalFilters(filters);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, filters]);

  const handleRangeBlur = (field, value, min, max) => {
    if (value === '') return; // Don't validate if empty

    let numValue = parseInt(value, 10);

    if (isNaN(numValue)) { // If not a number, clear it
        setLocalFilters(f => ({ ...f, [field]: '' }));
        return;
    }

    if (numValue > max) numValue = max;
    if (numValue < min) numValue = min;

    setLocalFilters(f => ({ ...f, [field]: String(numValue) }));
  };

  const toggleGame = (game) => {
    setLocalFilters((prev) => {
      const has = prev.games.includes(game);
      return { ...prev, games: has ? prev.games.filter(g => g !== game) : [...prev.games, game] };
    });
  };

  const toggleDifficultyName = (name) => {
    setLocalFilters((prev) => {
      const has = prev.difficultyNames.includes(name);
      return { ...prev, difficultyNames: has ? prev.difficultyNames.filter(n => n !== name) : [...prev.difficultyNames, name] };
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
      lengthMin: '',
      lengthMax: '',
      games: [],
      artist: '',
      title: '',
      multiBpm: 'any',
      difficultyNames: [],
    });
  };

  if (!isOpen) return null;

  const bpmActive = localFilters.bpmMin !== '' || localFilters.bpmMax !== '';
  const diffRangeActive = localFilters.difficultyMin !== '' || localFilters.difficultyMax !== '';
  const diffNamesActive = localFilters.difficultyNames.length > 0;
  const lengthActive = localFilters.lengthMin !== '' || localFilters.lengthMax !== '';
  const artistActive = localFilters.artist !== '';
  const titleActive = localFilters.title !== '';
  const gamesActive = localFilters.games.length > 0;
  const multiBpmActive = localFilters.multiBpm !== 'any';

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 className={styles.modalHeader}>Song Filters</h3>
        <div className={styles.modalBody}>
          <div className={styles.column}>
            <div className={styles.formGroup}>
              <label>BPM Range (1-1100)</label>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  min="1"
                  max="1100"
                  placeholder="Min"
                  value={localFilters.bpmMin}
                  onChange={e => setLocalFilters(f => ({ ...f, bpmMin: e.target.value }))}
                  onBlur={e => handleRangeBlur('bpmMin', e.target.value, 1, 1100)}
                  className={`${styles.input} ${localFilters.bpmMin !== '' ? styles.activeInput : ''}`}
                />
                <input
                  type="number"
                  min="1"
                  max="1100"
                  placeholder="Max"
                  value={localFilters.bpmMax}
                  onChange={e => setLocalFilters(f => ({ ...f, bpmMax: e.target.value }))}
                  onBlur={e => handleRangeBlur('bpmMax', e.target.value, 1, 1100)}
                  className={`${styles.input} ${localFilters.bpmMax !== '' ? styles.activeInput : ''}`}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Difficulty Range (1-19)</label>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  min="1"
                  max="19"
                  placeholder="Min"
                  value={localFilters.difficultyMin}
                  onChange={e => setLocalFilters(f => ({ ...f, difficultyMin: e.target.value }))}
                  onBlur={e => handleRangeBlur('difficultyMin', e.target.value, 1, 19)}
                  className={`${styles.input} ${localFilters.difficultyMin !== '' ? styles.activeInput : ''}`}
                />
                <input
                  type="number"
                  min="1"
                  max="19"
                  placeholder="Max"
                  value={localFilters.difficultyMax}
                  onChange={e => setLocalFilters(f => ({ ...f, difficultyMax: e.target.value }))}
                  onBlur={e => handleRangeBlur('difficultyMax', e.target.value, 1, 19)}
                  className={`${styles.input} ${localFilters.difficultyMax !== '' ? styles.activeInput : ''}`}
                />
              </div>
            </div>
            <div className={`${styles.formGroup} ${diffNamesActive ? styles.activeGroup : ''}`}>
              <label>Difficulty Names</label>
              <div className={styles.gameCheckboxes}>
                {difficultyNames.map(name => {
                  const isSelected = localFilters.difficultyNames.includes(name);
                  return (
                    <label
                      key={name}
                      className={`${styles.checkboxLabel} ${isSelected ? styles.selected : ''}`}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggleDifficultyName(name)} /> {name}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Length (seconds)</label>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  min="1"
                  max="600"
                  placeholder="Min"
                  value={localFilters.lengthMin}
                  onChange={e => setLocalFilters(f => ({ ...f, lengthMin: e.target.value }))}
                  onBlur={e => handleRangeBlur('lengthMin', e.target.value, 1, 600)}
                  className={`${styles.input} ${localFilters.lengthMin !== '' ? styles.activeInput : ''}`}
                />
                <input
                  type="number"
                  min="1"
                  max="600"
                  placeholder="Max"
                  value={localFilters.lengthMax}
                  onChange={e => setLocalFilters(f => ({ ...f, lengthMax: e.target.value }))}
                  onBlur={e => handleRangeBlur('lengthMax', e.target.value, 1, 600)}
                  className={`${styles.input} ${localFilters.lengthMax !== '' ? styles.activeInput : ''}`}
                />
              </div>
            </div>
          </div>
          <div className={styles.column}>
            <div className={styles.formGroup}>
              <label>Artist</label>
              <input
                type="text"
                value={localFilters.artist}
                onChange={e => setLocalFilters(f => ({ ...f, artist: e.target.value }))}
                className={`${styles.input} ${artistActive ? styles.activeInput : ''}`}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Song</label>
              <input
                type="text"
                value={localFilters.title}
                onChange={e => setLocalFilters(f => ({ ...f, title: e.target.value }))}
                className={`${styles.input} ${titleActive ? styles.activeInput : ''}`}
              />
            </div>
            <div className={`${styles.formGroup} ${gamesActive ? styles.activeGroup : ''}`}>
              <label>Game Versions</label>
              <div className={styles.gameCheckboxes}>
                {games.map(game => {
                  const isSelected = localFilters.games.includes(game);
                  return (
                    <label
                      key={game}
                      className={`${styles.checkboxLabel} ${isSelected ? styles.selected : ''}`}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggleGame(game)} /> {game}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Multiple BPMs</label>
              <select
                value={localFilters.multiBpm}
                onChange={e => setLocalFilters(f => ({ ...f, multiBpm: e.target.value }))}
                className={`${styles.select} ${multiBpmActive ? styles.activeInput : ''}`}
              >
                <option value="any">Any</option>
                <option value="single">Single BPM only</option>
                <option value="multiple">Multiple BPM only</option>
              </select>
            </div>
          </div>
        </div>
        <div className={styles.buttonGroup}>
          {showLists && (
            <button onClick={() => onCreateList(localFilters)} className={`${styles.button} ${styles.createListButton}`}>
              Create List
            </button>
          )}
          <div className={styles.rightButtons}>
            <button onClick={reset} className={`${styles.button} ${styles.resetButton}`}>Reset</button>
            <button onClick={onClose} className={`${styles.button} ${styles.cancelButton}`}>Cancel</button>
            <button onClick={apply} className={`${styles.button} ${styles.applyButton}`}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterModal;

