(function () {
  const form = document.getElementById("fourth-down-form");
  const output = document.getElementById("fourth-down-output");
  const yardLineInput = document.getElementById("yardLine");
  const yardLineDisplay = document.getElementById("yardLineDisplay");
  const yardsToGoInput = document.getElementById("yardsToGo");
  const yardsToGoValue = document.getElementById("yardsToGoValue");
  const scoreDifferentialInput = document.getElementById("scoreDifferential");
  const scoreDifferentialValue = document.getElementById("scoreDifferentialValue");
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
    const sign = value > 0 ? "+" : "-";
    return sign + (Math.round(Math.abs(value) * 1000) / 10).toFixed(1) + "%";
  }

  function getFieldPositionLabel(yardLine) {
    return model.formatFieldPosition(Number(yardLine)).replace(/^Opp\s/, "Opponent ");
  }

  function getScoreDifferentialLabel(scoreDifferential) {
    const value = Number(scoreDifferential);
    if (value > 0) return "Up " + value;
    if (value < 0) return "Down " + Math.abs(value);
    return "Tied";
  }

  function updateYardLineDisplay() {
    if (!yardLineInput || !yardLineDisplay) {
      return;
    }

    const yardLine = Number(yardLineInput.value || defaults.yardLine);
    yardLineDisplay.textContent = getFieldPositionLabel(yardLine);
  }

  function updateSliderDisplays() {
    if (yardsToGoInput && yardsToGoValue) {
      yardsToGoValue.textContent = String(yardsToGoInput.value);
    }

    if (scoreDifferentialInput && scoreDifferentialValue) {
      scoreDifferentialValue.textContent = getScoreDifferentialLabel(scoreDifferentialInput.value);
    }
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

  function getScenarioLabel(result) {
    return `4th & ${result.context.yardsToGo} · ${model.formatFieldPosition(result.context.yardLine)} · Q${result.context.quarter} · ${result.context.timeRemaining} · ${model.formatScoreDifferential(result.context.scoreDifferential)}`;
  }

  function getRecommendationEdge(result) {
    const values = [
      result.goForIt.winProbability,
      result.punt.winProbability,
      result.fieldGoal.winProbability
    ].sort(function (a, b) { return b - a; });

    return values[0] - values[1];
  }

  function getDecisionRow(label, overallWp, baselineWp, bestWp, detailHtml, isBest) {
    const edge = bestWp - overallWp;
    const deltaFromBaseline = overallWp - baselineWp;

    return `
      <article class="implication-row ${isBest ? "implication-row--best" : ""}">
        <div class="implication-row__main">
          <div class="implication-row__titleline">
            <div>
              <p class="meta">${label}</p>
              <strong class="implication-row__wp">${toPercent(overallWp)}</strong>
              <span class="implication-row__wp-label">Overall win probability</span>
            </div>
            <div class="implication-row__delta-group">
              <div class="implication-row__delta implication-row__delta--baseline">
                ${toSignedPercent(deltaFromBaseline)} from current state
              </div>
              ${isBest ? "" : `<div class="implication-row__delta">${toSignedPercent(-edge)} vs best</div>`}
            </div>
          </div>
          <div class="implication-row__details">
            ${detailHtml}
          </div>
        </div>
        ${isBest ? '<span class="decision-badge">Best decision</span>' : ''}
      </article>
    `;
  }

  function render(result) {
    const provenanceLabel = result.modelProvenance === "dense-cfb4th-surface"
      ? "Dense cfb4th-aligned surface"
      : "Local approximation fallback";
    const edge = getRecommendationEdge(result);

    output.innerHTML = `
      <section class="scenario-strip">
        <p class="meta">Decision snapshot</p>
        <h3>${result.recommendation}</h3>
        <p class="scenario-strip__summary">${getScenarioLabel(result)}</p>
      </section>

      <section class="implication-panel">
        <div class="implication-panel__header">
          <div>
            <p class="meta">Recommendation</p>
            <strong class="implication-panel__headline">${result.recommendation} at ${toPercent(result.bestWinProbability)} win probability</strong>
            <p class="implication-panel__baseline">Current win probability before the decision: <strong>${toPercent(result.baselineWinProbability)}</strong></p>
          </div>
          <div class="implication-panel__edge">
            <span class="meta">Edge over next best</span>
            <strong>${toPercent(edge)}</strong>
          </div>
        </div>

        ${getDecisionRow(
          "Go for it",
          result.goForIt.winProbability,
          result.baselineWinProbability,
          result.bestWinProbability,
          `
            <div class="implication-stat implication-stat--neutral"><span>Conversion probability</span><strong>${toPercent(result.goForIt.conversionRate)}</strong></div>
            <div class="implication-stat implication-stat--positive"><span>Win probability if converted</span><strong>${toPercent(result.goForIt.successWinProbability)}</strong></div>
            <div class="implication-stat implication-stat--negative"><span>Win probability if stopped</span><strong>${toPercent(result.goForIt.failureWinProbability)}</strong></div>
          `,
          result.recommendation === "Go for It"
        )}

        ${getDecisionRow(
          "Field goal",
          result.fieldGoal.winProbability,
          result.baselineWinProbability,
          result.bestWinProbability,
          `
            <div class="implication-stat implication-stat--neutral"><span>Kick profile</span><strong>${result.fieldGoal.distance} yd</strong></div>
            <div class="implication-stat implication-stat--positive"><span>Win probability if made</span><strong>${toPercent(result.fieldGoal.makeWinProbability)}</strong></div>
            <div class="implication-stat implication-stat--negative"><span>Win probability if missed</span><strong>${toPercent(result.fieldGoal.missWinProbability)}</strong></div>
          `,
          result.recommendation === "Field Goal"
        )}

        ${getDecisionRow(
          "Punt",
          result.punt.winProbability,
          result.baselineWinProbability,
          result.bestWinProbability,
          `
            <div class="implication-stat implication-stat--neutral"><span>Opponent start</span><strong>${model.formatFieldPosition(result.punt.opponentStartYardLine)}</strong></div>
            <div class="implication-stat implication-stat--neutral"><span>Punt win probability</span><strong>${toPercent(result.punt.winProbability)}</strong></div>
            <div class="implication-stat implication-stat--neutral"><span>Decision type</span><strong>Field-position play</strong></div>
          `,
          result.recommendation === "Punt"
        )}
      </section>

      <section class="explanation-panel">
        <div class="explanation-panel__section">
          <p class="meta">Why this recommendation</p>
          <p>${result.explanation}</p>
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

      if (field instanceof RadioNodeList) {
        const radio = form.querySelector(`[name="${key}"][value="${defaults[key]}"]`);
        if (radio) radio.checked = true;
      } else {
        field.value = defaults[key];
      }
    });

    updateYardLineDisplay();
    updateSliderDisplays();
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

    [yardsToGoInput, scoreDifferentialInput].forEach(function (field) {
      if (!field) return;
      field.addEventListener("input", function () {
        updateSliderDisplays();
        evaluateCurrentForm();
      });
      field.addEventListener("change", evaluateCurrentForm);
    });

    ["quarter", "timeRemaining", "offenseTimeouts", "defenseTimeouts", "pregameSpread", "overUnder", "receivesSecondHalfKickoff"].forEach(function (name) {
      const field = form.elements.namedItem(name);
      if (!field) return;
      field.addEventListener("change", evaluateCurrentForm);
      if (!(field instanceof RadioNodeList) && field.tagName === "INPUT" && field.type !== "range") {
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
    updateSliderDisplays();
    setMode("simple");
    evaluateCurrentForm();
  }

  initialize();
})();
