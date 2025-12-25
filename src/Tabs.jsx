import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCog,
  faTrophy,
  faCalculator,
  faArrowsUpDownLeftRight,
  faList,
  faRankingStar,
  faChartColumn,
  faBars,
  faTimes,
  faDice,
  faRightToBracket,
} from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "./contexts/AuthContext.jsx";
import { useScores } from "./contexts/ScoresContext.jsx";
import { SettingsContext } from "./contexts/SettingsContext.jsx";
import "./Tabs.css";

const Logo = () => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    fill="currentColor"
  >
    <path d="M471.51,102.82h-7.97v-8.86c0-7.41-6.02-13.48-13.38-13.48h-40.46c-7.36,0-13.38,6.07-13.38,13.48v8.86h-53.74v-47.68c0-15.48-12.5-28.08-27.87-28.08h-117.42c-15.37,0-27.87,12.6-27.87,28.08v47.68h-53.74v-8.86c0-7.41-6.02-13.48-13.38-13.48h-40.46c-7.36,0-13.38,6.07-13.38,13.48v8.86h-7.97C18.34,102.82.21,121.08.21,143.41v300.95c0,22.32,18.13,40.59,40.28,40.59h431.01c22.16,0,40.28-18.26,40.28-40.59V143.41c0-22.32-18.13-40.59-40.28-40.59ZM198.41,56.27h115.19v46.55h-115.19v-46.55ZM194.86,196.21l57.76-57.76h4.25l57.76,57.76v12.74l-8.7,8.7h-12.64l-21.32-21.32v44.51l-15.07,15.07h-4.32l-15.07-15.07v-44.51l-21.32,21.32h-12.64l-8.7-8.7v-12.74ZM183.23,340.36l-8.7,8.7h-12.74l-57.76-57.76v-4.25l57.76-57.76h12.74l8.7,8.7v12.64l-21.32,21.32h44.51s15.07,15.07,15.07,15.07v4.32l-15.07,15.07h-44.51l21.32,21.32v12.64ZM314.64,382.13l-57.76,57.76h-4.25l-57.76-57.76v-12.74l8.7-8.7h12.64s21.32,21.32,21.32,21.32v-44.51l15.07-15.07h2.16s2.16,0,2.16,0l15.07,15.07v44.51l21.32-21.32h12.64l8.7,8.7v12.74ZM406.72,290.42v2.13l-57.76,57.76h-12.74l-8.7-8.7v-12.64l21.32-21.32h-44.51l-15.07-15.07v-4.32l15.07-15.07h44.51l-21.32-21.32v-12.64l8.7-8.7h12.74l57.76,57.76v2.13Z" />
  </svg>
);

