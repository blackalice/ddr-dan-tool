// Compute chart metrics and derived statistics from parsed chart data.
// Version: heuristic-v5

const QUANTIZATION_TYPES = [4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 192];
const QUANTIZATION_LABELS = QUANTIZATION_TYPES.reduce((acc, n) => {
 acc[n] = `${n}th Notes`;
 return acc;
}, {});

// =============================================================================
// Utility Functions
// =============================================================================

function safeNumber(value) {
 const n = Number(value);
 return Number.isFinite(n) ? n : 0;
}

function safeDivide(numerator, denominator) {
 const n = safeNumber(numerator);
 const d = safeNumber(denominator);
 return d > 0 ? n / d : 0;
}

function roundTo(value, decimals = 3) {
 if (!Number.isFinite(value)) return 0;
 const factor = 10 ** decimals;
 return Math.round(value * factor) / factor;
}

function sum(values) {
 if (!Array.isArray(values) || values.length === 0) return 0;
 return values.reduce((acc, n) => acc + safeNumber(n), 0);
}

function mean(values) {
 if (!Array.isArray(values) || values.length === 0) return 0;
 return sum(values) / values.length;
}

function median(values) {
 if (!Array.isArray(values) || values.length === 0) return 0;
 const sorted = [...values].map(safeNumber).sort((a, b) => a - b);
 const mid = Math.floor(sorted.length / 2);
 if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
 return sorted[mid];
}

function mode(values, decimals = 3) {
 if (!Array.isArray(values) || values.length === 0) return 0;
 const buckets = new Map();
 for (const value of values) {
   const rounded = roundTo(safeNumber(value), decimals);
   buckets.set(rounded, (buckets.get(rounded) || 0) + 1);
 }
 let bestValue = 0;
 let bestCount = -1;
 for (const [value, count] of buckets.entries()) {
   if (count > bestCount) {
     bestCount = count;
     bestValue = value;
   }
 }
 return bestValue;
}

function standardDeviation(values) {
 if (!Array.isArray(values) || values.length === 0) return 0;
 const avg = mean(values);
 const variance = mean(values.map((value) => {
   const delta = safeNumber(value) - avg;
   return delta * delta;
 }));
 return Math.sqrt(variance);
}

function buildSummaryStats(values, { modeDecimals = 3 } = {}) {
 const normalized = Array.isArray(values)
   ? values.map(safeNumber).filter((value) => Number.isFinite(value))
   : [];
 if (normalized.length === 0) {
   return {
     min: 0,
     max: 0,
     mean: 0,
     median: 0,
     mode: 0,
     standardDeviation: 0,
   };
 }
 return {
   min: Math.min(...normalized),
   max: Math.max(...normalized),
   mean: mean(normalized),
   median: median(normalized),
   mode: mode(normalized, modeDecimals),
   standardDeviation: standardDeviation(normalized),
 };
}

// =============================================================================
// Note Parsing Utilities
// =============================================================================

function countTapsInRow(dir) {
 let count = 0;
 for (let i = 0; i < dir.length; i += 1) {
   const c = dir[i];
   if (c === '1' || c === '2' || c === '4') count += 1;
 }
 return count;
}

function isShockRow(dir) {
 if (!dir || typeof dir !== 'string') return false;
 const trimmed = dir.trim();
 if (!trimmed) return false;
 for (let i = 0; i < trimmed.length; i += 1) {
   if (trimmed[i] !== 'M') return false;
 }
 return true;
}

function getTapLaneIndices(direction) {
 const indices = [];
 const dir = String(direction || '');
 for (let i = 0; i < dir.length; i += 1) {
   const c = dir[i];
   if (c === '1' || c === '2' || c === '4') indices.push(i);
 }
 return indices;
}

function getSingleTapLane(direction) {
 const lanes = getTapLaneIndices(direction);
 return lanes.length === 1 ? lanes[0] : -1;
}

// =============================================================================
// Quantization Analysis
// =============================================================================

function isAlmostInteger(value, epsilon = 1e-6) {
 return Math.abs(value - Math.round(value)) <= epsilon;
}

function classifyQuantization(offsetInMeasures) {
 const offset = safeNumber(offsetInMeasures);
 for (const n of QUANTIZATION_TYPES) {
   if (isAlmostInteger(offset * n)) {
     return n;
   }
 }
 return null;
}

function findMostFrequentQuantizations(counts) {
 const entries = Object.entries(counts || {}).filter(([, count]) => count > 0);
 if (entries.length === 0) return '';
 entries.sort((a, b) => b[1] - a[1]);
 return entries.slice(0, 2).map(([label]) => label).join(', ');
}

// =============================================================================
// Lane Analysis
// =============================================================================

function computeLaneCounts(rows) {
 let left = 0;
 let down = 0;
 let up = 0;
 let right = 0;

 for (const row of rows) {
   const dir = row?.direction || '';
   for (let idx = 0; idx < dir.length; idx += 1) {
     const c = dir[idx];
     if (c !== '1' && c !== '2' && c !== '4') continue;
     const lane = idx % 4;
     if (lane === 0) left += 1;
     if (lane === 1) down += 1;
     if (lane === 2) up += 1;
     if (lane === 3) right += 1;
   }
 }

 return { left, down, up, right };
}

/**
* Returns the panel type for a lane index (for 4-panel)
* 0=left, 1=down, 2=up, 3=right
*/
function laneType(lane) {
 const idx = ((lane % 4) + 4) % 4;
 if (idx === 0) return 'left';
 if (idx === 1) return 'down';
 if (idx === 2) return 'up';
 return 'right';
}

/**
* Returns which side of the pad a lane belongs to
* For 4-panel: lanes 0,1 (L,D) = 'L' side, lanes 2,3 (U,R) = 'R' side
*/
function laneSide(lane, laneCount) {
 if (laneCount === 4) {
   return lane <= 1 ? 'L' : 'R';
 }
 return lane < laneCount / 2 ? 'L' : 'R';
}

/**
* Returns true if the foot is on its natural side
*/
function isNaturalSide(foot, lane, laneCount) {
 return laneSide(lane, laneCount) === foot;
}

// =============================================================================
// Timing Calculations
// =============================================================================

function timeAtOffset(bpmRanges, stops, targetOffset) {
 if (!Array.isArray(bpmRanges) || bpmRanges.length === 0) return 0;
 const sorted = [...bpmRanges].sort((a, b) => safeNumber(a.startOffset) - safeNumber(b.startOffset));
 const stopList = Array.isArray(stops) ? stops : [];
 const target = safeNumber(targetOffset);

 let time = 0;
 let pos = safeNumber(sorted[0]?.startOffset);

 for (let i = 0; i < sorted.length; i += 1) {
   const seg = sorted[i] || {};
   const segStart = safeNumber(seg.startOffset);
   const segEndRaw = seg.endOffset == null ? target : safeNumber(seg.endOffset);
   const start = Math.max(pos, segStart);
   const end = Math.min(target, segEndRaw);

   if (end > start && safeNumber(seg.bpm) > 0) {
     const beats = (end - start) * 4;
     time += (beats / safeNumber(seg.bpm)) * 60;

     for (const stop of stopList) {
       const offset = safeNumber(stop?.offset);
       if (offset >= start && offset < end) time += safeNumber(stop?.duration);
     }
   }

   pos = end;
   if (pos >= target) break;
 }

 return time;
}

function songLengthSeconds(bpmRanges, stops, lastBeat) {
 if (!Array.isArray(bpmRanges) || bpmRanges.length === 0) return 0;
 const endOffset = safeNumber(lastBeat) / 4;
 return timeAtOffset(bpmRanges, stops, endOffset);
}

function eventTimes(arrows, bpmRanges, stops) {
 const times = [];
 if (!Array.isArray(arrows)) return times;
 for (const arrow of arrows) {
   times.push(timeAtOffset(bpmRanges, stops, safeNumber(arrow?.offset)));
 }
 return times;
}

function computeLastBeat(chart) {
 if (!chart) return 0;
 const lastArrowOffset = chart.arrows?.length > 0
   ? safeNumber(chart.arrows[chart.arrows.length - 1].offset) + 0.25
   : 0;
 const lastFreezeOffset = chart.freezes?.length > 0
   ? safeNumber(chart.freezes[chart.freezes.length - 1].endOffset)
   : 0;
 return Math.max(lastArrowOffset, lastFreezeOffset) * 4;
}

// =============================================================================
// Hold Range Management
// =============================================================================

function buildHoldRanges(freezes, bpmRanges, stops) {
 if (!Array.isArray(freezes)) return [];

 return freezes.map((freeze) => {
   const startOffset = safeNumber(freeze?.startOffset);
   const endOffset = safeNumber(freeze?.endOffset);
   // Handle different property names for lane
   const lane = safeNumber(freeze?.lane ?? freeze?.column ?? freeze?.startLane ?? -1);

   return {
     lane,
     startOffset,
     endOffset,
     startTime: timeAtOffset(bpmRanges, stops, startOffset),
     endTime: timeAtOffset(bpmRanges, stops, endOffset),
   };
 }).filter(h => h.lane >= 0);
}

// =============================================================================
// Crossover Detection
// =============================================================================

