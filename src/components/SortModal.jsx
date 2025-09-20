import React, { useState, useEffect } from 'react';
import ModalShell from './ModalShell.jsx';
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
      setLocalKey(sortKey);
      setLocalAsc(ascending);
    }
  }, [isOpen, sortKey, ascending]);

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
    <ModalShell isOpen={isOpen} onClose={onClose} title="Sort Songs">
      <ModalShell.Body className={styles.body}>
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
      </ModalShell.Body>
      <ModalShell.Footer>
        <ModalShell.Button variant="secondary" onClick={reset}>
          Reset
        </ModalShell.Button>
        <ModalShell.Button variant="primary" onClick={apply}>
          Apply
        </ModalShell.Button>
      </ModalShell.Footer>
    </ModalShell>
  );
};

export default SortModal;
