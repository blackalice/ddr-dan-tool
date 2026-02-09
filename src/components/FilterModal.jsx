import React, { useState, useEffect, useContext } from 'react';
import { useFilters } from '../contexts/FilterContext.jsx';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import ModalShell from './ModalShell.jsx';
import styles from './FilterModal.module.css';
import {
  ADVANCED_FILTER_DEFAULTS,
  ADVANCED_FILTER_SECTIONS,
  hasActiveAdvancedFilters,
} from '../utils/advancedStatsFilters.js';

const difficultyNames = ['Beginner', 'Basic', 'Difficult', 'Expert', 'Challenge'];

const getStepDecimals = (step) => {
  const stepString = String(step ?? '');
  const dotIndex = stepString.indexOf('.');
  if (dotIndex === -1) return 0;
  return stepString.length - dotIndex - 1;
};

const formatMetricBound = (value, metric) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const decimals = metric.allowDecimal ? Math.min(3, getStepDecimals(metric.step)) : 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const FilterModal = ({ isOpen, onClose, games, showLists, onCreateList, getCounts, getMetricBounds }) => {
  const { filters, setFilters } = useFilters();
  const { showRankedRatings } = useContext(SettingsContext);
  const [localFilters, setLocalFilters] = useState(filters);
  const [activePage, setActivePage] = useState('basic');

  useEffect(() => {
    if (isOpen) {
      setLocalFilters(filters);
      setActivePage('basic');
    }
  }, [isOpen, filters]);

  const handleRangeBlur = (field, value, min, max, allowDecimal = false) => {
    if (value === '') return;

    let numValue = allowDecimal ? Number(value) : parseInt(value, 10);

    if (isNaN(numValue)) {
      setLocalFilters((f) => ({ ...f, [field]: '' }));
      return;
    }

    if (numValue > max) numValue = max;
    if (numValue < min) numValue = min;

    setLocalFilters((f) => ({ ...f, [field]: String(numValue) }));
  };

  const toggleGame = (game) => {
    setLocalFilters((prev) => {
      const has = prev.games.includes(game);
      return { ...prev, games: has ? prev.games.filter((g) => g !== game) : [...prev.games, game] };
    });
  };

  const toggleDifficultyName = (name) => {
    setLocalFilters((prev) => {
      const has = prev.difficultyNames.includes(name);
      return { ...prev, difficultyNames: has ? prev.difficultyNames.filter((n) => n !== name) : [...prev.difficultyNames, name] };
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
      rankedFractionMin: '',
      rankedFractionMax: '',
      lengthMin: '',
      lengthMax: '',
      games: [],
      artist: '',
      title: '',
      multiBpm: 'any',
      playedStatus: 'all',
      difficultyNames: [],
      ...ADVANCED_FILTER_DEFAULTS,
    });
  };

  const diffNamesActive = localFilters.difficultyNames.length > 0;
  const artistActive = localFilters.artist !== '';
  const titleActive = localFilters.title !== '';
  const gamesActive = localFilters.games.length > 0;
  const multiBpmActive = localFilters.multiBpm !== 'any';
  const playedStatusActive = localFilters.playedStatus !== 'all';
  const advancedActive = hasActiveAdvancedFilters(localFilters);
  const difficultyMax = showRankedRatings ? 19.99 : 19;
  const difficultyStep = showRankedRatings ? '0.05' : '1';
  const rankedFractionMax = 0.95;
  const rankedFractionStep = '0.05';
  const deferredFilters = React.useDeferredValue(localFilters);

  const counts = React.useMemo(() => {
    if (typeof getCounts !== 'function') return null;
    return getCounts(deferredFilters);
  }, [deferredFilters, getCounts]);
  const metricBounds = React.useMemo(() => {
    if (activePage !== 'advanced') return null;
    if (typeof getMetricBounds !== 'function') return null;
    return getMetricBounds(deferredFilters);
  }, [activePage, deferredFilters, getMetricBounds]);

  const showCounts = counts && Number.isFinite(counts.total);
  const showCharts = showCounts && Number.isFinite(counts.chartsTotal);

  const footerAlign = showLists ? 'space-between' : 'right';

  const sectionIsActive = (section) => {
    return section.metrics.some((metric) => {
      const minKey = `${metric.key}Min`;
      const maxKey = `${metric.key}Max`;
      return localFilters[minKey] !== '' || localFilters[maxKey] !== '';
    });
  };

  const countContent = showCounts ? (
    <div className={styles.formGroup}>
      <div className={styles.countGrid}>
        <div className={styles.countHeader}>
          <span className={styles.countHeaderSpacer}></span>
          <span className={styles.countHeaderLabel}>Filtered</span>
          <span className={styles.countHeaderLabel}>Total</span>
        </div>
        <div className={styles.countRow}>
          <span className={styles.countLabelCell}>Songs</span>
          <span className={styles.countValue}>{counts.filtered}</span>
          <span className={styles.countValue}>{counts.total}</span>
        </div>
        {showCharts && (
          <div className={styles.countRow}>
            <span className={styles.countLabelCell}>Charts</span>
            <span className={styles.countValue}>{counts.chartsFiltered}</span>
            <span className={styles.countValue}>{counts.chartsTotal}</span>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Song Filters" size="lg">
      <ModalShell.Body className={styles.body}>
        <div className={styles.pageTabs}>
          <button
            type="button"
            className={`${styles.pageTab} ${activePage === 'basic' ? styles.pageTabActive : ''}`}
            onClick={() => setActivePage('basic')}
          >
            Basic Filters
          </button>
          <button
            type="button"
            className={`${styles.pageTab} ${activePage === 'advanced' ? styles.pageTabActive : ''} ${advancedActive ? styles.pageTabHasActive : ''}`}
            onClick={() => setActivePage('advanced')}
          >
            Advanced Filters
          </button>
        </div>

        {activePage === 'basic' ? (
          <div className={styles.columns}>
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
                    onChange={(e) => setLocalFilters((f) => ({ ...f, bpmMin: e.target.value }))}
                    onBlur={(e) => handleRangeBlur('bpmMin', e.target.value, 1, 1100)}
                    className={`${styles.input} ${localFilters.bpmMin !== '' ? styles.activeInput : ''}`}
                  />
                  <input
                    type="number"
                    min="1"
                    max="1100"
                    placeholder="Max"
                    value={localFilters.bpmMax}
                    onChange={(e) => setLocalFilters((f) => ({ ...f, bpmMax: e.target.value }))}
                    onBlur={(e) => handleRangeBlur('bpmMax', e.target.value, 1, 1100)}
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
                    max={difficultyMax}
                    step={difficultyStep}
                    placeholder="Min"
                    value={localFilters.difficultyMin}
                    onChange={(e) => setLocalFilters((f) => ({ ...f, difficultyMin: e.target.value }))}
                    onBlur={(e) => handleRangeBlur('difficultyMin', e.target.value, 1, difficultyMax, showRankedRatings)}
                    className={`${styles.input} ${localFilters.difficultyMin !== '' ? styles.activeInput : ''}`}
                  />
                  <input
                    type="number"
                    min="1"
                    max={difficultyMax}
                    step={difficultyStep}
                    placeholder="Max"
                    value={localFilters.difficultyMax}
                    onChange={(e) => setLocalFilters((f) => ({ ...f, difficultyMax: e.target.value }))}
                    onBlur={(e) => handleRangeBlur('difficultyMax', e.target.value, 1, difficultyMax, showRankedRatings)}
                    className={`${styles.input} ${localFilters.difficultyMax !== '' ? styles.activeInput : ''}`}
                  />
                </div>
              </div>
              {showRankedRatings && (
                <div className={styles.formGroup}>
                  <label>Ranked Decimal Range (0.00-0.95)</label>
                  <div className={styles.inputGroup}>
                    <input
                      type="number"
                      min="0"
                      max={rankedFractionMax}
                      step={rankedFractionStep}
                      placeholder="Min"
                      value={localFilters.rankedFractionMin}
                      onChange={(e) => setLocalFilters((f) => ({ ...f, rankedFractionMin: e.target.value }))}
                      onBlur={(e) => handleRangeBlur('rankedFractionMin', e.target.value, 0, rankedFractionMax, true)}
                      className={`${styles.input} ${localFilters.rankedFractionMin !== '' ? styles.activeInput : ''}`}
                    />
                    <input
                      type="number"
                      min="0"
                      max={rankedFractionMax}
                      step={rankedFractionStep}
                      placeholder="Max"
                      value={localFilters.rankedFractionMax}
                      onChange={(e) => setLocalFilters((f) => ({ ...f, rankedFractionMax: e.target.value }))}
                      onBlur={(e) => handleRangeBlur('rankedFractionMax', e.target.value, 0, rankedFractionMax, true)}
                      className={`${styles.input} ${localFilters.rankedFractionMax !== '' ? styles.activeInput : ''}`}
                    />
                  </div>
                </div>
              )}
              <div className={`${styles.formGroup} ${diffNamesActive ? styles.activeGroup : ''}`}>
                <label>Difficulty Names</label>
                <div className={styles.gameCheckboxes}>
                  {difficultyNames.map((name) => {
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
                    onChange={(e) => setLocalFilters((f) => ({ ...f, lengthMin: e.target.value }))}
                    onBlur={(e) => handleRangeBlur('lengthMin', e.target.value, 1, 600)}
                    className={`${styles.input} ${localFilters.lengthMin !== '' ? styles.activeInput : ''}`}
                  />
                  <input
                    type="number"
                    min="1"
                    max="600"
                    placeholder="Max"
                    value={localFilters.lengthMax}
                    onChange={(e) => setLocalFilters((f) => ({ ...f, lengthMax: e.target.value }))}
                    onBlur={(e) => handleRangeBlur('lengthMax', e.target.value, 1, 600)}
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
                  onChange={(e) => setLocalFilters((f) => ({ ...f, artist: e.target.value }))}
                  className={`${styles.input} ${artistActive ? styles.activeInput : ''}`}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Song</label>
                <input
                  type="text"
                  value={localFilters.title}
                  onChange={(e) => setLocalFilters((f) => ({ ...f, title: e.target.value }))}
                  className={`${styles.input} ${titleActive ? styles.activeInput : ''}`}
                />
              </div>
              <div className={`${styles.formGroup} ${gamesActive ? styles.activeGroup : ''}`}>
                <label>Game Versions</label>
                <div className={styles.gameCheckboxes}>
                  {games.map((game) => {
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
              <div className={styles.halfWidthContainer}>
                <div className={`${styles.formGroup} ${multiBpmActive ? styles.activeGroup : ''}`}>
                  <label>Multiple BPMs</label>
                  <select
                    value={localFilters.multiBpm}
                    onChange={(e) => setLocalFilters((f) => ({ ...f, multiBpm: e.target.value }))}
                    className={`${styles.select} ${multiBpmActive ? styles.activeInput : ''}`}
                  >
                    <option value="any">Any</option>
                    <option value="single">Single BPM only</option>
                    <option value="multiple">Multiple BPM only</option>
                  </select>
                </div>
                <div className={`${styles.formGroup} ${playedStatusActive ? styles.activeGroup : ''}`}>
                  <label>Played Status</label>
                  <select
                    value={localFilters.playedStatus}
                    onChange={(e) => setLocalFilters((f) => ({ ...f, playedStatus: e.target.value }))}
                    className={`${styles.select} ${playedStatusActive ? styles.activeInput : ''}`}
                  >
                    <option value="all">All</option>
                    <option value="played">Played</option>
                    <option value="notPlayed">Not Played</option>
                  </select>
                </div>
              </div>
              {countContent}
            </div>
          </div>
        ) : (
          <div className={styles.advancedLayout}>
            <div className={styles.advancedSections}>
              {ADVANCED_FILTER_SECTIONS.map((section) => (
                <section
                  key={section.key}
                  className={`${styles.advancedSection} ${sectionIsActive(section) ? styles.activeGroup : ''}`}
                >
                  <h3>{section.title}</h3>
                  <div className={styles.advancedMetricGrid}>
                    {section.metrics.map((metric) => {
                      const minKey = `${metric.key}Min`;
                      const maxKey = `${metric.key}Max`;
                      const minValue = localFilters[minKey] ?? '';
                      const maxValue = localFilters[maxKey] ?? '';
                      const metricActive = minValue !== '' || maxValue !== '';
                      const bounds = metricBounds?.[metric.key];
                      const hasBounds = Number.isFinite(bounds?.count) && bounds.count > 0;
                      const boundsText = hasBounds
                        ? `Available: ${formatMetricBound(bounds.min, metric)} - ${formatMetricBound(bounds.max, metric)}`
                        : 'Available: --';

                      return (
                        <div key={metric.key} className={`${styles.advancedMetric} ${metricActive ? styles.activeGroup : ''}`}>
                          <label>{metric.label}</label>
                          <div className={styles.inputGroup}>
                            <input
                              type="number"
                              min={metric.min}
                              max={metric.max}
                              step={metric.step}
                              placeholder="Min"
                              value={minValue}
                              onChange={(e) => setLocalFilters((f) => ({ ...f, [minKey]: e.target.value }))}
                              onBlur={(e) => handleRangeBlur(minKey, e.target.value, metric.min, metric.max, metric.allowDecimal)}
                              className={`${styles.input} ${minValue !== '' ? styles.activeInput : ''}`}
                            />
                            <input
                              type="number"
                              min={metric.min}
                              max={metric.max}
                              step={metric.step}
                              placeholder="Max"
                              value={maxValue}
                              onChange={(e) => setLocalFilters((f) => ({ ...f, [maxKey]: e.target.value }))}
                              onBlur={(e) => handleRangeBlur(maxKey, e.target.value, metric.min, metric.max, metric.allowDecimal)}
                              className={`${styles.input} ${maxValue !== '' ? styles.activeInput : ''}`}
                            />
                          </div>
                          <p className={styles.metricHint}>{boundsText}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {countContent}
          </div>
        )}
      </ModalShell.Body>
      <ModalShell.Footer align={footerAlign}>
        {showLists && (
          <ModalShell.Button
            variant="secondary"
            className={styles.createListButton}
            onClick={() => onCreateList(localFilters)}
          >
            Create List
          </ModalShell.Button>
        )}
        <ModalShell.FooterActions className={styles.footerButtons}>
          <ModalShell.Button variant="secondary" onClick={reset}>
            Reset
          </ModalShell.Button>
          <ModalShell.Button variant="primary" onClick={apply}>
            Apply
          </ModalShell.Button>
        </ModalShell.FooterActions>
      </ModalShell.Footer>
    </ModalShell>
  );
};

export default FilterModal;