/**
* Determines if the current foot positions constitute a crossed state.
* Crossed means left foot is on a lane to the right of right foot.
*/
function getCrossedState(leftFootLane, rightFootLane, laneCount) {
 if (leftFootLane === null || rightFootLane === null) {
   return { crossed: false, type: null, depth: 0 };
 }

 if (leftFootLane > rightFootLane) {
   const depth = leftFootLane - rightFootLane;

   if (laneCount === 4) {
     return {
       crossed: true,
       type: depth >= 2 ? 'full' : 'half',
       depth,
     };
   }

   const normalizedDepth = depth / Math.max(1, laneCount / 2);
   return {
     crossed: true,
     type: normalizedDepth >= 0.5 ? 'full' : 'half',
     depth,
   };
 }

 return { crossed: false, type: null, depth: 0 };
}

/**
* Detect crossovers that occur while the other foot is holding a note.
* Counts only transitions entering crossed state while other foot holds.
*/
function detectCrossoversWithHoldsFixed(singleStepRows, assignments, holdRanges, laneCount) {
 let holdCrossovers = 0;
 let halfHoldCrossovers = 0;
 let fullHoldCrossovers = 0;

 if (!Array.isArray(holdRanges) || holdRanges.length === 0) {
   return { holdCrossovers, halfHoldCrossovers, fullHoldCrossovers };
 }

 // Build hold ownership map based on which foot naturally hits each hold
 const holdOwnership = new Map();
 holdRanges.forEach((hold, idx) => {
   holdOwnership.set(idx, laneSide(hold.lane, laneCount));
 });

 let leftFootLane = null;
 let rightFootLane = null;
 let wasCrossedDuringHold = false;

 for (let i = 0; i < singleStepRows.length; i++) {
   const row = singleStepRows[i];
   const foot = assignments[i];
   const time = row.time;
   const lane = row.lane;

   if (foot === 'L') {
     leftFootLane = lane;
   } else if (foot === 'R') {
     rightFootLane = lane;
   }

   // Check if the other foot is currently holding
   let otherFootHolding = false;
   const otherFoot = foot === 'L' ? 'R' : 'L';

   for (let j = 0; j < holdRanges.length; j++) {
     const hold = holdRanges[j];
     if (time > hold.startTime && time < hold.endTime) {
       if (holdOwnership.get(j) === otherFoot) {
         otherFootHolding = true;
         break;
       }
     }
   }

   if (!otherFootHolding) {
     wasCrossedDuringHold = false;
     continue;
   }

   const crossState = getCrossedState(leftFootLane, rightFootLane, laneCount);
   if (crossState.crossed && !wasCrossedDuringHold) {
     holdCrossovers++;
     if (crossState.type === 'full') fullHoldCrossovers++;
     else if (crossState.type === 'half') halfHoldCrossovers++;
   }
   wasCrossedDuringHold = crossState.crossed;
 }

 return { holdCrossovers, halfHoldCrossovers, fullHoldCrossovers };
}

// =============================================================================
// Foot Assignment - Cost Functions
// =============================================================================

/**
* Penalty for placing a foot on a lane (higher = less natural)
*/
function laneFootPenalty(foot, lane, laneCount) {
 if (laneCount === 4) {
   // Natural positions have zero penalty
   if (foot === 'L' && (lane === 0 || lane === 1)) return 0;
   if (foot === 'R' && (lane === 2 || lane === 3)) return 0;

   // Half crossover penalty
   if (foot === 'L' && lane === 2) return 0.4;
   if (foot === 'R' && lane === 1) return 0.4;

   // Full crossover penalty
   if (foot === 'L' && lane === 3) return 0.8;
   if (foot === 'R' && lane === 0) return 0.8;

   return 0.5;
 }

 // Generic calculation for other lane counts
 const mid = laneCount / 2;
 if ((foot === 'L' && lane < mid) || (foot === 'R' && lane >= mid)) return 0;

 let depth;
 if (foot === 'L') {
   depth = lane - mid + 1;
 } else {
   depth = mid - lane;
 }

 const normalizedDepth = safeDivide(depth, Math.max(1, laneCount / 2));
 return 0.35 + (normalizedDepth * 0.45);
}

/**
* Penalty for transitioning between two consecutive steps
* Speed-aware: faster patterns penalize awkward movements more
*/
function transitionPenalty(prevFoot, nextFoot, prevLane, nextLane, laneCount, timeDelta) {
 const prevSide = laneSide(prevLane, laneCount);
 const nextSide = laneSide(nextLane, laneCount);

 // Speed factor: faster patterns should more strongly prefer natural movement
 let speedMult = 1.0;
 if (timeDelta !== undefined && timeDelta !== null) {
   if (timeDelta < 0.08) speedMult = 2.0;       // Very fast (16ths at 180+ BPM)
   else if (timeDelta < 0.125) speedMult = 1.5; // Fast (16ths at 120 BPM)
   else if (timeDelta < 0.2) speedMult = 1.2;   // Medium
 }

 if (prevFoot === nextFoot) {
   // Same foot consecutive
   if (prevLane === nextLane) {
     return 0.05 * speedMult; // Jack - same foot same panel
   }

   // Doublestep - same foot different panel
   const crossesSides = prevSide !== nextSide;
   if (crossesSides) {
     return 1.5 * speedMult; // Cross-side doublestep (very awkward)
   }
   return 0.7 * speedMult; // Same-side doublestep
 }

 // Different feet
 if (prevLane === nextLane) {
   return 0.9 * speedMult; // Footswitch
 }

 // Natural alternation checks
 if (!isNaturalSide(nextFoot, nextLane, laneCount)) {
   return 0.3 * speedMult; // Crossing to unnatural side
 }

 // Large distance penalty
 const distance = Math.abs(nextLane - prevLane);
 if (distance >= laneCount - 1) {
   return 0.15 * speedMult;
 }

 return 0; // Natural alternation
}

// =============================================================================
// Foot Assignment - Dynamic Programming Solver
// =============================================================================

function solveFootAssignments(singleStepRows, laneCount, holdRanges = []) {
 if (!Array.isArray(singleStepRows) || singleStepRows.length === 0) return [];

 const feet = ['L', 'R'];
 const n = singleStepRows.length;
 const INF = Number.POSITIVE_INFINITY;

 const dp = Array.from({ length: n }, () => ({ L: INF, R: INF }));
 const back = Array.from({ length: n }, () => ({ L: null, R: null }));

 // Build hold ownership map - which foot owns each hold
 const holdOwnership = new Map();
 holdRanges.forEach((hold, idx) => {
   // Default: assign based on natural side
   holdOwnership.set(idx, laneSide(hold.lane, laneCount));
 });

 // Helper: get which foot is locked at a given time
 function getLockedFoot(time) {
   for (let i = 0; i < holdRanges.length; i++) {
     const hold = holdRanges[i];
     if (time > hold.startTime && time < hold.endTime) {
       return holdOwnership.get(i);
     }
   }
   return null;
 }

 // Helper: get the lane a foot is locked to
 function getLockedLane(foot, time) {
   for (let i = 0; i < holdRanges.length; i++) {
     const hold = holdRanges[i];
     if (time > hold.startTime && time < hold.endTime) {
       if (holdOwnership.get(i) === foot) {
         return hold.lane;
       }
     }
   }
   return null;
 }

 // Initialize first step
 const firstLane = safeNumber(singleStepRows[0]?.lane);
 const firstTime = safeNumber(singleStepRows[0]?.time);
 const firstLocked = getLockedFoot(firstTime);
 const firstPreferred = laneSide(firstLane, laneCount);

 for (const foot of feet) {
   // Check hold constraints
   if (firstLocked !== null && foot === firstLocked) {
     const lockedLane = getLockedLane(foot, firstTime);
     if (lockedLane !== null && lockedLane !== firstLane) {
       dp[0][foot] = INF;
       continue;
     }
   }

   const baseCost = laneFootPenalty(foot, firstLane, laneCount);
   const prefBonus = foot === firstPreferred ? 0 : 0.2;
   dp[0][foot] = baseCost + prefBonus;
 }

 // Fill DP table
 for (let i = 1; i < n; i++) {
   const prevRow = singleStepRows[i - 1];
   const currRow = singleStepRows[i];
   const prevLane = safeNumber(prevRow?.lane);
   const currLane = safeNumber(currRow?.lane);
   const currTime = safeNumber(currRow?.time);
   const prevTime = safeNumber(prevRow?.time);
   const timeDelta = currTime - prevTime;

   const lockedFoot = getLockedFoot(currTime);
   const lockedLane = lockedFoot ? getLockedLane(lockedFoot, currTime) : null;

   for (const foot of feet) {
     // If this foot is locked to a different lane, it can't step here
     if (foot === lockedFoot && lockedLane !== null && lockedLane !== currLane) {
       continue;
     }

     // If the other foot is locked, only this foot can step
     const otherFoot = foot === 'L' ? 'R' : 'L';
     if (lockedFoot === otherFoot) {
       // Only this foot can take this step - evaluate it
     }

     for (const prevFoot of feet) {
       const prevCost = dp[i - 1][prevFoot];
       if (prevCost === INF) continue;

       const transCost = transitionPenalty(prevFoot, foot, prevLane, currLane, laneCount, timeDelta);
       const laneCost = laneFootPenalty(foot, currLane, laneCount);
       const totalCost = prevCost + transCost + laneCost;

       if (totalCost < dp[i][foot]) {
         dp[i][foot] = totalCost;
         back[i][foot] = prevFoot;
       }
     }
   }

   // If both options are INF, something went wrong - allow any assignment
   if (dp[i].L === INF && dp[i].R === INF) {
     const preferred = laneSide(currLane, laneCount);
     dp[i][preferred] = dp[i - 1].L < dp[i - 1].R ? dp[i - 1].L : dp[i - 1].R;
     back[i][preferred] = dp[i - 1].L <= dp[i - 1].R ? 'L' : 'R';
   }
 }

 // Backtrack to find optimal assignment
 let current = dp[n - 1].L <= dp[n - 1].R ? 'L' : 'R';
 if (dp[n - 1][current] === INF) {
   current = current === 'L' ? 'R' : 'L';
 }

 const assignment = new Array(n);
 for (let i = n - 1; i >= 0; i--) {
   assignment[i] = current;
   const prev = back[i][current];
   current = prev || laneSide(singleStepRows[Math.max(0, i - 1)]?.lane || 0, laneCount);
 }

 return assignment;
}

