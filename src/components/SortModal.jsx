import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import styles from './AddToListModal.module.css';

const SORT_OPTIONS = [
  { value: 'title', label: 'Song Name' },
  { value: 'artist', label: 'Artist Name' },
  { value: 'level', label: 'Level' },
  { value: 'bpmHigh', label: 'Highest BPM' },
  { value: 'bpmLow', label: 'Lowest BPM' },
  { value: 'game', label: 'Game Version' },
];

const SortModal = ({ isOpen, onClose, sortKey, setSortKey, ascending, setAscending }) => {
  const [localKey, setLocalKey] = useState(sortKey);
  const [localAsc, setLocalAsc] = useState(ascending);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setLocalKey(sortKey);
      setLocalAsc(ascending);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen, sortKey, ascending]);

  if (!isOpen) return null;

  const apply = () => {
    setSortKey(localKey);
    setAscending(localAsc);
    onClose();
  };

  const reset = () => {
    setLocalKey('title');
    setLocalAsc(true);
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Sort Songs</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Sort By</label>
            <select className={styles.select} value={localKey} onChange={e => setLocalKey(e.target.value)}>
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Order</label>
            <select className={styles.select} value={localAsc ? 'asc' : 'desc'} onChange={e => setLocalAsc(e.target.value === 'asc')}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
        <div className={styles.buttonGroup}>
          <button onClick={reset} className={`${styles.button} ${styles.resetButton}`}>Reset</button>
          <button onClick={apply} className={`${styles.button} ${styles.applyButton}`}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default SortModal;
