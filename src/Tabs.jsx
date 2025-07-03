import React from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import './Tabs.css';

const Tabs = () => {
    return (
        <nav className="tabs-container">
            <NavLink to="/bpm" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                BPM
            </NavLink>
            <NavLink to="/dan" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                Dan
            </NavLink>
            <NavLink to="/multiplier" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                Multi
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                <FontAwesomeIcon icon={faCog} />
            </NavLink>
        </nav>
    );
};

export default Tabs;