// =============================================================================
// Bracket Detection
// =============================================================================

/**
* Checks if two lanes can be hit as a bracket (one foot hitting two panels)
*/
function isBracketPair(a, b, laneCount) {
 if (a === b) return false;

 // For doubles/8-panel, brackets must be on the same pad
 if (laneCount >= 8 && Math.floor(a / 4) !== Math.floor(b / 4)) return false;

 // Adjacent panels that can be hit with one foot
 const la = ((a % 4) + 4) % 4;
 const lb = ((b % 4) + 4) % 4;
 const low = Math.min(la, lb);
 const high = Math.max(la, lb);

 // Valid bracket pairs: L+D, D+U, U+R
 return (
   (low === 0 && high === 1) ||  // Left + Down
   (low === 1 && high === 2) ||  // Down + Up
   (low === 2 && high === 3)     // Up + Right
 );
}

/**
* Count brackets in the chart
*/
function countBrackets(rows, laneCount) {
 let brackets = 0;
 let forcedBrackets = 0;

 for (const row of rows) {
   if (row?.shock) continue;
   const taps = safeNumber(row?.taps);
   if (taps < 2) continue;

   const lanes = getTapLaneIndices(row?.direction || '');
   if (lanes.length < 2) continue;

   // Check all pairs for bracket patterns
   let hasBracket = false;
   for (let i = 0; i < lanes.length && !hasBracket; i++) {
     for (let j = i + 1; j < lanes.length; j++) {
       if (isBracketPair(lanes[i], lanes[j], laneCount)) {
         hasBracket = true;
         break;
       }
     }
   }

   if (hasBracket) {
     brackets++;
   }

   // Hands (3+ notes) require at least one bracket
   if (lanes.length >= 3) {
     forcedBrackets++;
   }
 }

 return { brackets, forcedBrackets };
}

// =============================================================================
// Sideswitch Detection
// =============================================================================

/**
* Detect sideswitches - jumps where feet must swap sides
*/
function detectSideswitches(eventRows, singleStepRows, assignments, laneCount) {
 let sideswitches = 0;

 // Build lookup for single step assignments
 const footAssignmentMap = new Map();
 for (let i = 0; i < singleStepRows.length; i++) {
   const key = `${singleStepRows[i].time.toFixed(6)}-${singleStepRows[i].lane}`;
   footAssignmentMap.set(key, assignments[i]);
 }

 // Track current foot positions
 let leftFootSide = 'L';  // Which side of pad left foot is on
 let rightFootSide = 'R';

 for (const row of eventRows) {
   if (row.shock) continue;

   const lanes = getTapLaneIndices(row.direction);

   if (lanes.length === 1) {
     // Single step - update foot position
     const lane = lanes[0];
     const key = `${row.time.toFixed(6)}-${lane}`;
     const foot = footAssignmentMap.get(key);

     if (foot === 'L') {
       leftFootSide = laneSide(lane, laneCount);
     } else if (foot === 'R') {
       rightFootSide = laneSide(lane, laneCount);
     }
   } else if (lanes.length === 2) {
     // Jump - check for sideswitch
     const sorted = [...lanes].sort((a, b) => a - b);
     const [lowLane, highLane] = sorted;

     // Standard jump assignment: left foot on lower lane, right foot on upper
     const newLeftSide = laneSide(lowLane, laneCount);
     const newRightSide = laneSide(highLane, laneCount);

     // Check if this jump requires a sideswitch
     // Sideswitch: both feet change sides
     const leftChanges = leftFootSide !== newLeftSide;
     const rightChanges = rightFootSide !== newRightSide;

     if (leftChanges && rightChanges) {
       sideswitches++;
     }

     // Update positions
     leftFootSide = newLeftSide;
     rightFootSide = newRightSide;
   }
 }

 return sideswitches;
}

// =============================================================================
// Anchor Detection
// =============================================================================

/**
* Detect anchor patterns where one foot stays planted while the other moves
*/
function detectAnchors(singleStepRows, assignments) {
 let anchors = 0;
 const anchorSequences = [];

 if (singleStepRows.length < 3) {
   return { anchors, anchorSequences };
 }

 let currentAnchor = null;

 for (let i = 1; i < singleStepRows.length; i++) {
   const foot = assignments[i];
   const lane = singleStepRows[i].lane;
   const prevFoot = assignments[i - 1];
   const prevLane = singleStepRows[i - 1].lane;

   if (prevFoot !== foot) {
     // Alternating feet - potential anchor
     if (currentAnchor === null) {
       // Start new potential anchor
       currentAnchor = {
         foot: prevFoot,
         lane: prevLane,
         startIdx: i - 1,
         length: 2
       };
     } else if (currentAnchor.foot === prevFoot && currentAnchor.lane === prevLane) {
       // Previous foot returned to anchor position
       currentAnchor.length++;
     } else if (currentAnchor.foot === foot && currentAnchor.lane === lane) {
       // Current foot is the anchor
       currentAnchor.length++;
     } else {
       // Anchor broken - save if long enough
       if (currentAnchor.length >= 4) {
         anchorSequences.push({ ...currentAnchor });
         anchors += currentAnchor.length - 2;
       }
       // Start new anchor
       currentAnchor = {
         foot: prevFoot,
         lane: prevLane,
         startIdx: i - 1,
         length: 2
       };
     }
   } else {
     // Same foot - anchor broken
     if (currentAnchor && currentAnchor.length >= 4) {
       anchorSequences.push({ ...currentAnchor });
       anchors += currentAnchor.length - 2;
     }
     currentAnchor = null;
   }
 }

 // Check final anchor
 if (currentAnchor && currentAnchor.length >= 4) {
   anchorSequences.push({ ...currentAnchor });
   anchors += currentAnchor.length - 2;
 }

 return { anchors, anchorSequences };
}

// =============================================================================
// Spin Detection
// =============================================================================

/**
* Detects spin patterns (180° and 360°)
*/
function detectSpins(eventRows, laneCount) {
 if (laneCount !== 4) return { spins180: 0, spins360: 0, spinDetails: [] };

 let spins180 = 0;
 let spins360 = 0;
 const spinDetails = [];

 // 180° patterns (partial rotation)
 // These patterns require the player to face away from the screen momentarily
 const patterns180 = [
   [0, 2, 3], // L → U → R
   [3, 2, 0], // R → U → L
   [0, 1, 3], // L → D → R
   [3, 1, 0], // R → D → L
 ];

 // 360° patterns (full rotation)
 const patterns360 = [
   [0, 1, 3, 2], // L → D → R → U (clockwise from front)
   [0, 2, 3, 1], // L → U → R → D (counter-clockwise from front)
   [3, 1, 0, 2], // R → D → L → U
   [3, 2, 0, 1], // R → U → L → D
 ];

 // Get lane sequence (single steps only)
 const laneSeq = eventRows
   .filter(r => !r.shock && r.taps === 1)
   .map(r => ({ lane: getSingleTapLane(r.direction), time: r.time }))
   .filter(r => r.lane >= 0);

 const lanes = laneSeq.map(r => r.lane);

 // Track which indices we've already counted as part of a spin
 const usedIndices = new Set();

 // Check for 360° spins first (longer patterns)
 for (let i = 0; i <= lanes.length - 4; i++) {
   if (usedIndices.has(i)) continue;

   const window = lanes.slice(i, i + 4);

   for (const pattern of patterns360) {
     if (window.every((lane, idx) => lane === pattern[idx])) {
       spins360++;
       spinDetails.push({
         type: '360',
         startIdx: i,
         startTime: laneSeq[i].time,
         pattern: window
       });

       // Mark indices as used
       for (let j = i; j < i + 4; j++) usedIndices.add(j);
       break;
     }
   }
 }

 // Check for 180° spins
 for (let i = 0; i <= lanes.length - 3; i++) {
   if (usedIndices.has(i) || usedIndices.has(i + 1) || usedIndices.has(i + 2)) continue;

   const window = lanes.slice(i, i + 3);

   for (const pattern of patterns180) {
     if (window.every((lane, idx) => lane === pattern[idx])) {
       spins180++;
       spinDetails.push({
         type: '180',
         startIdx: i,
         startTime: laneSeq[i].time,
         pattern: window
       });

       for (let j = i; j < i + 3; j++) usedIndices.add(j);
       break;
     }
   }
 }

 return { spins180, spins360, spinDetails };
}

// =============================================================================
// Staircase / Roll Detection
// =============================================================================

