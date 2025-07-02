import React from 'react';
import { NavLink } from 'react-router-dom';
import './Tabs.css';

const Tabs = () => {
    return (
        <nav className="tabs-container">
            <NavLink to="/bpm" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                BPM Tool
            </NavLink>
            <NavLink to="/dan" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                Dan Courses
            </NavLink>
            <NavLink to="/multiplier" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                Multiplier Calculator
            </NavLink>
        </nav>
    );
};

export default Tabs;
