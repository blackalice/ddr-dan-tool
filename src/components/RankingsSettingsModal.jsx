import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import styles from './RankingsSettingsModal.module.css';

const MIN_SCORE = 0;
const MAX_SCORE = 1000000;

const PRESET_RANGES = [
  { key: 'mfc', label: 'MFC-able', min: 999900, max: 999999 },
  { key: 'pfc', label: 'PFC-able', min: 998000, max: 998999 },
  { key: 'aaa', label: 'AAA-able', min: 980000, max: 989999 },
];

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
  onApply,
}) => {
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [error, setError] = useState('');

  const resolvedMin = sanitizeScore(minValue);
  const resolvedMax = sanitizeScore(maxValue);

  const handlePresetSelect = (preset) => {
    setMinValue(String(preset.min));
    setMaxValue(String(preset.max));
    setError('');
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setMinValue(formatForInput(closeRange?.min));
      setMaxValue(formatForInput(closeRange?.max));
      setError('');
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, closeRange]);

  if (!isOpen) return null;

  const handleApply = () => {
    const minScore = sanitizeScore(minValue);
    const maxScore = sanitizeScore(maxValue);

    if (minScore == null || maxScore == null) {
      setError('Enter whole numbers between 0 and 1,000,000.');
      return;
    }

    if (minScore > maxScore) {
      setError('Minimum score cannot exceed maximum score.');
      return;
    }

    setError('');
    onApply({ min: minScore, max: maxScore });
    onClose();
  };

  const handleReset = () => {
    setMinValue(formatForInput(defaultCloseRange?.min));
    setMaxValue(formatForInput(defaultCloseRange?.max));
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
            <h4 className={styles.sectionTitle}>Filter Close Range</h4>
            <p className={styles.sectionDescription}>
              Choose the score window used when Filter Close is enabled.
            </p>
            <div className={styles.presetGroup}>
              {PRESET_RANGES.map(preset => {
                const isActive = resolvedMin === preset.min && resolvedMax === preset.max;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={[styles.presetButton, isActive ? styles.presetButtonActive : ''].filter(Boolean).join(' ')}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
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
            <div className={styles.hint}>Scores are clamped between 0 and 1,000,000.</div>
            {error && <div className={styles.error}>{error}</div>}
          </section>
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