/**
* Detects staircase (L-D-U-R or R-U-D-L) and roll patterns
*/
function detectStaircases(eventRows, laneCount) {
 if (laneCount !== 4) return { staircases: 0, rolls: 0, staircaseDetails: [] };

 let staircases = 0;
 let rolls = 0;
 const staircaseDetails = [];

 const ascending = [0, 1, 2, 3];  // L-D-U-R
 const descending = [3, 2, 1, 0]; // R-U-D-L

 // Get lane sequence
 const laneSeq = eventRows
   .filter(r => !r.shock && r.taps === 1)
   .map(r => ({ lane: getSingleTapLane(r.direction), time: r.time }))
   .filter(r => r.lane >= 0);

 const lanes = laneSeq.map(r => r.lane);

 let consecutiveStairs = 0;
 let lastStairEnd = -1;

 for (let i = 0; i <= lanes.length - 4; i++) {
   const window = lanes.slice(i, i + 4);

   const isAscending = window.every((lane, idx) => lane === ascending[idx]);
   const isDescending = window.every((lane, idx) => lane === descending[idx]);

   if (isAscending || isDescending) {
     staircases++;
     staircaseDetails.push({
       type: isAscending ? 'ascending' : 'descending',
       startIdx: i,
       startTime: laneSeq[i].time
     });

     // Check for consecutive staircases (rolls)
     if (lastStairEnd === i) {
       consecutiveStairs++;
       if (consecutiveStairs >= 1) {
         rolls++;
       }
     } else {
       consecutiveStairs = 0;
     }

     lastStairEnd = i + 4;
     i += 3; // Skip to end of this staircase
   }
 }

 return { staircases, rolls, staircaseDetails };
}

// =============================================================================
// Candle Detection
// =============================================================================

/**
* Detects candle patterns (D-U-D or U-D-U)
*/
function detectCandles(singleStepRows, assignments, laneCount) {
 if (laneCount !== 4) return { candles: 0, candleDetails: [] };

 let candles = 0;
 const candleDetails = [];

 for (let i = 0; i < singleStepRows.length - 2; i++) {
   const l0 = singleStepRows[i].lane;
   const l1 = singleStepRows[i + 1].lane;
   const l2 = singleStepRows[i + 2].lane;

   // Check for U-D-U (2-1-2) or D-U-D (1-2-1)
   const isCandle = (l0 === 2 && l1 === 1 && l2 === 2) ||
                    (l0 === 1 && l1 === 2 && l2 === 1);

   if (isCandle) {
     // Must be with alternating feet to be truly awkward
     const f0 = assignments[i];
     const f1 = assignments[i + 1];
     const f2 = assignments[i + 2];

     if (f0 !== f1 && f1 !== f2) {
       candles++;
       candleDetails.push({
         type: l0 === 2 ? 'UDU' : 'DUD',
         startIdx: i,
         startTime: singleStepRows[i].time
       });
     }
   }
 }

 return { candles, candleDetails };
}

// =============================================================================
// Drill Detection
// =============================================================================

/**
* Detects drill patterns (repeated same-lane notes)
*/
function detectDrills(singleStepRows, laneCount, minLength = 4) {
 let drills = 0;
 let drillNotes = 0;
 const drillDetails = [];

 let currentDrillLane = -1;
 let currentDrillStart = 0;
 let currentDrillLength = 0;

 for (let i = 0; i < singleStepRows.length; i++) {
   const lane = singleStepRows[i].lane;

   if (lane === currentDrillLane) {
     currentDrillLength++;
   } else {
     // End current drill if long enough
     if (currentDrillLength >= minLength) {
       drills++;
       drillNotes += currentDrillLength;
       drillDetails.push({
         lane: currentDrillLane,
         laneType: laneType(currentDrillLane),
         startIdx: currentDrillStart,
         length: currentDrillLength,
         startTime: singleStepRows[currentDrillStart].time
       });
     }

     // Start new potential drill
     currentDrillLane = lane;
     currentDrillStart = i;
     currentDrillLength = 1;
   }
 }

 // Check final sequence
 if (currentDrillLength >= minLength) {
   drills++;
   drillNotes += currentDrillLength;
   drillDetails.push({
     lane: currentDrillLane,
     laneType: laneType(currentDrillLane),
     startIdx: currentDrillStart,
     length: currentDrillLength,
     startTime: singleStepRows[currentDrillStart].time
   });
 }

 return { drills, drillNotes, drillDetails };
}

// =============================================================================
// Gallop Detection
// =============================================================================

/**
* Detects gallop patterns (short-long or long-short timing)
*/
function detectGallops(eventRows, tolerance = 0.15) {
 let gallops = 0;
 const gallopDetails = [];

 const times = eventRows
   .filter(r => !r.shock && r.taps >= 1)
   .map(r => r.time);

 if (times.length < 3) return { gallops, gallopDetails };

 for (let i = 0; i < times.length - 2; i++) {
   const gap1 = times[i + 1] - times[i];
   const gap2 = times[i + 2] - times[i + 1];

   if (gap1 <= 0 || gap2 <= 0) continue;

   const ratio = gap1 / gap2;

   // Check for ~1:2 ratio (short-long) or ~2:1 ratio (long-short)
   const isShortLong = ratio >= (0.5 - tolerance) && ratio <= (0.5 + tolerance);
   const isLongShort = ratio >= (2.0 - tolerance * 2) && ratio <= (2.0 + tolerance * 2);

   if (isShortLong || isLongShort) {
     gallops++;
     gallopDetails.push({
       type: isShortLong ? 'short-long' : 'long-short',
       startTime: times[i],
       ratio: roundTo(ratio, 3)
     });
   }
 }

 return { gallops, gallopDetails };
}

// =============================================================================
// Mono-direction Run Detection
// =============================================================================

/**
* Detects runs that stay on one side of the pad
*/
function detectMonoRuns(singleStepRows, assignments, laneCount, minLength = 6) {
 let monoLeftRuns = 0;
 let monoRightRuns = 0;
 const monoRunDetails = [];

 let currentSide = null;
 let currentRunStart = 0;
 let currentRunLength = 0;

 for (let i = 0; i < singleStepRows.length; i++) {
   const side = laneSide(singleStepRows[i].lane, laneCount);

   if (side === currentSide) {
     currentRunLength++;
   } else {
     // End current run if long enough
     if (currentRunLength >= minLength) {
       if (currentSide === 'L') monoLeftRuns++;
       else monoRightRuns++;

       monoRunDetails.push({
         side: currentSide,
         startIdx: currentRunStart,
         length: currentRunLength,
         startTime: singleStepRows[currentRunStart].time
       });
     }

     currentSide = side;
     currentRunStart = i;
     currentRunLength = 1;
   }
 }

 // Check final run
 if (currentRunLength >= minLength) {
   if (currentSide === 'L') monoLeftRuns++;
   else monoRightRuns++;

   monoRunDetails.push({
     side: currentSide,
     startIdx: currentRunStart,
     length: currentRunLength,
     startTime: singleStepRows[currentRunStart].time
   });
 }

 return {
   monoLeftRuns,
   monoRightRuns,
   monoRuns: monoLeftRuns + monoRightRuns,
   monoRunDetails
 };
}

// =============================================================================
// Stream Detection
// =============================================================================

/**
* Split raw notes text into measures.
*/
function splitNotesIntoMeasures(notesText, laneCount) {
 if (typeof notesText !== 'string' || notesText.trim().length === 0) return [];

 const lines = notesText.replace(/\r\n?/g, '\n').split('\n');
 const measures = [];
 let currentMeasure = [];

 for (const rawLine of lines) {
   const line = rawLine.replace(/\/\/.*$/, '').trim();
   if (!line) continue;
   if (line.startsWith(';') || line.startsWith(',;')) break;
   if (line.startsWith(',')) {
     measures.push(currentMeasure);
     currentMeasure = [];
     continue;
   }
   const normalized = line.replace(/\s+/g, '');
   if (!normalized || normalized.startsWith('#') || normalized.includes(':')) continue;
   currentMeasure.push(normalized.slice(0, laneCount));
 }

 measures.push(currentMeasure);

 while (measures.length > 0 && measures[measures.length - 1].length === 0) {
   measures.pop();
 }

 return measures;
}

function isZeroRow(row) {
 const str = String(row || '');
 if (!str) return true;
 for (let i = 0; i < str.length; i += 1) {
   if (str[i] !== '0') return false;
 }
 return true;
}

/**
* Port of SL-ChartParser MinimizeMeasure.
*/
function minimizeMeasureRows(rows) {
 let measure = Array.isArray(rows) ? [...rows] : [];
 let minimal = false;

 while (!minimal && measure.length > 0 && measure.length % 2 === 0) {
   let allZeroes = true;
   for (let i = 1; i < measure.length; i += 2) {
     if (!isZeroRow(measure[i])) {
       allZeroes = false;
       break;
     }
   }

   if (allZeroes) {
     const next = [];
     for (let i = 0; i < measure.length; i += 2) {
       next.push(measure[i]);
     }
     measure = next;
   } else {
     minimal = true;
   }
 }

 return measure;
}

/**
* Port of SL-ChartParser GetMeasureInfo (stream-focused fields).
*/
function buildMeasureInfoFromChartNotes(chartNotes, laneCount, bpms, stops) {
 const measures = splitNotesIntoMeasures(chartNotes, laneCount);
 const notesPerMeasure = [];
 const equallySpacedPerMeasure = [];
 const npsPerMeasure = [];
 let peakNPS = 0;

 for (let i = 0; i < measures.length; i += 1) {
   const minimized = minimizeMeasureRows(measures[i]);
   let notesInMeasure = 0;
   for (const row of minimized) {
     if (/[124]/.test(String(row || ''))) notesInMeasure += 1;
   }
   const rowsInMeasure = minimized.length;
   notesPerMeasure.push(notesInMeasure);
   equallySpacedPerMeasure.push(notesInMeasure === rowsInMeasure);

   const duration = timeAtOffset(bpms, stops, i + 1) - timeAtOffset(bpms, stops, i);
   const nps = duration <= 0.12 ? 0 : safeDivide(notesInMeasure, duration);
   npsPerMeasure.push(nps);
   if (nps > peakNPS) peakNPS = nps;
 }

 return {
   notesPerMeasure,
   equallySpacedPerMeasure,
   npsPerMeasure,
   peakNPS,
 };
}

