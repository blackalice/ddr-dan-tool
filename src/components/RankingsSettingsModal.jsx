import React, { useEffect, useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faCircleExclamation, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import styles from './RankingsSettingsModal.module.css';

const MIN_SCORE = 0;
const MAX_SCORE = 1000000;

const CLOSE_RANGE_PRESETS = [
  { key: 'mfc', label: 'MFC-able', min: 999900, max: 999999 },
  { key: 'pfc', label: 'PFC-able', min: 998000, max: 998999 },
  { key: 'aaa', label: 'AAA-able', min: 980000, max: 989999 },
];

const PLAYED_OPTIONS = [
  { value: 'hidePlayed', label: 'Hide played' },
  { value: 'hideUnplayed', label: 'Hide unplayed' },
  { value: 'off', label: 'Off' },
];

const HIDE_OPTIONS = [
  { value: 'lamp:perfect', label: 'Perfect FC or better', type: 'lamp', lamp: 'perfect', threshold: 989999 },
  { value: 'lamp:great', label: 'Great FC or better', type: 'lamp', lamp: 'great', threshold: 989999 },
  { value: 'lamp:good', label: 'Good FC or better', type: 'lamp', lamp: 'good', threshold: 989999 },
  { value: 'grade:AAA', label: 'AAA (≥ 990,000)', type: 'grade', threshold: 989999 },
  { value: 'grade:AA+', label: 'AA+ (≥ 950,000)', type: 'grade', threshold: 949999 },
  { value: 'grade:AA', label: 'AA (≥ 900,000)', type: 'grade', threshold: 899999 },
  { value: 'grade:AA-', label: 'AA- (≥ 890,000)', type: 'grade', threshold: 889999 },
  { value: 'grade:A+', label: 'A+ (≥ 850,000)', type: 'grade', threshold: 849999 },
  { value: 'grade:A', label: 'A (≥ 800,000)', type: 'grade', threshold: 799999 },
  { value: 'grade:A-', label: 'A- (≥ 790,000)', type: 'grade', threshold: 789999 },
  { value: 'grade:B+', label: 'B+ (≥ 750,000)', type: 'grade', threshold: 749999 },
  { value: 'grade:B', label: 'B (≥ 700,000)', type: 'grade', threshold: 699999 },
  { value: 'grade:B-', label: 'B- (≥ 690,000)', type: 'grade', threshold: 689999 },
  { value: 'grade:C+', label: 'C+ (≥ 650,000)', type: 'grade', threshold: 649999 },
  { value: 'grade:C', label: 'C (≥ 600,000)', type: 'grade', threshold: 599999 },
  { value: 'grade:C-', label: 'C- (≥ 590,000)', type: 'grade', threshold: 589999 },
  { value: 'grade:D+', label: 'D+ (≥ 550,000)', type: 'grade', threshold: 549999 },
];

const DEFAULT_HIDE_SELECTION = 'grade:AAA';

const formatForInput = (value) => {
  if (value == null) return '';
  return String(value);
};

const sanitizeScore = (value) => {
  if (value === '' || value == null) return null;
  const numeric = Math.round(Number(value));
  if (Number.isNaN(numeric)) return null;
  const clamped = Math.min(Math.max(numeric, MIN_SCORE), MAX_SCORE);
  return clamped;
};

const RankingsSettingsModal = ({
  isOpen,
  onClose,
  closeRange,
  defaultCloseRange,
  hideThreshold,
  defaultHideThreshold,
  hideLamp,
  hidePlayedMode,
  onApply,
}) => {
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [hideSelection, setHideSelection] = useState(DEFAULT_HIDE_SELECTION);
  const [playedSelection, setPlayedSelection] = useState('off');
  const [error, setError] = useState('');

  const resolvedMin = sanitizeScore(minValue);
  const resolvedMax = sanitizeScore(maxValue);

  const selectedHideOption = useMemo(
    () => HIDE_OPTIONS.find(option => option.value === hideSelection) || null,
    [hideSelection],
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setMinValue(formatForInput(closeRange?.min));
      setMaxValue(formatForInput(closeRange?.max));

      if (hideLamp) {
        const lampValue = 'lamp:' + String(hideLamp).toLowerCase();
        setHideSelection(
          HIDE_OPTIONS.some(option => option.value === lampValue)
            ? lampValue
            : DEFAULT_HIDE_SELECTION,
        );
      } else if (hideThreshold != null) {
        const matchingGrade = HIDE_OPTIONS.find(option => option.type === 'grade' && option.threshold === hideThreshold);
        if (matchingGrade) {
          setHideSelection(matchingGrade.value);
        } else {
          const fallbackGrade = HIDE_OPTIONS.find(option => option.type === 'grade' && option.threshold === defaultHideThreshold);
          setHideSelection(fallbackGrade ? fallbackGrade.value : DEFAULT_HIDE_SELECTION);
        }
      } else {
        setHideSelection(DEFAULT_HIDE_SELECTION);
      }

      const normalizedPlayed = String(hidePlayedMode || 'off').toLowerCase();
      if (normalizedPlayed === 'hideplayed') setPlayedSelection('hidePlayed');
      else if (normalizedPlayed === 'hideunplayed') setPlayedSelection('hideUnplayed');
      else setPlayedSelection('off');

      setError('');
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, closeRange, hideLamp, hideThreshold, defaultHideThreshold, hidePlayedMode]);

  if (!isOpen) return null;

  const handleApply = () => {
    const minScore = sanitizeScore(minValue);
    const maxScore = sanitizeScore(maxValue);

    if (minScore == null || maxScore == null) {
      setError('Enter whole numbers between 0 and 1,000,000 for Filter Close range.');
      return;
    }

    if (minScore > maxScore) {
      setError('Minimum score cannot exceed maximum score.');
      return;
    }

    if (!selectedHideOption) {
      setError('Choose how you want to hide cleared scores.');
      return;
    }

    let thresholdValue = defaultHideThreshold;
    let lampValue = null;

    if (selectedHideOption.type === 'lamp') {
      lampValue = selectedHideOption.lamp;
      thresholdValue = selectedHideOption.threshold ?? defaultHideThreshold;
    } else if (selectedHideOption.type === 'grade') {
      thresholdValue = selectedHideOption.threshold;
    }

    setError('');
    onApply({
      closeRange: { min: minScore, max: maxScore },
      hideCleared: { threshold: thresholdValue, lamp: lampValue },
      hidePlayedMode: playedSelection,
    });
    onClose();
  };

  const handleReset = () => {
    setMinValue(formatForInput(defaultCloseRange?.min));
    setMaxValue(formatForInput(defaultCloseRange?.max));
    const fallbackGrade = HIDE_OPTIONS.find(option => option.type === 'grade' && option.threshold === defaultHideThreshold);
    setHideSelection(fallbackGrade ? fallbackGrade.value : DEFAULT_HIDE_SELECTION);
    setPlayedSelection('off');
    setError('');
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={event => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Rankings Settings</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <section className={styles.formSection}>
            <h4 className={styles.sectionTitle}>
              <FontAwesomeIcon icon={faCircleExclamation} className={styles.sectionIcon} />
              Filter Close Range
            </h4>
            <div className={styles.rangeInputs}>
              <div className={styles.inputRow}>
                <label className={styles.inputLabel} htmlFor="close-range-min">Minimum score</label>
                <input
                  id="close-range-min"
                  type="number"
                  min={MIN_SCORE}
                  max={MAX_SCORE}
                  step="1"
                  value={minValue}
                  onChange={event => setMinValue(event.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.inputRow}>
                <label className={styles.inputLabel} htmlFor="close-range-max">Maximum score</label>
                <input
                  id="close-range-max"
                  type="number"
                  min={MIN_SCORE}
                  max={MAX_SCORE}
                  step="1"
                  value={maxValue}
                  onChange={event => setMaxValue(event.target.value)}
                  className={styles.input}
                />
              </div>
            </div>
            <div className={styles.presetGroup}>
              {CLOSE_RANGE_PRESETS.map(preset => {
                const isActive = resolvedMin === preset.min && resolvedMax === preset.max;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={[styles.presetButton, isActive ? styles.presetButtonActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      setMinValue(String(preset.min));
                      setMaxValue(String(preset.max));
                    }}
                    aria-pressed={isActive}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>
          <section className={styles.formSection}>
            <h4 className={styles.sectionTitle}>
              <FontAwesomeIcon icon={faEyeSlash} className={styles.sectionIcon} />
              Hide Cleared Threshold
            </h4>
            <div className={styles.selectRow}>
              <label className={styles.inputLabel} htmlFor="hide-selection">
                Hide cleared charts
              </label>
              <select
                id="hide-selection"
                className={styles.select}
                value={hideSelection}
                onChange={event => setHideSelection(event.target.value)}
              >
                {HIDE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
          <section className={styles.formSection}>
            <h4 className={styles.sectionTitle}>
              Hide Played Status
            </h4>
            <div className={styles.toggleGroup}>
              {PLAYED_OPTIONS.map(option => {
                const isActive = playedSelection === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={[styles.toggleButton, isActive ? styles.toggleButtonActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setPlayedSelection(option.value)}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.buttonGroup}>
          <button className={[styles.button, styles.resetButton].join(' ')} type="button" onClick={handleReset}>
            Reset
          </button>
          <button className={[styles.button, styles.cancelButton].join(' ')} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={[styles.button, styles.applyButton].join(' ')} type="button" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default RankingsSettingsModal;
