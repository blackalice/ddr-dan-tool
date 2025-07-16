import React, { useState, useEffect } from 'react';
import styles from './AddToListModal.module.css';

const CreateListModal = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed);
      onClose();
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 className={styles.modalHeader}>Create New List</h3>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>List Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={styles.input}
              placeholder="List name"
            />
          </div>
        </div>
        <div className={styles.buttonGroup}>
          <button onClick={onClose} className={`${styles.button} ${styles.cancelButton}`}>Cancel</button>
          <button onClick={handleCreate} className={`${styles.button} ${styles.applyButton}`}>Create</button>
        </div>
      </div>
    </div>
  );
};

export default CreateListModal;
