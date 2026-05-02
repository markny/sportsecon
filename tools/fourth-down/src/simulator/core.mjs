function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function lerp(a, b, weight) {
  return a + (b - a) * weight;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getBounds(sortedValues, target) {
  if (target <= sortedValues[0]) {
    return [sortedValues[0], sortedValues[0]];
  }
  if (target >= sortedValues[sortedValues.length - 1]) {
    return [sortedValues[sortedValues.length - 1], sortedValues[sortedValues.length - 1]];
  }

  for (let i = 0; i < sortedValues.length - 1; i += 1) {
    const lower = sortedValues[i];
    const upper = sortedValues[i + 1];
    if (target >= lower && target <= upper) {
      return [lower, upper];
    }
  }

  return [sortedValues[sortedValues.length - 1], sortedValues[sortedValues.length - 1]];
}

function interpolateFromSeries(points, xKey, yKey, target) {
  if (!points || points.length === 0) {
    return null;
  }

  const sorted = [...points].sort((a, b) => a[xKey] - b[xKey]);
  if (target <= sorted[0][xKey]) {
    return sorted[0][yKey];
  }
  if (target >= sorted[sorted.length - 1][xKey]) {
    return sorted[sorted.length - 1][yKey];
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (target >= left[xKey] && target <= right[xKey]) {
      if (left[xKey] === right[xKey]) {
        return left[yKey];
      }
      const weight = (target - left[xKey]) / (right[xKey] - left[xKey]);
      return lerp(left[yKey], right[yKey], weight);
    }
  }

  return sorted[sorted.length - 1][yKey];
}

function buildDecisionIndex(decisionInputs) {
  const conversionByDistance = new Map();
  for (const row of decisionInputs.conversion) {
    const key = row.ydstogo_bucket;
    if (!conversionByDistance.has(key)) {
      conversionByDistance.set(key, []);
    }
    conversionByDistance.get(key).push(row);
  }

  const shortGoByDistance = new Map();
  for (const row of decisionInputs.short_go ?? []) {
    const key = row.ydstogo_bucket;
    if (!shortGoByDistance.has(key)) {
      shortGoByDistance.set(key, []);
    }
    shortGoByDistance.get(key).push(row);
  }

  const fgSeries = [...decisionInputs.field_goal].sort(
    (a, b) => a.distance_bucket - b.distance_bucket
  );
  const puntSeries = [...decisionInputs.punt].sort(
    (a, b) => a.field_pos_bucket - b.field_pos_bucket
  );

  return {
    conversionByDistance,
    shortGoByDistance,
    fgSeries,
    puntSeries,
  };
}

function buildCalibrationIndex(calibrationInputs = {}) {
  if (calibrationInputs.model_type === "current_wp_calibration_v1") {
    return {
      kind: "current_wp_calibration_v1",
      coefficients: calibrationInputs.coefficients ?? {},
    };
  }

  return { kind: "none", coefficients: {} };
}

function buildWpIndex(wpInputs) {
  if (wpInputs.model_type === "parametric_logit_v1") {
    return {
      kind: "parametric_logit_v1",
      coefficients: wpInputs.coefficients ?? {},
      defaults: wpInputs.defaults ?? {
        posteam_spread: 0,
        total_line: 45,
      },
    };
  }

  const rowsByScoreAndTime = new Map();

  for (const row of wpInputs.rows) {
    const key = `${row.score_diff_bucket}|${row.game_seconds_bucket}`;
    if (!rowsByScoreAndTime.has(key)) {
      rowsByScoreAndTime.set(key, []);
    }
    rowsByScoreAndTime.get(key).push(row);
  }

  for (const rows of rowsByScoreAndTime.values()) {
    rows.sort((a, b) => a.field_pos_bucket - b.field_pos_bucket);
  }

  return {
    kind: "grid_v1",
    scoreBuckets: [...wpInputs.score_diff_buckets].sort((a, b) => a - b),
    timeBuckets: [...wpInputs.game_seconds_buckets].sort((a, b) => a - b),
    rowsByScoreAndTime,
  };
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function scoreTimeFieldWp(index, scoreDiffBucket, timeBucket, fieldPos) {
  const key = `${scoreDiffBucket}|${timeBucket}`;
  const rows = index.rowsByScoreAndTime.get(key);
  return interpolateFromSeries(rows, "field_pos_bucket", "smoothed_wp", fieldPos);
}

function lookupWp(index, scoreDiff, gameSecondsRemaining, yardline100) {
  if (index.kind === "parametric_logit_v1") {
    throw new Error("Parametric WP model requires a full state object.");
  }

  const clampedScore = clamp(Math.round(scoreDiff), -24, 24);
  const clampedTime = clamp(gameSecondsRemaining, 0, 3600);
  const clampedField = clamp(yardline100, 0, 95);

  const [lowerTime, upperTime] = getBounds(index.timeBuckets, clampedTime);
  const lowerValue = scoreTimeFieldWp(index, clampedScore, lowerTime, clampedField);
  const upperValue = scoreTimeFieldWp(index, clampedScore, upperTime, clampedField);

  if (lowerValue === null && upperValue === null) {
    return 0.5;
  }
  if (lowerTime === upperTime || upperValue === null) {
    return lowerValue ?? 0.5;
  }
  if (lowerValue === null) {
    return upperValue;
  }

  const weight = (clampedTime - lowerTime) / (upperTime - lowerTime);
  return lerp(lowerValue, upperValue, weight);
}

function lookupWpFromModel(index, state) {
  const coefficients = index.coefficients ?? {};
  const posteamSpread =
    typeof state.posteamSpread === "number"
      ? state.posteamSpread
      : index.defaults.posteam_spread ?? 0;
  const totalLine =
    typeof state.totalLine === "number"
      ? state.totalLine
      : index.defaults.total_line ?? 45;
  const posteamTotal = (totalLine + posteamSpread) / 2;
  const timeFrac = clamp(state.gameSecondsRemaining, 0, 3600) / 3600;
  const yardline100 = clamp(state.yardline100, 0, 95);
  const scoreDiff = state.scoreDiff;
  const down = clamp(Math.round(state.down ?? 4), 1, 4);
  const ydstogo = clamp(state.ydstogo ?? 10, 1, 20);
  const features = {
    down_2: Number(down === 2),
    down_3: Number(down === 3),
    down_4: Number(down === 4),
    ydstogo,
    ydstogo_sq: ydstogo ** 2,
    score_diff: scoreDiff,
    score_diff_sq: scoreDiff ** 2,
    time_frac: timeFrac,
    time_frac_sq: timeFrac ** 2,
    yardline_100: yardline100,
    yardline_sq: yardline100 ** 2,
    posteam_spread: posteamSpread,
    posteam_spread_sq: posteamSpread ** 2,
    posteam_total: posteamTotal,
    posteam_total_sq: posteamTotal ** 2,
    score_diff_x_time: scoreDiff * timeFrac,
    yardline_x_time: yardline100 * timeFrac,
    spread_x_time: posteamSpread * timeFrac,
    total_x_time: posteamTotal * timeFrac,
    score_diff_x_spread: scoreDiff * posteamSpread,
    down4_x_ydstogo: Number(down === 4) * ydstogo,
    down3_x_ydstogo: Number(down === 3) * ydstogo,
  };

  let logit = coefficients["(Intercept)"] ?? 0;
  for (const [key, value] of Object.entries(features)) {
    logit += (coefficients[key] ?? 0) * value;
  }

  return clamp(logistic(logit), 0.0001, 0.9999);
}

function lookupConversionRate(index, ydstogo, yardline100) {
  const clampedDistance = clamp(Math.round(ydstogo), 1, 10);
  const clampedField = clamp(yardline100, 0, 95);
  const rows = index.conversionByDistance.get(clampedDistance) ?? [];
  return interpolateFromSeries(rows, "field_pos_bucket", "smoothed_conversion_rate", clampedField) ?? 0.5;
}

function lookupShortGoOutcome(index, ydstogo, yardline100) {
  const clampedDistance = clamp(Math.round(ydstogo), 1, 2);
  const clampedField = clamp(yardline100, 0, 95);
  const rows = index.shortGoByDistance.get(clampedDistance) ?? [];

  if (rows.length === 0) {
    return null;
  }

  const conversionProbability =
    interpolateFromSeries(rows, "field_pos_bucket", "smoothed_conversion_rate", clampedField) ?? 0.5;
  const touchdownProbability =
    interpolateFromSeries(rows, "field_pos_bucket", "smoothed_touchdown_rate", clampedField) ?? 0;
  const successNonTdProbability =
    interpolateFromSeries(rows, "field_pos_bucket", "smoothed_success_non_td_rate", clampedField) ?? 0.5;

  let successNewYardline100 =
    interpolateFromSeries(rows, "field_pos_bucket", "smoothed_success_new_yardline100", clampedField) ??
    clamp(yardline100 - ydstogo, 0, 95);
  let failureNewYardline100 =
    interpolateFromSeries(rows, "field_pos_bucket", "smoothed_failure_new_yardline100", clampedField) ??
    yardline100;

  // The smoothed short-yardage location estimates become implausible in scoring range.
  // Replace them with football-plausible spot estimates so the value of a conversion is not understated.
  if (clampedField <= 35) {
    const extraSuccessYards =
      clampedField <= 10
        ? clampedDistance === 1
          ? 1.5
          : 2
        : clampedDistance === 1
          ? 1.5
          : 2.5;
    const failureLossYards =
      clampedField <= 10
        ? clampedDistance === 1
          ? 1.5
          : 1
        : clampedDistance === 1
          ? 0.5
          : 1;

    successNewYardline100 = clamp(
      clampedField - clampedDistance - extraSuccessYards,
      1,
      95
    );
    failureNewYardline100 = clamp(clampedField + failureLossYards, 0, 95);
  } else {
    successNewYardline100 = clamp(
      Math.min(successNewYardline100, clampedField - clampedDistance),
      0,
      95
    );
    failureNewYardline100 = clamp(
      Math.min(Math.max(failureNewYardline100, clampedField), clampedField + 2),
      0,
      95
    );
  }

  return {
    conversionProbability,
    touchdownProbability,
    successNonTdProbability,
    successNewYardline100,
    failureNewYardline100,
  };
}

function lookupFieldGoalRate(index, kickDistance) {
  const adjustedDistance =
    kickDistance > 55 ? kickDistance + 0.6 * (kickDistance - 55) : kickDistance;
  const clampedDistance = clamp(adjustedDistance, 19, 70);
  return interpolateFromSeries(index.fgSeries, "distance_bucket", "smoothed_make_rate", clampedDistance) ?? 0.5;
}

function lookupPuntStart(index, yardline100) {
  const clampedField = clamp(yardline100, 25, 95);
  const estimatedStart =
    interpolateFromSeries(
      index.puntSeries,
      "field_pos_bucket",
      "smoothed_est_start_yardline100",
      clampedField
    ) ?? 75;

  return clamp(estimatedStart - 5, 20, 95);
}

function normalizeState(state) {
  const posteamSpread =
    typeof state.posteamSpread === "number" ? state.posteamSpread : 0;
  const totalLine =
    typeof state.totalLine === "number" ? state.totalLine : 45;
  const offenseTimeouts = clamp(
    Math.round(
      state.offenseTimeouts ?? state.posteamTimeoutsRemaining ?? state.posteam_timeouts_remaining ?? 3
    ),
    0,
    3
  );
  const defenseTimeouts = clamp(
    Math.round(
      state.defenseTimeouts ?? state.defteamTimeoutsRemaining ?? state.defteam_timeouts_remaining ?? 3
    ),
    0,
    3
  );

  if (typeof state.gameSecondsRemaining === "number") {
    return {
      ...state,
      gameSecondsRemaining: clamp(state.gameSecondsRemaining, 0, 3600),
      down: clamp(Math.round(state.down ?? 4), 1, 4),
      ydstogo: clamp(state.ydstogo ?? 10, 1, 20),
      offenseTimeouts,
      defenseTimeouts,
      posteamSpread,
      totalLine,
    };
  }

  if (
    typeof state.quarter === "number" &&
    typeof state.secondsRemainingInQuarter === "number"
  ) {
    const quarter = clamp(state.quarter, 1, 4);
    const gameSecondsRemaining =
      (4 - quarter) * 900 + clamp(state.secondsRemainingInQuarter, 0, 900);

    return {
      ...state,
      quarter,
      gameSecondsRemaining,
      down: clamp(Math.round(state.down ?? 4), 1, 4),
      ydstogo: clamp(state.ydstogo ?? 10, 1, 20),
      offenseTimeouts,
      defenseTimeouts,
      posteamSpread,
      totalLine,
    };
  }

  throw new Error(
    "State must include either gameSecondsRemaining or quarter plus secondsRemainingInQuarter."
  );
}

function wpForPerspective(wpIndex, state, offenseHasBall) {
  const normalizedState = {
    ...state,
    gameSecondsRemaining: clamp(state.gameSecondsRemaining, 0, 3600),
    yardline100: clamp(state.yardline100, 0, 95),
  };

  if (offenseHasBall) {
    if (wpIndex.kind === "parametric_logit_v1") {
      return lookupWpFromModel(wpIndex, normalizedState);
    }

    return lookupWp(
      wpIndex,
      normalizedState.scoreDiff,
      normalizedState.gameSecondsRemaining,
      normalizedState.yardline100
    );
  }

  const opponentState = {
    ...normalizedState,
    scoreDiff: -normalizedState.scoreDiff,
    yardline100: clamp(100 - normalizedState.yardline100, 0, 95),
    offenseTimeouts: normalizedState.defenseTimeouts,
    defenseTimeouts: normalizedState.offenseTimeouts,
    posteamSpread: -normalizedState.posteamSpread,
  };
  const opponentOffenseWp =
    wpIndex.kind === "parametric_logit_v1"
      ? lookupWpFromModel(wpIndex, opponentState)
      : lookupWp(
          wpIndex,
          opponentState.scoreDiff,
          opponentState.gameSecondsRemaining,
          opponentState.yardline100
        );
  return 1 - opponentOffenseWp;
}

function makeSuccessState(state, nextYardline100 = null) {
  const touchdown = state.ydstogo >= state.yardline100 || nextYardline100 === 0;
  if (touchdown) {
    return {
      offenseHasBall: false,
      gameSecondsRemaining: clamp(state.gameSecondsRemaining - 8, 0, 3600),
      scoreDiff: state.scoreDiff + 7,
      yardline100: 75,
      posteamSpread: state.posteamSpread,
      totalLine: state.totalLine,
      offenseTimeouts: state.defenseTimeouts,
      defenseTimeouts: state.offenseTimeouts,
      down: 1,
      ydstogo: 10,
    };
  }

  return {
    offenseHasBall: true,
    gameSecondsRemaining: clamp(state.gameSecondsRemaining - 6, 0, 3600),
    scoreDiff: state.scoreDiff,
    yardline100: clamp(
      nextYardline100 ?? state.yardline100 - state.ydstogo,
      0,
      95
    ),
    posteamSpread: state.posteamSpread,
    totalLine: state.totalLine,
    offenseTimeouts: state.offenseTimeouts,
    defenseTimeouts: state.defenseTimeouts,
    down: 1,
    ydstogo: clamp(
      Math.min(10, Math.max(1, nextYardline100 ?? state.yardline100 - state.ydstogo)),
      1,
      20
    ),
  };
}

function makeFailureState(state, failureYardline100 = null) {
  const playResultYardline100 = clamp(failureYardline100 ?? state.yardline100, 0, 95);
  const opponentYardline100 = clamp(100 - playResultYardline100, 0, 95);
  return {
    offenseHasBall: false,
    gameSecondsRemaining: clamp(state.gameSecondsRemaining - 6, 0, 3600),
    scoreDiff: state.scoreDiff,
    yardline100: playResultYardline100,
    posteamSpread: state.posteamSpread,
    totalLine: state.totalLine,
    offenseTimeouts: state.defenseTimeouts,
    defenseTimeouts: state.offenseTimeouts,
    down: 1,
    ydstogo: clamp(Math.min(10, opponentYardline100), 1, 20),
  };
}

function makeFieldGoalSuccessState(state) {
  return {
    offenseHasBall: false,
    gameSecondsRemaining: clamp(state.gameSecondsRemaining - 8, 0, 3600),
    scoreDiff: state.scoreDiff + 3,
    yardline100: 25,
    posteamSpread: state.posteamSpread,
    totalLine: state.totalLine,
    offenseTimeouts: state.defenseTimeouts,
    defenseTimeouts: state.offenseTimeouts,
    down: 1,
    ydstogo: 10,
  };
}

function makeFieldGoalFailureState(state) {
  const opponentYardline100 = clamp(100 - state.yardline100, 0, 95);
  return {
    offenseHasBall: false,
    gameSecondsRemaining: clamp(state.gameSecondsRemaining - 5, 0, 3600),
    scoreDiff: state.scoreDiff,
    yardline100: state.yardline100,
    posteamSpread: state.posteamSpread,
    totalLine: state.totalLine,
    offenseTimeouts: state.defenseTimeouts,
    defenseTimeouts: state.offenseTimeouts,
    down: 1,
    ydstogo: clamp(Math.min(10, opponentYardline100), 1, 20),
  };
}

function makePuntState(state, puntStartYardline100) {
  return {
    offenseHasBall: false,
    gameSecondsRemaining: clamp(state.gameSecondsRemaining - 8, 0, 3600),
    scoreDiff: state.scoreDiff,
    yardline100: clamp(100 - puntStartYardline100, 0, 95),
    posteamSpread: state.posteamSpread,
    totalLine: state.totalLine,
    offenseTimeouts: state.defenseTimeouts,
    defenseTimeouts: state.offenseTimeouts,
    down: 1,
    ydstogo: clamp(Math.min(10, puntStartYardline100), 1, 20),
  };
}

function shortYardagePuntPenalty(state) {
  if (state.ydstogo > 2) {
    return 0;
  }

  const fieldFactor = clamp((state.yardline100 - 35) / 45, 0, 1);
  const timeFactor = clamp(state.gameSecondsRemaining / 3600, 0.3, 1);
  const distanceFactor = state.ydstogo === 1 ? 1 : 0.8;
  return 0.025 * fieldFactor * timeFactor * distanceFactor;
}

function shortYardageFieldGoalPenalty(state) {
  if (state.ydstogo > 2) {
    return 0;
  }

  const scoringTerritoryFactor = clamp((45 - state.yardline100) / 45, 0, 1);
  const distanceFactor = state.ydstogo === 1 ? 1 : 0.8;
  const trailingTouchdownPenalty =
    state.scoreDiff <= -4 && state.scoreDiff >= -8 && state.gameSecondsRemaining <= 900
      ? 0.035 * clamp((12 - state.yardline100) / 12, 0, 1)
      : 0;
  return 0.01 * scoringTerritoryFactor * distanceFactor + trailingTouchdownPenalty;
}

function shortYardageGoBonus(state) {
  if (state.ydstogo > 2) {
    return 0;
  }

  const midfieldFactor = clamp(1 - Math.abs(state.yardline100 - 50) / 40, 0.2, 1);
  const scoringFactor = clamp((35 - state.yardline100) / 35, 0, 1);
  const fieldFactor = Math.max(midfieldFactor, scoringFactor);
  const timeFactor = clamp(state.gameSecondsRemaining / 3600, 0.25, 1);
  const scoreFactor = Math.abs(state.scoreDiff) <= 10 ? 1 : 0.5;
  const distanceFactor = state.ydstogo === 1 ? 1 : 0.8;
  const goalToGoBonus = state.yardline100 <= 5 ? 0.01 : 0;
  return 0.018 * fieldFactor * timeFactor * scoreFactor * distanceFactor + goalToGoBonus;
}

function lateGameGoBonus(state) {
  if (state.scoreDiff >= 0 || state.gameSecondsRemaining > 900) {
    return 0;
  }

  const urgencyFactor = clamp((900 - state.gameSecondsRemaining) / 600, 0.15, 1);
  const fieldFactor = clamp((65 - state.yardline100) / 65, 0.2, 1);
  const distanceFactor = clamp(1 - (state.ydstogo - 1) / 6, 0.25, 1);
  const trailingFactor = state.scoreDiff <= -4 && state.scoreDiff >= -8 ? 1 : 0.55;
  const redZoneChaseBonus =
    state.scoreDiff <= -4 && state.scoreDiff >= -8
      ? 0.045 *
        clamp((420 - state.gameSecondsRemaining) / 240, 0, 1) *
        clamp((30 - state.yardline100) / 30, 0, 1) *
        clamp(1 - (state.ydstogo - 1) / 4, 0.4, 1)
      : 0;
  return 0.028 * urgencyFactor * fieldFactor * distanceFactor * trailingFactor + redZoneChaseBonus;
}

function lateGameFieldGoalPenalty(state) {
  if (state.scoreDiff >= 0 || state.gameSecondsRemaining > 900) {
    return 0;
  }

  const urgencyFactor = clamp((900 - state.gameSecondsRemaining) / 600, 0.15, 1);
  const scoringFactor = clamp((40 - state.yardline100) / 40, 0, 1);
  const trailingTouchdownFactor = state.scoreDiff <= -4 && state.scoreDiff >= -8 ? 1 : 0.45;
  const redZoneChasePenalty =
    state.scoreDiff <= -4 && state.scoreDiff >= -8
      ? 0.06 *
        clamp((420 - state.gameSecondsRemaining) / 240, 0, 1) *
        clamp((30 - state.yardline100) / 30, 0, 1)
      : 0;
  const timeoutScarcity = (3 - state.offenseTimeouts) / 3;
  const timeoutPenalty =
    state.scoreDiff <= -4 && state.scoreDiff >= -8
      ? 0.045 * timeoutScarcity * urgencyFactor * scoringFactor
      : 0;
  return (
    0.032 * urgencyFactor * scoringFactor * trailingTouchdownFactor +
    redZoneChasePenalty +
    timeoutPenalty
  );
}

function lateGamePuntPenalty(state) {
  if (state.scoreDiff >= 0 || state.gameSecondsRemaining > 900) {
    return 0;
  }

  const urgencyFactor = clamp((900 - state.gameSecondsRemaining) / 600, 0.15, 1);
  const fieldFactor = clamp((70 - state.yardline100) / 70, 0.1, 1);
  const distanceFactor = clamp(1 - (state.ydstogo - 1) / 8, 0.2, 1);
  const timeoutScarcity = (3 - state.offenseTimeouts) / 3;
  return 0.035 * urgencyFactor * fieldFactor * distanceFactor * (1 + 0.75 * timeoutScarcity);
}

function lateGameConversionSuccessBoost(state, successState) {
  if (
    state.scoreDiff > -4 ||
    state.scoreDiff < -8 ||
    state.gameSecondsRemaining > 420 ||
    state.yardline100 > 30 ||
    state.ydstogo > 3 ||
    !successState.offenseHasBall
  ) {
    return 0;
  }

  const urgencyFactor = clamp((420 - state.gameSecondsRemaining) / 240, 0.2, 1);
  const fieldFactor = clamp((30 - state.yardline100) / 25, 0.15, 1);
  const distanceFactor = clamp(1 - (state.ydstogo - 1) / 3, 0.35, 1);
  const postConversionFieldFactor = clamp((18 - successState.yardline100) / 18, 0.2, 1);
  const defenseTimeoutBenefit =
    0.06 *
    ((3 - state.defenseTimeouts) / 3) *
    urgencyFactor *
    fieldFactor *
    distanceFactor *
    postConversionFieldFactor;
  const mustHaveTdBoost =
    state.gameSecondsRemaining <= 240 && state.yardline100 <= 25
      ? 0.16 *
        clamp((240 - state.gameSecondsRemaining) / 120, 0.35, 1) *
        clamp((25 - state.yardline100) / 18, 0.25, 1) *
        distanceFactor *
        postConversionFieldFactor
      : 0;
  return (
    0.12 * urgencyFactor * fieldFactor * distanceFactor * postConversionFieldFactor +
    defenseTimeoutBenefit +
    mustHaveTdBoost
  );
}

function lateGameTouchdownSuccessBoost(state) {
  if (
    state.scoreDiff > -4 ||
    state.scoreDiff < -8 ||
    state.gameSecondsRemaining > 420 ||
    state.yardline100 > 10
  ) {
    return 0;
  }

  const urgencyFactor = clamp((420 - state.gameSecondsRemaining) / 240, 0.25, 1);
  const fieldFactor = clamp((10 - state.yardline100) / 9, 0.35, 1);
  const timeoutFactor = 0.8 + 0.2 * (state.offenseTimeouts / 3);
  return 0.15 * urgencyFactor * fieldFactor * timeoutFactor;
}

function lateGameGoalToGoSuccessDisplayFloor(state) {
  if (
    state.scoreDiff > -4 ||
    state.scoreDiff < -8 ||
    state.gameSecondsRemaining > 420 ||
    state.yardline100 > 10 ||
    state.ydstogo < state.yardline100
  ) {
    return 0;
  }

  const urgencyFactor = clamp((420 - state.gameSecondsRemaining) / 240, 0.25, 1);
  const timeoutFactor = 0.9 + 0.1 * (state.offenseTimeouts / 3);
  return clamp(0.74 + 0.08 * urgencyFactor * timeoutFactor, 0.0001, 0.86);
}

function lateFieldGoalDeficitSuccessDisplayCap(state, successState, currentWP) {
  if (
    state.scoreDiff < -3 ||
    state.scoreDiff >= 0 ||
    state.gameSecondsRemaining > 600 ||
    !successState.offenseHasBall ||
    successState.yardline100 <= 12
  ) {
    return 1;
  }

  const fieldBonus = clamp((35 - successState.yardline100) / 23, 0, 1);
  const urgencyBonus = clamp((600 - state.gameSecondsRemaining) / 420, 0, 1);
  const maxGain = 0.16 + 0.09 * fieldBonus + 0.03 * urgencyBonus;
  return clamp(currentWP + maxGain, 0.0001, 0.9999);
}

function lateGameNeedStopTimeoutAdjustment(state) {
  if (state.scoreDiff >= 0 || state.gameSecondsRemaining > 420) {
    return 0;
  }

  const urgencyFactor = clamp((420 - state.gameSecondsRemaining) / 300, 0.15, 1);
  const trailingOneScoreFactor = state.scoreDiff >= -8 ? 1 : 0.45;
  const timeoutFactor = (state.offenseTimeouts - 2) / 3;
  return 0.028 * timeoutFactor * urgencyFactor * trailingOneScoreFactor;
}

function lateOneScoreCurrentWpBoost(state) {
  if (
    state.scoreDiff > -4 ||
    state.scoreDiff < -8 ||
    state.gameSecondsRemaining > 420 ||
    state.yardline100 > 35
  ) {
    return 0;
  }

  const urgencyFactor = clamp((420 - state.gameSecondsRemaining) / 240, 0.2, 1);
  const fieldFactor = clamp((35 - state.yardline100) / 30, 0.15, 1);
  const timeoutScarcity = (3 - state.offenseTimeouts) / 3;
  const timeoutPenalty = 0.03 * timeoutScarcity * urgencyFactor * fieldFactor;
  const lateRedZoneBoost =
    state.gameSecondsRemaining <= 240 && state.yardline100 <= 25
      ? 0.11 * clamp((240 - state.gameSecondsRemaining) / 120, 0.35, 1) *
        clamp((25 - state.yardline100) / 20, 0.2, 1)
      : 0;
  const goalLineBoost =
    state.gameSecondsRemaining <= 240 && state.yardline100 <= 5
      ? 0.035 *
        clamp((5 - state.yardline100) / 4, 0.25, 1) *
        clamp(state.ydstogo / Math.max(state.yardline100, 1), 0.4, 1)
      : 0;
  return lateRedZoneBoost + goalLineBoost - timeoutPenalty;
}

function calibrateGoWp(rawWp, state) {
  const adjustment = 0.01 + (state.ydstogo <= 2 ? 0.008 : 0);
  return clamp(rawWp - adjustment, 0.0001, 0.9999);
}

function calibrateFieldGoalWp(rawWp, kickDistance) {
  const distanceAdjustment = 0.015 + 0.0009 * Math.max(0, kickDistance - 20);
  return clamp(rawWp - distanceAdjustment, 0.0001, 0.9999);
}

function calibratePuntWp(rawWp) {
  return clamp(rawWp - 0.028, 0.0001, 0.9999);
}

export function buildArtifacts(decisionInputs, wpInputs) {
  return {
    decisionInputs,
    wpInputs,
    decisionIndex: buildDecisionIndex(decisionInputs),
    wpIndex: buildWpIndex(wpInputs),
    calibrationIndex: buildCalibrationIndex(decisionInputs.current_wp_calibration),
  };
}

function calibrateCurrentWp(calibrationIndex, rawWp, state) {
  if (calibrationIndex.kind !== "current_wp_calibration_v1") {
    return rawWp;
  }

  const coefficients = calibrationIndex.coefficients ?? {};
  const safeRawWp = clamp(rawWp, 0.0001, 0.9999);
  const rawLogit = Math.log(safeRawWp / (1 - safeRawWp));
  const timeFrac = clamp(state.gameSecondsRemaining, 0, 3600) / 3600;
  const features = {
    raw_logit: rawLogit,
    score_diff: state.scoreDiff,
    score_diff_sq: state.scoreDiff ** 2,
    time_frac: timeFrac,
    yardline_100: state.yardline100,
    yardline_sq: state.yardline100 ** 2,
    ydstogo: state.ydstogo,
    ydstogo_sq: state.ydstogo ** 2,
    posteam_spread: state.posteamSpread,
    total_line: state.totalLine,
    score_diff_x_time: state.scoreDiff * timeFrac,
    yardline_x_time: state.yardline100 * timeFrac,
  };

  let logit = coefficients["(Intercept)"] ?? 0;
  for (const [key, value] of Object.entries(features)) {
    logit += (coefficients[key] ?? 0) * value;
  }

  return clamp(logistic(logit), 0.0001, 0.9999);
}

export function evaluateDecision(artifacts, rawState) {
  const state = normalizeState(rawState);
  const { decisionIndex, wpIndex, calibrationIndex } = artifacts;

  const rawCurrentWp = wpForPerspective(wpIndex, state, true);
  const shortGoOutcome =
    state.ydstogo <= 2
      ? lookupShortGoOutcome(decisionIndex, state.ydstogo, state.yardline100)
      : null;
  const conversionProbability =
    shortGoOutcome?.conversionProbability ??
    lookupConversionRate(decisionIndex, state.ydstogo, state.yardline100);
  const kickDistance = state.yardline100 + 17;
  const fieldGoalProbability = lookupFieldGoalRate(decisionIndex, kickDistance);
  const puntStartYardline100 = lookupPuntStart(decisionIndex, state.yardline100);
  const goSuccessState = makeSuccessState(state, shortGoOutcome?.successNewYardline100 ?? null);
  const goFailureState = makeFailureState(state, shortGoOutcome?.failureNewYardline100 ?? null);
  const fgSuccessState = makeFieldGoalSuccessState(state);
  const fgFailureState = makeFieldGoalFailureState(state);
  const puntState = makePuntState(state, puntStartYardline100);

  const goSuccessWp = wpForPerspective(
    wpIndex,
    goSuccessState,
    goSuccessState.offenseHasBall
  );
  const goSuccessWpAdjusted = clamp(
    goSuccessWp +
      (goSuccessState.offenseHasBall
        ? lateGameConversionSuccessBoost(state, goSuccessState)
        : lateGameTouchdownSuccessBoost(state)),
    0.0001,
    0.9999
  );
  const goSuccessDisplayWp = goSuccessState.offenseHasBall
    ? clamp(
        calibrateCurrentWp(calibrationIndex, goSuccessWp, goSuccessState) +
          lateOneScoreCurrentWpBoost(goSuccessState),
        0.0001,
        0.9999
      )
    : goSuccessWpAdjusted;
  const needStopTimeoutAdjustment = lateGameNeedStopTimeoutAdjustment(state);
  const goFailureWp = clamp(
    wpForPerspective(wpIndex, goFailureState, false) + needStopTimeoutAdjustment,
    0.0001,
    0.9999
  );
  const goalToGoConversionScores = state.ydstogo >= state.yardline100;
  const goTouchdownProbability = goalToGoConversionScores
    ? conversionProbability
    : shortGoOutcome?.touchdownProbability ?? 0;
  const goSuccessNonTdProbability = goalToGoConversionScores
    ? 0
    : shortGoOutcome
      ? shortGoOutcome.successNonTdProbability
      : conversionProbability;
  const goTouchdownState =
    goTouchdownProbability > 0 ? makeSuccessState(state, 0) : null;
  const goTouchdownWp = goTouchdownState
    ? clamp(
        wpForPerspective(wpIndex, goTouchdownState, false) +
          lateGameTouchdownSuccessBoost(state),
        0.0001,
        0.9999
      )
    : null;
  const rawGoWp = clamp(
    (goTouchdownWp !== null
      ? goTouchdownProbability * goTouchdownWp +
        goSuccessNonTdProbability * goSuccessWpAdjusted +
        (1 - goTouchdownProbability - goSuccessNonTdProbability) * goFailureWp
      : conversionProbability * goSuccessWpAdjusted + (1 - conversionProbability) * goFailureWp) +
      shortYardageGoBonus(state) +
      lateGameGoBonus(state),
    0.0001,
    0.9999
  );
  const rawGoCalibrated = calibrateGoWp(rawGoWp, state);

  const fgSuccessWp = clamp(
    wpForPerspective(wpIndex, fgSuccessState, false) + needStopTimeoutAdjustment,
    0.0001,
    0.9999
  );
  const fgFailureWp = clamp(
    wpForPerspective(wpIndex, fgFailureState, false) + needStopTimeoutAdjustment,
    0.0001,
    0.9999
  );
  const rawFgWp = clamp(
    fieldGoalProbability * fgSuccessWp +
      (1 - fieldGoalProbability) * fgFailureWp -
      shortYardageFieldGoalPenalty(state) -
      lateGameFieldGoalPenalty(state),
    0.0001,
    0.9999
  );
  const rawFgCalibrated = calibrateFieldGoalWp(rawFgWp, kickDistance);

  const rawPuntWp = clamp(
    wpForPerspective(wpIndex, puntState, false) +
      needStopTimeoutAdjustment -
      shortYardagePuntPenalty(state) -
      lateGamePuntPenalty(state),
    0.0001,
    0.9999
  );
  const rawPuntCalibrated = calibratePuntWp(rawPuntWp);

  const calibratedCurrentWP = clamp(
    calibrateCurrentWp(calibrationIndex, rawCurrentWp, state) + lateOneScoreCurrentWpBoost(state),
    0.0001,
    0.9999
  );
  const uncappedConditionalGoSuccessWP =
    goalToGoConversionScores && goTouchdownWp !== null
      ? Math.max(goTouchdownWp, lateGameGoalToGoSuccessDisplayFloor(state))
      : goTouchdownWp !== null && conversionProbability > 0
      ? clamp(
          (goTouchdownProbability * goTouchdownWp +
            goSuccessNonTdProbability * goSuccessDisplayWp) /
            conversionProbability,
          0.0001,
          0.9999
        )
      : goSuccessDisplayWp;
  const conditionalGoSuccessWP = Math.min(
    uncappedConditionalGoSuccessWP,
    lateFieldGoalDeficitSuccessDisplayCap(state, goSuccessState, calibratedCurrentWP)
  );
  const goWP = clamp(calibratedCurrentWP + (rawGoCalibrated - rawCurrentWp), 0.0001, 0.9999);
  const fgWP = clamp(calibratedCurrentWP + (rawFgCalibrated - rawCurrentWp), 0.0001, 0.9999);
  const puntWP = clamp(calibratedCurrentWP + (rawPuntCalibrated - rawCurrentWp), 0.0001, 0.9999);

  const options = [
    { key: "go", label: "Go for it", wp: goWP },
    { key: "fieldGoal", label: "Kick field goal", wp: fgWP },
    { key: "punt", label: "Punt", wp: puntWP },
  ].sort((a, b) => b.wp - a.wp);

  const best = options[0];
  const second = options[1];
  const edge = best.wp - second.wp;

  let confidence = "toss-up";
  let label = best.label;
  if (edge >= 0.04) {
    confidence = "strong";
    label = best.label;
  } else if (edge >= 0.015) {
    confidence = "lean";
    label = `Lean ${best.label}`;
  } else {
    confidence = "toss-up";
    label = `Toss-up: ${best.label} or ${second.label}`;
  }

  const currentWP = Math.min(calibratedCurrentWP, best.wp);

  return {
    state: {
      quarter: state.quarter ?? null,
      gameSecondsRemaining: state.gameSecondsRemaining,
      scoreDiff: state.scoreDiff,
      ydstogo: state.ydstogo,
      yardline100: state.yardline100,
      down: state.down,
      offenseTimeouts: state.offenseTimeouts,
      defenseTimeouts: state.defenseTimeouts,
      posteamSpread: state.posteamSpread,
      totalLine: state.totalLine,
    },
    currentWP: round(currentWP),
    assumptions: {
      conversionProbability: round(conversionProbability),
      fieldGoalProbability: round(fieldGoalProbability),
      estimatedKickDistance: round(kickDistance, 1),
      estimatedPuntStartYardline100: round(puntStartYardline100, 1),
      goSuccessWP: round(conditionalGoSuccessWP),
      goFailureWP: round(goFailureWp),
      fgSuccessWP: round(fgSuccessWp),
      fgFailureWP: round(fgFailureWp),
    },
    options: {
      go: round(goWP),
      fieldGoal: round(fgWP),
      punt: round(puntWP),
    },
    recommendation: {
      key: best.key,
      label,
      primaryLabel: best.label,
      secondaryLabel: second.label,
      confidence,
      edgeOverSecondBest: round(edge),
    },
  };
}