/**
* Port of SL-ChartParserHelpers GetStreamSequences.
*/
function getStreamSequences(notesPerMeasure, notesThreshold = 16) {
 const streamMeasures = [];
 for (let i = 0; i < notesPerMeasure.length; i += 1) {
   if (safeNumber(notesPerMeasure[i]) >= notesThreshold) {
     streamMeasures.push(i + 1); // Lua-style 1-indexed measure ids
   }
 }

 const streamSequences = [];
 const streamSequenceThreshold = 1;
 const breakSequenceThreshold = 2;
 let counter = 1;
 let streamEnd = null;

 if (streamMeasures.length > 0) {
   const breakStart = 0;
   const breakEnd = streamMeasures[0] - 1;
   if (breakEnd - breakStart >= breakSequenceThreshold) {
     streamSequences.push({ streamStart: breakStart, streamEnd: breakEnd, isBreak: true });
   }
 }

 for (let k = 0; k < streamMeasures.length; k += 1) {
   const curVal = streamMeasures[k];
   const nextVal = streamMeasures[k + 1] ?? -1;

   if (curVal + 1 === nextVal) {
     counter += 1;
     streamEnd = curVal + 1;
     continue;
   }

   if (counter >= streamSequenceThreshold) {
     if (streamEnd === null) streamEnd = curVal;
     const streamStart = streamEnd - counter;
     streamSequences.push({ streamStart, streamEnd, isBreak: false });
   }

   const breakStart = curVal;
   const breakEnd = nextVal !== -1 ? nextVal - 1 : notesPerMeasure.length;
   if (breakEnd - breakStart >= breakSequenceThreshold) {
     streamSequences.push({ streamStart: breakStart, streamEnd: breakEnd, isBreak: true });
   }

   counter = 1;
   streamEnd = null;
 }

 return streamSequences;
}

/**
* Detects streams and bursts using Lua-style measure processing when notes text exists.
*/
function detectStreams(eventRows, bpm, measureInfo = null, minStreamLength = 16) {
 if (measureInfo && Array.isArray(measureInfo.notesPerMeasure) && measureInfo.notesPerMeasure.length > 0) {
   const notesPerMeasure = measureInfo.notesPerMeasure;
   const sequences = getStreamSequences(notesPerMeasure, minStreamLength);
   const streams = [];
   let streamNotes = 0;
   let streamMeasures = 0;
   let breakMeasures = 0;
   let breakSegments = 0;

   for (const sequence of sequences) {
     const length = Math.max(0, sequence.streamEnd - sequence.streamStart);
     if (length === 0) continue;

     if (sequence.isBreak) {
       breakSegments += 1;
       breakMeasures += length;
       continue;
     }

     const startMeasure = Math.max(0, sequence.streamStart);
     const endMeasure = Math.min(notesPerMeasure.length, sequence.streamEnd);
     let notesInSegment = 0;
     for (let i = startMeasure; i < endMeasure; i += 1) {
       notesInSegment += safeNumber(notesPerMeasure[i]);
     }
     streamNotes += notesInSegment;
     streamMeasures += (endMeasure - startMeasure);

     streams.push({
       startMeasure,
       endMeasure,
       length: endMeasure - startMeasure,
       notes: notesInSegment,
     });
   }

   // Short dense sections below stream threshold.
   let bursts = 0;
   let inBurst = false;
   for (let i = 0; i < notesPerMeasure.length; i += 1) {
     const n = safeNumber(notesPerMeasure[i]);
     const burstMeasure = n >= 8 && n < minStreamLength;
     if (burstMeasure && !inBurst) {
       bursts += 1;
       inBurst = true;
     } else if (!burstMeasure) {
       inBurst = false;
     }
   }

   return {
     streams,
     streamNotes,
     bursts,
     streamMeasures,
     breakMeasures,
     streamSegments: streams.length,
     breakSegments,
     streamDetectionMethod: 'lua-measure-v1',
   };
 }

 const streams = [];
 let bursts = 0;
 if (!eventRows.length) {
   return {
     streams,
     streamNotes: 0,
     bursts,
     streamMeasures: 0,
     breakMeasures: 0,
     streamSegments: 0,
     breakSegments: 0,
     streamDetectionMethod: 'time-gap-fallback',
   };
 }

 const avgBpm = Array.isArray(bpm) && bpm.length > 0
   ? mean(bpm.map((b) => safeNumber(b?.bpm)).filter((b) => b > 0))
   : 150;
 const sixteenthGap = 60 / avgBpm / 4;
 const tolerance = sixteenthGap * 0.5;
 const times = eventRows.filter((r) => !r.shock && r.taps >= 1).map((r) => r.time);
 if (times.length < 2) {
   return {
     streams,
     streamNotes: 0,
     bursts,
     streamMeasures: 0,
     breakMeasures: 0,
     streamSegments: 0,
     breakSegments: 0,
     streamDetectionMethod: 'time-gap-fallback',
   };
 }

 let streamStart = 0;
 let streamLength = 1;
 for (let i = 1; i < times.length; i += 1) {
   const gap = times[i] - times[i - 1];
   if (gap <= sixteenthGap + tolerance && gap >= sixteenthGap * 0.4) {
     streamLength += 1;
     continue;
   }

   if (streamLength >= minStreamLength) {
     streams.push({
       startIdx: streamStart,
       length: streamLength,
       startTime: times[streamStart],
       endTime: times[streamStart + streamLength - 1],
     });
   } else if (streamLength >= 4) {
     bursts += 1;
   }
   streamStart = i;
   streamLength = 1;
 }

 if (streamLength >= minStreamLength) {
   streams.push({
     startIdx: streamStart,
     length: streamLength,
     startTime: times[streamStart],
     endTime: times[streamStart + streamLength - 1],
   });
 } else if (streamLength >= 4) {
   bursts += 1;
 }

 const streamNotes = streams.reduce((acc, s) => acc + safeNumber(s.length), 0);

 return {
   streams,
   streamNotes,
   bursts,
   streamMeasures: 0,
   breakMeasures: 0,
   streamSegments: streams.length,
   breakSegments: 0,
   streamDetectionMethod: 'time-gap-fallback',
 };
}

// =============================================================================
// Main Footwork Analysis
// =============================================================================

function analyzeFootwork(singleStepRows, eventRows, laneCount, holdRanges = [], bpms = [], measureInfo = null) {
 const assignments = solveFootAssignments(singleStepRows, laneCount, holdRanges);

 let footswitches = 0;
 let upFootswitches = 0;
 let downFootswitches = 0;
 let jacks = 0;
 let doublesteps = 0;
 let halfCrossovers = 0;
 let fullCrossovers = 0;

 let leftFootLane = null;
 let rightFootLane = null;
 let wasCrossed = false;

 // Analyze each single step
 for (let i = 0; i < singleStepRows.length; i++) {
   const lane = safeNumber(singleStepRows[i]?.lane);
   const foot = assignments[i];

   if (foot === 'L') {
     leftFootLane = lane;
   } else if (foot === 'R') {
     rightFootLane = lane;
   }

   const crossState = getCrossedState(leftFootLane, rightFootLane, laneCount);
   if (crossState.crossed && !wasCrossed) {
     if (crossState.type === 'full') fullCrossovers++;
     else if (crossState.type === 'half') halfCrossovers++;
   }
   wasCrossed = crossState.crossed;

   if (i === 0) continue;

   const prevLane = safeNumber(singleStepRows[i - 1]?.lane);
   const prevFoot = assignments[i - 1];

   const sameLane = lane === prevLane;
   const sameFoot = foot === prevFoot;

   if (sameLane && sameFoot) {
     jacks++;
   } else if (sameLane && !sameFoot) {
     footswitches++;
     const noteType = laneType(lane);
     if (noteType === 'up') upFootswitches++;
     if (noteType === 'down') downFootswitches++;
   } else if (!sameLane && sameFoot) {
     doublesteps++;
   }
 }

 // Detect sideswitches
 const sideswitches = detectSideswitches(eventRows, singleStepRows, assignments, laneCount);

 // Count brackets
 const { brackets, forcedBrackets } = countBrackets(eventRows, laneCount);

 // Detect anchors
 const { anchors, anchorSequences } = detectAnchors(singleStepRows, assignments);

 // Detect spins
 const { spins180, spins360, spinDetails } = detectSpins(eventRows, laneCount);

 // Detect staircases and rolls
 const { staircases, rolls, staircaseDetails } = detectStaircases(eventRows, laneCount);

 // Detect candles
 const { candles, candleDetails } = detectCandles(singleStepRows, assignments, laneCount);

 // Detect drills
 const { drills, drillNotes, drillDetails } = detectDrills(singleStepRows, laneCount);

 // Detect gallops
 const { gallops, gallopDetails } = detectGallops(eventRows);

 // Detect mono-side runs
 const { monoLeftRuns, monoRightRuns, monoRuns, monoRunDetails } = detectMonoRuns(singleStepRows, assignments, laneCount);

 // Detect crossovers during holds
 const { holdCrossovers, halfHoldCrossovers, fullHoldCrossovers } =
   detectCrossoversWithHoldsFixed(singleStepRows, assignments, holdRanges, laneCount);

 // Detect streams
 const {
   streams,
   streamNotes,
   bursts,
   streamMeasures,
   breakMeasures,
   streamSegments,
   breakSegments,
   streamDetectionMethod,
 } = detectStreams(eventRows, bpms, measureInfo);

 // Aggregate statistics
 const crossovers = halfCrossovers + fullCrossovers;
 const totalCrossovers = crossovers + holdCrossovers;
 const spins = spins180 + spins360;
 const technicalMoves = crossovers + footswitches + sideswitches + jacks + doublesteps;

 return {
   footworkMethod: 'heuristic-v5',

   // Crossovers
   crossovers,
   halfCrossovers,
   fullCrossovers,
   holdCrossovers,
   halfHoldCrossovers,
   fullHoldCrossovers,
   totalCrossovers,

   // Basic patterns
   footswitches,
   upFootswitches,
   downFootswitches,
   sideswitches,
   jacks,
   doublesteps,

   // Brackets
   brackets,
   forcedBrackets,

   // Anchors
   anchors,
   anchorSequences,

   // Spins
   spins,
   spins180,
   spins360,
   spinDetails,

   // Staircases
   staircases,
   rolls,
   staircaseDetails,

   // Candles
   candles,
   candleDetails,

   // Drills
   drills,
   drillNotes,
   drillDetails,

   // Gallops
   gallops,
   gallopDetails,

   // Mono runs
   monoRuns,
   monoLeftRuns,
   monoRightRuns,
   monoRunDetails,

   // Streams
   streams,
   streamCount: streams.length,
   streamNotes,
   bursts,
   streamMeasures,
   breakMeasures,
   streamSegments,
   breakSegments,
   streamDetectionMethod,

   // Aggregates
   technicalMoves,
   footAssignments: assignments,
 };
}

