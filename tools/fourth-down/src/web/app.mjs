import { evaluateDecision, loadSimulatorArtifacts } from "../simulator/browser.mjs?v=20260501e";

const form = document.querySelector("#simulator-form");
const currentWpEl = document.querySelector("#current-wp");
const headlineExplainerEl = document.querySelector("#headline-explainer");
const recommendationTitleEl = document.querySelector("#recommendation-title");
const confidenceLabelEl = document.querySelector("#confidence-label");
const edgeLabelEl = document.querySelector("#edge-label");
const kickDistanceEl = document.querySelector("#kick-distance");
const summaryBandEl = document.querySelector("#summary-band");

const optionElements = {
  go: {
    container: document.querySelector(".result-card-go"),
    wp: document.querySelector("#go-wp"),
    note: document.querySelector("#go-note"),
    label: "Go for it",
  },
  fieldGoal: {
    container: document.querySelector(".result-card-fg"),
    wp: document.querySelector("#fg-wp"),
    note: document.querySelector("#fg-note"),
    label: "Kick field goal",
  },
  punt: {
    container: document.querySelector(".result-card-punt"),
    wp: document.querySelector("#punt-wp"),
    label: "Punt",
  },
};

const assumptionElements = {
  conversionProbability: document.querySelector("#conversion-prob"),
  fieldGoalProbability: document.querySelector("#fg-prob"),
  puntStart: document.querySelector("#punt-start"),
  posteamSpread: document.querySelector("#posteam-spread"),
  totalLine: document.querySelector("#total-line"),
};

