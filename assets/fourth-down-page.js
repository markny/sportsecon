(function () {
  const form = document.getElementById("fourth-down-form");
  const output = document.getElementById("fourth-down-output");

  if (!form || !output || !window.FourthDownModel) {
    return;
  }

  const model = window.FourthDownModel;

  function toFixed(value) {
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  function render(result) {
    output.innerHTML = `
      <div class="result-highlight">
        <div>
          <div class="meta">Recommendation</div>
          <strong>${result.recommendation}</strong>
        </div>
        <div>
          <div class="meta">Best expected value</div>
          <strong>${toFixed(result.bestExpectedValue)} EP</strong>
        </div>
      </div>
      <p>${result.explanation}</p>
      <div class="tool-summary">
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
      <table class="outcome-table">
        <thead>
          <tr>
            <th>Decision</th>
            <th>Detail</th>
            <th>Expected value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Go for It</td>
            <td>${Math.round(result.goForIt.conversionRate * 100)}% conversion estimate</td>
            <td>${toFixed(result.goForIt.expectedValue)} EP</td>
          </tr>
          <tr>
            <td>Punt</td>
            <td>Field-position value only</td>
            <td>${toFixed(result.punt.expectedValue)} EP</td>
          </tr>
          <tr>
            <td>Field Goal</td>
            <td>${result.fieldGoal.distance}-yard attempt, ${Math.round(result.fieldGoal.successRate * 100)}% make rate</td>
            <td>${toFixed(result.fieldGoal.expectedValue)} EP</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function handleSubmit(event) {
    event.preventDefault();
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

  form.addEventListener("submit", handleSubmit);
  handleSubmit(new Event("submit"));
})();