function normalizeStepmaniaTech(raw) {
 if (!raw || typeof raw !== 'object') return null;
 const aliases = {
   crossovers: ['crossovers', 'TechCountsCategory_Crossovers'],
   footswitches: ['footswitches', 'TechCountsCategory_Footswitches'],
   sideswitches: ['sideswitches', 'TechCountsCategory_Sideswitches'],
   jacks: ['jacks', 'TechCountsCategory_Jacks'],
   brackets: ['brackets', 'TechCountsCategory_Brackets'],
   doublesteps: ['doublesteps', 'TechCountsCategory_Doublesteps'],
   halfCrossovers: ['halfCrossovers', 'half_crossovers'],
   fullCrossovers: ['fullCrossovers', 'full_crossovers'],
   holdCrossovers: ['holdCrossovers', 'hold_crossovers'],
   upFootswitches: ['upFootswitches', 'up_footswitches'],
   downFootswitches: ['downFootswitches', 'down_footswitches'],
   forcedBrackets: ['forcedBrackets', 'forced_brackets'],
   anchors: ['anchors'],
   spins: ['spins'],
   spins180: ['spins180', 'spins_180'],
   spins360: ['spins360', 'spins_360'],
   staircases: ['staircases'],
   rolls: ['rolls'],
   candles: ['candles'],
   drills: ['drills'],
   drillNotes: ['drillNotes', 'drill_notes'],
   gallops: ['gallops'],
   monoRuns: ['monoRuns', 'mono_runs'],
   monoLeftRuns: ['monoLeftRuns', 'mono_left_runs'],
   monoRightRuns: ['monoRightRuns', 'mono_right_runs'],
   streamCount: ['streamCount', 'streams', 'stream_count'],
   streamNotes: ['streamNotes', 'stream_notes'],
   bursts: ['bursts'],
   technicalMoves: ['technicalMoves', 'technical_moves'],
 };
 const out = {};
 for (const [target, keys] of Object.entries(aliases)) {
   for (const key of keys) {
     if (!(key in raw)) continue;
     const n = Number(raw[key]);
     if (Number.isFinite(n) && n >= 0) {
       out[target] = Math.round(n);
       break;
     }
   }
 }
 return Object.keys(out).length > 0 ? out : null;
}

function applyStepmaniaTechOverrides(footwork, rawTech) {
 const tech = normalizeStepmaniaTech(rawTech);
 if (!tech) return footwork;

 const next = { ...footwork };
 const has = (key) => Object.prototype.hasOwnProperty.call(tech, key);

 if (has('crossovers')) next.crossovers = tech.crossovers;
 if (has('halfCrossovers')) next.halfCrossovers = tech.halfCrossovers;
 if (has('fullCrossovers')) next.fullCrossovers = tech.fullCrossovers;
 if (has('holdCrossovers')) next.holdCrossovers = tech.holdCrossovers;
 if (has('footswitches')) next.footswitches = tech.footswitches;
 if (has('upFootswitches')) next.upFootswitches = tech.upFootswitches;
 if (has('downFootswitches')) next.downFootswitches = tech.downFootswitches;
 if (has('sideswitches')) next.sideswitches = tech.sideswitches;
 if (has('jacks')) next.jacks = tech.jacks;
 if (has('brackets')) next.brackets = tech.brackets;
 if (has('forcedBrackets')) next.forcedBrackets = tech.forcedBrackets;
 if (has('doublesteps')) next.doublesteps = tech.doublesteps;
 if (has('anchors')) next.anchors = tech.anchors;
 if (has('spins')) next.spins = tech.spins;
 if (has('spins180')) next.spins180 = tech.spins180;
 if (has('spins360')) next.spins360 = tech.spins360;
 if (has('staircases')) next.staircases = tech.staircases;
 if (has('rolls')) next.rolls = tech.rolls;
 if (has('candles')) next.candles = tech.candles;
 if (has('drills')) next.drills = tech.drills;
 if (has('drillNotes')) next.drillNotes = tech.drillNotes;
 if (has('gallops')) next.gallops = tech.gallops;
 if (has('monoRuns')) next.monoRuns = tech.monoRuns;
 if (has('monoLeftRuns')) next.monoLeftRuns = tech.monoLeftRuns;
 if (has('monoRightRuns')) next.monoRightRuns = tech.monoRightRuns;
 if (has('streamCount')) next.streamCount = tech.streamCount;
 if (has('streamNotes')) next.streamNotes = tech.streamNotes;
 if (has('bursts')) next.bursts = tech.bursts;

 if (!has('crossovers')) {
   next.crossovers = safeNumber(next.halfCrossovers) + safeNumber(next.fullCrossovers);
 }
 next.totalCrossovers = safeNumber(next.crossovers) + safeNumber(next.holdCrossovers);
 if (!has('spins')) {
   next.spins = safeNumber(next.spins180) + safeNumber(next.spins360);
 }
 if (has('technicalMoves')) {
   next.technicalMoves = tech.technicalMoves;
 } else {
   next.technicalMoves =
     safeNumber(next.crossovers)
     + safeNumber(next.footswitches)
     + safeNumber(next.sideswitches)
     + safeNumber(next.jacks)
     + safeNumber(next.doublesteps);
 }
 next.stepmaniaTechApplied = true;
 next.stepmaniaTechCategories = Object.keys(tech).sort();
 next.footworkMethod = `${next.footworkMethod}+stepmania-tech`;

 return next;
}

// =============================================================================
// Statistical Helpers
// =============================================================================

function diffSeries(values) {
 if (!Array.isArray(values) || values.length < 2) return [];
 const deltas = [];
 for (let i = 1; i < values.length; i++) {
   deltas.push(safeNumber(values[i]) - safeNumber(values[i - 1]));
 }
 return deltas;
}

function maxRateFromTimes(times, windowSize) {
 if (!Array.isArray(times) || times.length < windowSize || windowSize < 2) return 0;
 let best = 0;
 for (let i = 0; i + windowSize - 1 < times.length; i++) {
   const start = safeNumber(times[i]);
   const end = safeNumber(times[i + windowSize - 1]);
   const duration = end - start;
   if (duration <= 0) continue;
   const rate = (windowSize - 1) / duration;
   if (rate > best) best = rate;
 }
 return best;
}

function minGapBetweenTimes(times) {
 const deltas = diffSeries(times).filter((d) => d > 0);
 if (deltas.length === 0) return 0;
 return Math.min(...deltas);
}

// =============================================================================
// Radar Approximation
// =============================================================================

function approximateRadar(arrows, freezes, bpmRanges, stops, lastBeat) {
 const totalTaps = (arrows || []).reduce(
   (acc, arrow) => acc + countTapsInRow(arrow?.direction || ''),
   0
 );
 const jumpEvents = (arrows || []).reduce(
   (acc, arrow) => acc + (countTapsInRow(arrow?.direction || '') >= 2 ? 1 : 0),
   0
 );
 const times = eventTimes(arrows || [], bpmRanges || [], stops || []);
 const length = songLengthSeconds(bpmRanges || [], stops || [], lastBeat || 0);

 // Voltage: max notes in any 1-second window
 let voltage = 0;
 let j = 0;
 for (let i = 0; i < times.length; i++) {
   while (j < times.length && times[j] <= times[i] + 1) j++;
   voltage = Math.max(voltage, j - i);
 }

 // Freeze calculation
 let freezeSeconds = 0;
 if (Array.isArray(freezes)) {
   for (const freeze of freezes) {
     const start = Math.max(0, safeNumber(freeze?.startOffset));
     const end = Math.max(start, safeNumber(freeze?.endOffset));
     freezeSeconds +=
       timeAtOffset(bpmRanges || [], stops || [], end) -
       timeAtOffset(bpmRanges || [], stops || [], start);
   }
 }

 return {
   stream: safeDivide(totalTaps, length),
   voltage,
   air: safeDivide(jumpEvents, times.length),
   freeze: Math.min(1, safeDivide(freezeSeconds, length)),
   chaos: null,
 };
}

