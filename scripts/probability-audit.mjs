import fs from 'node:fs'
import vm from 'node:vm'

const base = '/Users/mark/Documents/Projects/sportsecon'
const code = fs.readFileSync(`${base}/assets/fourth-down-model.js`, 'utf8')
const benchmark = JSON.parse(fs.readFileSync(`${base}/data/cfb4th-benchmark-grid.json`, 'utf8'))
const surface = JSON.parse(fs.readFileSync(`${base}/data/cfb4th-dense-surface.json`, 'utf8'))

const sandbox = { window: {} }
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
const model = sandbox.window.FourthDownModel
model.loadDenseSurface(surface)

const rows = []

for (const scenario of benchmark.scenarios) {
  const result = model.evaluateFourthDownDecision(scenario.input)
  const target = scenario.cfb4thTarget
  const num = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null

  const diffs = {
    go: num(target.goWinProb) == null ? null : Math.abs(result.goForIt.winProbability - target.goWinProb),
    punt: num(target.puntWinProb) == null ? null : Math.abs(result.punt.winProbability - target.puntWinProb),
    fg: num(target.fgWinProb) == null ? null : Math.abs(result.fieldGoal.winProbability - target.fgWinProb),
    firstDown: num(target.firstDownProb) == null ? null : Math.abs(result.goForIt.conversionRate - target.firstDownProb),
    fgMake: num(target.fgMakeProb) == null ? null : Math.abs(result.fieldGoal.successRate - target.fgMakeProb)
  }

  rows.push({
    id: scenario.id,
    input: scenario.input,
    recMatch: result.recommendation === target.recommendation,
    diffs,
    target,
    model: result
  })
}

function metricSummary(name) {
  const values = rows.map((row) => row.diffs[name]).filter((value) => value != null).sort((a, b) => a - b)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const pct = (p) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))]
  return {
    count: values.length,
    mean,
    p50: pct(0.5),
    p90: pct(0.9),
    p95: pct(0.95),
    max: values[values.length - 1]
  }
}

function summarizeGroups(groupFn, metric) {
  const groups = new Map()
  for (const row of rows) {
    const key = groupFn(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const out = {}
  for (const [key, groupRows] of groups.entries()) {
    const values = groupRows.map((row) => row.diffs[metric]).filter((value) => value != null)
    out[key] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null
  }
  return out
}

const worst = [...rows]
  .map((row) => {
    const comparable = [row.diffs.go, row.diffs.punt, row.diffs.fg].filter((value) => value != null)
    return {
      id: row.id,
      input: row.input,
      recMatch: row.recMatch,
      rec: row.model.recommendation,
      targetRec: row.target.recommendation,
      meanComparable: comparable.length
        ? comparable.reduce((sum, value) => sum + value, 0) / comparable.length
        : null,
      diffs: row.diffs
    }
  })
  .filter((row) => row.meanComparable != null)
  .sort((a, b) => b.meanComparable - a.meanComparable)
  .slice(0, 20)

const report = {
  recommendationAgreement: `${rows.filter((row) => row.recMatch).length}/${rows.length}`,
  metrics: {
    goWP: metricSummary('go'),
    puntWP: metricSummary('punt'),
    fgWP: metricSummary('fg'),
    firstDownProb: metricSummary('firstDown'),
    fgMakeProb: metricSummary('fgMake')
  },
  goByQuarter: summarizeGroups((row) => `Q${row.input.quarter}`, 'go'),
  fgByQuarter: summarizeGroups((row) => `Q${row.input.quarter}`, 'fg'),
  puntByQuarter: summarizeGroups((row) => `Q${row.input.quarter}`, 'punt'),
  goByField: summarizeGroups((row) => {
    if (row.input.yardLine >= 70) return 'plus-territory'
    if (row.input.yardLine >= 58) return 'fringe-plus'
    if (row.input.yardLine >= 45) return 'midfield'
    return 'own-side'
  }, 'go'),
  fgByField: summarizeGroups((row) => {
    if (row.input.yardLine >= 70) return 'plus-territory'
    if (row.input.yardLine >= 58) return 'fringe-plus'
    if (row.input.yardLine >= 45) return 'midfield'
    return 'own-side'
  }, 'fg'),
  puntByField: summarizeGroups((row) => {
    if (row.input.yardLine >= 70) return 'plus-territory'
    if (row.input.yardLine >= 58) return 'fringe-plus'
    if (row.input.yardLine >= 45) return 'midfield'
    return 'own-side'
  }, 'punt'),
  goByGameState: summarizeGroups((row) => row.input.scoreDifferential > 0 ? 'leading' : row.input.scoreDifferential < 0 ? 'trailing' : 'tied', 'go'),
  fgByGameState: summarizeGroups((row) => row.input.scoreDifferential > 0 ? 'leading' : row.input.scoreDifferential < 0 ? 'trailing' : 'tied', 'fg'),
  puntByGameState: summarizeGroups((row) => row.input.scoreDifferential > 0 ? 'leading' : row.input.scoreDifferential < 0 ? 'trailing' : 'tied', 'punt'),
  worst
}

const outPath = `${base}/data/cfb4th-probability-audit.json`
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(`wrote ${outPath}`)
console.log(JSON.stringify(report, null, 2))