let artifacts;
const sliderInputs = [...document.querySelectorAll('input[type="range"]')];
const yardlineInput = document.querySelector('input[name="yardline100"]');
const ydstogoInput = document.querySelector('input[name="ydstogo"]');

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.min(900, Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildExplanation(result) {
  const { recommendation, assumptions } = result;
  const edgePoints = (result.recommendation.edgeOverSecondBest * 100).toFixed(1);

  if (recommendation.confidence === "toss-up") {
    return `${recommendation.primaryLabel} and ${recommendation.secondaryLabel.toLowerCase()} are effectively tied here. The model sees only a ${edgePoints}-point gap between the top two choices.`;
  }

  if (recommendation.key === "go") {
    return `Going for it rates best because the estimated conversion chance is ${toPercent(
      assumptions.conversionProbability
    )} and the reward outweighs the downside in this field position.`;
  }

  if (recommendation.key === "fieldGoal") {
    return `The field goal grades out best because the estimated make rate is ${toPercent(
      assumptions.fieldGoalProbability
    )}, which beats the expected value of extending the drive or flipping field position.`;
  }

  return `Punting rates best here because the offensive alternatives do not recover enough win probability to justify the risk, while the expected punt still leaves the opponent relatively backed up.`;
}

function renderResult(result) {
  currentWpEl.textContent = toPercent(result.currentWP);
  recommendationTitleEl.textContent = result.recommendation.label;
  confidenceLabelEl.textContent = titleCase(result.recommendation.confidence);
  edgeLabelEl.textContent = `${(result.recommendation.edgeOverSecondBest * 100).toFixed(1)} pts`;
  kickDistanceEl.textContent = `${result.assumptions.estimatedKickDistance.toFixed(0)} yds`;
  headlineExplainerEl.textContent = buildExplanation(result);

  for (const [key, value] of Object.entries(result.options)) {
    const option = optionElements[key];
    option.wp.textContent = toPercent(value);
    if (key === "go") {
      option.note.textContent = `If converted: ${toPercent(
        result.assumptions.goSuccessWP
      )} | if stopped: ${toPercent(result.assumptions.goFailureWP)}`;
    }
    if (key === "fieldGoal") {
      option.note.textContent = `If made: ${toPercent(
        result.assumptions.fgSuccessWP
      )} | if missed: ${toPercent(result.assumptions.fgFailureWP)}`;
    }
    const isHighlighted =
      result.recommendation.primaryLabel === option.label ||
      (result.recommendation.confidence === "toss-up" &&
        result.recommendation.secondaryLabel === option.label);
    option.container.classList.toggle(
      "result-card-active",
      isHighlighted
    );
  }

  assumptionElements.conversionProbability.textContent = toPercent(
    result.assumptions.conversionProbability
  );
  assumptionElements.fieldGoalProbability.textContent = toPercent(
    result.assumptions.fieldGoalProbability
  );
  assumptionElements.puntStart.textContent = `${result.assumptions.estimatedPuntStartYardline100.toFixed(
    1
  )} yards from the opponent end zone`;
  assumptionElements.posteamSpread.textContent = formatSliderValue(
    "posteamSpread",
    -result.state.posteamSpread
  );
  assumptionElements.totalLine.textContent = `${result.state.totalLine.toFixed(1)}`;

  summaryBandEl.dataset.recommendation = result.recommendation.key;
}

function readFormState() {
  const formData = new FormData(form);
  const quarter = Number(formData.get("quarter"));
  const quarterSeconds = Number(formData.get("quarterSeconds"));

  return {
    quarter,
    secondsRemainingInQuarter: quarterSeconds,
    scoreDiff: Number(formData.get("scoreDiff")),
    ydstogo: Number(formData.get("ydstogo")),
    yardline100: Number(formData.get("yardline100")),
    offenseTimeouts: Number(formData.get("offenseTimeouts") ?? 3),
    defenseTimeouts: Number(formData.get("defenseTimeouts") ?? 3),
    posteamSpread: -Number(formData.get("posteamSpread")),
    totalLine: Number(formData.get("totalLine")),
  };
}

function formatSliderValue(name, value) {
  if (name === "yardline100") {
    const numericValue = Number(value);
    if (numericValue === 50) {
      return "Midfield";
    }
    if (numericValue > 50) {
      return `Own ${100 - numericValue}`;
    }
    return `Opp ${numericValue}`;
  }
  if (name === "posteamSpread") {
    const numericValue = Number(value);
    if (numericValue > 0) {
      return `+${numericValue.toFixed(1)}`;
    }
    return numericValue.toFixed(1);
  }
  if (name === "totalLine") {
    return Number(value).toFixed(1);
  }
  if (name === "quarterSeconds") {
    return formatClock(value);
  }
  return String(value);
}

function getYardsToGoDisplay() {
  const yardsToGo = Number(ydstogoInput.value);
  const yardline100 = Number(yardlineInput.value);
  if (yardsToGo === yardline100) {
    return `${yardsToGo} (Goal)`;
  }
  return String(yardsToGo);
}

function syncDependentSliders() {
  const yardline100 = Number(yardlineInput.value);
  const maxYardsToGo = Math.max(1, Math.min(20, yardline100));
  ydstogoInput.max = String(maxYardsToGo);

  if (Number(ydstogoInput.value) > maxYardsToGo) {
    ydstogoInput.value = String(maxYardsToGo);
  }
}

function syncSliderOutputs() {
  for (const input of sliderInputs) {
    const output = document.querySelector(`[data-output-for="${input.name}"]`);
    if (!output) {
      continue;
    }
    if (input.name === "ydstogo") {
      output.textContent = getYardsToGoDisplay();
      continue;
    }
    output.textContent = formatSliderValue(input.name, input.value);
  }
}

function syncSliderVisuals() {
  for (const input of sliderInputs) {
    const min = Number(input.min ?? 0);
    const max = Number(input.max ?? 100);
    const value = Number(input.value);
    if (max <= min) {
      continue;
    }

    let fillFraction = (value - min) / (max - min);
    if (input.classList.contains("is-reversed")) {
      fillFraction = (max - value) / (max - min);
    }

    input.style.setProperty("--fill-percent", `${(fillFraction * 100).toFixed(2)}%`);
  }
}

async function initialize() {
  headlineExplainerEl.textContent = "Loading simulator artifacts...";
  artifacts = await loadSimulatorArtifacts();
  renderResult(evaluateDecision(artifacts, readFormState()));
}

function updateResult() {
  syncDependentSliders();
  syncSliderOutputs();
  syncSliderVisuals();
  if (!artifacts) {
    return;
  }
  renderResult(evaluateDecision(artifacts, readFormState()));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  updateResult();
});

for (const input of sliderInputs) {
  input.addEventListener("input", updateResult);
}

form.addEventListener("change", updateResult);

syncDependentSliders();
syncSliderOutputs();
syncSliderVisuals();

initialize().catch((error) => {
  console.error(error);
  headlineExplainerEl.textContent =
    "The simulator could not load its model artifacts. Check the console for details.";
});
