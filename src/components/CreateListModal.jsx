import React, { useState, useEffect } from 'react';
import ModalShell from './ModalShell.jsx';
import styles from './AddToListModal.module.css';

const CreateListModal = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
    }
  }, [isOpen]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed);
      onClose();
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Create New List">
      <ModalShell.Body className={styles.body}>
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
      </ModalShell.Body>
      <ModalShell.Footer>
        <ModalShell.Button variant="primary" onClick={handleCreate}>
          Create
        </ModalShell.Button>
      </ModalShell.Footer>
    </ModalShell>
  );
};

export default CreateListModal;
