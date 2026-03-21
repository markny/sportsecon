function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

const conversionProbabilityTable = {
  1: 0.72,
  2: 0.63,
  3: 0.57,
  4: 0.51,
  5: 0.45,
  6: 0.4,
  7: 0.36,
  8: 0.32,
  9: 0.29,
  10: 0.26
};

const expectedPointsAnchors = [
  { yardLine: 1, points: -0.5 },
  { yardLine: 10, points: -0.5 },
  { yardLine: 20, points: 0.1 },
  { yardLine: 30, points: 0.6 },
  { yardLine: 40, points: 1.0 },
  { yardLine: 50, points: 1.5 },
  { yardLine: 60, points: 2.0 },
  { yardLine: 70, points: 2.6 },
  { yardLine: 80, points: 3.2 },
  { yardLine: 90, points: 4.2 },
  { yardLine: 99, points: 5.2 }
];

const fieldGoalSuccessAnchors = [
  { distance: 20, rate: 0.995 },
  { distance: 25, rate: 0.985 },
  { distance: 30, rate: 0.93 },
  { distance: 35, rate: 0.78 },
  { distance: 40, rate: 0.69 },
  { distance: 45, rate: 0.57 },
  { distance: 50, rate: 0.45 },
  { distance: 55, rate: 0.33 },
  { distance: 60, rate: 0.24 },
  { distance: 65, rate: 0.12 }
];

const denseSurfaceState = {
  ready: false,
  dimensions: null,
  index: new Map()
};

function parseClock(timeRemaining) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeRemaining).trim());

  if (!match) {
    return 15 * 60;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return clamp(minutes * 60 + seconds, 0, 15 * 60);
}

function formatClockFromSeconds(seconds) {
  const normalized = clamp(Math.round(seconds), 0, 15 * 60);
  const minutes = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getGameSecondsRemaining(input) {
  const secondsInQuarter = parseClock(input.timeRemaining);
  const quartersAfterCurrent = Math.max(0, 4 - input.quarter);
  return quartersAfterCurrent * 15 * 60 + secondsInQuarter;
}

function normalizeInput(input) {
  return {
    yardLine: clamp(Math.round(Number(input.yardLine) || 1), 1, 99),
    yardsToGo: clamp(Math.round(Number(input.yardsToGo) || 1), 1, 25),
    quarter: clamp(Math.round(Number(input.quarter) || 1), 1, 4),
    timeRemaining: input.timeRemaining,
    scoreDifferential: clamp(Math.round(Number(input.scoreDifferential) || 0), -30, 30)
  };
}

function interpolateAnchors(value, anchors, key, outputKey) {
  const minimum = anchors[0][key];
  const maximum = anchors[anchors.length - 1][key];
  const normalized = clamp(value, minimum, maximum);

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const current = anchors[index];

    if (normalized <= current[key]) {
      const span = current[key] - previous[key];
      const progress = span === 0 ? 0 : (normalized - previous[key]) / span;
      return previous[outputKey] + (current[outputKey] - previous[outputKey]) * progress;
    }
  }

  return anchors[anchors.length - 1][outputKey];
}

function interpolateExpectedPoints(yardLine) {
  return interpolateAnchors(yardLine, expectedPointsAnchors, "yardLine", "points");
}

function getConversionProbability(yardsToGo) {
  const normalizedYardsToGo = clamp(Math.round(yardsToGo), 1, 25);

  if (normalizedYardsToGo <= 10) {
    return conversionProbabilityTable[normalizedYardsToGo];
  }

  return clamp(0.26 - (normalizedYardsToGo - 10) * 0.015, 0.12, 0.26);
}

function getSituationAdjustedConversionProbability(input) {
  let rate = getConversionProbability(input.yardsToGo);

  if (input.yardsToGo <= 2) {
    rate += 0.03;
  } else if (input.yardsToGo <= 4) {
    rate += 0.015;
  }

  if (input.scoreDifferential <= -7) {
    rate += 0.02;
  } else if (input.scoreDifferential <= -3) {
    rate += 0.01;
  }

  if (input.quarter <= 2 && input.yardLine >= 40 && input.yardLine <= 65) {
    rate += 0.015;
  }

  if (input.quarter === 4 && getGameSecondsRemaining(input) <= 10 * 60 && input.scoreDifferential < 0) {
    rate += 0.02;
  }

  return clamp(rate, 0.08, 0.95);
}

