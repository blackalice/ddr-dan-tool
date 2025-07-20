import React, { useState, useEffect } from 'react';
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

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 className={styles.modalHeader}>Sort Songs</h3>
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
          <button onClick={onClose} className={`${styles.button} ${styles.cancelButton}`}>Cancel</button>
          <button onClick={apply} className={`${styles.button} ${styles.applyButton}`}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default SortModal;
