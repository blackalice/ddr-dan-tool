import React, { useState, useEffect, useRef } from 'react';
import styles from './AddToListModal.module.css';

const EditChartModal = ({ isOpen, onClose, chart, options, onSave }) => {
  const [selected, setSelected] = useState(chart?.difficulty || '');
  const scrollRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(chart?.difficulty || '');
    scrollRef.current = window.scrollY;
    const sbWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollRef.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.paddingRight = `${sbWidth}px`;
    return () => {
      const y = scrollRef.current;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.paddingRight = '';
      window.scrollTo(0, y);
    };
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
