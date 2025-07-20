import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import styles from './AddToListModal.module.css';

const AddToListModal = ({ isOpen, onClose, groups, onAdd }) => {
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelected(groups[0]?.name || '');
      setNewName('');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen, groups]);

  if (!isOpen) return null;

  const handleAdd = () => {
    const name = newName.trim() || selected;
    if (!name) return;
    onAdd(name);
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <h3 className={styles.modalHeader}>Add Chart to List</h3>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Select List</label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className={styles.select}
              disabled={groups.length === 0}
            >
              {groups.length === 0 ? (
                <option value="" disabled>
                  There are no lists yet
                </option>
              ) : (
                groups.map(g => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Or Create New</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className={styles.input} placeholder="New list name" />
          </div>
        </div>
        <div className={styles.buttonGroup}>
          <button onClick={handleAdd} className={`${styles.button} ${styles.applyButton}`}>Add</button>
        </div>
      </div>
    </div>
  );
};

export default AddToListModal;