function getFieldGoalSuccessRate(distance) {
  return interpolateAnchors(distance, fieldGoalSuccessAnchors, "distance", "rate");
}

function getNetPuntDistance(yardLine) {
  if (yardLine < 40) return 38;
  if (yardLine <= 59) return 34;
  if (yardLine <= 74) return 28;
  if (yardLine <= 84) return 20;
  return 12;
}

function getOpponentStartAfterMissedFieldGoal(yardLine) {
  const kickSpotYardLine = clamp(yardLine - 7, 1, 99);
  const opponentStart = 100 - kickSpotYardLine;
  return clamp(Math.max(20, opponentStart), 1, 99);
}

function estimateStateWinProbability(state) {
  const totalSecondsRemaining = clamp(state.totalSecondsRemaining, 1, 4 * 15 * 60);
  const lateGameWeight = 1 - totalSecondsRemaining / (4 * 15 * 60);
  const fieldAdvantage = state.offenseHasBall
    ? (state.yardLine - 50) / 50
    : (50 - state.yardLine) / 50;

  let index =
    state.scoreDifferential * (0.12 + 0.24 * lateGameWeight) +
    (state.offenseHasBall ? 1 : -1) * (0.06 + 0.66 * lateGameWeight) +
    fieldAdvantage * (0.68 - 0.14 * lateGameWeight);

  if (state.scoreDifferential > 0 && lateGameWeight > 0.85) {
    const leadWeight = Math.min(state.scoreDifferential, 8) / 8;

    if (state.offenseHasBall) {
      index += 1.45 * leadWeight * (state.yardLine / 100) * lateGameWeight;
    } else {
      index += 0.55 * leadWeight * ((100 - state.yardLine) / 100) * lateGameWeight;
    }
  }

  if (state.scoreDifferential < 0 && lateGameWeight > 0.75) {
    const trailWeight = Math.min(Math.abs(state.scoreDifferential), 8) / 8;

    if (state.offenseHasBall) {
      index += 0.7 * trailWeight * (state.yardLine / 100) * lateGameWeight;
    } else {
      index -= 0.22 * trailWeight * ((100 - state.yardLine) / 100) * lateGameWeight;
    }
  }

  return clamp(logistic(index), 0.01, 0.99);
}

function estimateDecisionWinProbabilities(input, details) {
  const totalSecondsRemaining = getGameSecondsRemaining(input);
  const goSuccessWinProbability = estimateStateWinProbability({
    offenseHasBall: true,
    yardLine: details.successfulConversionYardLine,
    scoreDifferential: input.scoreDifferential,
    totalSecondsRemaining: totalSecondsRemaining
  });
  const goFailureWinProbability = estimateStateWinProbability({
    offenseHasBall: false,
    yardLine: 100 - input.yardLine,
    scoreDifferential: input.scoreDifferential,
    totalSecondsRemaining: totalSecondsRemaining
  });

  const puntWinProbability = estimateStateWinProbability({
    offenseHasBall: false,
    yardLine: details.opponentStartAfterPunt,
    scoreDifferential: input.scoreDifferential,
    totalSecondsRemaining: totalSecondsRemaining
  });

  const fieldGoalMakeWinProbability = estimateStateWinProbability({
    offenseHasBall: false,
    yardLine: 25,
    scoreDifferential: input.scoreDifferential + 3,
    totalSecondsRemaining: totalSecondsRemaining
  });
  const fieldGoalMissWinProbability = estimateStateWinProbability({
    offenseHasBall: false,
    yardLine: details.opponentStartAfterMissedFieldGoal,
    scoreDifferential: input.scoreDifferential,
    totalSecondsRemaining: totalSecondsRemaining
  });

  let goWinProbability =
    details.conversionRate * goSuccessWinProbability +
    (1 - details.conversionRate) * goFailureWinProbability;

  let fieldGoalWinProbability =
    details.fieldGoalSuccessRate * fieldGoalMakeWinProbability +
    (1 - details.fieldGoalSuccessRate) * fieldGoalMissWinProbability;

  if (
    input.quarter === 4 &&
    totalSecondsRemaining <= 5 * 60 &&
    input.scoreDifferential > 0 &&
    input.scoreDifferential <= 3 &&
    input.yardLine >= 75
  ) {
    goWinProbability += 0.09;
    fieldGoalWinProbability -= 0.03;
  }

  if (
    input.quarter <= 2 &&
    Math.abs(input.scoreDifferential) <= 3 &&
    input.yardLine >= 45 &&
    input.yardLine <= 60
  ) {
    goWinProbability += 0.015;
    details.puntWinProbabilityAdjustment = -0.01;
  }

  if (
    input.quarter === 4 &&
    totalSecondsRemaining <= 10 * 60 &&
    input.scoreDifferential < 0
  ) {
    goWinProbability += input.scoreDifferential <= -7 ? 0.06 : 0.035;
    fieldGoalWinProbability += input.scoreDifferential >= -3 ? 0.005 : -0.02;
  }

  if (input.quarter <= 2 && input.scoreDifferential <= -7) {
    goWinProbability += 0.05;
    fieldGoalWinProbability -= 0.015;
    details.puntWinProbabilityAdjustment = (details.puntWinProbabilityAdjustment || 0) - 0.025;
  }

  return {
    goWinProbability: clamp(goWinProbability, 0.01, 0.99),
    puntWinProbability: clamp(
      puntWinProbability + (details.puntWinProbabilityAdjustment || 0),
      0.01,
      0.99
    ),
    fieldGoalWinProbability: clamp(fieldGoalWinProbability, 0.01, 0.99),
    goSuccessWinProbability: goSuccessWinProbability,
    goFailureWinProbability: goFailureWinProbability,
    fieldGoalMakeWinProbability: fieldGoalMakeWinProbability,
    fieldGoalMissWinProbability: fieldGoalMissWinProbability
  };
}