const Tabs = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { scores } = useScores();
  const settings = React.useContext(SettingsContext) || {};
  const { playStyle, setPlayStyle, targetBPM, setTargetBPM, showCoursesBeta } = settings;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuNoTransition, setMenuNoTransition] = React.useState(false);
  const [targetBpmInput, setTargetBpmInput] = React.useState(() =>
    String(targetBPM ?? 300),
  );

  const hasUploadedScores = React.useMemo(() => {
    if (!scores || typeof scores !== "object") return false;
    return ["single", "double"].some((mode) => {
      const entries = scores?.[mode];
      return (
        entries &&
        typeof entries === "object" &&
        Object.keys(entries).length > 0
      );
    });
  }, [scores]);

  const hash = location.hash || "";

  React.useEffect(() => {
    setTargetBpmInput(String(targetBPM ?? 300));
  }, [targetBPM]);

  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [menuOpen]);

  const commitTargetBpm = React.useCallback(
    (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        setTargetBpmInput(String(targetBPM ?? 300));
        return;
      }
      const clamped = Math.min(Math.max(Math.round(numeric), 50), 900);
      setTargetBpmInput(String(clamped));
      setTargetBPM?.(clamped);
    },
    [setTargetBPM, targetBPM],
  );

  const handleTargetBpmInputChange = React.useCallback((event) => {
    setTargetBpmInput(event.target.value);
  }, []);

  const handleTargetBpmCommit = React.useCallback(() => {
    commitTargetBpm(targetBpmInput);
  }, [commitTargetBpm, targetBpmInput]);

  const handleTargetBpmKeyDown = React.useCallback(
    (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitTargetBpm(event.currentTarget.value);
      event.currentTarget.blur();
    },
    [commitTargetBpm],
  );

  const navLinks = React.useMemo(() => {
    const links = [
      {
        key: "bpm",
        to: `/bpm${hash}`,
        label: "BPM Tool",
        shortLabel: "BPM",
        icon: <FontAwesomeIcon icon={faArrowsUpDownLeftRight} />,
        primary: true,
      },
      {
        key: "rankings",
        to: `/rankings${hash}`,
        label: "Rankings",
        shortLabel: "Rankings",
        icon: <FontAwesomeIcon icon={faRankingStar} />,
        primary: true,
      },
      {
        key: "multiplier",
        to: `/multiplier${hash}`,
        label: "Multiplier",
        shortLabel: "Multiplier",
        icon: <FontAwesomeIcon icon={faCalculator} />,
        primary: true,
      },
      {
        key: "card-draw",
        to: `/card-draw${hash}`,
        label: "Card Draw",
        shortLabel: "Draw",
        icon: <FontAwesomeIcon icon={faDice} />,
        primary: true,
      },
      {
        key: "dan",
        to: `/dan${hash}`,
        label: "Dan Courses",
        shortLabel: "Dan",
        icon: "段",
        primary: true,
      },
      {
        key: "vega",
        to: `/vega${hash}`,
        label: "Vega Rankings",
        shortLabel: "Vega",
        icon: <FontAwesomeIcon icon={faTrophy} />,
        primary: false,
      },
    ];

    // Insert Courses tab after Dan (Beta toggle)
    if (showCoursesBeta) {
      links.splice(4, 0, {
        key: "courses",
        to: `/courses${hash}`,
        label: "Courses",
        shortLabel: "Courses",
        icon: <FontAwesomeIcon icon={faList} />,
        primary: true,
      });
    }

    if (user && hasUploadedScores) {
      links.push({
        key: "stats",
        to: `/stats${hash}`,
        label: "Stats",
        shortLabel: "Stats",
        icon: <FontAwesomeIcon icon={faChartColumn} />,
        primary: false,
      });
    }

    if (user) {
      links.push({
        key: "lists",
        to: `/lists${hash}`,
        label: "Lists",
        shortLabel: "Lists",
        icon: <FontAwesomeIcon icon={faList} />,
        primary: false,
      });
    }

    links.push({
      key: "settings",
      to: `/settings${hash}`,
      label: "Settings",
      shortLabel: "Settings",
      icon: <FontAwesomeIcon icon={faCog} />,
      primary: false,
    });

    return links;
  }, [hash, user, hasUploadedScores, showCoursesBeta]);

  const normalizedLocation = React.useMemo(
    () => `${location.pathname}${location.search || ""}${location.hash || ""}`,
    [location.hash, location.pathname, location.search],
  );

  const previousLocationRef = React.useRef(normalizedLocation);

  React.useEffect(() => {
    const previousLocation = previousLocationRef.current;
    if (previousLocation === normalizedLocation) {
      return;
    }

    previousLocationRef.current = normalizedLocation;

    if (!menuOpen) {
      return;
    }

    setMenuNoTransition(true);
    setMenuOpen(false);
  }, [normalizedLocation, menuOpen]);

  React.useEffect(() => {
    if (!menuNoTransition) return undefined;
    const id = window.requestAnimationFrame(() => setMenuNoTransition(false));
    return () => window.cancelAnimationFrame(id);
  }, [menuNoTransition]);

  const handleMenuToggle = () => {
    setMenuNoTransition(false);
    setMenuOpen((prev) => !prev);
  };

  const handleMenuLinkClick = React.useCallback(
    (event, nextHref) => {
      if (event) {
        event.stopPropagation();
      }

      const targetHref = typeof nextHref === "string" ? nextHref : undefined;

      setMenuNoTransition(true);

      if (!targetHref || targetHref === normalizedLocation) {
        setMenuOpen(false);
      }
    },
    [normalizedLocation],
  );

  const handleLogout = async () => {
    setMenuNoTransition(true);
    setMenuOpen(false);
    try {
      await logout();
    } catch (error) {
      console.warn("Logout failed", error);
    }
  };

  const primaryLinks = navLinks.filter((link) => link.primary);
  const secondaryLinks = navLinks.filter((link) => !link.primary);
  const settingsLink = navLinks.find((link) => link.key === "settings");
  const headerLinks = [
    ...primaryLinks,
    ...secondaryLinks.filter((link) => link.key !== "settings"),
  ];

  return (
    <nav className="tabs-container">
      <div className="tabs-content">
        <div className="logo-container">
          <Logo />
        </div>
        <div className="tabs-group">
          {headerLinks.map((link) => (
            <NavLink
              key={link.key}
              to={link.to}
              aria-label={link.label}
              className={({ isActive }) => {
                const base = `tab${link.primary ? " tab--primary" : " tab--secondary"}`;
                return isActive ? `${base} active` : base;
              }}
            >
              <span className="tab-icon">{link.icon}</span>
              <span className="tab-label">{link.shortLabel}</span>
            </NavLink>
          ))}
        </div>
        {settingsLink && (
          <div className="settings-actions">
            <NavLink
              to={settingsLink.to}
              aria-label={settingsLink.label}
              className={({ isActive }) =>
                isActive
                  ? "settings-tab settings-tab-desktop active"
                  : "settings-tab settings-tab-desktop"
              }
            >
              <span className="tab-icon">{settingsLink.icon}</span>
            </NavLink>
            {!user?.email && (
              <NavLink
                to={`/login${hash}`}
                aria-label="Log in"
                className={({ isActive }) =>
                  isActive
                    ? "settings-tab settings-tab-desktop active"
                    : "settings-tab settings-tab-desktop"
                }
              >
                <span className="tab-icon">
                  <FontAwesomeIcon icon={faRightToBracket} />
                </span>
              </NavLink>
            )}
          </div>
        )}
        <button
          className={`mobile-menu-toggle${menuOpen ? " open" : ""}`}
          type="button"
          onClick={handleMenuToggle}
          aria-label={
            menuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          aria-expanded={menuOpen}
        >
          <FontAwesomeIcon icon={menuOpen ? faTimes : faBars} />
        </button>
      </div>
      <div
        className={`mobile-menu${menuOpen ? " open" : ""}${menuNoTransition ? " no-transition" : ""}`}
      >
        <div className="mobile-menu-inner">
          <div className="mobile-menu-scroll">
            <div className="mobile-menu-header">
              <div className="mobile-menu-title">Menu</div>
              <button
                className="mobile-menu-close"
                onClick={handleMenuToggle}
                aria-label="Close navigation menu"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="mobile-menu-links">
              {[...primaryLinks, ...secondaryLinks].map((link) => (
                <NavLink
                  key={`mobile-${link.key}`}
                  to={link.to}
                  aria-label={link.label}
                  className={({ isActive }) =>
                    isActive ? "mobile-menu-link active" : "mobile-menu-link"
                  }
                  onClick={(event) => handleMenuLinkClick(event, link.to)}
                >
                  <span className="mobile-menu-icon">{link.icon}</span>
                  <span className="mobile-menu-label">{link.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="mobile-menu-section">
              <div className="mobile-section-title">Play Style</div>
              <div className="mobile-toggle-group">
                {["single", "double"].map((style) => (
                  <button
                    key={style}
                    type="button"
                    className={`mobile-toggle${(playStyle || "single") === style ? " active" : ""}`}
                    onClick={() => setPlayStyle?.(style)}
                    aria-pressed={(playStyle || "single") === style}
                  >
                    {style === "single" ? "Single" : "Double"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mobile-menu-section">
              <div className="mobile-section-title">Target Scroll Speed</div>
              <div className="mobile-target-input">
                <input
                  type="number"
                  inputMode="numeric"
                  min="50"
                  max="900"
                  step="5"
                  value={targetBpmInput}
                  onChange={handleTargetBpmInputChange}
                  onBlur={handleTargetBpmCommit}
                  onKeyDown={handleTargetBpmKeyDown}
                  aria-label="Target scroll speed"
                />
                <span className="mobile-target-suffix">BPM</span>
              </div>
            </div>
          </div>
          <div className="mobile-menu-footer">
            <div className="mobile-account-info">
              {user?.email ? (
                <>
                  <span className="mobile-account-label">Signed in as</span>
                  <span className="mobile-account-email">{user.email}</span>
                </>
              ) : (
                <>
                  <span className="mobile-account-label">Not signed in</span>
                  <span className="mobile-account-email">
                    Log in to sync scores
                  </span>
                </>
              )}
            </div>
            {user?.email ? (
              <button
                type="button"
                className="mobile-menu-link mobile-menu-action"
                onClick={handleLogout}
              >
                <span className="mobile-menu-label">Log out</span>
              </button>
            ) : (
              <NavLink
                to={`/login${hash}`}
                aria-label="Log in"
                className={({ isActive }) =>
                  isActive
                    ? "mobile-menu-link mobile-menu-action active"
                    : "mobile-menu-link mobile-menu-action"
                }
                onClick={(event) => handleMenuLinkClick(event, `/login${hash}`)}
              >
                <span className="mobile-menu-label">Log in</span>
              </NavLink>
            )}
          </div>
        </div>
      </div>
      <div
        className={`mobile-menu-backdrop${menuOpen ? " open" : ""}`}
        onClick={(event) => handleMenuLinkClick(event)}
        aria-hidden={menuOpen ? "false" : "true"}
      />
    </nav>
  );
};

export default Tabs;