// =============================================================================
// Main Export: computeChartMetrics
// =============================================================================

export function computeChartMetrics(chart) {
 if (!chart) return null;

 const arrows = Array.isArray(chart.arrows) ? chart.arrows : [];
 const freezes = Array.isArray(chart.freezes) ? chart.freezes : [];
 const bpms = Array.isArray(chart.bpm) ? chart.bpm : [];
 const stops = Array.isArray(chart.stops) ? chart.stops : [];
 const chartNotes = typeof chart.notes === 'string' ? chart.notes : '';

 const laneCount = Math.max(
   4,
   ...arrows.map((arrow) => String(arrow?.direction || '').length).filter((length) => length > 0)
 );

 // Build hold ranges for footwork analysis
 const holdRanges = buildHoldRanges(freezes, bpms, stops);

 const eventRows = [];
 let steps = 0;
 let notes = 0;
 let jumps = 0;
 let hands = 0;
 let quads = 0;
 let shocks = 0;

 const quantizationCounts = {};
 for (const n of QUANTIZATION_TYPES) {
   quantizationCounts[QUANTIZATION_LABELS[n]] = 0;
 }

 // Process all arrows
 for (const arrow of arrows) {
   const direction = arrow?.direction || '';
   const taps = countTapsInRow(direction);
   const shock = isShockRow(direction);
   const hasPlayableEvent = taps > 0 || shock;
   if (!hasPlayableEvent) continue;

   const time = timeAtOffset(bpms, stops, safeNumber(arrow?.offset));
   eventRows.push({
     offset: safeNumber(arrow?.offset),
     time,
     taps,
     shock,
     direction,
   });

   const quant = classifyQuantization(arrow?.offset);
   if (quant) {
     quantizationCounts[QUANTIZATION_LABELS[quant]] += 1;
   }

   if (shock) {
     shocks += 1;
     notes += 1;
     continue;
   }

   steps += 1;
   notes += taps;
   if (taps === 2) jumps += 1;
   if (taps === 3) hands += 1;
   if (taps >= 4) quads += 1;
 }

 // Extract single-step rows for footwork analysis
 const singleStepRows = eventRows
   .filter((row) => !row.shock && row.taps === 1)
   .map((row) => ({
     lane: getSingleTapLane(row.direction),
     time: row.time,
     offset: row.offset,
   }))
   .filter((row) => row.lane >= 0)
   .sort((a, b) => a.time - b.time || a.offset - b.offset);

 // Hold statistics
 const holds = freezes.length;
 const holdDurations = freezes
   .map((freeze) => {
     const start = Math.max(0, safeNumber(freeze?.startOffset));
     const end = Math.max(start, safeNumber(freeze?.endOffset));
     return timeAtOffset(bpms, stops, end) - timeAtOffset(bpms, stops, start);
   })
   .filter((value) => value > 0);

 // Stop statistics
 const stopDurations = stops
   .map((stop) => safeNumber(stop?.duration))
   .filter((duration) => duration > 0);

 // Timing analysis
 const eventTimesList = eventRows.map((row) => row.time).sort((a, b) => a - b);
 const eventDeltas = diffSeries(eventTimesList).filter((delta) => delta > 0);
 const notesPerSecondSeries = eventDeltas.map((delta) => 1 / delta);

 const firstNoteSeconds = eventTimesList.length > 0 ? eventTimesList[0] : 0;
 const chartEndSeconds = eventTimesList.length > 0 ? eventTimesList[eventTimesList.length - 1] : 0;
 const chartLengthSeconds = Math.max(0, chartEndSeconds - firstNoteSeconds);

 // Lane distribution
 const laneCounts = computeLaneCounts(eventRows.filter((row) => !row.shock));
 const leftRightTotal = laneCounts.left + laneCounts.right;
 const downUpTotal = laneCounts.down + laneCounts.up;
 const horizontal = laneCounts.left + laneCounts.right;
 const vertical = laneCounts.down + laneCounts.up;
 const totalDirectional = horizontal + vertical;

 // Jump timing
 const jumpTimes = eventRows
   .filter((row) => row.taps === 2)
   .map((row) => row.time)
   .sort((a, b) => a - b);

 // BPM statistics
 const bpmValues = bpms.map((entry) => safeNumber(entry?.bpm)).filter((bpm) => bpm > 0);
 const bpmChanges = Math.max(0, bpms.length - 1);
 const stopCount = stopDurations.length;
 const totalStopDurationSeconds = sum(stopDurations);

 // Quantization analysis
 const quantizationEntries = QUANTIZATION_TYPES.map((n) => ({
   noteType: n,
   label: QUANTIZATION_LABELS[n],
   count: quantizationCounts[QUANTIZATION_LABELS[n]] || 0,
 }));
 const finestQuantization =
   quantizationEntries
     .filter((entry) => entry.count > 0)
     .sort((a, b) => b.noteType - a.noteType)[0]?.label || '';
 const mostFrequentQuantizations = findMostFrequentQuantizations(quantizationCounts);

 // Statistical summaries
 const npsStats = buildSummaryStats(notesPerSecondSeries, { modeDecimals: 3 });
 const tbnStats = buildSummaryStats(eventDeltas, { modeDecimals: 3 });
 const holdStats = buildSummaryStats(holdDurations, { modeDecimals: 3 });
 const measureInfo = buildMeasureInfoFromChartNotes(chartNotes, laneCount, bpms, stops);

 // Footwork analysis
 const footworkHeuristic = analyzeFootwork(singleStepRows, eventRows, laneCount, holdRanges, bpms, measureInfo);
 const footwork = applyStepmaniaTechOverrides(
   footworkHeuristic,
   chart?.stepmaniaTech || chart?.stepmaniaTechCounts || chart?.techCounts || null,
 );

 // Radar and song length
 const lastBeat = computeLastBeat(chart);
 const radar = approximateRadar(arrows, freezes, bpms, stops, lastBeat);
 const songLength = songLengthSeconds(bpms, stops, lastBeat);

 // =============================================================================
 // Build Debug Stats
 // =============================================================================

 const debugStats = {
   // Basic counts
   notes,
   steps,
   jumps,
   holds,
   shocks,
   hands,
   quads,
   bpmChanges,
   stops: stopCount,

   // Timing
   chartStart: firstNoteSeconds,
   chartEnd: chartEndSeconds,
   chartLength: chartLengthSeconds,
   totalStopDuration: totalStopDurationSeconds,
   stopPercentOfChart: safeDivide(totalStopDurationSeconds, chartLengthSeconds) * 100,
   shortestStop: stopDurations.length > 0 ? Math.min(...stopDurations) : 0,
   longestStop: stopDurations.length > 0 ? Math.max(...stopDurations) : 0,

   // Hold stats
   totalHoldDuration: sum(holdDurations),
   meanHoldDuration: holdStats.mean,
   shortestHoldNote: holdDurations.length > 0 ? Math.min(...holdDurations) : 0,
   longestHoldNote: holdDurations.length > 0 ? Math.max(...holdDurations) : 0,

   // NPS stats
   maximumNotesPerSecond: npsStats.max,
   minimumNotesPerSecond: npsStats.min,
   meanNotesPerSecond: npsStats.mean,
   medianNotesPerSecond: npsStats.median,
   modeNotesPerSecond: npsStats.mode,
   standardDeviationNotesPerSecond: npsStats.standardDeviation,
   peakMeasureNps: measureInfo.peakNPS,
   equallySpacedMeasuresPercent: safeDivide(
     measureInfo.equallySpacedPerMeasure.filter(Boolean).length,
     measureInfo.equallySpacedPerMeasure.length,
   ) * 100,

   // Time between notes
   maxTimeBetweenNotes: tbnStats.max,
   meanTimeBetweenNotes: tbnStats.mean,
   medianTimeBetweenNotes: tbnStats.median,
   modeTimeBetweenNotes: tbnStats.mode,
   standardDeviationTimeBetweenNotes: tbnStats.standardDeviation,

   // Burst rates
   fastest2NoteBurst: maxRateFromTimes(eventTimesList, 2),
   fastest3NoteBurst: maxRateFromTimes(eventTimesList, 3),
   fastest5NoteBurst: maxRateFromTimes(eventTimesList, 5),
   fastest7NoteRun: maxRateFromTimes(eventTimesList, 7),
   fastest15NoteRun: maxRateFromTimes(eventTimesList, 15),
   closestJumps: minGapBetweenTimes(jumpTimes),

   // Per-second rates
   notesPerSecond: safeDivide(notes, chartLengthSeconds),
   stepsPerSecond: safeDivide(steps, chartLengthSeconds),
   jumpsPerSecond: safeDivide(jumps, chartLengthSeconds),
   holdsPerSecond: safeDivide(holds, chartLengthSeconds),
   shocksPerSecond: safeDivide(shocks, chartLengthSeconds),
   handsPerSecond: safeDivide(hands, chartLengthSeconds),
   quadsPerSecond: safeDivide(quads, chartLengthSeconds),

   // Footwork per second
   crossoversPerSecond: safeDivide(footwork.crossovers, chartLengthSeconds),
   halfCrossoversPerSecond: safeDivide(footwork.halfCrossovers, chartLengthSeconds),
   fullCrossoversPerSecond: safeDivide(footwork.fullCrossovers, chartLengthSeconds),
   holdCrossoversPerSecond: safeDivide(footwork.holdCrossovers, chartLengthSeconds),
   totalCrossoversPerSecond: safeDivide(footwork.totalCrossovers, chartLengthSeconds),
   footswitchesPerSecond: safeDivide(footwork.footswitches, chartLengthSeconds),
   upFootswitchesPerSecond: safeDivide(footwork.upFootswitches, chartLengthSeconds),
   downFootswitchesPerSecond: safeDivide(footwork.downFootswitches, chartLengthSeconds),
   sideswitchesPerSecond: safeDivide(footwork.sideswitches, chartLengthSeconds),
   jacksPerSecond: safeDivide(footwork.jacks, chartLengthSeconds),
   bracketsPerSecond: safeDivide(footwork.brackets, chartLengthSeconds),
   doublestepsPerSecond: safeDivide(footwork.doublesteps, chartLengthSeconds),
   anchorsPerSecond: safeDivide(footwork.anchors, chartLengthSeconds),
   spinsPerSecond: safeDivide(footwork.spins, chartLengthSeconds),
   staircasesPerSecond: safeDivide(footwork.staircases, chartLengthSeconds),
   candlesPerSecond: safeDivide(footwork.candles, chartLengthSeconds),
   drillsPerSecond: safeDivide(footwork.drills, chartLengthSeconds),
   gallopsPerSecond: safeDivide(footwork.gallops, chartLengthSeconds),
   technicalMovesPerSecond: safeDivide(footwork.technicalMoves, chartLengthSeconds),

   // Footwork percentages (per step)
   jumpsPerStepsPercent: safeDivide(jumps, steps) * 100,
   holdsPerStepsPercent: safeDivide(holds, steps) * 100,
   shocksPerStepsPercent: safeDivide(shocks, steps) * 100,
   handsPerStepsPercent: safeDivide(hands, steps) * 100,
   quadsPerStepsPercent: safeDivide(quads, steps) * 100,
   crossoversPerStepsPercent: safeDivide(footwork.crossovers, steps) * 100,
   halfCrossoversPerStepsPercent: safeDivide(footwork.halfCrossovers, steps) * 100,
   fullCrossoversPerStepsPercent: safeDivide(footwork.fullCrossovers, steps) * 100,
   holdCrossoversPerStepsPercent: safeDivide(footwork.holdCrossovers, steps) * 100,
   totalCrossoversPerStepsPercent: safeDivide(footwork.totalCrossovers, steps) * 100,
   footswitchesPerStepsPercent: safeDivide(footwork.footswitches, steps) * 100,
   upFootswitchesPerStepsPercent: safeDivide(footwork.upFootswitches, steps) * 100,
   downFootswitchesPerStepsPercent: safeDivide(footwork.downFootswitches, steps) * 100,
   sideswitchesPerStepsPercent: safeDivide(footwork.sideswitches, steps) * 100,
   jacksPerStepsPercent: safeDivide(footwork.jacks, steps) * 100,
   bracketsPerStepsPercent: safeDivide(footwork.brackets, steps) * 100,
   bracketsPerJumpsPercent: safeDivide(footwork.brackets, jumps) * 100,
   doublestepsPerStepsPercent: safeDivide(footwork.doublesteps, steps) * 100,
   anchorsPerStepsPercent: safeDivide(footwork.anchors, steps) * 100,
   spinsPerStepsPercent: safeDivide(footwork.spins, steps) * 100,
   staircasesPerStepsPercent: safeDivide(footwork.staircases, steps) * 100,
   candlesPerStepsPercent: safeDivide(footwork.candles, steps) * 100,
   drillsPerStepsPercent: safeDivide(footwork.drills, steps) * 100,
   drillNotesPerStepsPercent: safeDivide(footwork.drillNotes, steps) * 100,
   gallopsPerStepsPercent: safeDivide(footwork.gallops, steps) * 100,
   technicalMovesPerStepsPercent: safeDivide(footwork.technicalMoves, steps) * 100,
   streamNotesPerStepsPercent: safeDivide(footwork.streamNotes, steps) * 100,

   // Raw footwork counts
   crossovers: footwork.crossovers,
   halfCrossovers: footwork.halfCrossovers,
   fullCrossovers: footwork.fullCrossovers,
   holdCrossovers: footwork.holdCrossovers,
   halfHoldCrossovers: footwork.halfHoldCrossovers,
   fullHoldCrossovers: footwork.fullHoldCrossovers,
   totalCrossovers: footwork.totalCrossovers,
   footswitches: footwork.footswitches,
   upFootswitches: footwork.upFootswitches,
   downFootswitches: footwork.downFootswitches,
   sideswitches: footwork.sideswitches,
   jacks: footwork.jacks,
   brackets: footwork.brackets,
   forcedBrackets: footwork.forcedBrackets,
   doublesteps: footwork.doublesteps,
   anchors: footwork.anchors,
   spins: footwork.spins,
   spins180: footwork.spins180,
   spins360: footwork.spins360,
   staircases: footwork.staircases,
   rolls: footwork.rolls,
   candles: footwork.candles,
   drills: footwork.drills,
   drillNotes: footwork.drillNotes,
   gallops: footwork.gallops,
   monoRuns: footwork.monoRuns,
   monoLeftRuns: footwork.monoLeftRuns,
   monoRightRuns: footwork.monoRightRuns,
   streamCount: footwork.streamCount,
   streamNotes: footwork.streamNotes,
   bursts: footwork.bursts,
   streamMeasures: footwork.streamMeasures,
   breakMeasures: footwork.breakMeasures,
   streamSegments: footwork.streamSegments,
   breakSegments: footwork.breakSegments,
   streamDetectionMethod: footwork.streamDetectionMethod,
   technicalMoves: footwork.technicalMoves,
   stepmaniaTechApplied: Boolean(footwork.stepmaniaTechApplied),
   stepmaniaTechCategories: footwork.stepmaniaTechCategories || [],
   footworkMethod: footwork.footworkMethod,

   // BPM stats
   bpmMin: bpmValues.length > 0 ? Math.min(...bpmValues) : 0,
   bpmMax: bpmValues.length > 0 ? Math.max(...bpmValues) : 0,
   bpmRange: bpmValues.length > 0 ? Math.max(...bpmValues) - Math.min(...bpmValues) : 0,
   bpmMean: bpmValues.length > 0 ? mean(bpmValues) : 0,
   bpmChangesPerSecond: safeDivide(bpmChanges, chartLengthSeconds),
   stopsPerSecond: safeDivide(stopCount, chartLengthSeconds),

   // Lane distribution
   leftNotes: laneCounts.left,
   downNotes: laneCounts.down,
   upNotes: laneCounts.up,
   rightNotes: laneCounts.right,
   lopsidednessByMax: safeDivide(
     Math.max(Math.abs(laneCounts.left - laneCounts.right), Math.abs(laneCounts.down - laneCounts.up)),
     totalDirectional
   ),
   lopsidednessByMean: safeDivide(
     Math.abs(laneCounts.left - laneCounts.right) + Math.abs(laneCounts.down - laneCounts.up),
     totalDirectional * 2
   ),
   leftRightBias: safeDivide(laneCounts.left, leftRightTotal),
   downUpBias: safeDivide(laneCounts.down, downUpTotal),
   horizontalVerticalBias: safeDivide(horizontal, horizontal + vertical),
   leftPercent: safeDivide(laneCounts.left, totalDirectional) * 100,
   downPercent: safeDivide(laneCounts.down, totalDirectional) * 100,
   upPercent: safeDivide(laneCounts.up, totalDirectional) * 100,
   rightPercent: safeDivide(laneCounts.right, totalDirectional) * 100,

   // Quantization
   mostFrequentQuantizations,
   finestQuantization,
   quantizationCounts,
   chartSeconds: songLength,

   // Detailed pattern information (for visualization/debugging)
   anchorSequences: footwork.anchorSequences,
   spinDetails: footwork.spinDetails,
   staircaseDetails: footwork.staircaseDetails,
   candleDetails: footwork.candleDetails,
   drillDetails: footwork.drillDetails,
   gallopDetails: footwork.gallopDetails,
   monoRunDetails: footwork.monoRunDetails,
   streams: footwork.streams,
   notesPerMeasure: measureInfo.notesPerMeasure,
   equallySpacedPerMeasure: measureInfo.equallySpacedPerMeasure,
   measureNpsPerMeasure: measureInfo.npsPerMeasure,
 };

 // =============================================================================
 // Return Result
 // =============================================================================

 return {
   // Primary metrics
   steps,
   holds,
   jumps,
   shocks,
   hands,
   quads,
   notes,
   firstNoteSeconds,
   chartEndSeconds,
   chartLengthSeconds,
   stops: stopCount,
   bpmChanges,

   // Rates
   notesPerSecond: debugStats.notesPerSecond,
   stepsPerSecond: debugStats.stepsPerSecond,
   jumpsPerSecond: debugStats.jumpsPerSecond,
   holdsPerSecond: debugStats.holdsPerSecond,
   shocksPerSecond: debugStats.shocksPerSecond,
   handsPerSecond: debugStats.handsPerSecond,

   // Lane distribution
   leftNotes: laneCounts.left,
   downNotes: laneCounts.down,
   upNotes: laneCounts.up,
   rightNotes: laneCounts.right,

   // Quantization
   quantizationCounts,
   mostFrequentQuantizations,
   finestQuantization,

   // Radar
   radar,
   lastBeat,

   // All detailed stats
   debugStats,
 };
}

export { timeAtOffset, songLengthSeconds };
