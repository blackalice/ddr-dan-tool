import React, { useState, useEffect } from 'react';
import ModalShell from './ModalShell.jsx';
import styles from './AddToListModal.module.css';

const AddToListModal = ({ isOpen, onClose, groups, onAdd }) => {
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelected(groups[0]?.name || '');
      setNewName('');
    }
  }, [isOpen, groups]);

  const handleAdd = () => {
    const name = newName.trim() || selected;
    if (!name) return;
    onAdd(name);
    onClose();
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Add Chart to List">
      <ModalShell.Body className={styles.body}>
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
      </ModalShell.Body>
      <ModalShell.Footer>
        <ModalShell.Button variant="primary" onClick={handleAdd}>
          Add
        </ModalShell.Button>
      </ModalShell.Footer>
    </ModalShell>
  );
};

export default AddToListModal;
