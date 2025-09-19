import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faTrophy, faCalculator, faArrowsUpDownLeftRight, faList, faRankingStar, faChartColumn } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from './contexts/AuthContext.jsx';
import './Tabs.css';

const Logo = () => (
    <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor">
      <path d="M471.51,102.82h-7.97v-8.86c0-7.41-6.02-13.48-13.38-13.48h-40.46c-7.36,0-13.38,6.07-13.38,13.48v8.86h-53.74v-47.68c0-15.48-12.5-28.08-27.87-28.08h-117.42c-15.37,0-27.87,12.6-27.87,28.08v47.68h-53.74v-8.86c0-7.41-6.02-13.48-13.38-13.48h-40.46c-7.36,0-13.38,6.07-13.38,13.48v8.86h-7.97C18.34,102.82.21,121.08.21,143.41v300.95c0,22.32,18.13,40.59,40.28,40.59h431.01c22.16,0,40.28-18.26,40.28-40.59V143.41c0-22.32-18.13-40.59-40.28-40.59ZM198.41,56.27h115.19v46.55h-115.19v-46.55ZM194.86,196.21l57.76-57.76h4.25l57.76,57.76v12.74l-8.7,8.7h-12.64l-21.32-21.32v44.51l-15.07,15.07h-4.32l-15.07-15.07v-44.51l-21.32,21.32h-12.64l-8.7-8.7v-12.74ZM183.23,340.36l-8.7,8.7h-12.74l-57.76-57.76v-4.25l57.76-57.76h12.74l8.7,8.7v12.64l-21.32,21.32h44.51s15.07,15.07,15.07,15.07v4.32l-15.07,15.07h-44.51l21.32,21.32v12.64ZM314.64,382.13l-57.76,57.76h-4.25l-57.76-57.76v-12.74l8.7-8.7h12.64s21.32,21.32,21.32,21.32v-44.51l15.07-15.07h2.16s2.16,0,2.16,0l15.07,15.07v44.51l21.32-21.32h12.64l8.7,8.7v12.74ZM406.72,290.42v2.13l-57.76,57.76h-12.74l-8.7-8.7v-12.64l21.32-21.32h-44.51l-15.07-15.07v-4.32l15.07-15.07h44.51l-21.32-21.32v-12.64l8.7-8.7h12.74l57.76,57.76v2.13Z"/>
    </svg>
);

const Tabs = () => {
    const location = useLocation();
    const { user } = useAuth();

    return (
        <nav className="tabs-container">
            <div className="tabs-content">
                <div className="logo-container">
                    <Logo />
                </div>
                <div className="tabs-group">
                    <NavLink
                        to={`/bpm${location.hash}`}
                        aria-label="BPM Tool"
                        className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                    >
                        <span className="tab-icon"><FontAwesomeIcon icon={faArrowsUpDownLeftRight} /></span>
                        <span className="tab-label">BPM</span>
                    </NavLink>

                    <NavLink
                        to={`/dan${location.hash}`}
                        aria-label="Dan"
                        className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                    >
                        <span className="tab-icon">段</span>
                        <span className="tab-label">Dan</span>
                    </NavLink>

                    <NavLink
                        to={`/vega${location.hash}`}
                        aria-label="Vega"
                        className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                    >
                        <span className="tab-icon"><FontAwesomeIcon icon={faTrophy} /></span>
                        <span className="tab-label">Vega</span>
                    </NavLink>

                    <NavLink
                        to={`/multiplier${location.hash}`}
                        aria-label="Multiplier"
                        className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                    >
                        <span className="tab-icon"><FontAwesomeIcon icon={faCalculator} /></span>
                        <span className="tab-label">Multiplier</span>
                    </NavLink>

                    <NavLink
                        to={`/stats${location.hash}`}
                        aria-label="Stats"
                        className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                    >
                        <span className="tab-icon"><FontAwesomeIcon icon={faChartColumn} /></span>
                        <span className="tab-label">Stats</span>
                    </NavLink>

                    <NavLink
                        to={`/rankings${location.hash}`}
                        aria-label="Rankings"
                        className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                    >
                        <span className="tab-icon"><FontAwesomeIcon icon={faRankingStar} /></span>
                        <span className="tab-label">Rankings</span>
                    </NavLink>

                    {!!user && (
                        <NavLink
                            to={`/lists${location.hash}`}
                            aria-label="Lists"
                            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
                        >
                            <span className="tab-icon"><FontAwesomeIcon icon={faList} /></span>
                            <span className="tab-label">Lists</span>
                        </NavLink>
                    )}
                </div>
                <NavLink
                    to={`/settings${location.hash}`}
                    aria-label="Settings"
                    className={({ isActive }) => (isActive ? 'settings-tab active' : 'settings-tab')}
                >
                    <span className="tab-icon"><FontAwesomeIcon icon={faCog} /></span>
                </NavLink>
            </div>
        </nav>
    );
};

export default Tabs;
