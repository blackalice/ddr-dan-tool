import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faChartColumn,
  faDownload,
  faFilter,
  faGear,
  faLock,
  faLockOpen,
  faRotateRight,
  faTrash,
  faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import SongCard from "./components/SongCard.jsx";
import FilterModal from "./components/FilterModal.jsx";
import ModalShell from "./components/ModalShell.jsx";
import { Switch } from "./components/Switch.jsx";
import { SettingsContext } from "./contexts/SettingsContext.jsx";
import { useFilters } from "./contexts/FilterContext.jsx";
import { useScores } from "./contexts/ScoresContext.jsx";
import { resolveScore } from "./utils/scoreKey.js";
import {
  SONGLIST_OVERRIDE_OPTIONS,
  buildSonglistOverrideLookup,
  songlistOverrideHasEntries,
  songlistOverrideMatches,
  songlistOverrideChartMatches,
} from "./utils/songlistOverrides.js";
import { getJsonCached } from "./utils/cachedFetch.js";
import { storage } from "./utils/remoteStorage.js";
import { useOfflineMode } from "./hooks/useOfflineMode.js";
import { getDifficultyBucketValue, getDifficultyValue, isDifficultyAllowed } from "./utils/difficultyFilters.js";
import { ADVANCED_FILTER_METRICS, chartMatchesAdvancedFilters, hasActiveAdvancedFilters } from "./utils/advancedStatsFilters.js";
import "./CardDrawPage.css";
import settingsStyles from "./components/CardDrawSettingsModal.module.css";

const DEFAULT_DRAW_COUNT = 5;
const MAX_DRAW_COUNT = 30;
const DEFAULT_BUCKET_COUNT = 4;
const MAX_BUCKET_COUNT = 10;
const DEFAULT_FREE_PICK_COUNT = 0;
const MAX_FREE_PICK_COUNT = 30;
const LOCKED_ACTIONS = new Set(["protect", "pocket-pick"]);
const DEFAULT_TOURNAMENT_LABELS = {
  round: "",
  p1: "P1",
  p2: "P2",
};

const normalizeTournamentLabels = (labels) => ({
  round: typeof labels?.round === "string" ? labels.round : "",
  p1: typeof labels?.p1 === "string" ? labels.p1 : DEFAULT_TOURNAMENT_LABELS.p1,
  p2: typeof labels?.p2 === "string" ? labels.p2 : DEFAULT_TOURNAMENT_LABELS.p2,
});

const getPlayerDisplayLabel = (player, labels) => {
  const normalized = normalizeTournamentLabels(labels);
  if (player === "P1") return normalized.p1.trim() || "P1";
  if (player === "P2") return normalized.p2.trim() || "P2";
  return player || "";
};

const getRoundDisplayLabel = (labels, fallback) => {
  const round = normalizeTournamentLabels(labels).round.trim();
  return round || fallback;
};

const clampNumber = (value, min, max) => {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const getInitialWeightedBucketCount = () => {
  try {
    const saved = storage.getItem("cardDrawWeightedBucketCount");
    const parsed = saved ? Number(saved) : DEFAULT_BUCKET_COUNT;
    if (Number.isNaN(parsed)) return DEFAULT_BUCKET_COUNT;
    return clampNumber(parsed, 1, MAX_BUCKET_COUNT);
  } catch {
    return DEFAULT_BUCKET_COUNT;
  }
};

const coerceDistribution = (values, count) => {
  const array = Array.isArray(values) ? values : [];
  return Array.from({ length: count }, (_, index) =>
    Math.max(0, Math.floor(Number(array[index]) || 0)),
  );
};

const calculateWeightedTargets = (values, total) => {
  const count = Array.isArray(values) ? values.length : 0;
  if (!count) return [];
  const weights = coerceDistribution(values, count);
  const targets = Array.from({ length: count }, () => 0);
  if (total <= 0) return targets;
  let totalWeight = weights.reduce((acc, value) => acc + value, 0);
  let effectiveWeights = weights;
  if (totalWeight <= 0) {
    effectiveWeights = Array.from({ length: count }, () => 1);
    totalWeight = count;
  }
  const ideal = effectiveWeights.map((weight) => (weight / totalWeight) * total);
  const floors = ideal.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((acc, value) => acc + value, 0);
  const fractions = ideal
    .map((value, index) => ({
      index,
      frac: value - floors[index],
      rand: Math.random(),
    }))
    .sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.rand - b.rand;
    });
  floors.forEach((value, index) => {
    targets[index] = value;
  });
  for (let i = 0; i < remainder; i += 1) {
    const target = fractions[i % fractions.length];
    targets[target.index] += 1;
  }
  return targets;
};

const buildBucketDefinitions = (minLevel, maxLevel, groupEnabled, bucketCount) => {
  if (minLevel == null || maxLevel == null) return [];
  const min = Math.floor(minLevel);
  const max = Math.ceil(maxLevel);
  if (max < min) return [];
  if (!groupEnabled) {
    return Array.from({ length: max - min + 1 }, (_, index) => {
      const level = min + index;
      return { id: `level-${level}`, min: level, max: level };
    });
  }
  const totalLevels = max - min + 1;
  const count = clampNumber(bucketCount, 1, totalLevels);
  const baseSize = Math.floor(totalLevels / count);
  const remainder = totalLevels % count;
  const buckets = [];
  let cursor = min;
  for (let i = 0; i < count; i += 1) {
    const size = baseSize + (i < remainder ? 1 : 0);
    const start = cursor;
    const end = start + size - 1;
    buckets.push({ id: `bucket-${start}-${end}`, min: start, max: end });
    cursor = end + 1;
  }
  return buckets;
};

const buildCardForBucket = (entry, bucket, buildChartData, getBucketValue) => {
  const { meta, matchingCharts } = entry;
  if (!meta || !matchingCharts.length) return null;
  const options = matchingCharts.filter((chart) => {
    const bucketValue = getBucketValue(chart);
    return Number.isFinite(bucketValue) && bucketValue >= bucket.min && bucketValue <= bucket.max;
  });
  if (!options.length) return null;
  const chosen = options[Math.floor(Math.random() * options.length)];
  return buildChartData(meta, chosen);
};

const drawWeightedCards = (
  entries,
  buckets,
  targetCounts,
  maxCount,
  buildChartData,
  buildChartCard,
  getBucketValue,
) => {
  const remaining = [...entries];
  const picks = [];
  buckets.forEach((bucket, index) => {
    let needed = targetCounts[index] || 0;
    while (needed > 0 && remaining.length > 0) {
      const eligible = [];
      for (let i = 0; i < remaining.length; i += 1) {
        if (
          remaining[i].matchingCharts.some(
            (chart) => {
              const bucketValue = getBucketValue(chart);
              return Number.isFinite(bucketValue) && bucketValue >= bucket.min && bucketValue <= bucket.max;
            },
          )
        ) {
          eligible.push(i);
        }
      }
      if (!eligible.length) break;
      const chosenIndex = eligible[Math.floor(Math.random() * eligible.length)];
      const [entry] = remaining.splice(chosenIndex, 1);
      const card = buildCardForBucket(entry, bucket, buildChartData, getBucketValue);
      if (card) {
        picks.push(card);
        needed -= 1;
      }
    }
  });
  while (picks.length < maxCount && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    const [entry] = remaining.splice(idx, 1);
    const card = buildChartCard(entry);
    if (card) picks.push(card);
  }
  return picks;
};

const calculateRandomTargets = (values, total) => {
  const count = Array.isArray(values) ? values.length : 0;
  if (!count) return [];
  const weights = coerceDistribution(values, count);
  const targets = Array.from({ length: count }, () => 0);
  if (total <= 0) return targets;
  let totalWeight = weights.reduce((acc, value) => acc + value, 0);
  let effectiveWeights = weights;
  if (totalWeight <= 0) {
    effectiveWeights = Array.from({ length: count }, () => 1);
    totalWeight = count;
  }
  const cumulative = [];
  let running = 0;
  for (let i = 0; i < count; i += 1) {
    running += effectiveWeights[i];
    cumulative[i] = running;
  }
  for (let pick = 0; pick < total; pick += 1) {
    const roll = Math.random() * totalWeight;
    for (let i = 0; i < cumulative.length; i += 1) {
      if (roll < cumulative[i]) {
        targets[i] += 1;
        break;
      }
    }
  }
  return targets;
};