function getLateGameAdjustments(input) {
  if (input.quarter !== 4) {
    return { go: 0, fieldGoal: 0, punt: 0 };
  }

  const secondsRemaining = parseClock(input.timeRemaining);
  const lateWeight = clamp((480 - secondsRemaining) / 480, 0, 1);
  const scoreWeight = clamp(Math.abs(input.scoreDifferential) / 14, 0, 1);

  if (input.scoreDifferential < 0) {
    return {
      go: 0.18 * lateWeight * Math.max(scoreWeight, 0.35),
      fieldGoal: input.scoreDifferential >= -3
        ? 0.04 * lateWeight * Math.max(scoreWeight, 0.35)
        : -0.03 * lateWeight * scoreWeight,
      punt: -0.16 * lateWeight * Math.max(scoreWeight, 0.5)
    };
  }

  if (input.scoreDifferential > 0) {
    return {
      go: -0.08 * lateWeight * Math.max(scoreWeight, 0.25),
      fieldGoal: 0.08 * lateWeight * Math.max(scoreWeight, 0.25),
      punt: 0.12 * lateWeight * Math.max(scoreWeight, 0.25)
    };
  }

  return { go: 0, fieldGoal: 0, punt: 0 };
}

function findBracket(value, orderedValues) {
  const minimum = orderedValues[0];
  const maximum = orderedValues[orderedValues.length - 1];
  const normalized = clamp(value, minimum, maximum);

  if (normalized <= minimum) {
    return { lower: minimum, upper: minimum, weight: 0 };
  }

  for (let index = 1; index < orderedValues.length; index += 1) {
    const upper = orderedValues[index];

    if (normalized <= upper) {
      const lower = orderedValues[index - 1];
      const span = upper - lower;
      return {
        lower: lower,
        upper: upper,
        weight: span === 0 ? 0 : (normalized - lower) / span
      };
    }
  }

  return { lower: maximum, upper: maximum, weight: 0 };
}

