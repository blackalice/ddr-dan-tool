import React, { useState, useEffect, useRef, useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import ModalShell from './ModalShell.jsx';
import styles from './AddToListModal.module.css';

const EditChartModal = ({ isOpen, onClose, chart, options, onSave }) => {
  const [selected, setSelected] = useState(chart?.difficulty || '');
  const scrollRef = useRef(0);
  const { showRankedRatings } = useContext(SettingsContext);

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
    <ModalShell isOpen={isOpen} onClose={onClose} title="Edit Difficulty" lockScroll={false}>
      <ModalShell.Body className={styles.body}>
        <div className={styles.formGroup}>
          <label>Difficulty</label>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className={styles.select}
          >
            {options.map(o => (
              <option key={o.difficulty} value={o.difficulty}>
                {o.difficulty} (Lv.{showRankedRatings && o.rankedRating != null ? o.rankedRating : o.feet})
              </option>
            ))}
          </select>
        </div>
      </ModalShell.Body>
      <ModalShell.Footer>
        <ModalShell.Button variant="primary" onClick={handleSave}>
          Save
        </ModalShell.Button>
      </ModalShell.Footer>
    </ModalShell>
  );
};

export default EditChartModal;
