import React, { useState, useEffect } from 'react';
import styles from './AddToListModal.module.css';

const EditChartModal = ({ isOpen, onClose, chart, options, onSave }) => {
  const [selected, setSelected] = useState(chart?.difficulty || '');

  useEffect(() => {
    if (isOpen) {
      setSelected(chart?.difficulty || '');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen, chart]);

  if (!isOpen || !chart) return null;

  const handleSave = () => {
    const opt = options.find(o => o.difficulty === selected);
    if (opt) {
      onSave(opt);
    }
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 className={styles.modalHeader}>Edit Difficulty</h3>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Difficulty</label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className={styles.select}
            >
              {options.map(o => (
                <option key={o.difficulty} value={o.difficulty}>
                  {o.difficulty} (Lv.{o.feet})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.buttonGroup}>
          <button onClick={onClose} className={`${styles.button} ${styles.cancelButton}`}>Cancel</button>
          <button onClick={handleSave} className={`${styles.button} ${styles.applyButton}`}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default EditChartModal;