const formatDrawTimestamp = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}/${month}/${year} - ${hours}:${minutes}`;
};
const CARD_ACTIONS = [
  { key: "protect", label: "Protect", requiresPlayer: true },
  { key: "veto", label: "Veto", requiresPlayer: true },
  { key: "pocket-pick", label: "Pocket", requiresPlayer: true },
];

const getActionSortRank = (chart, actionsMap) => {
  const action = actionsMap?.[chart.uniqueKey]?.action;
  if (action === "protect") return 0;
  if (action === "veto") return 2;
  return 1;
};

const getDisplayedCharts = (charts, actionsMap, { reorderByAction, hideVetoed }) => {
  const visibleCharts = hideVetoed
    ? charts.filter((chart) => actionsMap?.[chart.uniqueKey]?.action !== "veto")
    : charts;
  if (!reorderByAction) return visibleCharts;
  return visibleCharts
    .map((chart, index) => ({ chart, index }))
    .sort((a, b) => {
      const rankDiff = getActionSortRank(a.chart, actionsMap) - getActionSortRank(b.chart, actionsMap);
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    })
    .map(({ chart }) => chart);
};

const csvValue = (value) => {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadTextFile = (filename, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const CardDrawPage = ({ smData }) => {
  const { offline } = useOfflineMode();
  const showJacket = !offline;
  const jacketFull = !offline;
  const {
    playStyle,
    songlistOverride,
    setPlayStyle,
    showTransliterationBeta,
    showRankedRatings,
    showDrawFocusBeta,
    cardDrawTournamentLabels: currentLabels,
    setCardDrawTournamentLabels: setCurrentLabels,
    cardDrawTournamentLabelLocks: tournamentLabelLocks,
    setCardDrawTournamentLabelLocks: setTournamentLabelLocks,
  } = useContext(SettingsContext);
  const { filters } = useFilters();
  const { scores, loadSongMeta } = useScores();
  const navigate = useNavigate();
  const [songMeta, setSongMeta] = useState([]);
  const [overrideSongs, setOverrideSongs] = useState(null);
  const [drawnCharts, setDrawnCharts] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawCurrent");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [currentDrawId, setCurrentDrawId] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawCurrentId");
      return saved ? Number(saved) || null : null;
    } catch {
      return null;
    }
  });
  const [cardActions, setCardActions] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawCurrentActions");
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [drawHistory, setDrawHistory] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawHistory");
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => ({
        ...entry,
        actions: entry?.actions && typeof entry.actions === "object" ? entry.actions : {},
        labels: normalizeTournamentLabels(entry?.labels),
      }));
    } catch {
      return [];
    }
  });
  const [showFilter, setShowFilter] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEligibleCharts, setShowEligibleCharts] = useState(false);
  const [drawCount, setDrawCount] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawCount");
      const parsed = saved ? Number(saved) : DEFAULT_DRAW_COUNT;
      if (Number.isNaN(parsed)) return DEFAULT_DRAW_COUNT;
      return Math.min(MAX_DRAW_COUNT, Math.max(1, parsed));
    } catch {
      return DEFAULT_DRAW_COUNT;
    }
  });
  const [freePickCount, setFreePickCount] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawFreePickCount");
      const parsed = saved ? Number(saved) : DEFAULT_FREE_PICK_COUNT;
      if (Number.isNaN(parsed)) return DEFAULT_FREE_PICK_COUNT;
      return clampNumber(parsed, 0, MAX_FREE_PICK_COUNT);
    } catch {
      return DEFAULT_FREE_PICK_COUNT;
    }
  });
  const [weightedEnabled, setWeightedEnabled] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawWeightedEnabled");
      return saved === "true";
    } catch {
      return false;
    }
  });
  const [weightedForceExpected, setWeightedForceExpected] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawWeightedForceExpected");
      return saved === "true";
    } catch {
      return false;
    }
  });
  const [weightedGroupBuckets, setWeightedGroupBuckets] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawWeightedGroupBuckets");
      if (saved == null) return true;
      return saved === "true";
    } catch {
      return true;
    }
  });
  const [weightedBucketCount, setWeightedBucketCount] = useState(getInitialWeightedBucketCount);
  const [weightedBucketCountInput, setWeightedBucketCountInput] = useState(
    () => String(getInitialWeightedBucketCount()),
  );
  const [weightedDistribution, setWeightedDistribution] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawWeightedDistribution");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [sortByLevel, setSortByLevel] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawSortByLevel");
      return saved === "true";
    } catch {
      return false;
    }
  });
  const [reorderByAction, setReorderByAction] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawReorderByAction");
      if (saved == null) return true;
      return saved === "true";
    } catch {
      return true;
    }
  });
  const [hideVetoed, setHideVetoed] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawHideVetoed");
      return saved === "true";
    } catch {
      return false;
    }
  });
  const [showTournamentLabels, setShowTournamentLabels] = useState(() => {
    try {
      const saved = storage.getItem("cardDrawShowTournamentLabels");
      return saved === "true";
    } catch {
      return false;
    }
  });
  const [draftDrawCount, setDraftDrawCount] = useState(drawCount);
  const [draftFreePickCount, setDraftFreePickCount] = useState(freePickCount);
  const [draftWeightedEnabled, setDraftWeightedEnabled] = useState(weightedEnabled);
  const [draftWeightedForceExpected, setDraftWeightedForceExpected] = useState(weightedForceExpected);
  const [draftWeightedGroupBuckets, setDraftWeightedGroupBuckets] = useState(weightedGroupBuckets);
  const [draftWeightedBucketCount, setDraftWeightedBucketCount] = useState(weightedBucketCount);
  const [draftWeightedBucketCountInput, setDraftWeightedBucketCountInput] = useState(
    weightedBucketCountInput,
  );
  const [draftWeightedDistribution, setDraftWeightedDistribution] = useState(weightedDistribution);
  const [draftSortByLevel, setDraftSortByLevel] = useState(sortByLevel);
  const [draftReorderByAction, setDraftReorderByAction] = useState(reorderByAction);
  const [draftHideVetoed, setDraftHideVetoed] = useState(hideVetoed);
  const [draftShowTournamentLabels, setDraftShowTournamentLabels] = useState(showTournamentLabels);
  const [activeCardContext, setActiveCardContext] = useState(null);
  const [viewedDrawKey, setViewedDrawKey] = useState("current");
  const [collapsedDrawKeys, setCollapsedDrawKeys] = useState(() => new Set());
  const drawPageRef = useRef(null);
  const filterCountsCacheRef = useRef(new Map());
  const metricBoundsCacheRef = useRef(new Map());
  const [pocketPickState, setPocketPickState] = useState(null);
  const [pocketPickSong, setPocketPickSong] = useState(null);
  const [pocketPickChart, setPocketPickChart] = useState(null);
  const [pocketPickInput, setPocketPickInput] = useState("");
  const menuPortalTarget = typeof document !== "undefined" ? document.body : null;
  const activeCard = activeCardContext?.card || null;
  const displayTitleFor = useCallback((chart) => {
    if (!chart) return "";
    if (showTransliterationBeta) {
      if (chart.titleTranslit) return chart.titleTranslit;
      const meta = songMeta.find((entry) => entry.id === chart.songId || entry.path === chart.path);
      if (meta?.titleTranslit) return meta.titleTranslit;
    }
    return chart.title || "";
  }, [showTransliterationBeta, songMeta]);
  const displayArtistFor = useCallback((chart) => {
    if (!chart) return "";
    if (showTransliterationBeta) {
      if (chart.artistTranslit) return chart.artistTranslit;
      const meta = songMeta.find((entry) => entry.id === chart.songId || entry.path === chart.path);
      if (meta?.artistTranslit) return meta.artistTranslit;
    }
    return chart.artist || "";
  }, [showTransliterationBeta, songMeta]);
  const openSettings = useCallback(() => {
    setDraftDrawCount(drawCount);
    setDraftFreePickCount(freePickCount);
    setDraftWeightedEnabled(weightedEnabled);
    setDraftWeightedForceExpected(weightedForceExpected);
    setDraftWeightedGroupBuckets(weightedGroupBuckets);
    setDraftWeightedBucketCount(weightedBucketCount);
    setDraftWeightedBucketCountInput(weightedBucketCountInput);
    setDraftWeightedDistribution(weightedDistribution);
    setDraftSortByLevel(sortByLevel);
    setDraftReorderByAction(reorderByAction);
    setDraftHideVetoed(hideVetoed);
    setDraftShowTournamentLabels(showTournamentLabels);
    setShowSettings(true);
  }, [
    drawCount,
    freePickCount,
    weightedEnabled,
    weightedForceExpected,
    weightedGroupBuckets,
    weightedBucketCount,
    weightedBucketCountInput,
    weightedDistribution,
    sortByLevel,
    reorderByAction,
    hideVetoed,
    showTournamentLabels,
  ]);
  const freePickPlaceholder = useMemo(() => ({
    title: "Free pick",
    artist: "Tap to choose",
    bpm: "--",
    level: "--",
    mode: playStyle,
    difficulty: "basic",
  }), [playStyle]);
  const draftBucketCountNumeric = Number(draftWeightedBucketCountInput);
  const draftBucketCountInvalid = draftWeightedBucketCountInput.trim() === ""
    || Number.isNaN(draftBucketCountNumeric)
    || !Number.isInteger(draftBucketCountNumeric)
    || draftBucketCountNumeric < 1
    || draftBucketCountNumeric > MAX_BUCKET_COUNT;
  const activeActionsMap = useMemo(() => {
    if (!activeCardContext) return null;
    if (!activeCardContext.entryId) return cardActions;
    const entry = drawHistory.find((item) => item.id === activeCardContext.entryId);
    return entry?.actions || {};
  }, [activeCardContext, cardActions, drawHistory]);
  const activeActionEntry = activeCard && activeActionsMap
    ? activeActionsMap[activeCard.uniqueKey]
    : null;
  const activeTournamentLabels = useMemo(() => {
    if (!activeCardContext?.entryId) return currentLabels;
    const entry = drawHistory.find((item) => item.id === activeCardContext.entryId);
    return normalizeTournamentLabels(entry?.labels);
  }, [activeCardContext, currentLabels, drawHistory]);

  useEffect(() => {
    let cancelled = false;
    loadSongMeta({ includeRankedRatings: showRankedRatings })
      .then((meta) => {
        if (!cancelled) setSongMeta(meta);
      })
      .catch(() => {
        if (!cancelled) setSongMeta([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSongMeta, showRankedRatings]);

  useEffect(() => {
    storage.removeItem("cardDrawFlowerFilter");
  }, []);

  useEffect(() => {
    const option = SONGLIST_OVERRIDE_OPTIONS.find(
      (opt) => opt.value === songlistOverride,
    );
    if (!option || !option.file) {
      setOverrideSongs(null);
      return;
    }
      getJsonCached(option.file)
        .then((data) => {
          setOverrideSongs(buildSonglistOverrideLookup(data, songMeta));
        })
        .catch(() => setOverrideSongs(null));
    }, [songlistOverride, songMeta]);

  useEffect(() => {
    storage.setItem("cardDrawCurrent", JSON.stringify(drawnCharts));
  }, [drawnCharts]);

  useEffect(() => {
    if (currentDrawId == null) {
      storage.setItem("cardDrawCurrentId", "");
      return;
    }
    storage.setItem("cardDrawCurrentId", String(currentDrawId));
  }, [currentDrawId]);

  useEffect(() => {
    storage.setItem("cardDrawCurrentActions", JSON.stringify(cardActions));
  }, [cardActions]);

  useEffect(() => {
    storage.setItem("cardDrawHistory", JSON.stringify(drawHistory));
  }, [drawHistory]);

  useEffect(() => {
    storage.setItem("cardDrawCount", String(drawCount));
  }, [drawCount]);

  useEffect(() => {
    storage.setItem("cardDrawFreePickCount", String(freePickCount));
  }, [freePickCount]);

  useEffect(() => {
    storage.setItem("cardDrawWeightedEnabled", String(weightedEnabled));
  }, [weightedEnabled]);

  useEffect(() => {
    storage.setItem("cardDrawWeightedForceExpected", String(weightedForceExpected));
  }, [weightedForceExpected]);

  useEffect(() => {
    storage.setItem("cardDrawWeightedGroupBuckets", String(weightedGroupBuckets));
  }, [weightedGroupBuckets]);

  useEffect(() => {
    storage.setItem("cardDrawWeightedBucketCount", String(weightedBucketCount));
  }, [weightedBucketCount]);

  useEffect(() => {
    storage.setItem(
      "cardDrawWeightedDistribution",
      JSON.stringify(weightedDistribution),
    );
  }, [weightedDistribution]);

  useEffect(() => {
    storage.setItem("cardDrawSortByLevel", String(sortByLevel));
  }, [sortByLevel]);

  useEffect(() => {
    storage.setItem("cardDrawReorderByAction", String(reorderByAction));
  }, [reorderByAction]);

  useEffect(() => {
    storage.setItem("cardDrawHideVetoed", String(hideVetoed));
  }, [hideVetoed]);

  useEffect(() => {
    storage.setItem("cardDrawShowTournamentLabels", String(showTournamentLabels));
  }, [showTournamentLabels]);

  const filtersActive = Boolean(
    filters.bpmMin !== "" ||
      filters.bpmMax !== "" ||
      filters.difficultyMin !== "" ||
      filters.difficultyMax !== "" ||
      filters.lengthMin !== "" ||
      filters.lengthMax !== "" ||
      filters.games.length > 0 ||
      (filters.difficultyNames && filters.difficultyNames.length > 0) ||
      filters.artist !== "" ||
      (filters.title && filters.title !== "") ||
      filters.multiBpm !== "any" ||
      filters.playedStatus !== "all" ||
      (showRankedRatings && (filters.rankedFractionMin !== "" || filters.rankedFractionMax !== "")) ||
      hasActiveAdvancedFilters(filters),
  );
  const buildFilterCacheKey = useCallback((currentFilters = {}) => {
    const normalized = {
      bpmMin: currentFilters?.bpmMin ?? "",
      bpmMax: currentFilters?.bpmMax ?? "",
      difficultyMin: currentFilters?.difficultyMin ?? "",
      difficultyMax: currentFilters?.difficultyMax ?? "",
      rankedFractionMin: currentFilters?.rankedFractionMin ?? "",
      rankedFractionMax: currentFilters?.rankedFractionMax ?? "",
      lengthMin: currentFilters?.lengthMin ?? "",
      lengthMax: currentFilters?.lengthMax ?? "",
      artist: (currentFilters?.artist || "").toLowerCase(),
      title: (currentFilters?.title || "").toLowerCase(),
      multiBpm: currentFilters?.multiBpm ?? "any",
      playedStatus: currentFilters?.playedStatus ?? "all",
      games: Array.isArray(currentFilters?.games) ? [...currentFilters.games].sort() : [],
      difficultyNames: Array.isArray(currentFilters?.difficultyNames)
        ? [...currentFilters.difficultyNames].map((n) => n.toLowerCase()).sort()
        : [],
    };
    ADVANCED_FILTER_METRICS.forEach((metric) => {
      normalized[`${metric.key}Min`] = currentFilters?.[`${metric.key}Min`] ?? "";
      normalized[`${metric.key}Max`] = currentFilters?.[`${metric.key}Max`] ?? "";
    });
    return JSON.stringify(normalized);
  }, []);
  const setCachedResult = (cache, key, value) => {
    cache.set(key, value);
    const maxEntries = 24;
    if (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    return value;
  };

  const getFilterCounts = useCallback((currentFilters) => {
    if (!songMeta.length) return null;
    const cacheKey = `counts|${playStyle}|${showRankedRatings ? "1" : "0"}|${buildFilterCacheKey(currentFilters)}`;
    const cached = filterCountsCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const gamesFilter = Array.isArray(currentFilters?.games) ? currentFilters.games : [];
    const diffNames = Array.isArray(currentFilters?.difficultyNames) ? currentFilters.difficultyNames : [];
    const lowerCaseFilterNames = diffNames.map((n) => n.toLowerCase());
    const artistFilter = (currentFilters?.artist || "").toLowerCase();
    const titleFilter = (currentFilters?.title || "").toLowerCase();
    const bpmMinFilter = currentFilters?.bpmMin ?? "";
    const bpmMaxFilter = currentFilters?.bpmMax ?? "";
    const lengthMinFilter = currentFilters?.lengthMin ?? "";
    const lengthMaxFilter = currentFilters?.lengthMax ?? "";
    const multiBpmFilter = currentFilters?.multiBpm ?? "any";
    const playedStatusFilter = currentFilters?.playedStatus ?? "all";
    const rankedFractionMinFilter = currentFilters?.rankedFractionMin ?? "";
    const rankedFractionMaxFilter = currentFilters?.rankedFractionMax ?? "";
    const advancedFiltersActive = hasActiveAdvancedFilters(currentFilters);

    let total = 0;
    let filtered = 0;
    let chartsTotal = 0;
    let chartsFiltered = 0;

    songMeta.forEach((meta) => {
      if (!meta) return;
      if (songlistOverrideHasEntries(overrideSongs)) {
        if (!songlistOverrideMatches(overrideSongs, {
          path: meta.path,
          songKey: meta.songKey,
          title: meta.title,
          titleTranslit: meta.titleTranslit,
          artist: meta.artist,
          artistTranslit: meta.artistTranslit,
          game: meta.game,
          mode: playStyle,
        })) {
          return;
        }
      }

      const chartsInMode = (meta.difficulties || []).filter((d) => d.mode === playStyle && (
        !songlistOverrideHasEntries(overrideSongs) || songlistOverrideChartMatches(overrideSongs, {
          path: meta.path,
          songKey: meta.songKey,
          title: meta.title,
          titleTranslit: meta.titleTranslit,
          artist: meta.artist,
          artistTranslit: meta.artistTranslit,
          game: meta.game,
          mode: d.mode,
          difficulty: d.difficulty,
        })
      ));
      if (!chartsInMode.length) return;
      total += 1;
      chartsTotal += chartsInMode.length;

      if (gamesFilter.length && !gamesFilter.includes(meta.game)) return;
      if (artistFilter && !meta.artist?.toLowerCase()?.includes(artistFilter)) return;
      if (titleFilter) {
        const titleMatch = meta.title?.toLowerCase()?.includes(titleFilter);
        const translitMatch = meta.titleTranslit?.toLowerCase()?.includes(titleFilter);
        if (!titleMatch && !translitMatch) return;
      }
      const bpmDiff = meta.bpmMax - meta.bpmMin;
      const isSingleBpm = bpmDiff <= 5;
      if (multiBpmFilter === "single" && !isSingleBpm) return;
      if (multiBpmFilter === "multiple" && isSingleBpm) return;
      if (bpmMinFilter !== "" && meta.bpmMax < Number(bpmMinFilter)) return;
      if (bpmMaxFilter !== "" && meta.bpmMin > Number(bpmMaxFilter)) return;
      if (lengthMinFilter !== "" && meta.length < Number(lengthMinFilter)) return;
      if (lengthMaxFilter !== "" && meta.length > Number(lengthMaxFilter)) return;

      if (playedStatusFilter !== "all") {
        const hasPlayed = chartsInMode.some((d) => {
          const scoreHit = resolveScore(scores, d.mode, {
            songKey: meta.songKey || meta.path,
            path: meta.path,
            chartId: d.chartId,
            songId: meta.id,
            title: meta.title,
            artist: meta.artist,
            difficulty: d.difficulty,
          });
          return scoreHit != null;
        });
        if (playedStatusFilter === "played" && !hasPlayed) return;
        if (playedStatusFilter === "notPlayed" && hasPlayed) return;
      }

      const matchingCharts = chartsInMode.filter((d) => {
        const difficultyValue = getDifficultyValue(d, showRankedRatings);
        if (!isDifficultyAllowed(
          difficultyValue,
          currentFilters?.difficultyMin,
          currentFilters?.difficultyMax,
          showRankedRatings,
          rankedFractionMinFilter,
          rankedFractionMaxFilter,
        )) {
          return false;
        }
        if (lowerCaseFilterNames.length > 0) {
          if (!lowerCaseFilterNames.includes(d.difficulty.toLowerCase())) {
            return false;
          }
        }
        if (advancedFiltersActive && !chartMatchesAdvancedFilters(d, currentFilters)) {
          return false;
        }
        return true;
      });

      if (!matchingCharts.length) return;
      filtered += 1;
      chartsFiltered += matchingCharts.length;
    });

    return setCachedResult(
      filterCountsCacheRef.current,
      cacheKey,
      { filtered, total, chartsFiltered, chartsTotal },
    );
  }, [songMeta, overrideSongs, playStyle, scores, showRankedRatings, buildFilterCacheKey]);

  const getMetricBounds = useCallback((currentFilters) => {
    if (!songMeta.length) return null;
    const cacheKey = `bounds|${playStyle}|${showRankedRatings ? "1" : "0"}|${buildFilterCacheKey(currentFilters)}`;
    const cached = metricBoundsCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const gamesFilter = Array.isArray(currentFilters?.games) ? currentFilters.games : [];
    const diffNames = Array.isArray(currentFilters?.difficultyNames) ? currentFilters.difficultyNames : [];
    const lowerCaseFilterNames = diffNames.map((n) => n.toLowerCase());
    const artistFilter = (currentFilters?.artist || "").toLowerCase();
    const titleFilter = (currentFilters?.title || "").toLowerCase();
    const bpmMinFilter = currentFilters?.bpmMin ?? "";
    const bpmMaxFilter = currentFilters?.bpmMax ?? "";
    const lengthMinFilter = currentFilters?.lengthMin ?? "";
    const lengthMaxFilter = currentFilters?.lengthMax ?? "";
    const multiBpmFilter = currentFilters?.multiBpm ?? "any";
    const playedStatusFilter = currentFilters?.playedStatus ?? "all";
    const rankedFractionMinFilter = currentFilters?.rankedFractionMin ?? "";
    const rankedFractionMaxFilter = currentFilters?.rankedFractionMax ?? "";

    const bounds = ADVANCED_FILTER_METRICS.reduce((acc, metric) => {
      acc[metric.key] = { min: Infinity, max: -Infinity, count: 0 };
      return acc;
    }, {});

    songMeta.forEach((meta) => {
      if (!meta) return;
      if (gamesFilter.length && !gamesFilter.includes(meta.game)) return;
      if (artistFilter && !meta.artist?.toLowerCase()?.includes(artistFilter)) return;
      if (titleFilter) {
        const titleMatch = meta.title?.toLowerCase()?.includes(titleFilter);
        const translitMatch = meta.titleTranslit?.toLowerCase()?.includes(titleFilter);
        if (!titleMatch && !translitMatch) return;
      }
      if (songlistOverrideHasEntries(overrideSongs)) {
        if (!songlistOverrideMatches(overrideSongs, {
          path: meta.path,
          songKey: meta.songKey,
          title: meta.title,
          titleTranslit: meta.titleTranslit,
          artist: meta.artist,
          artistTranslit: meta.artistTranslit,
          game: meta.game,
          mode: playStyle,
        })) {
          return;
        }
      }
      const bpmDiff = meta.bpmMax - meta.bpmMin;
      const isSingleBpm = bpmDiff <= 5;
      if (multiBpmFilter === "single" && !isSingleBpm) return;
      if (multiBpmFilter === "multiple" && isSingleBpm) return;
      if (bpmMinFilter !== "" && meta.bpmMax < Number(bpmMinFilter)) return;
      if (bpmMaxFilter !== "" && meta.bpmMin > Number(bpmMaxFilter)) return;
      if (lengthMinFilter !== "" && meta.length < Number(lengthMinFilter)) return;
      if (lengthMaxFilter !== "" && meta.length > Number(lengthMaxFilter)) return;

      const chartsInMode = (meta.difficulties || []).filter((d) => d.mode === playStyle && (
        !songlistOverrideHasEntries(overrideSongs) || songlistOverrideChartMatches(overrideSongs, {
          path: meta.path,
          songKey: meta.songKey,
          title: meta.title,
          titleTranslit: meta.titleTranslit,
          artist: meta.artist,
          artistTranslit: meta.artistTranslit,
          game: meta.game,
          mode: d.mode,
          difficulty: d.difficulty,
        })
      ));
      if (!chartsInMode.length) return;

      if (playedStatusFilter !== "all") {
        const hasPlayed = chartsInMode.some((d) => {
          const scoreHit = resolveScore(scores, d.mode, {
            songKey: meta.songKey || meta.path,
            path: meta.path,
            chartId: d.chartId,
            songId: meta.id,
            title: meta.title,
            artist: meta.artist,
            difficulty: d.difficulty,
          });
          return scoreHit != null;
        });
        if (playedStatusFilter === "played" && !hasPlayed) return;
        if (playedStatusFilter === "notPlayed" && hasPlayed) return;
      }

      chartsInMode.forEach((d) => {
        const difficultyValue = getDifficultyValue(d, showRankedRatings);
        if (!isDifficultyAllowed(
          difficultyValue,
          currentFilters?.difficultyMin,
          currentFilters?.difficultyMax,
          showRankedRatings,
          rankedFractionMinFilter,
          rankedFractionMaxFilter,
        )) {
          return;
        }
        if (lowerCaseFilterNames.length > 0 && !lowerCaseFilterNames.includes(d.difficulty.toLowerCase())) {
          return;
        }
        if (playedStatusFilter !== "all") {
          const scoreHit = resolveScore(scores, d.mode, {
            songKey: meta.songKey || meta.path,
            path: meta.path,
            chartId: d.chartId,
            songId: meta.id,
            title: meta.title,
            artist: meta.artist,
            difficulty: d.difficulty,
          });
          const hasScore = scoreHit != null;
          if (playedStatusFilter === "played" && !hasScore) return;
          if (playedStatusFilter === "notPlayed" && hasScore) return;
        }

        const failingMetricKeys = [];
        ADVANCED_FILTER_METRICS.forEach((metric) => {
          const minRaw = currentFilters?.[`${metric.key}Min`] ?? "";
          const maxRaw = currentFilters?.[`${metric.key}Max`] ?? "";
          if (minRaw === "" && maxRaw === "") return;
          const value = Number(d?.stepmaniaTech?.[metric.key]);
          const safeValue = Number.isFinite(value) ? value : 0;
          if (minRaw !== "" && safeValue < Number(minRaw)) {
            failingMetricKeys.push(metric.key);
            return;
          }
          if (maxRaw !== "" && safeValue > Number(maxRaw)) {
            failingMetricKeys.push(metric.key);
          }
        });
        const failedCount = failingMetricKeys.length;
        const singleFailedKey = failedCount === 1 ? failingMetricKeys[0] : null;

        ADVANCED_FILTER_METRICS.forEach((metric) => {
          if (failedCount > 1) return;
          if (failedCount === 1 && singleFailedKey !== metric.key) return;
          const value = Number(d?.stepmaniaTech?.[metric.key]);
          const safeValue = Number.isFinite(value) ? value : 0;
          const entry = bounds[metric.key];
          entry.min = Math.min(entry.min, safeValue);
          entry.max = Math.max(entry.max, safeValue);
          entry.count += 1;
        });
      });
    });

    ADVANCED_FILTER_METRICS.forEach((metric) => {
      const entry = bounds[metric.key];
      if (!entry || entry.count === 0) {
        bounds[metric.key] = { min: null, max: null, count: 0 };
      }
    });

    return setCachedResult(metricBoundsCacheRef.current, cacheKey, bounds);
  }, [songMeta, overrideSongs, playStyle, scores, showRankedRatings, buildFilterCacheKey]);

  useEffect(() => {
    filterCountsCacheRef.current.clear();
    metricBoundsCacheRef.current.clear();
  }, [songMeta, overrideSongs, playStyle, scores, showRankedRatings]);

  const filteredEntries = useMemo(() => {
    if (!songMeta.length) return [];
    const lowerCaseFilterNames = (filters.difficultyNames || []).map((n) =>
      n.toLowerCase(),
    );
    const advancedFiltersActive = hasActiveAdvancedFilters(filters);

    return songMeta
      .filter((meta) => {
        if (!meta) return false;
        if (filters.games.length && !filters.games.includes(meta.game)) {
          return false;
        }
        if (
          filters.artist &&
          !meta.artist?.toLowerCase()?.includes(filters.artist.toLowerCase())
        ) {
          return false;
        }
        if (filters.title) {
          const titleMatch = meta.title
            ?.toLowerCase()
            ?.includes(filters.title.toLowerCase());
          const translitMatch = meta.titleTranslit
            ?.toLowerCase()
            ?.includes(filters.title.toLowerCase());
          if (!titleMatch && !translitMatch) return false;
        }
          if (songlistOverrideHasEntries(overrideSongs)) {
            if (!songlistOverrideMatches(overrideSongs, {
              path: meta.path,
              songKey: meta.songKey,
              title: meta.title,
              titleTranslit: meta.titleTranslit,
              artist: meta.artist,
              artistTranslit: meta.artistTranslit,
              game: meta.game,
              mode: playStyle,
            })) {
              return false;
            }
          }
        const bpmDiff = meta.bpmMax - meta.bpmMin;
        const isSingleBpm = bpmDiff <= 5;
        if (filters.multiBpm === "single" && !isSingleBpm) return false;
        if (filters.multiBpm === "multiple" && isSingleBpm) return false;
        if (filters.bpmMin !== "" && meta.bpmMax < Number(filters.bpmMin)) {
          return false;
        }
        if (filters.bpmMax !== "" && meta.bpmMin > Number(filters.bpmMax)) {
          return false;
        }
        if (filters.lengthMin !== "" && meta.length < Number(filters.lengthMin)) {
          return false;
        }
        if (filters.lengthMax !== "" && meta.length > Number(filters.lengthMax)) {
          return false;
        }

        if (filters.playedStatus !== "all") {
          const hasPlayed = meta.difficulties?.some((d) => {
            if (d.mode !== playStyle) return false;
            const scoreHit = resolveScore(scores, d.mode, {
              songKey: meta.songKey || meta.path,
              path: meta.path,
              chartId: d.chartId,
              songId: meta.id,
              title: meta.title,
              artist: meta.artist,
              difficulty: d.difficulty,
            });
            return scoreHit != null;
          });
          if (filters.playedStatus === "played" && !hasPlayed) return false;
          if (filters.playedStatus === "notPlayed" && hasPlayed) return false;
        }

        return true;
      })
      .map((meta) => {
        const matchingCharts = (meta.difficulties || []).filter((d) => {
          if (d.mode !== playStyle) return false;
          const difficultyValue = getDifficultyValue(d, showRankedRatings);
          if (!isDifficultyAllowed(
            difficultyValue,
            filters.difficultyMin,
            filters.difficultyMax,
            showRankedRatings,
            filters.rankedFractionMin,
            filters.rankedFractionMax,
          )) {
            return false;
          }
          if (lowerCaseFilterNames.length > 0) {
            if (!lowerCaseFilterNames.includes(d.difficulty.toLowerCase())) {
              return false;
            }
          }
          if (advancedFiltersActive && !chartMatchesAdvancedFilters(d, filters)) {
            return false;
          }
          return true;
        });
        return { meta, matchingCharts };
      })
      .filter((entry) => entry.matchingCharts.length > 0);
  }, [
    songMeta,
    filters,
    scores,
    playStyle,
    overrideSongs,
    showRankedRatings,
  ]);

  const availableCount = filteredEntries.length;
  const levelRange = useMemo(() => {
    let minLevel = filters.difficultyMin !== "" ? Number(filters.difficultyMin) : null;
    let maxLevel = filters.difficultyMax !== "" ? Number(filters.difficultyMax) : null;
    if (minLevel != null && Number.isNaN(minLevel)) minLevel = null;
    if (maxLevel != null && Number.isNaN(maxLevel)) maxLevel = null;
    if (minLevel != null) {
      minLevel = showRankedRatings ? Math.floor(minLevel) : minLevel;
    }
    if (maxLevel != null) {
      maxLevel = showRankedRatings ? Math.floor(maxLevel) : maxLevel;
    }
    if (minLevel == null || maxLevel == null) {
      let foundMin = Infinity;
      let foundMax = -Infinity;
      filteredEntries.forEach((entry) => {
        entry.matchingCharts.forEach((chart) => {
          const bucketValue = getDifficultyBucketValue(chart, showRankedRatings);
          if (!Number.isFinite(bucketValue)) return;
          foundMin = Math.min(foundMin, bucketValue);
          foundMax = Math.max(foundMax, bucketValue);
        });
      });
      if (minLevel == null) {
        minLevel = Number.isFinite(foundMin) ? foundMin : 1;
      }
      if (maxLevel == null) {
        maxLevel = Number.isFinite(foundMax) ? foundMax : minLevel;
      }
    }
    if (minLevel > maxLevel) return { min: maxLevel, max: minLevel };
    return { min: minLevel, max: maxLevel };
  }, [filteredEntries, filters.difficultyMax, filters.difficultyMin, showRankedRatings]);

  const bucketDefinitions = useMemo(
    () =>
      buildBucketDefinitions(
        levelRange.min,
        levelRange.max,
        weightedGroupBuckets,
        weightedBucketCount,
      ),
    [levelRange.max, levelRange.min, weightedGroupBuckets, weightedBucketCount],
  );
  const draftBucketDefinitions = useMemo(
    () =>
      buildBucketDefinitions(
        levelRange.min,
        levelRange.max,
        draftWeightedGroupBuckets,
        draftWeightedBucketCount,
      ),
    [levelRange.max, levelRange.min, draftWeightedGroupBuckets, draftWeightedBucketCount],
  );
  const draftWeightedTotalCount = Math.min(draftDrawCount, availableCount || draftDrawCount);
  const draftBucketDistribution = useMemo(
    () => coerceDistribution(draftWeightedDistribution, draftBucketDefinitions.length),
    [draftBucketDefinitions.length, draftWeightedDistribution],
  );
  const draftBucketWeightTotal = useMemo(
    () => draftBucketDistribution.reduce((acc, value) => acc + value, 0),
    [draftBucketDistribution],
  );
  const draftBucketExpectedRanges = useMemo(() => {
    if (!draftBucketDefinitions.length) return [];
    if (draftBucketWeightTotal <= 0) {
      return draftBucketDistribution.map(() => "--");
    }
    return draftBucketDistribution.map((weight) => {
      const ideal = (weight / draftBucketWeightTotal) * draftWeightedTotalCount;
      const min = Math.floor(ideal);
      const max = Math.ceil(ideal);
      return min === max ? String(min) : `${min}-${max}`;
    });
  }, [
    draftBucketDefinitions.length,
    draftBucketDistribution,
    draftBucketWeightTotal,
    draftWeightedTotalCount,
  ]);

  useEffect(() => {
    if (!bucketDefinitions.length) return;
    setWeightedDistribution((prev) => {
      const next = coerceDistribution(prev, bucketDefinitions.length);
      if (Array.isArray(prev) && prev.length === next.length) {
        const unchanged = prev.every((value, index) => next[index] === value);
        if (unchanged) return prev;
      }
      return next;
    });
  }, [bucketDefinitions]);

  useEffect(() => {
    if (!draftBucketDefinitions.length) return;
    setDraftWeightedDistribution((prev) => {
      const next = coerceDistribution(prev, draftBucketDefinitions.length);
      if (Array.isArray(prev) && prev.length === next.length) {
        const unchanged = prev.every((value, index) => next[index] === value);
        if (unchanged) return prev;
      }
      return next;
    });
  }, [draftBucketDefinitions]);

  const buildChartData = useCallback((meta, chart) => {
    if (!meta || !chart) return null;
    const bpmMin = Math.round(meta.bpmMin);
    const bpmMax = Math.round(meta.bpmMax);
    const bpmLabel = bpmMin === bpmMax ? String(bpmMax) : `${bpmMin}-${bpmMax}`;
    return {
      uniqueKey: `${meta.id}-${chart.chartId || chart.difficulty}`,
      title: meta.title,
      titleTranslit: meta.titleTranslit,
      artist: meta.artist,
      artistTranslit: meta.artistTranslit,
      jacket: meta.jacket,
      level: chart.feet,
      rankedRating: chart.rankedRating,
      bpm: bpmLabel,
      difficulty: chart.difficulty.toLowerCase(),
      mode: chart.mode,
      game: meta.game,
      chartId: chart.chartId,
      songId: meta.id,
      path: meta.path,
      hasShock: chart.hasShock,
    };
  }, []);

  const eligibleChartRows = useMemo(() => {
    const rows = [];
    filteredEntries.forEach(({ meta, matchingCharts }) => {
      matchingCharts.forEach((chart) => {
        const card = buildChartData(meta, chart);
        if (!card) return;
        const levelValue = getDifficultyValue(chart, showRankedRatings);
        const bucketValue = getDifficultyBucketValue(chart, showRankedRatings);
        rows.push({
          ...card,
          displayTitle: showTransliterationBeta && card.titleTranslit ? card.titleTranslit : card.title,
          displayArtist: showTransliterationBeta && card.artistTranslit ? card.artistTranslit : card.artist,
          levelValue,
          bucketValue,
          length: meta.length,
          bpmMin: meta.bpmMin,
          bpmMax: meta.bpmMax,
        });
      });
    });
    return rows.sort((a, b) => {
      const levelA = Number.isFinite(a.levelValue) ? a.levelValue : Number.MAX_SAFE_INTEGER;
      const levelB = Number.isFinite(b.levelValue) ? b.levelValue : Number.MAX_SAFE_INTEGER;
      if (levelA !== levelB) return levelA - levelB;
      const titleCompare = a.displayTitle.localeCompare(b.displayTitle);
      if (titleCompare !== 0) return titleCompare;
      return a.difficulty.localeCompare(b.difficulty);
    });
  }, [buildChartData, filteredEntries, showRankedRatings, showTransliterationBeta]);

  const eligibleHistogram = useMemo(() => {
    const counts = new Map();
    eligibleChartRows.forEach((row) => {
      const value = Number.isFinite(row.bucketValue) ? row.bucketValue : Number(row.level);
      const key = Number.isFinite(value) ? value : "Unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => {
        if (a.level === "Unknown") return 1;
        if (b.level === "Unknown") return -1;
        return a.level - b.level;
      });
  }, [eligibleChartRows]);

  const eligibleHistogramMax = useMemo(
    () => Math.max(1, ...eligibleHistogram.map((row) => row.count)),
    [eligibleHistogram],
  );

  const exportEligibleCharts = useCallback(() => {
    const columns = [
      ["Title", "displayTitle"],
      ["Artist", "displayArtist"],
      ["Game", "game"],
      ["Mode", "mode"],
      ["Difficulty", "difficulty"],
      ["Level", "level"],
      ["Ranked Rating", "rankedRating"],
      ["BPM", "bpm"],
      ["Length Seconds", "length"],
      ["Song ID", "songId"],
      ["Chart ID", "chartId"],
      ["Path", "path"],
    ];
    const lines = [
      columns.map(([label]) => csvValue(label)).join(","),
      ...eligibleChartRows.map((row) =>
        columns.map(([, key]) => csvValue(row[key])).join(","),
      ),
    ];
    downloadTextFile("card-draw-eligible-charts.csv", `${lines.join("\n")}\n`, "text/csv;charset=utf-8");
  }, [eligibleChartRows]);

  const buildChartCard = useCallback((entry) => {
    const { meta, matchingCharts } = entry;
    if (!meta || !matchingCharts.length) return null;
    const chosen =
      matchingCharts[Math.floor(Math.random() * matchingCharts.length)];
    if (!chosen) return null;
    return buildChartData(meta, chosen);
  }, [buildChartData]);

  const sortChartsByLevel = useCallback((charts) => {
    if (!sortByLevel) return charts;
    const withIndex = charts.map((chart, index) => ({ chart, index }));
    const sorted = withIndex.sort((a, b) => {
      const aFreePick = a.chart.freePickSlot || a.chart.isFreePickPlaceholder;
      const bFreePick = b.chart.freePickSlot || b.chart.isFreePickPlaceholder;
      if (aFreePick && !bFreePick) return 1;
      if (!aFreePick && bFreePick) return -1;
      const aLevel = getDifficultyValue(a.chart, showRankedRatings);
      const bLevel = getDifficultyValue(b.chart, showRankedRatings);
      if (Number.isFinite(aLevel) && Number.isFinite(bLevel) && aLevel !== bLevel) {
        return aLevel - bLevel;
      }
      if (Number.isFinite(aLevel) && !Number.isFinite(bLevel)) return -1;
      if (!Number.isFinite(aLevel) && Number.isFinite(bLevel)) return 1;
      return a.index - b.index;
    });
    return sorted.map(({ chart }) => chart);
  }, [sortByLevel, showRankedRatings]);

  const bucketValueForChart = useCallback(
    (chart) => getDifficultyBucketValue(chart, showRankedRatings),
    [showRankedRatings],
  );

  const drawCharts = useCallback(() => {
    if (!filteredEntries.length) {
      setDrawnCharts([]);
      setDrawHistory([]);
      setCurrentDrawId(null);
      setCardActions({});
      return;
    }
    const drawId = Date.now();
    const pool = [...filteredEntries];
    const maxCount = Math.min(drawCount, pool.length);
    let picks = [];
    if (weightedEnabled && bucketDefinitions.length) {
      const targetCounts = weightedForceExpected
        ? calculateWeightedTargets(
            coerceDistribution(weightedDistribution, bucketDefinitions.length),
            maxCount,
          )
        : calculateRandomTargets(
            coerceDistribution(weightedDistribution, bucketDefinitions.length),
            maxCount,
          );
      picks = drawWeightedCards(
        pool,
        bucketDefinitions,
        targetCounts,
        maxCount,
        buildChartData,
        buildChartCard,
        bucketValueForChart,
      );
    } else {
      for (let i = 0; i < maxCount; i += 1) {
        const idx = Math.floor(Math.random() * pool.length);
        const [picked] = pool.splice(idx, 1);
        const card = buildChartCard(picked);
        if (card) picks.push(card);
      }
    }
    const freePickSlots = Array.from({ length: freePickCount }, (_, index) => ({
      uniqueKey: `free-pick-${drawId}-${index}`,
      freePickSlot: true,
      isFreePickPlaceholder: true,
    }));
    const nextPicks = sortChartsByLevel([...picks, ...freePickSlots]);
    setCollapsedDrawKeys((currentKeys) => {
      if (!currentKeys.has("current")) return currentKeys;
      const nextKeys = new Set(currentKeys);
      nextKeys.delete("current");
      return nextKeys;
    });
    const nextLabels = drawnCharts.length > 0
      ? normalizeTournamentLabels({
          round: tournamentLabelLocks.round
            ? currentLabels.round
            : DEFAULT_TOURNAMENT_LABELS.round,
          p1: tournamentLabelLocks.p1
            ? currentLabels.p1
            : DEFAULT_TOURNAMENT_LABELS.p1,
          p2: tournamentLabelLocks.p2
            ? currentLabels.p2
            : DEFAULT_TOURNAMENT_LABELS.p2,
        })
      : currentLabels;
    setDrawnCharts(nextPicks);
    setCardActions({});
    setCurrentDrawId(drawId);
    setDrawHistory((prev) => {
      if (!nextPicks.length) return prev;
      const archived = currentDrawId == null
        ? prev
        : prev.map((entry) => (
            entry.id === currentDrawId
              ? { ...entry, labels: normalizeTournamentLabels(currentLabels) }
              : entry
          ));
      const entry = { id: drawId, charts: nextPicks, actions: {}, labels: nextLabels };
      const next = [entry, ...archived];
      return next.slice(0, 6);
    });
    setCurrentLabels(nextLabels);
  }, [
    filteredEntries,
    buildChartCard,
    buildChartData,
    drawCount,
    freePickCount,
    weightedEnabled,
    weightedForceExpected,
    weightedDistribution,
    bucketDefinitions,
    sortChartsByLevel,
    bucketValueForChart,
    currentLabels,
    currentDrawId,
    drawnCharts.length,
    setCurrentLabels,
    tournamentLabelLocks,
  ]);

  const clearDraw = useCallback(() => {
    const hasData = drawnCharts.length > 0 || drawHistory.length > 0;
    if (hasData) {
      const confirmed = window.confirm(
        "Clear the current draw and history?",
      );
      if (!confirmed) return;
    }
    setDrawnCharts([]);
    setDrawHistory([]);
    setCurrentDrawId(null);
    setCardActions({});
    setCollapsedDrawKeys(new Set());
  }, [drawHistory.length, drawnCharts.length]);

  const removeHistoryDraw = useCallback((entryId) => {
    const confirmed = window.confirm("Remove this old draw?");
    if (!confirmed) return;
    setDrawHistory((prev) => prev.filter((entry) => entry.id !== entryId));
  }, []);

  const games = useMemo(() => {
    if (smData?.games?.length) return smData.games;
    const set = new Set();
    songMeta.forEach((meta) => {
      if (meta?.game) set.add(meta.game);
    });
    return Array.from(set);
  }, [smData, songMeta]);

  const drawUniqueCard = useCallback((excludedKeys) => {
    if (!filteredEntries.length) return null;
    const attempts = Math.min(filteredEntries.length * 4, 40);
    for (let i = 0; i < attempts; i += 1) {
      const entry = filteredEntries[Math.floor(Math.random() * filteredEntries.length)];
      const card = buildChartCard(entry);
      if (card && !excludedKeys.has(card.uniqueKey)) return card;
    }
    return null;
  }, [filteredEntries, buildChartCard]);

  const updateActionsForContext = useCallback((entryId, updater) => {
    if (!entryId) {
      setCardActions(updater);
      return;
    }
    setDrawHistory((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, actions: updater(entry.actions || {}) }
          : entry,
      ),
    );
  }, []);

  const updateChartsForContext = useCallback((entryId, updater) => {
    if (!entryId) {
      setDrawnCharts(updater);
      return;
    }
    setDrawHistory((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, charts: updater(entry.charts || []) }
          : entry,
      ),
    );
  }, []);

  const updateLabelsForContext = useCallback((entryId, updater) => {
    if (!entryId) {
      setCurrentLabels((prev) => normalizeTournamentLabels(updater(normalizeTournamentLabels(prev))));
      return;
    }
    setDrawHistory((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
            ...entry,
            labels: normalizeTournamentLabels(
              updater(normalizeTournamentLabels(entry.labels)),
            ),
          }
          : entry,
      ),
    );
  }, [setCurrentLabels]);

  const removeFreePickSlot = useCallback((entryId, cardKey) => {
    if (!cardKey) return;
    updateChartsForContext(entryId, (prev) => prev.filter((chart) => chart.uniqueKey !== cardKey));
    updateActionsForContext(entryId, (prev) => {
      const next = { ...prev };
      delete next[cardKey];
      return next;
    });
  }, [updateActionsForContext, updateChartsForContext]);

  const resetCardDrawSettings = useCallback(() => {
    setDraftDrawCount(DEFAULT_DRAW_COUNT);
    setDraftFreePickCount(DEFAULT_FREE_PICK_COUNT);
    setDraftWeightedEnabled(false);
    setDraftWeightedForceExpected(false);
    setDraftWeightedGroupBuckets(true);
    setDraftWeightedBucketCount(DEFAULT_BUCKET_COUNT);
    setDraftWeightedBucketCountInput(String(DEFAULT_BUCKET_COUNT));
    setDraftWeightedDistribution([]);
    setDraftSortByLevel(false);
    setDraftReorderByAction(true);
    setDraftHideVetoed(false);
    setDraftShowTournamentLabels(false);
  }, []);

  const applyCardDrawSettings = useCallback(() => {
    setDrawCount(draftDrawCount);
    setFreePickCount(draftFreePickCount);
    setWeightedEnabled(draftWeightedEnabled);
    setWeightedForceExpected(draftWeightedForceExpected);
    setWeightedGroupBuckets(draftWeightedGroupBuckets);
    setWeightedBucketCount(draftWeightedBucketCount);
    setWeightedBucketCountInput(
      draftBucketCountInvalid ? String(draftWeightedBucketCount) : draftWeightedBucketCountInput,
    );
    setWeightedDistribution(
      coerceDistribution(draftWeightedDistribution, draftBucketDefinitions.length),
    );
    setSortByLevel(draftSortByLevel);
    setReorderByAction(draftReorderByAction);
    setHideVetoed(draftHideVetoed);
    setShowTournamentLabels(draftShowTournamentLabels);
    setShowSettings(false);
  }, [
    draftDrawCount,
    draftFreePickCount,
    draftWeightedEnabled,
    draftWeightedForceExpected,
    draftWeightedGroupBuckets,
    draftWeightedBucketCount,
    draftWeightedBucketCountInput,
    draftWeightedDistribution,
    draftSortByLevel,
    draftReorderByAction,
    draftHideVetoed,
    draftShowTournamentLabels,
    draftBucketCountInvalid,
    draftBucketDefinitions.length,
  ]);

  const refreshChartsForContext = useCallback((entryId) => {
    const charts = entryId
      ? drawHistory.find((entry) => entry.id === entryId)?.charts || []
      : drawnCharts;
    if (!charts.length) return;

    const actionsMap = entryId
      ? drawHistory.find((entry) => entry.id === entryId)?.actions || {}
      : cardActions;

    const keepKeys = new Set(
      charts
        .filter(
          (chart) =>
            LOCKED_ACTIONS.has(actionsMap[chart.uniqueKey]?.action)
            || chart.freePickSlot,
        )
        .map((chart) => chart.uniqueKey),
    );
    if (weightedEnabled && bucketDefinitions.length) {
      const lockedCharts = charts.filter((chart) => keepKeys.has(chart.uniqueKey));
      const lockedSongIds = new Set(lockedCharts.map((chart) => chart.songId));
      const pool = filteredEntries.filter(
        (entry) => !lockedSongIds.has(entry.meta.id),
      );
      const totalCount = charts.length;
      const remainingCount = totalCount - lockedCharts.length;
      const targetCounts = weightedForceExpected
        ? calculateWeightedTargets(
            coerceDistribution(weightedDistribution, bucketDefinitions.length),
            totalCount,
          )
        : calculateRandomTargets(
            coerceDistribution(weightedDistribution, bucketDefinitions.length),
            remainingCount,
          );
      let remainingTargets = targetCounts;
      if (weightedForceExpected) {
        const lockedCounts = bucketDefinitions.map(() => 0);
        lockedCharts.forEach((chart) => {
          const bucketValue = bucketValueForChart(chart);
          if (!Number.isFinite(bucketValue)) return;
          const index = bucketDefinitions.findIndex(
            (bucket) => bucketValue >= bucket.min && bucketValue <= bucket.max,
          );
          if (index !== -1) lockedCounts[index] += 1;
        });
        remainingTargets = targetCounts.map((count, index) =>
          Math.max(count - lockedCounts[index], 0),
        );
      }
      const replacements = drawWeightedCards(
        pool,
        bucketDefinitions,
        remainingTargets,
        remainingCount,
        buildChartData,
        buildChartCard,
        bucketValueForChart,
      );
      let replacementIndex = 0;
      const nextCharts = charts.map((chart) => {
        if (keepKeys.has(chart.uniqueKey)) return chart;
        const replacement = replacements[replacementIndex];
        replacementIndex += 1;
        return replacement || chart;
      });
      const nextSortedCharts = sortChartsByLevel(nextCharts);
      const nextActions = {};
      nextSortedCharts.forEach((chart) => {
        if (keepKeys.has(chart.uniqueKey)) {
          const existing = actionsMap[chart.uniqueKey];
          if (existing) nextActions[chart.uniqueKey] = existing;
        }
      });
      updateChartsForContext(entryId, () => nextSortedCharts);
      updateActionsForContext(entryId, () => nextActions);
      return;
    }

    const excluded = new Set(keepKeys);
    const nextCharts = charts.map((chart) => {
      if (keepKeys.has(chart.uniqueKey)) return chart;
      const replacement = drawUniqueCard(excluded);
      if (!replacement) return chart;
      excluded.add(replacement.uniqueKey);
      return replacement;
    });

    const nextSortedCharts = sortChartsByLevel(nextCharts);
    const nextActions = {};
    nextSortedCharts.forEach((chart) => {
      if (keepKeys.has(chart.uniqueKey)) {
        const existing = actionsMap[chart.uniqueKey];
        if (existing) nextActions[chart.uniqueKey] = existing;
      }
    });

    updateChartsForContext(entryId, () => nextSortedCharts);
    updateActionsForContext(entryId, () => nextActions);
  }, [
    cardActions,
    drawHistory,
    drawnCharts,
    drawUniqueCard,
    updateActionsForContext,
    updateChartsForContext,
    weightedEnabled,
    weightedForceExpected,
    weightedDistribution,
    bucketDefinitions,
    filteredEntries,
    buildChartData,
    buildChartCard,
    sortChartsByLevel,
    bucketValueForChart,
  ]);

  const revertPocketPick = useCallback((entryId, cardKey) => {
    const actionEntry = (entryId ? (drawHistory.find((item) => item.id === entryId)?.actions || {}) : cardActions)[cardKey];
    if (!actionEntry) return;
    if (!actionEntry.originalCard) {
      updateActionsForContext(entryId, (prev) => {
        const next = { ...prev };
        delete next[cardKey];
        return next;
      });
      return;
    }
    updateChartsForContext(entryId, (prev) => {
      const index = prev.findIndex((chart) => chart.uniqueKey === cardKey);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = actionEntry.originalCard;
      return next;
    });
    updateActionsForContext(entryId, (prev) => {
      const next = { ...prev };
      delete next[cardKey];
      if (actionEntry.originalAction) {
        next[actionEntry.originalCard.uniqueKey] = actionEntry.originalAction;
      }
      return next;
    });
  }, [cardActions, drawHistory, updateActionsForContext, updateChartsForContext]);

  const applyCardAction = useCallback((actionKey, player) => {
    if (!activeCardContext?.card) return;
    const entryId = activeCardContext.entryId || null;
    if (actionKey === "redraw") {
      updateChartsForContext(entryId, (prev) => {
        const index = prev.findIndex((chart) => chart.uniqueKey === activeCard.uniqueKey);
        if (index === -1) return prev;
        const excluded = new Set(prev.map((chart) => chart.uniqueKey));
        excluded.delete(activeCard.uniqueKey);
        const replacement = drawUniqueCard(excluded);
        if (!replacement) return prev;
        const next = [...prev];
        next[index] = replacement;
        updateActionsForContext(entryId, (prevActions) => {
          const nextActions = { ...prevActions };
          delete nextActions[activeCard.uniqueKey];
          nextActions[replacement.uniqueKey] = { action: actionKey, player: null, winner: null };
          return nextActions;
        });
        return next;
      });
      setActiveCardContext(null);
      return;
    }
    const existing = (entryId ? (drawHistory.find((item) => item.id === entryId)?.actions || {}) : cardActions)[activeCard.uniqueKey];
    if (actionKey === "winner") {
      const isSameWinner = existing?.winner === player;
      updateActionsForContext(entryId, (prev) => {
        const next = { ...prev };
        if (isSameWinner) {
          if (existing?.action) {
            next[activeCard.uniqueKey] = { ...existing, winner: null };
          } else {
            delete next[activeCard.uniqueKey];
          }
        } else {
          next[activeCard.uniqueKey] = {
            ...(existing || { action: null, player: null }),
            winner: player,
          };
        }
        return next;
      });
      setActiveCardContext(null);
      return;
    }
    if (existing?.action === actionKey && existing?.player === player) {
      if (actionKey === "pocket-pick") {
        revertPocketPick(entryId, activeCard.uniqueKey);
      } else {
        updateActionsForContext(entryId, (prev) => {
          const next = { ...prev };
          if (existing?.winner) {
            next[activeCard.uniqueKey] = { ...existing, action: null, player: null };
          } else {
            delete next[activeCard.uniqueKey];
          }
          return next;
        });
      }
      setActiveCardContext(null);
      return;
    }
    if (actionKey === "pocket-pick") {
      setPocketPickState({ card: activeCard, player, entryId, mode: "pocket-pick" });
      setPocketPickSong(null);
      setPocketPickChart(null);
      setPocketPickInput("");
      setActiveCardContext(null);
      return;
    }
    updateActionsForContext(entryId, (prev) => ({
      ...prev,
      [activeCard.uniqueKey]: {
        action: actionKey,
        player,
        winner: existing?.winner || null,
      },
    }));
    setActiveCardContext(null);
  }, [activeCard, activeCardContext, cardActions, drawHistory, drawUniqueCard, revertPocketPick, updateActionsForContext, updateChartsForContext]);

  const openFreePickModal = useCallback((card, entryId) => {
    setPocketPickState({
      card,
      player: null,
      entryId,
      mode: "free-pick",
    });
    setPocketPickSong(null);
    setPocketPickChart(null);
    setPocketPickInput("");
  }, []);

  const handleChartPage = useCallback((chart) => {
    if (!chart) return;
    if (setPlayStyle) setPlayStyle(chart.mode);
    const songId = chart.songId || chart.id || chart.path || chart.value;
    const chartId = chart.chartId || chart.slug;
    if (songId) {
      const params = new URLSearchParams();
      params.set("song", songId);
      if (chartId) params.set("chart", chartId);
      const query = params.toString();
      navigate(`/bpm${query ? `?${query}` : ""}`, { state: { fromSongCard: true } });
      return;
    }
    navigate(`/bpm?mode=${encodeURIComponent(chart.mode)}&difficulty=${encodeURIComponent(chart.difficulty)}&t=${encodeURIComponent(chart.title)}`, { state: { fromSongCard: true, title: chart.title } });
  }, [navigate, setPlayStyle]);

  const getActionLabel = useCallback((actionKey) => {
    const match = CARD_ACTIONS.find((action) => action.key === actionKey);
    if (match) return match.label;
    return String(actionKey || "")
      .replace(/[-_]+/g, " ")
      .replace(/^./, (character) => character.toUpperCase());
  }, []);

  const toggleDrawCollapsed = useCallback((drawKey) => {
    setCollapsedDrawKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(drawKey)) nextKeys.delete(drawKey);
      else nextKeys.add(drawKey);
      return nextKeys;
    });
  }, []);

  const exportDrawCsv = useCallback(({ charts, actions, labels, drawId }) => {
    const normalizedLabels = normalizeTournamentLabels(labels);
    const roundLabel = getRoundDisplayLabel(
      normalizedLabels,
      drawId ? formatDrawTimestamp(drawId) : "Current draw",
    );
    const columns = [
      ["Draw", () => roundLabel],
      ["Draw Time", () => formatDrawTimestamp(drawId)],
      ["Player 1", () => getPlayerDisplayLabel("P1", normalizedLabels)],
      ["Player 2", () => getPlayerDisplayLabel("P2", normalizedLabels)],
      ["Position", (_, index) => index + 1],
      ["Title", (row) => displayTitleFor(row)],
      ["Artist", (row) => displayArtistFor(row)],
      ["Game", (row) => row.game],
      ["Mode", (row) => row.mode],
      ["Difficulty", (row) => row.difficulty],
      ["Level", (row) => row.level],
      ["Ranked Rating", (row) => row.rankedRating],
      ["BPM", (row) => row.bpm],
      ["Song ID", (row) => row.songId],
      ["Chart ID", (row) => row.chartId],
      ["Path", (row) => row.path],
      ["Action", (row) => {
        const action = actions?.[row.uniqueKey]?.action;
        return action ? getActionLabel(action) : "";
      }],
      ["Action Player", (row) => {
        const player = actions?.[row.uniqueKey]?.player;
        return player ? getPlayerDisplayLabel(player, normalizedLabels) : "";
      }],
      ["Winner", (row) => {
        const winner = actions?.[row.uniqueKey]?.winner;
        return winner ? getPlayerDisplayLabel(winner, normalizedLabels) : "";
      }],
      ["Free Pick", (row) => (
        row.freePickSlot || row.isFreePickPlaceholder ? "Yes" : "No"
      )],
    ];
    const rows = Array.isArray(charts) ? charts : [];
    const lines = [
      columns.map(([label]) => csvValue(label)).join(","),
      ...rows.map((row, index) => (
        columns.map(([, getValue]) => csvValue(getValue(row, index))).join(",")
      )),
    ];
    const filenameLabel = roundLabel
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || String(drawId || "current");
    downloadTextFile(
      `card-draw-${filenameLabel}.csv`,
      `${lines.join("\n")}\n`,
      "text/csv;charset=utf-8",
    );
  }, [displayArtistFor, displayTitleFor, getActionLabel]);

  const renderSliceTag = useCallback((entry, labels) => {
    if (!entry?.action) {
      if (entry?.winner) {
        return (
          <span className="card-draw-slice-tag">
            <span className="card-draw-slice-action">Winner</span>
          </span>
        );
      }
      return <span className="card-draw-slice-placeholder">No tag</span>;
    }
    const label = getActionLabel(entry.action);
    const playerLabel = entry.player ? getPlayerDisplayLabel(entry.player, labels) : "";
    return (
      <span className={`card-draw-slice-tag${playerLabel ? " has-player" : ""}`}>
        <span className="card-draw-slice-action">{label}</span>
        {playerLabel && <span className="card-draw-slice-player">{playerLabel}</span>}
      </span>
    );
  }, [getActionLabel]);

  const renderSliceWinner = useCallback((entry, labels) => {
    if (!entry?.winner) {
      return null;
    }
    const winnerBadge = getPlayerDisplayLabel(entry.winner, labels);
    return (
      <span className="card-draw-slice-winner" aria-label={`Winner ${winnerBadge}`}>
        <FontAwesomeIcon icon={faTrophy} />
        <span className="card-draw-slice-winner-badge">{winnerBadge}</span>
      </span>
    );
  }, []);

  const getSliceClassName = useCallback((entry) => {
    const classes = [];
    if (entry?.action) classes.push(`card-draw-slice-${entry.action}`);
    else if (entry?.winner) classes.push("card-draw-slice-winner");
    else classes.push("card-draw-slice-none");
    if (entry?.winner) classes.push("has-winner");
    return classes.join(" ");
  }, []);

  const pocketPickSongOptions = useMemo(() => {
    return filteredEntries.map((entry) => ({
      value: entry.meta.id,
      label: showTransliterationBeta && entry.meta.titleTranslit
        ? entry.meta.titleTranslit
        : entry.meta.title,
      data: {
        entry,
        title: entry.meta.title,
        titleTranslit: entry.meta.titleTranslit,
      },
    }));
  }, [filteredEntries, showTransliterationBeta]);

  const pocketPickSongValue = useMemo(() => {
    if (!pocketPickSong) return null;
    return pocketPickSongOptions.find((opt) => opt.value === pocketPickSong.value) || pocketPickSong;
  }, [pocketPickSong, pocketPickSongOptions]);

  const pocketPickContextCharts = useMemo(() => {
    if (!pocketPickState) return [];
    if (!pocketPickState.entryId) return drawnCharts;
    const entry = drawHistory.find((item) => item.id === pocketPickState.entryId);
    return entry?.charts || [];
  }, [pocketPickState, drawnCharts, drawHistory]);

  const pocketPickChartOptions = useMemo(() => {
    if (!pocketPickSongValue?.data?.entry) return [];
    const { entry } = pocketPickSongValue.data;
    const existing = new Set(pocketPickContextCharts.map((chart) => chart.uniqueKey));
    if (pocketPickState?.card?.uniqueKey) {
      existing.delete(pocketPickState.card.uniqueKey);
    }
    return entry.matchingCharts
      .map((chart) => {
        const card = buildChartData(entry.meta, chart);
        if (!card || existing.has(card.uniqueKey)) return null;
        const diffLabel = chart.difficulty?.toUpperCase?.() || chart.difficulty;
        return {
          value: card.uniqueKey,
          label: `${chart.mode?.toUpperCase?.() || chart.mode} ${diffLabel} • Lv.${chart.feet}`,
          data: { chart, entry },
        };
      })
      .filter(Boolean);
  }, [pocketPickSongValue, pocketPickContextCharts, pocketPickState, buildChartData]);

  const handlePocketPickConfirm = useCallback(() => {
    if (!pocketPickState || !pocketPickChart?.data) return;
    const { card, player, entryId } = pocketPickState;
    const isFreePick = pocketPickState.mode === "free-pick";
    const { chart, entry } = pocketPickChart.data;
    const replacement = buildChartData(entry.meta, chart);
    if (!replacement) return;
    const replacementWithSlot = card?.freePickSlot
      ? { ...replacement, freePickSlot: true }
      : replacement;
    const originalAction = (entryId ? (drawHistory.find((item) => item.id === entryId)?.actions || {}) : cardActions)[card.uniqueKey]
      ? {
        action: (entryId ? (drawHistory.find((item) => item.id === entryId)?.actions || {}) : cardActions)[card.uniqueKey].action || null,
        player: (entryId ? (drawHistory.find((item) => item.id === entryId)?.actions || {}) : cardActions)[card.uniqueKey].player || null,
        winner: (entryId ? (drawHistory.find((item) => item.id === entryId)?.actions || {}) : cardActions)[card.uniqueKey].winner || null,
      }
      : null;
    updateChartsForContext(entryId, (prev) => {
      const index = prev.findIndex((chartEntry) => chartEntry.uniqueKey === card.uniqueKey);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = replacementWithSlot;
      return next;
    });
    updateActionsForContext(entryId, (prev) => {
      const next = { ...prev };
      delete next[card.uniqueKey];
      if (!isFreePick) {
        next[replacement.uniqueKey] = {
          action: "pocket-pick",
          player,
          winner: originalAction?.winner || null,
          originalCard: card,
          originalAction,
        };
      }
      return next;
    });
    setPocketPickState(null);
    setPocketPickSong(null);
    setPocketPickChart(null);
    setPocketPickInput("");
  }, [pocketPickState, pocketPickChart, buildChartData, cardActions, drawHistory, updateActionsForContext, updateChartsForContext]);

  useEffect(() => {
    if (!currentDrawId) return;
    setDrawHistory((prev) => {
      const index = prev.findIndex((entry) => entry.id === currentDrawId);
      if (index === -1) return prev;
      const entry = prev[index];
      const nextEntry = {
        ...entry,
        charts: drawnCharts,
        actions: cardActions,
        labels: currentLabels,
      };
      const next = [...prev];
      next[index] = nextEntry;
      return next;
    });
  }, [cardActions, currentLabels, drawnCharts, currentDrawId]);

  const isFreePickModal = pocketPickState?.mode === "free-pick";
  const pocketPickLabels = useMemo(() => {
    if (!pocketPickState?.entryId) return currentLabels;
    const entry = drawHistory.find((item) => item.id === pocketPickState.entryId);
    return normalizeTournamentLabels(entry?.labels);
  }, [currentLabels, drawHistory, pocketPickState]);
  const displayOptions = useMemo(
    () => ({ reorderByAction, hideVetoed }),
    [hideVetoed, reorderByAction],
  );
  const displayedDrawnCharts = useMemo(
    () => getDisplayedCharts(drawnCharts, cardActions, displayOptions),
    [cardActions, displayOptions, drawnCharts],
  );
  const displayedDrawHistory = useMemo(
    () =>
      drawHistory.map((entry) => ({
        ...entry,
        displayCharts: getDisplayedCharts(entry.charts || [], entry.actions || {}, displayOptions),
      })),
    [displayOptions, drawHistory],
  );
  useEffect(() => {
    if (!showDrawFocusBeta) {
      setViewedDrawKey("current");
      return undefined;
    }

    const page = drawPageRef.current;
    if (!page || typeof window === "undefined") return undefined;

    const desktopQuery = window.matchMedia("(min-width: 641px)");
    let animationFrame = null;

    const updateViewedDraw = () => {
      animationFrame = null;
      if (!desktopQuery.matches) {
        setViewedDrawKey("current");
        return;
      }

      const drawSections = Array.from(
        page.querySelectorAll("[data-draw-viewport-key]"),
      );
      if (!drawSections.length) return;

      const pageBottom = document.documentElement.scrollHeight;
      const atPageBottom = window.scrollY + window.innerHeight >= pageBottom - 2;
      if (atPageBottom) {
        const lastKey = drawSections[drawSections.length - 1].dataset.drawViewportKey;
        setViewedDrawKey((currentKey) => (
          currentKey === lastKey ? currentKey : lastKey
        ));
        return;
      }

      const focusLine = window.innerHeight * 0.45;
      let closestKey = drawSections[0].dataset.drawViewportKey;
      let closestDistance = Number.POSITIVE_INFINITY;

      drawSections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const distance = focusLine < rect.top
          ? rect.top - focusLine
          : focusLine > rect.bottom
            ? focusLine - rect.bottom
            : 0;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestKey = section.dataset.drawViewportKey;
        }
      });

      setViewedDrawKey((currentKey) => (
        currentKey === closestKey ? currentKey : closestKey
      ));
    };

    const scheduleUpdate = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(updateViewedDraw);
    };

    updateViewedDraw();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    desktopQuery.addEventListener("change", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      desktopQuery.removeEventListener("change", scheduleUpdate);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [displayedDrawHistory, drawnCharts.length, showDrawFocusBeta, showTournamentLabels]);
  const nonFreePickCount = useMemo(
    () => displayedDrawnCharts.filter((chart) => !chart.freePickSlot && !chart.isFreePickPlaceholder).length,
    [displayedDrawnCharts],
  );
  const currentDrawHidden = drawnCharts.length > 0 && displayedDrawnCharts.length === 0;
  const renderTournamentLabelEditor = useCallback((labels, entryId = null) => {
    const normalized = normalizeTournamentLabels(labels);
    const updateField = (field, value) => {
      updateLabelsForContext(entryId, (prev) => ({
        ...prev,
        [field]: value,
      }));
    };
    const renderLockButton = (lockKey, label) => {
      if (entryId !== null) return null;
      const locked = tournamentLabelLocks[lockKey];
      const stateLabel = locked ? "locked" : "unlocked";
      const actionLabel = locked ? "Unlock" : "Lock";
      return (
        <button
          type="button"
          className={`card-draw-label-lock${locked ? " is-locked" : ""}`}
          title={`${actionLabel} ${label}. ${locked ? "It will currently be kept for the next draw." : "It will currently reset for the next draw."}`}
          aria-label={`${actionLabel} ${label}; currently ${stateLabel}`}
          aria-pressed={locked}
          onClick={() => setTournamentLabelLocks((current) => ({
            ...current,
            [lockKey]: !current[lockKey],
          }))}
        >
          <FontAwesomeIcon icon={locked ? faLock : faLockOpen} />
        </button>
      );
    };
    return (
      <div className="card-draw-labels" aria-label="Tournament labels">
        <label className="card-draw-label-field card-draw-label-round">
          <span>Round</span>
          <span className="card-draw-label-input-wrap">
            <input
              type="text"
              value={normalized.round}
              placeholder="Round name"
              onChange={(event) => updateField("round", event.target.value)}
            />
            {renderLockButton("round", "round label")}
          </span>
        </label>
        <label className="card-draw-label-field">
          <span>Player 1</span>
          <span className="card-draw-label-input-wrap">
            <input
              type="text"
              value={normalized.p1}
              placeholder="P1"
              onChange={(event) => updateField("p1", event.target.value)}
            />
            {renderLockButton("p1", "Player 1 label")}
          </span>
        </label>
        <label className="card-draw-label-field">
          <span>Player 2</span>
          <span className="card-draw-label-input-wrap">
            <input
              type="text"
              value={normalized.p2}
              placeholder="P2"
              onChange={(event) => updateField("p2", event.target.value)}
            />
            {renderLockButton("p2", "Player 2 label")}
          </span>
        </label>
      </div>
    );
  }, [setTournamentLabelLocks, tournamentLabelLocks, updateLabelsForContext]);

  return (
    <div className="app-container card-draw-page" ref={drawPageRef}>
      <section className="filter-bar card-draw-bar">
        <div className="filter-group card-draw-controls">
          <div className="card-draw-summary">
            <span className="card-draw-summary-full">
              {availableCount} song{availableCount === 1 ? "" : "s"} match the
              filter.
            </span>
            <span className="card-draw-summary-short">
              {availableCount} song{availableCount === 1 ? "" : "s"}.
            </span>
            <span className="card-draw-summary-tiny">
              {availableCount}♫
            </span>
          </div>
          <div className="card-draw-actions">
            <button
              type="button"
              className="card-draw-action primary"
              onClick={drawCharts}
              disabled={availableCount === 0}
            >
              {drawnCharts.length ? "Draw" : `Draw ${drawCount}`}
            </button>
            <button
              type="button"
              className="filter-button"
              onClick={openSettings}
              title="Settings"
              aria-label="Settings"
            >
              <FontAwesomeIcon icon={faGear} />
            </button>
            <button
              type="button"
              className={`filter-button ${filtersActive ? "active" : ""}`}
              onClick={() => setShowFilter(true)}
              title="Filters"
            >
              <FontAwesomeIcon icon={faFilter} />
            </button>
            <button
              type="button"
              className={`filter-button ${showEligibleCharts ? "active" : ""}`}
              onClick={() => setShowEligibleCharts((prev) => !prev)}
              title="Show eligible charts"
              aria-label="Show eligible charts"
              aria-pressed={showEligibleCharts}
            >
              <FontAwesomeIcon icon={faChartColumn} />
            </button>
          </div>
        </div>
      </section>

      {showEligibleCharts && (
        <section className="card-draw-eligible">
          <h2 className="card-draw-eligible-header">
            <span className="card-draw-eligible-heading">
              <span>Eligible charts</span>
              <span className="card-draw-eligible-count">
                {eligibleChartRows.length} chart{eligibleChartRows.length === 1 ? "" : "s"}
              </span>
            </span>
            <button
              type="button"
              className="card-draw-eligible-export"
              onClick={exportEligibleCharts}
              disabled={eligibleChartRows.length === 0}
            >
              <FontAwesomeIcon icon={faDownload} />
              <span>Export CSV</span>
            </button>
          </h2>
          <div className="card-draw-eligible-body">
            <p className="card-draw-eligible-note">
              Current filter pool by level.
            </p>
            {eligibleHistogram.length > 0 ? (
              <div className="card-draw-histogram" aria-label="Eligible charts by level">
                {eligibleHistogram.map((bucket) => {
                  const width = `${Math.max(4, (bucket.count / eligibleHistogramMax) * 100)}%`;
                  const label = bucket.level === "Unknown" ? "Unknown" : `Lv.${bucket.level}`;
                  return (
                    <div key={bucket.level} className="card-draw-histogram-row">
                      <span className="card-draw-histogram-label">{label}</span>
                      <span className="card-draw-histogram-track">
                        <span className="card-draw-histogram-bar" style={{ width }} />
                      </span>
                      <span className="card-draw-histogram-count">{bucket.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card-draw-empty">No charts match the current filters.</div>
            )}
          </div>
        </section>
      )}

      <section
        className={`dan-section card-draw-results card-draw-focus-group${
          showDrawFocusBeta
            ? viewedDrawKey === "current" ? " is-draw-viewed" : " is-draw-muted"
            : ""
        }`}
        data-draw-viewport-key="current"
      >
        <h2
          className={`dan-header${collapsedDrawKeys.has("current") ? " is-collapsed" : ""}`}
          style={{ backgroundColor: "var(--accent-color)" }}
        >
          <span>{getRoundDisplayLabel(currentLabels, "Current draw")}</span>
          <span className="card-draw-header-actions">
            <button
              type="button"
              className="collapse-button"
              title="Refresh draw"
              aria-label="Refresh draw"
              onClick={() => {
                const confirmed = window.confirm(
                  "Refresh this draw? Protected and pocket picks will be kept.",
                );
                if (!confirmed) return;
                refreshChartsForContext(null);
              }}
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
            <button
              type="button"
              className="collapse-button"
              title="Download draw CSV"
              aria-label="Download current draw CSV"
              onClick={() => exportDrawCsv({
                charts: drawnCharts,
                actions: cardActions,
                labels: currentLabels,
                drawId: currentDrawId,
              })}
            >
              <FontAwesomeIcon icon={faDownload} />
            </button>
            <button
              type="button"
              className="collapse-button"
              title={collapsedDrawKeys.has("current") ? "Expand draw" : "Collapse draw"}
              aria-label={collapsedDrawKeys.has("current") ? "Expand current draw" : "Collapse current draw"}
              aria-expanded={!collapsedDrawKeys.has("current")}
              aria-controls="card-draw-current-content"
              onClick={() => toggleDrawCollapsed("current")}
            >
              <FontAwesomeIcon icon={collapsedDrawKeys.has("current") ? faChevronDown : faChevronUp} />
            </button>
          </span>
        </h2>
        <div
          id="card-draw-current-content"
          className="card-draw-collapsible"
          hidden={collapsedDrawKeys.has("current")}
        >
          {showTournamentLabels && drawnCharts.length > 0 && renderTournamentLabelEditor(currentLabels)}
          <div
            className={`song-grid ${nonFreePickCount === DEFAULT_DRAW_COUNT ? "card-draw-five" : ""}`}
          >
            {displayedDrawnCharts.length ? (
              displayedDrawnCharts.map((chart) => (
                chart.isFreePickPlaceholder ? (
                  <div
                    key={chart.uniqueKey}
                    className="card-draw-card card-draw-free-pick"
                  >
                    <SongCard
                      song={freePickPlaceholder}
                      skipScoreLookup
                      bpmOnly
                      showArtist
                      showJacket={showJacket}
                      jacketFull={jacketFull}
                      showGameLogo={offline}
                      showGameWithDifficulty
                      levelInTitleBlock
                      onCardClick={() => openFreePickModal(chart, null)}
                      showScoreSlice
                      scoreSliceLeft={<span className="card-draw-slice-placeholder">Free pick</span>}
                      scoreSliceClassName="card-draw-slice-none"
                    />
                  </div>
                ) : (
                  <div
                    key={chart.uniqueKey}
                    className={`card-draw-card${cardActions[chart.uniqueKey] ? ` is-${cardActions[chart.uniqueKey].action}${cardActions[chart.uniqueKey].player ? ` is-${cardActions[chart.uniqueKey].player.toLowerCase()}` : ""}` : ""}`}
                  >
                    <SongCard
                      song={chart}
                      skipScoreLookup
                      bpmOnly
                      showArtist
                      showJacket={showJacket}
                      jacketFull={jacketFull}
                      showGameLogo={offline}
                      showGameWithDifficulty
                      levelInTitleBlock
                      onCardClick={() => setActiveCardContext({ card: chart, entryId: null })}
                      showScoreSlice
                      scoreSliceLeft={renderSliceTag(cardActions[chart.uniqueKey], currentLabels)}
                      scoreSliceRight={renderSliceWinner(cardActions[chart.uniqueKey], currentLabels)}
                      scoreSliceClassName={getSliceClassName(cardActions[chart.uniqueKey])}
                    />
                  </div>
                )
              ))
            ) : (
              <div className="card-draw-empty">
                {currentDrawHidden
                  ? "All charts in this draw are hidden by vetoes."
                  : "Draw to generate a set of charts for your tournament round."}
              </div>
            )}
          </div>
        </div>
      </section>

      {displayedDrawHistory.length > 1 && (
        <section className="card-draw-history dan-section">
          {displayedDrawHistory.slice(1, 6).map((entry) => (
            <div
              key={entry.id}
              className={`card-draw-history-set card-draw-focus-group${
                showDrawFocusBeta
                  ? viewedDrawKey === `history-${entry.id}` ? " is-draw-viewed" : " is-draw-muted"
                  : ""
              }`}
              data-draw-viewport-key={`history-${entry.id}`}
            >
              <h3 className={`dan-header card-draw-history-header${
                collapsedDrawKeys.has(`history-${entry.id}`) ? " is-collapsed" : ""
              }`}>
                <span>{getRoundDisplayLabel(entry.labels, formatDrawTimestamp(entry.id))}</span>
                <span className="card-draw-header-actions">
                  <button
                    type="button"
                    className="collapse-button"
                    title="Refresh draw"
                    aria-label="Refresh draw"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Refresh this draw? Protected and pocket picks will be kept.",
                      );
                      if (!confirmed) return;
                      refreshChartsForContext(entry.id);
                    }}
                  >
                    <FontAwesomeIcon icon={faRotateRight} />
                  </button>
                  <button
                    type="button"
                    className="collapse-button"
                    title="Download draw CSV"
                    aria-label={`Download ${getRoundDisplayLabel(entry.labels, "saved draw")} CSV`}
                    onClick={() => exportDrawCsv({
                      charts: entry.charts,
                      actions: entry.actions,
                      labels: entry.labels,
                      drawId: entry.id,
                    })}
                  >
                    <FontAwesomeIcon icon={faDownload} />
                  </button>
                  <button
                    type="button"
                    className="collapse-button"
                    title="Remove old draw"
                    aria-label="Remove old draw"
                    onClick={() => removeHistoryDraw(entry.id)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                  <button
                    type="button"
                    className="collapse-button"
                    title={collapsedDrawKeys.has(`history-${entry.id}`) ? "Expand draw" : "Collapse draw"}
                    aria-label={collapsedDrawKeys.has(`history-${entry.id}`) ? "Expand saved draw" : "Collapse saved draw"}
                    aria-expanded={!collapsedDrawKeys.has(`history-${entry.id}`)}
                    aria-controls={`card-draw-history-${entry.id}-content`}
                    onClick={() => toggleDrawCollapsed(`history-${entry.id}`)}
                  >
                    <FontAwesomeIcon icon={collapsedDrawKeys.has(`history-${entry.id}`) ? faChevronDown : faChevronUp} />
                  </button>
                </span>
              </h3>
              <div
                id={`card-draw-history-${entry.id}-content`}
                className="card-draw-collapsible"
                hidden={collapsedDrawKeys.has(`history-${entry.id}`)}
              >
                {showTournamentLabels && renderTournamentLabelEditor(entry.labels, entry.id)}
                <div
                  className={`song-grid card-draw-history-grid ${
                    entry.displayCharts.filter((chart) => !chart.freePickSlot && !chart.isFreePickPlaceholder).length === DEFAULT_DRAW_COUNT
                      ? "card-draw-five"
                      : ""
                  }`}
                >
                  {entry.displayCharts.length ? entry.displayCharts.map((chart) => (
                    chart.isFreePickPlaceholder ? (
                      <div
                        key={`${entry.id}-${chart.uniqueKey}`}
                        className="card-draw-card card-draw-free-pick"
                      >
                        <SongCard
                          song={freePickPlaceholder}
                          skipScoreLookup
                          bpmOnly
                          showArtist
                          showJacket={showJacket}
                          jacketFull={jacketFull}
                          showGameLogo={offline}
                          showGameWithDifficulty
                          levelInTitleBlock
                          onCardClick={() => openFreePickModal(chart, entry.id)}
                          showScoreSlice
                          scoreSliceLeft={<span className="card-draw-slice-placeholder">Free pick</span>}
                          scoreSliceClassName="card-draw-slice-none"
                        />
                      </div>
                    ) : (
                      <SongCard
                        key={`${entry.id}-${chart.uniqueKey}`}
                        song={chart}
                        skipScoreLookup
                        bpmOnly
                        showArtist
                        showJacket={showJacket}
                        jacketFull={jacketFull}
                        showGameLogo={offline}
                        showGameWithDifficulty
                        levelInTitleBlock
                        onCardClick={() => setActiveCardContext({ card: chart, entryId: entry.id })}
                        showScoreSlice
                        scoreSliceLeft={renderSliceTag(entry.actions?.[chart.uniqueKey], entry.labels)}
                        scoreSliceRight={renderSliceWinner(entry.actions?.[chart.uniqueKey], entry.labels)}
                        scoreSliceClassName={getSliceClassName(entry.actions?.[chart.uniqueKey])}
                      />
                    )
                  )) : (
                    <div className="card-draw-empty">
                      All charts in this draw are hidden by vetoes.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <ModalShell
        isOpen={Boolean(activeCardContext)}
        onClose={() => setActiveCardContext(null)}
        title={activeCard ? "Card actions" : "Card actions"}
        ariaDescribedBy="card-draw-actions"
      >
        <ModalShell.Body id="card-draw-actions">
          {activeCard && (
            <div className="card-draw-modal-meta">
              <div className="card-draw-modal-title">{displayTitleFor(activeCard)}</div>
              {displayArtistFor(activeCard) && (
                <div className="card-draw-modal-artist">{displayArtistFor(activeCard)}</div>
              )}
              <div className="card-draw-modal-subtitle">
                {activeCard.mode?.toUpperCase()} {activeCard.difficulty?.toUpperCase()} • Lv.{activeCard.level}
              </div>
            </div>
          )}
          <div className="card-draw-modal-actions">
            {CARD_ACTIONS.map((action) => (
              <div key={action.key} className="card-draw-modal-row">
                <div className="card-draw-modal-label">{action.label}</div>
                <div className="card-draw-modal-buttons">
                  <ModalShell.Button
                    variant="secondary"
                    className={
                      activeActionEntry?.action === action.key &&
                      activeActionEntry?.player === "P1"
                        ? "card-draw-modal-selected"
                        : null
                    }
                    aria-pressed={
                      activeActionEntry?.action === action.key &&
                      activeActionEntry?.player === "P1"
                    }
                    onClick={() => applyCardAction(action.key, "P1")}
                  >
                    {getPlayerDisplayLabel("P1", activeTournamentLabels)}
                  </ModalShell.Button>
                  <ModalShell.Button
                    variant="secondary"
                    className={
                      activeActionEntry?.action === action.key &&
                      activeActionEntry?.player === "P2"
                        ? "card-draw-modal-selected"
                        : null
                    }
                    aria-pressed={
                      activeActionEntry?.action === action.key &&
                      activeActionEntry?.player === "P2"
                    }
                    onClick={() => applyCardAction(action.key, "P2")}
                  >
                    {getPlayerDisplayLabel("P2", activeTournamentLabels)}
                  </ModalShell.Button>
                </div>
              </div>
            ))}
            <div className="card-draw-modal-row">
              <div className="card-draw-modal-label">Winner</div>
              <div className="card-draw-modal-buttons">
                <ModalShell.Button
                  variant="secondary"
                  className={
                    activeActionEntry?.winner === "P1" ? "card-draw-modal-selected" : null
                  }
                  aria-pressed={activeActionEntry?.winner === "P1"}
                  onClick={() => applyCardAction("winner", "P1")}
                >
                  {getPlayerDisplayLabel("P1", activeTournamentLabels)}
                </ModalShell.Button>
                <ModalShell.Button
                  variant="secondary"
                  className={
                    activeActionEntry?.winner === "P2" ? "card-draw-modal-selected" : null
                  }
                  aria-pressed={activeActionEntry?.winner === "P2"}
                  onClick={() => applyCardAction("winner", "P2")}
                >
                  {getPlayerDisplayLabel("P2", activeTournamentLabels)}
                </ModalShell.Button>
              </div>
            </div>
          </div>
        </ModalShell.Body>
        <ModalShell.Footer align="space-between">
          <ModalShell.Button
            variant="secondary"
            onClick={() => applyCardAction("redraw", null)}
          >
            Redraw
          </ModalShell.Button>
          <ModalShell.Button
            variant="secondary"
            onClick={() => {
              handleChartPage(activeCard);
              setActiveCardContext(null);
            }}
          >
            View chart
          </ModalShell.Button>
        </ModalShell.Footer>
      </ModalShell>

      <ModalShell
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Card draw settings"
      >
        <ModalShell.Body>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Draw count</h4>
                <p className={settingsStyles.sectionDescription}>
                  Choose how many charts to draw (1–{MAX_DRAW_COUNT}).
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
            <button
              type="button"
              className={settingsStyles.stepperButton}
              onClick={() => setDraftDrawCount((prev) => Math.max(1, prev - 1))}
              aria-label="Decrease draw count"
            >
              −
            </button>
            <input
              id="card-draw-count"
              type="number"
              className={settingsStyles.input}
              min={1}
              max={MAX_DRAW_COUNT}
              value={draftDrawCount}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isNaN(next)) return;
                setDraftDrawCount(Math.min(MAX_DRAW_COUNT, Math.max(1, next)));
              }}
            />
            <button
              type="button"
              className={settingsStyles.stepperButton}
              onClick={() => setDraftDrawCount((prev) => Math.min(MAX_DRAW_COUNT, prev + 1))}
              aria-label="Increase draw count"
            >
              +
            </button>
              </div>
            </div>
          </section>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Free picks</h4>
                <p className={settingsStyles.sectionDescription}>
                  Add blank cards that you can fill in after the draw (0–{MAX_FREE_PICK_COUNT}).
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
                <button
                  type="button"
                  className={settingsStyles.stepperButton}
                  onClick={() => setDraftFreePickCount((prev) => Math.max(0, prev - 1))}
                  aria-label="Decrease free pick count"
                >
                  −
                </button>
                <input
                  id="card-draw-free-picks"
                  type="number"
                  className={settingsStyles.input}
                  min={0}
                  max={MAX_FREE_PICK_COUNT}
                  value={draftFreePickCount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setDraftFreePickCount(Math.min(MAX_FREE_PICK_COUNT, Math.max(0, next)));
                  }}
                />
                <button
                  type="button"
                  className={settingsStyles.stepperButton}
                  onClick={() => setDraftFreePickCount((prev) => Math.min(MAX_FREE_PICK_COUNT, prev + 1))}
                  aria-label="Increase free pick count"
                >
                  +
                </button>
              </div>
            </div>
          </section>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Sort by level</h4>
                <p className={settingsStyles.sectionDescription}>
                  Order the drawn charts from low to high difficulty.
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
                <Switch
                  checked={draftSortByLevel}
                  onChange={() => setDraftSortByLevel((prev) => !prev)}
                  ariaLabel="Toggle sort by level"
                />
              </div>
            </div>
          </section>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Reorder by pick/ban</h4>
                <p className={settingsStyles.sectionDescription}>
                  Show protected charts first and vetoed charts last.
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
                <Switch
                  checked={draftReorderByAction}
                  onChange={() => setDraftReorderByAction((prev) => !prev)}
                  ariaLabel="Toggle pick and ban ordering"
                />
              </div>
            </div>
          </section>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Hide vetoed charts</h4>
                <p className={settingsStyles.sectionDescription}>
                  Remove vetoed cards from the visible draw instead of dimming them.
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
                <Switch
                  checked={draftHideVetoed}
                  onChange={() => setDraftHideVetoed((prev) => !prev)}
                  ariaLabel="Toggle hidden vetoes"
                />
              </div>
            </div>
          </section>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Tournament labels</h4>
                <p className={settingsStyles.sectionDescription}>
                  Add editable round and player labels to current and saved draws.
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
                <Switch
                  checked={draftShowTournamentLabels}
                  onChange={() => setDraftShowTournamentLabels((prev) => !prev)}
                  ariaLabel="Toggle tournament labels"
                />
              </div>
            </div>
          </section>
          <section className={settingsStyles.formSection}>
            <div className={settingsStyles.settingRow}>
              <div className={settingsStyles.settingText}>
                <h4 className={settingsStyles.sectionTitle}>Use Weighted Distributions</h4>
                <p className={settingsStyles.sectionDescription}>
                  Weight the chance of drawing charts from each difficulty bucket.
                  Values are relative and do not need to add up.
                </p>
              </div>
              <div className={settingsStyles.settingControl}>
                <Switch
                  checked={draftWeightedEnabled}
                  onChange={() => setDraftWeightedEnabled((prev) => !prev)}
                  ariaLabel="Toggle weighted distributions"
                />
              </div>
            </div>
            {draftWeightedEnabled && (
              <div className={settingsStyles.subSection}>
                <label className={settingsStyles.inlineToggle}>
                  <input
                    type="checkbox"
                    checked={draftWeightedForceExpected}
                    onChange={() => setDraftWeightedForceExpected((prev) => !prev)}
                  />
                  <span>Force expected distribution</span>
                </label>
                <div className={settingsStyles.inlineRow}>
                  <label className={settingsStyles.inlineToggle}>
                    <input
                      type="checkbox"
                      checked={draftWeightedGroupBuckets}
                      onChange={() => setDraftWeightedGroupBuckets((prev) => !prev)}
                    />
                    <span>Group cards into this many buckets</span>
                  </label>
                  {draftWeightedGroupBuckets && (
                    <input
                      type="number"
                      className={`${settingsStyles.bucketCountInput} ${
                        draftBucketCountInvalid ? settingsStyles.bucketCountInvalid : ""
                      }`}
                      value={draftWeightedBucketCountInput}
                      aria-invalid={draftBucketCountInvalid}
                      onChange={(event) => {
                        const nextRaw = event.target.value;
                        setDraftWeightedBucketCountInput(nextRaw);
                        if (nextRaw.trim() === "") return;
                        const nextParsed = Number(nextRaw);
                        if (!Number.isFinite(nextParsed)) return;
                        if (!Number.isInteger(nextParsed)) return;
                        if (nextParsed < 1 || nextParsed > MAX_BUCKET_COUNT) return;
                        setDraftWeightedBucketCount(nextParsed);
                      }}
                    />
                  )}
                </div>
                <div className={settingsStyles.bucketHint}>
                  Higher numbers increase the odds for that bucket.
                  {draftWeightedForceExpected ? " Ranges show how many cards each bucket gets." : ""}
                </div>
                <div className={settingsStyles.bucketGrid}>
                  {draftBucketDefinitions.map((bucket, index) => {
                    const label =
                      bucket.min === bucket.max
                        ? `Lv.${bucket.min}`
                        : `Lv.${bucket.min}-${bucket.max}`;
                    const weightValue = draftBucketDistribution[index] ?? 0;
                    const percentLabel = draftBucketWeightTotal > 0
                      ? `${Math.round((weightValue / draftBucketWeightTotal) * 100)}%`
                      : "--";
                    const rangeLabel = draftBucketExpectedRanges[index] ?? "--";
                    const hintLabel = draftWeightedForceExpected ? rangeLabel : percentLabel;
                    return (
                      <div key={bucket.id} className={settingsStyles.bucketCell}>
                        <input
                          type="number"
                          min={0}
                          className={settingsStyles.bucketInput}
                          value={draftBucketDistribution[index] ?? 0}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            if (Number.isNaN(nextValue)) return;
                            setDraftWeightedDistribution((prev) => {
                              const next = coerceDistribution(
                                prev,
                                draftBucketDefinitions.length,
                              );
                              next[index] = Math.max(0, Math.floor(nextValue));
                              return next;
                            });
                          }}
                        />
                        <div className={settingsStyles.bucketLabel}>{label}</div>
                        <div className={settingsStyles.bucketPercent}>{hintLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </ModalShell.Body>
        <ModalShell.Footer align="space-between">
          <ModalShell.Button
            variant="danger"
            onClick={clearDraw}
            disabled={drawnCharts.length === 0}
            aria-label="Clear all draws"
          >
            <FontAwesomeIcon icon={faTrash} />
            <span className={settingsStyles.clearLabel}>Clear all draws</span>
          </ModalShell.Button>
          <ModalShell.FooterActions>
            <ModalShell.Button variant="secondary" onClick={resetCardDrawSettings}>
              Reset
            </ModalShell.Button>
            <ModalShell.Button variant="primary" onClick={applyCardDrawSettings}>
              Apply
            </ModalShell.Button>
          </ModalShell.FooterActions>
        </ModalShell.Footer>
      </ModalShell>

      <ModalShell
        isOpen={Boolean(pocketPickState)}
        onClose={() => {
          setPocketPickState(null);
          setPocketPickSong(null);
          setPocketPickChart(null);
          setPocketPickInput("");
        }}
        title={isFreePickModal ? "Free pick" : "Pocket pick"}
        ariaDescribedBy="pocket-pick-modal"
      >
        <ModalShell.Body id="pocket-pick-modal">
          {pocketPickState?.card && !isFreePickModal && (
            <div className="card-draw-modal-meta">
              <div className="card-draw-modal-title">
                Replace: {displayTitleFor(pocketPickState.card)}
              </div>
              {displayArtistFor(pocketPickState.card) && (
                <div className="card-draw-modal-artist">
                  {displayArtistFor(pocketPickState.card)}
                </div>
              )}
              <div className="card-draw-modal-subtitle">
                {getPlayerDisplayLabel(pocketPickState.player, pocketPickLabels)} pocket pick
              </div>
            </div>
          )}
          {isFreePickModal && (
            <div className="card-draw-modal-meta">
              <div className="card-draw-modal-title">Select a free pick</div>
              <div className="card-draw-modal-subtitle">
                Choose a song and chart to fill this blank card.
              </div>
            </div>
          )}
          <div className="card-draw-pocket">
            <div className="card-draw-pocket-field">
              <label className="card-draw-pocket-label" htmlFor="pocket-pick-song">
                Song
              </label>
              <Select
                inputId="pocket-pick-song"
                className="card-draw-pocket-select"
                options={pocketPickSongOptions}
                value={pocketPickSongValue}
                onChange={(selected) => {
                  setPocketPickSong(selected);
                  setPocketPickChart(null);
                }}
                inputValue={pocketPickInput}
                onInputChange={(value) => setPocketPickInput(value)}
                placeholder="Search for a song..."
                isClearable
                menuPortalTarget={menuPortalTarget}
                menuPosition="fixed"
                filterOption={(option, rawInput) => {
                  const input = rawInput.toLowerCase();
                  const { label, data } = option;
                  const title = data?.title || "";
                  const titleTranslit = data?.titleTranslit || "";
                  return (
                    label.toLowerCase().includes(input) ||
                    title.toLowerCase().includes(input) ||
                    titleTranslit.toLowerCase().includes(input)
                  );
                }}
                styles={{
                  control: (styles) => ({
                    ...styles,
                    backgroundColor: "var(--card-bg-color)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-color)",
                    padding: "0.3rem",
                    borderRadius: "0.5rem",
                  }),
                  menu: (styles) => ({
                    ...styles,
                    backgroundColor: "var(--bg-color-light)",
                    zIndex: 1002,
                  }),
                  menuPortal: (styles) => ({ ...styles, zIndex: 2000 }),
                  option: (styles, { isFocused, isSelected }) => ({
                    ...styles,
                    backgroundColor: isSelected
                      ? "var(--card-hover-bg-color)"
                      : isFocused
                      ? "var(--card-bg-color)"
                      : null,
                    color: "var(--text-color)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }),
                  singleValue: (styles) => ({
                    ...styles,
                    color: "var(--text-color)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }),
                  input: (styles) => ({ ...styles, color: "var(--text-color)" }),
                }}
              />
            </div>
            <div className="card-draw-pocket-field">
              <label className="card-draw-pocket-label" htmlFor="pocket-pick-chart">
                Chart
              </label>
              <Select
                inputId="pocket-pick-chart"
                className="card-draw-pocket-select"
                options={pocketPickChartOptions}
                value={pocketPickChart}
                onChange={(selected) => setPocketPickChart(selected)}
                placeholder="Select a chart..."
                isClearable
                isDisabled={!pocketPickSong}
                menuPortalTarget={menuPortalTarget}
                menuPosition="fixed"
                styles={{
                  control: (styles) => ({
                    ...styles,
                    backgroundColor: "var(--card-bg-color)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-color)",
                    padding: "0.3rem",
                    borderRadius: "0.5rem",
                  }),
                  menu: (styles) => ({
                    ...styles,
                    backgroundColor: "var(--bg-color-light)",
                    zIndex: 1002,
                  }),
                  menuPortal: (styles) => ({ ...styles, zIndex: 2000 }),
                  option: (styles, { isFocused, isSelected }) => ({
                    ...styles,
                    backgroundColor: isSelected
                      ? "var(--card-hover-bg-color)"
                      : isFocused
                      ? "var(--card-bg-color)"
                      : null,
                    color: "var(--text-color)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }),
                  singleValue: (styles) => ({
                    ...styles,
                    color: "var(--text-color)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }),
                  input: (styles) => ({ ...styles, color: "var(--text-color)" }),
                }}
              />
            </div>
          </div>
        </ModalShell.Body>
      <ModalShell.Footer align="space-between">
        {isFreePickModal ? (
          <>
            <ModalShell.Button
              variant="secondary"
              onClick={() => {
                const confirmed = window.confirm("Remove this free pick slot?");
                if (!confirmed) return;
                removeFreePickSlot(pocketPickState?.entryId || null, pocketPickState?.card?.uniqueKey);
                setPocketPickState(null);
                setPocketPickSong(null);
                setPocketPickChart(null);
                setPocketPickInput("");
              }}
              aria-label="Remove free pick"
            >
              <FontAwesomeIcon icon={faTrash} />
            </ModalShell.Button>
            <div className="card-draw-modal-footer-actions">
              <ModalShell.Button
                variant="ghost"
                onClick={() => {
                  setPocketPickState(null);
                  setPocketPickSong(null);
                  setPocketPickChart(null);
                  setPocketPickInput("");
                }}
              >
                Cancel
              </ModalShell.Button>
              <ModalShell.Button
                variant="primary"
                onClick={handlePocketPickConfirm}
                disabled={!pocketPickSong || !pocketPickChart}
              >
                Apply free pick
              </ModalShell.Button>
            </div>
          </>
        ) : (
          <>
            <ModalShell.Button
              variant="ghost"
              onClick={() => {
                setPocketPickState(null);
                setPocketPickSong(null);
                setPocketPickChart(null);
                setPocketPickInput("");
              }}
            >
              Cancel
            </ModalShell.Button>
            <ModalShell.Button
              variant="primary"
              onClick={handlePocketPickConfirm}
              disabled={!pocketPickSong || !pocketPickChart}
            >
              Apply pocket pick
            </ModalShell.Button>
          </>
        )}
      </ModalShell.Footer>
      </ModalShell>

      <FilterModal
        isOpen={showFilter}
        onClose={() => setShowFilter(false)}
        games={games}
        showLists={false}
        getCounts={getFilterCounts}
        getMetricBounds={getMetricBounds}
      />
    </div>
  );
};

export default CardDrawPage;
