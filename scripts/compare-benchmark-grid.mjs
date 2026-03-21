import fs from 'node:fs'
import vm from 'node:vm'

const base = process.cwd()
const modelPath = `${base}/assets/fourth-down-model.js`
const benchmarkPath = `${base}/data/cfb4th-benchmark-grid.json`
const outPath = `${base}/data/cfb4th-grid-comparison.json`

const modelCode = fs.readFileSync(modelPath, 'utf8')
const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'))
const denseSurfacePath = `${base}/data/cfb4th-dense-surface.json`
const denseSurface = fs.existsSync(denseSurfacePath)
  ? JSON.parse(fs.readFileSync(denseSurfacePath, 'utf8'))
  : null

const sandbox = { window: {} }
vm.createContext(sandbox)
vm.runInContext(modelCode, sandbox)
const model = sandbox.window.FourthDownModel

if (denseSurface && model?.loadDenseSurface) {
  model.loadDenseSurface(denseSurface)
}

function num(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

function absDiff(a, b) {
  if (a == null || b == null) return null
  return Math.abs(a - b)
}

const rows = benchmark.scenarios.map((scenario) => {
  const result = model.evaluateFourthDownDecision(scenario.input)
  const target = scenario.cfb4thTarget

  const modelGo = num(result.goForIt?.winProbability)
  const modelPunt = num(result.punt?.winProbability)
  const modelFg = num(result.fieldGoal?.winProbability)

  const row = {
    id: scenario.id,
    input: scenario.input,
    model: {
      recommendation: result.recommendation,
      goWinProb: modelGo,
      puntWinProb: modelPunt,
      fgWinProb: modelFg
    },
    target,
    error: {
      go: absDiff(modelGo, target.goWinProb),
      punt: absDiff(modelPunt, target.puntWinProb),
      fg: absDiff(modelFg, target.fgWinProb)
    }
  }

  row.recommendationMatch = row.model.recommendation === target.recommendation
  row.meanAbsError = [row.error.go, row.error.punt, row.error.fg].filter((v) => v != null)
  row.meanAbsError = row.meanAbsError.length
    ? row.meanAbsError.reduce((a, b) => a + b, 0) / row.meanAbsError.length
    : null

  return row
})

const recMatches = rows.filter((r) => r.recommendationMatch).length
const maeRows = rows.map((r) => r.meanAbsError).filter((v) => v != null)
const summary = {
  scenarioCount: rows.length,
  recommendationAgreement: recMatches,
  recommendationAgreementRate: recMatches / rows.length,
  meanScenarioAbsError: maeRows.reduce((a, b) => a + b, 0) / maeRows.length,
  worstScenarios: [...rows]
    .filter((r) => r.meanAbsError != null)
    .sort((a, b) => b.meanAbsError - a.meanAbsError)
    .slice(0, 25)
    .map((r) => ({
      id: r.id,
      input: r.input,
      modelRecommendation: r.model.recommendation,
      targetRecommendation: r.target.recommendation,
      meanAbsError: r.meanAbsError,
      error: r.error
    }))
}

const bandSummary = {}
for (const row of rows) {
  const key = `Q${row.input.quarter}-YTG${row.input.yardsToGo}`
  if (!bandSummary[key]) {
    bandSummary[key] = { count: 0, recMatch: 0, totalMae: 0 }
  }
  bandSummary[key].count += 1
  if (row.recommendationMatch) bandSummary[key].recMatch += 1
  if (row.meanAbsError != null) bandSummary[key].totalMae += row.meanAbsError
}
for (const key of Object.keys(bandSummary)) {
  const b = bandSummary[key]
  b.recommendationAgreementRate = b.recMatch / b.count
  b.meanScenarioAbsError = b.totalMae / b.count
  delete b.totalMae
}

const out = { summary, bandSummary, scenarios: rows }
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`wrote ${outPath}`)
console.log(JSON.stringify(summary, null, 2))
