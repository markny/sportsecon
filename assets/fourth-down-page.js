(function () {
  const form = document.getElementById("fourth-down-form");
  const output = document.getElementById("fourth-down-output");
  const yardLineInput = document.getElementById("yardLine");
  const yardLineDisplay = document.getElementById("yardLineDisplay");
  const yardLineValue = document.getElementById("yardLineValue");
  const advancedInputs = document.getElementById("advancedInputs");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode-button]"));
  const resetButton = document.getElementById("resetScenario");

  if (!form || !output || !window.FourthDownModel) {
    return;
  }

  const model = window.FourthDownModel;
  const defaults = {
    yardLine: 58,
    yardsToGo: 4,
    quarter: 4,
    timeRemaining: "08:42",
    scoreDifferential: -3,
    offenseTimeouts: 3,
    defenseTimeouts: 3,
    pregameSpread: -3,
    overUnder: 52,
    receivesSecondHalfKickoff: "yes"
  };

  let currentMode = "simple";

  function toFixed(value) {
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function toPercent(value) {
    return (Math.round(value * 1000) / 10).toFixed(1) + "%";
  }

  function toSignedPercent(value) {
    if (Math.abs(value) < 0.0005) {
      return "Best option";
    }

    const rounded = (Math.round(Math.abs(value) * 1000) / 10).toFixed(1) + "%";
    return "-" + rounded + " vs best";
  }

  function getFieldPositionLabel(yardLine) {
    return model.formatFieldPosition(Number(yardLine)).replace(/^Opp\s/, "Opponent ");
  }

  function updateYardLineDisplay() {
    if (!yardLineInput || !yardLineDisplay || !yardLineValue) {
      return;
    }

    const yardLine = Number(yardLineInput.value || defaults.yardLine);
    yardLineDisplay.textContent = getFieldPositionLabel(yardLine);
    yardLineValue.textContent = String(yardLine);
  }

  function renderStatus(message) {
    output.innerHTML = `<p class="meta">${message}</p>`;
  }

  function setMode(mode) {
    currentMode = mode === "advanced" ? "advanced" : "simple";

    modeButtons.forEach(function (button) {
      const isActive = button.getAttribute("data-mode-button") === currentMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (advancedInputs) {
      advancedInputs.hidden = currentMode !== "advanced";
    }
  }

  function getMetricCards(result) {
    return `
      <div class="tool-summary tool-summary--simulator">
        <div class="metric">
          <span class="meta">Field position</span>
          <strong>${model.formatFieldPosition(result.context.yardLine)}</strong>
        </div>
        <div class="metric">
          <span class="meta">Game state</span>
          <strong>Q${result.context.quarter}, ${result.context.timeRemaining}</strong>
        </div>
        <div class="metric">
          <span class="meta">Score state</span>
          <strong>${model.formatScoreDifferential(result.context.scoreDifferential)}</strong>
        </div>
      </div>
    `;
  }

  function getComparisonCard(title, supportingLabel, supportingValue, winProbability, bestWinProbability, toneClass) {
    return `
      <article class="decision-card ${toneClass}">
        <div class="decision-card__topline">
          <span class="meta">${title}</span>
          <span class="decision-card__delta">${toSignedPercent(bestWinProbability - winProbability)}</span>
        </div>
        <strong class="decision-card__value">${toPercent(winProbability)}</strong>
        <p class="decision-card__support"><span>${supportingLabel}</span><strong>${supportingValue}</strong></p>
      </article>
    `;
  }

  function render(result) {
    const provenanceLabel = result.modelProvenance === "dense-cfb4th-surface"
      ? "Dense cfb4th-aligned surface"
      : "Local approximation fallback";

    output.innerHTML = `
      <section class="result-hero">
        <div>
          <p class="meta">Best decision</p>
          <h3>${result.recommendation}</h3>
          <p class="result-hero__summary">${result.explanation}</p>
        </div>
        <div class="result-hero__score">
          <span class="meta">Best win probability</span>
          <strong>${toPercent(result.bestWinProbability)}</strong>
          <span class="muted">${provenanceLabel}</span>
        </div>
      </section>

      ${getMetricCards(result)}

      <section class="decision-grid">
        ${getComparisonCard(
          "Go for it",
          "Conversion probability",
          toPercent(result.goForIt.conversionRate),
          result.goForIt.winProbability,
          result.bestWinProbability,
          result.recommendation === "Go for It" ? "decision-card--best" : ""
        )}
        ${getComparisonCard(
          "Punt",
          "Opponent start",
          "Own " + result.punt.opponentStartYardLine,
          result.punt.winProbability,
          result.bestWinProbability,
          result.recommendation === "Punt" ? "decision-card--best" : ""
        )}
        ${getComparisonCard(
          "Field goal",
          "Attempt profile",
          result.fieldGoal.distance + " yd · " + toPercent(result.fieldGoal.successRate),
          result.fieldGoal.winProbability,
          result.bestWinProbability,
          result.recommendation === "Field Goal" ? "decision-card--best" : ""
        )}
      </section>

      <section class="explanation-panel">
        <div class="explanation-panel__section">
          <p class="meta">Why this recommendation</p>
          <p>${result.explanation}</p>
        </div>
        <div class="mini-grid decision-facts">
          <div class="card decision-fact">
            <p class="meta">Go expected value</p>
            <strong>${toFixed(result.goForIt.expectedValue)} EP</strong>
          </div>
          <div class="card decision-fact">
            <p class="meta">Punt expected value</p>
            <strong>${toFixed(result.punt.expectedValue)} EP</strong>
          </div>
          <div class="card decision-fact">
            <p class="meta">FG expected value</p>
            <strong>${toFixed(result.fieldGoal.expectedValue)} EP</strong>
          </div>
        </div>
        <p class="meta">Model basis: ${provenanceLabel}. Treat outputs as directional decision support rather than exact team-specific odds.</p>
      </section>
    `;
  }

  function evaluateCurrentForm(event) {
    if (event) {
      event.preventDefault();
    }

    const formData = new FormData(form);
    const result = model.evaluateFourthDownDecision({
      yardLine: formData.get("yardLine"),
      yardsToGo: formData.get("yardsToGo"),
      quarter: formData.get("quarter"),
      timeRemaining: formData.get("timeRemaining"),
      scoreDifferential: formData.get("scoreDifferential")
    });

    render(result);
  }

  function resetScenario() {
    Object.keys(defaults).forEach(function (key) {
      const field = form.elements.namedItem(key);
      if (!field) return;
      field.value = defaults[key];
    });

    updateYardLineDisplay();
    setMode("simple");
    evaluateCurrentForm();
  }

  async function initialize() {
    renderStatus("Loading dense cfb4th surface…");

    try {
      const response = await fetch("/data/cfb4th-dense-surface.json", { cache: "force-cache" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const surface = await response.json();
      model.loadDenseSurface(surface);
    } catch (error) {
      console.warn("Dense fourth-down surface unavailable, falling back to approximation layer.", error);
    }

    form.addEventListener("submit", evaluateCurrentForm);

    if (yardLineInput) {
      yardLineInput.addEventListener("input", function () {
        updateYardLineDisplay();
        evaluateCurrentForm();
      });
    }

    ["yardsToGo", "quarter", "timeRemaining", "scoreDifferential", "offenseTimeouts", "defenseTimeouts", "pregameSpread", "overUnder", "receivesSecondHalfKickoff"].forEach(function (name) {
      const field = form.elements.namedItem(name);
      if (!field) return;
      field.addEventListener("change", evaluateCurrentForm);
      if (field.tagName === "INPUT" && field.type !== "range") {
        field.addEventListener("input", evaluateCurrentForm);
      }
    });

    modeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.getAttribute("data-mode-button"));
      });
    });

    if (resetButton) {
      resetButton.addEventListener("click", resetScenario);
    }

    updateYardLineDisplay();
    setMode("simple");
    evaluateCurrentForm();
  }

  initialize();
})();