function scenarioKey(input) {
  return `${input.yardLine}|${input.yardsToGo}|${input.quarter}|${input.timeRemaining}|${input.scoreDifferential}`;
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();

    if (!normalized || normalized === "NA") {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function loadDenseSurface(surface) {
  denseSurfaceState.ready = false;
  denseSurfaceState.index = new Map();
  denseSurfaceState.dimensions = null;

  if (!surface?.dimensions || !Array.isArray(surface.scenarios)) {
    return false;
  }

  denseSurfaceState.dimensions = {
    yardLines: surface.dimensions.yardLines.slice().sort((a, b) => a - b),
    yardsToGo: surface.dimensions.yardsToGo.slice().sort((a, b) => a - b),
    quarters: surface.dimensions.quarters.slice().sort((a, b) => a - b),
    timeSeconds: surface.dimensions.timeRemaining
      .map(function (value) {
        return parseClock(value);
      })
      .sort((a, b) => a - b),
    scoreDiffs: surface.dimensions.scoreDiffs.slice().sort((a, b) => a - b)
  };

  for (const scenario of surface.scenarios) {
    denseSurfaceState.index.set(scenario.key, scenario.output);
  }

  denseSurfaceState.ready = true;
  return true;
}

function getDenseSurfaceEstimate(input) {
  if (!denseSurfaceState.ready) {
    return null;
  }

  const dimensions = denseSurfaceState.dimensions;
  const yardBracket = findBracket(input.yardLine, dimensions.yardLines);
  const scoreBracket = findBracket(input.scoreDifferential, dimensions.scoreDiffs);
  const timeBracket = findBracket(parseClock(input.timeRemaining), dimensions.timeSeconds);
  const yardsBracket = findBracket(input.yardsToGo, dimensions.yardsToGo);
  const quarterBracket = findBracket(input.quarter, dimensions.quarters);

  const weightsByMetric = [
    [yardBracket.lower, yardBracket.upper, yardBracket.weight],
    [yardsBracket.lower, yardsBracket.upper, yardsBracket.weight],
    [quarterBracket.lower, quarterBracket.upper, quarterBracket.weight],
    [timeBracket.lower, timeBracket.upper, timeBracket.weight],
    [scoreBracket.lower, scoreBracket.upper, scoreBracket.weight]
  ];

  const accumulators = {
    goWinProb: { weightedSum: 0, totalWeight: 0 },
    puntWinProb: { weightedSum: 0, totalWeight: 0 },
    fgWinProb: { weightedSum: 0, totalWeight: 0 },
    firstDownProb: { weightedSum: 0, totalWeight: 0 },
    fgMakeProb: { weightedSum: 0, totalWeight: 0 }
  };

  for (let mask = 0; mask < 32; mask += 1) {
    const yardLine = (mask & 1) ? weightsByMetric[0][1] : weightsByMetric[0][0];
    const yardsToGo = (mask & 2) ? weightsByMetric[1][1] : weightsByMetric[1][0];
    const quarter = (mask & 4) ? weightsByMetric[2][1] : weightsByMetric[2][0];
    const timeRemaining = formatClockFromSeconds((mask & 8) ? weightsByMetric[3][1] : weightsByMetric[3][0]);
    const scoreDifferential = (mask & 16) ? weightsByMetric[4][1] : weightsByMetric[4][0];

    const weight =
      ((mask & 1) ? yardBracket.weight : 1 - yardBracket.weight) *
      ((mask & 2) ? yardsBracket.weight : 1 - yardsBracket.weight) *
      ((mask & 4) ? quarterBracket.weight : 1 - quarterBracket.weight) *
      ((mask & 8) ? timeBracket.weight : 1 - timeBracket.weight) *
      ((mask & 16) ? scoreBracket.weight : 1 - scoreBracket.weight);

    if (weight <= 0) {
      continue;
    }

    const output = denseSurfaceState.index.get(
      scenarioKey({ yardLine, yardsToGo, quarter, timeRemaining, scoreDifferential })
    );

    if (!output) {
      continue;
    }

    Object.keys(accumulators).forEach(function (metric) {
      const numericValue = toFiniteNumber(output[metric]);

      if (numericValue == null) {
        return;
      }

      accumulators[metric].weightedSum += numericValue * weight;
      accumulators[metric].totalWeight += weight;
    });
  }

  const result = {};

  Object.keys(accumulators).forEach(function (metric) {
    const accumulator = accumulators[metric];
    result[metric] = accumulator.totalWeight > 0
      ? accumulator.weightedSum / accumulator.totalWeight
      : null;
  });

  if (result.goWinProb == null || result.fgWinProb == null) {
    return null;
  }

  if (result.puntWinProb == null) {
    result.puntWinProb = estimatePuntFallbackFromSurface(input, result);
  }

  const options = [
    { label: "Go for It", winProbability: result.goWinProb },
    { label: "Punt", winProbability: result.puntWinProb },
    { label: "Field Goal", winProbability: result.fgWinProb }
  ];

  result.recommendation = options.reduce(function (best, option) {
    return option.winProbability > best.winProbability ? option : best;
  }).label;

  return result;
}

function estimatePuntFallbackFromSurface(input, result) {
  const lateGameAdjustments = getLateGameAdjustments(input);
  const penalty = input.yardLine >= 70 ? 0.01 + (input.yardLine - 70) * 0.0015 : 0;
  return clamp(
    Math.max(result.goWinProb, result.fgWinProb) - 0.012 + lateGameAdjustments.punt - penalty,
    0.01,
    0.99
  );
}

function buildExplanation(input, recommendation, conversionProbability, adjustments, fieldGoalDistance, winProbabilities, provenanceLabel) {
  const fieldPositionNote = input.yardLine >= 60
    ? "Field position already favors aggression because a turnover gives the opponent a short field."
    : "The baseline tradeoff is driven mostly by conversion odds versus surrendering field position.";

  const wpLens = " Estimated win probability: go " +
    Math.round(winProbabilities.goWinProbability * 100) +
    "%, punt " + Math.round(winProbabilities.puntWinProbability * 100) +
    "%, field goal " + Math.round(winProbabilities.fieldGoalWinProbability * 100) + "%.";

  const provenanceNote = provenanceLabel === "dense-cfb4th-surface"
    ? " This state is anchored to the dense cfb4th lookup surface with interpolation between nearby scenarios."
    : " This state falls back to the local approximation layer.";

  if (recommendation === "Go for It") {
    const urgencyNote = adjustments.go > 0.02
      ? "Trailing late slightly increases the value of keeping the ball."
      : "The updated model still leans toward offense here once possession value is included.";

    return fieldPositionNote + " A " + Math.round(conversionProbability * 100) +
      "% conversion estimate keeps going-for-it competitive. " + urgencyNote + wpLens + provenanceNote;
  }

  if (recommendation === "Field Goal") {
    const leverageNote = adjustments.fieldGoal > 0.02
      ? "Late-game context modestly supports taking near-certain points."
      : "The kick produces the cleanest blend of points and win probability in this range.";

    return fieldPositionNote + " From roughly " + fieldGoalDistance +
      " yards, the field goal remains credible enough to beat the alternatives. " + leverageNote + wpLens + provenanceNote;
  }

  const puntNote = adjustments.punt > 0.02
    ? "Protecting field position matters a bit more when leading late."
    : "The field-position swing from the punt slightly outweighs the offensive upside in this game state.";

  return fieldPositionNote + " " + puntNote + wpLens + provenanceNote;
}

function evaluateFourthDownDecision(rawInput) {
  const input = normalizeInput(rawInput);
  const conversionRate = getSituationAdjustedConversionProbability(input);
  const successfulConversionYardLine = clamp(input.yardLine + input.yardsToGo, 1, 99);
  const goSuccessValue = interpolateExpectedPoints(successfulConversionYardLine);
  const goFailureValue = -interpolateExpectedPoints(100 - input.yardLine);
  const baseGoExpectedValue =
    conversionRate * goSuccessValue + (1 - conversionRate) * goFailureValue;

  const fieldGoalDistance = 117 - input.yardLine;
  const fieldGoalSuccessRate = getFieldGoalSuccessRate(fieldGoalDistance);
  const opponentStartAfterMissedFieldGoal = getOpponentStartAfterMissedFieldGoal(input.yardLine);
  const fieldGoalMissValue = -interpolateExpectedPoints(opponentStartAfterMissedFieldGoal);
  const baseFieldGoalExpectedValue =
    fieldGoalSuccessRate * 3 + (1 - fieldGoalSuccessRate) * fieldGoalMissValue;

  const netPuntDistance = getNetPuntDistance(input.yardLine);
  const grossFieldPositionAfterPunt = input.yardLine + netPuntDistance;
  const opponentStartAfterPunt = grossFieldPositionAfterPunt >= 100
    ? 20
    : clamp(100 - grossFieldPositionAfterPunt, 1, 99);
  const basePuntExpectedValue = -interpolateExpectedPoints(opponentStartAfterPunt);

  const adjustments = getLateGameAdjustments(input);
  const goExpectedValue = baseGoExpectedValue + adjustments.go;
  const puntExpectedValue = basePuntExpectedValue + adjustments.punt;
  const fieldGoalExpectedValue = baseFieldGoalExpectedValue + adjustments.fieldGoal;

  const approximatedWinProbabilities = estimateDecisionWinProbabilities(input, {
    conversionRate: conversionRate,
    successfulConversionYardLine: successfulConversionYardLine,
    opponentStartAfterPunt: opponentStartAfterPunt,
    opponentStartAfterMissedFieldGoal: opponentStartAfterMissedFieldGoal,
    fieldGoalSuccessRate: fieldGoalSuccessRate,
    puntWinProbabilityAdjustment: 0
  });

  const surfaceEstimate = getDenseSurfaceEstimate(input);
  const winProbabilities = surfaceEstimate
    ? {
        goWinProbability: surfaceEstimate.goWinProb,
        puntWinProbability: surfaceEstimate.puntWinProb,
        fieldGoalWinProbability: surfaceEstimate.fgWinProb,
        goSuccessWinProbability: approximatedWinProbabilities.goSuccessWinProbability,
        goFailureWinProbability: approximatedWinProbabilities.goFailureWinProbability,
        fieldGoalMakeWinProbability: approximatedWinProbabilities.fieldGoalMakeWinProbability,
        fieldGoalMissWinProbability: approximatedWinProbabilities.fieldGoalMissWinProbability
      }
    : approximatedWinProbabilities;

  const effectiveConversionRate = surfaceEstimate?.firstDownProb ?? conversionRate;
  const effectiveFieldGoalSuccessRate = surfaceEstimate?.fgMakeProb ?? fieldGoalSuccessRate;

  const options = [
    {
      label: "Go for It",
      winProbability: winProbabilities.goWinProbability,
      expectedValue: goExpectedValue
    },
    {
      label: "Punt",
      winProbability: winProbabilities.puntWinProbability,
      expectedValue: puntExpectedValue
    },
    {
      label: "Field Goal",
      winProbability: winProbabilities.fieldGoalWinProbability,
      expectedValue: fieldGoalExpectedValue
    }
  ];

  const bestOption = surfaceEstimate?.recommendation
    ? options.find(function (option) { return option.label === surfaceEstimate.recommendation; })
    : options.reduce(function (best, option) {
        if (option.winProbability !== best.winProbability) {
          return option.winProbability > best.winProbability ? option : best;
        }

        return option.expectedValue > best.expectedValue ? option : best;
      });

  const provenance = surfaceEstimate ? "dense-cfb4th-surface" : "local-approximation";

  return {
    context: input,
    recommendation: bestOption.label,
    explanation: buildExplanation(
      input,
      bestOption.label,
      effectiveConversionRate,
      adjustments,
      fieldGoalDistance,
      winProbabilities,
      provenance
    ),
    bestExpectedValue: bestOption.expectedValue,
    bestWinProbability: bestOption.winProbability,
    modelProvenance: provenance,
    goForIt: {
      expectedValue: goExpectedValue,
      conversionRate: effectiveConversionRate,
      winProbability: winProbabilities.goWinProbability,
      successWinProbability: winProbabilities.goSuccessWinProbability,
      failureWinProbability: winProbabilities.goFailureWinProbability
    },
    punt: {
      expectedValue: puntExpectedValue,
      winProbability: winProbabilities.puntWinProbability,
      opponentStartYardLine: opponentStartAfterPunt
    },
    fieldGoal: {
      expectedValue: fieldGoalExpectedValue,
      distance: fieldGoalDistance,
      isAvailable: true,
      successRate: effectiveFieldGoalSuccessRate,
      winProbability: winProbabilities.fieldGoalWinProbability,
      makeWinProbability: winProbabilities.fieldGoalMakeWinProbability,
      missWinProbability: winProbabilities.fieldGoalMissWinProbability,
      opponentStartAfterMiss: opponentStartAfterMissedFieldGoal
    }
  };
}

function formatFieldPosition(yardLine) {
  if (yardLine === 50) return "Midfield";
  if (yardLine < 50) return "Own " + yardLine;
  return "Opp " + (100 - yardLine);
}

function formatScoreDifferential(scoreDifferential) {
  if (scoreDifferential > 0) return "Leading by " + scoreDifferential;
  if (scoreDifferential < 0) return "Trailing by " + Math.abs(scoreDifferential);
  return "Tied game";
}

window.FourthDownModel = {
  evaluateFourthDownDecision: evaluateFourthDownDecision,
  formatFieldPosition: formatFieldPosition,
  formatScoreDifferential: formatScoreDifferential,
  loadDenseSurface: loadDenseSurface,
  isDenseSurfaceReady: function () {
    return denseSurfaceState.ready;
  }
};
