import fs from "node:fs";
import vm from "node:vm";

const base = process.cwd();
const modelPath = `${base}/assets/fourth-down-model.js`;
const denseSurfacePath = `${base}/data/cfb4th-dense-surface.json`;
const benchmarkPath = process.argv.includes("--grid")
  ? `${base}/data/cfb4th-benchmark-grid.json`
  : fs.existsSync(`${base}/data/cfb4th-benchmark-targets.json`)
    ? `${base}/data/cfb4th-benchmark-targets.json`
    : `${base}/data/cfb4th-benchmark-template.json`;

const modelCode = fs.readFileSync(modelPath, "utf8");
const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));
const denseSurface = fs.existsSync(denseSurfacePath)
  ? JSON.parse(fs.readFileSync(denseSurfacePath, "utf8"))
  : null;

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(modelCode, sandbox);
const model = sandbox.window.FourthDownModel;

if (!model?.evaluateFourthDownDecision) {
  throw new Error("FourthDownModel.evaluateFourthDownDecision not available");
}

if (denseSurface) {
  model.loadDenseSurface(denseSurface);
}

function fmt(n) {
  return n == null || !Number.isFinite(Number(n)) ? "n/a" : Number(n).toFixed(3);
}

let agreement = 0;
let compared = 0;
let absGo = 0;
let absPunt = 0;
let absFg = 0;
let goN = 0;
let puntN = 0;
let fgN = 0;
const disagreements = [];

console.log(`\nSimulator parity check vs cfb4th targets (${benchmarkPath.replace(base + '/', '')})\n`);

for (const s of benchmark.scenarios) {
  const out = model.evaluateFourthDownDecision(s.input);
  const target = s.cfb4thTarget;

  const recAgree = out.recommendation === target.recommendation;
  if (target.recommendation) {
    compared += 1;
    if (recAgree) {
      agreement += 1;
    } else {
      disagreements.push({ id: s.id, input: s.input, model: out.recommendation, target: target.recommendation });
    }
  }

  if (target.goWinProb != null) {
    absGo += Math.abs(out.goForIt.winProbability - target.goWinProb);
    goN += 1;
  }
  if (target.puntWinProb != null) {
    absPunt += Math.abs(out.punt.winProbability - target.puntWinProb);
    puntN += 1;
  }
  if (target.fgWinProb != null) {
    absFg += Math.abs(out.fieldGoal.winProbability - target.fgWinProb);
    fgN += 1;
  }

  if (!process.argv.includes("--summary-only")) {
    console.log(`${s.id} — ${recAgree ? "✓" : "✗"} ${s.label ?? JSON.stringify(s.input)}`);
    console.log(`  model rec:   ${out.recommendation}`);
    console.log(`  target rec:  ${target.recommendation ?? "(pending)"}`);
    console.log(`  provenance:  ${out.modelProvenance}`);

    if (target.goWinProb != null || target.puntWinProb != null || target.fgWinProb != null) {
      console.log(`  go WP   model/target: ${fmt(out.goForIt.winProbability)} / ${fmt(target.goWinProb)}`);
      console.log(`  punt WP model/target: ${fmt(out.punt.winProbability)} / ${fmt(target.puntWinProb)}`);
      console.log(`  fg WP   model/target: ${fmt(out.fieldGoal.winProbability)} / ${fmt(target.fgWinProb)}`);
    }

    console.log("");
  }
}

console.log("Summary");
console.log(`  recommendation agreement: ${agreement}/${compared} (${fmt(compared ? agreement / compared : null)})`);
console.log(`  mean |go WP delta|:   ${fmt(goN ? absGo / goN : null)}`);
console.log(`  mean |punt WP delta|: ${fmt(puntN ? absPunt / puntN : null)}`);
console.log(`  mean |fg WP delta|:   ${fmt(fgN ? absFg / fgN : null)}`);

if (disagreements.length) {
  console.log("  sample disagreements:");
  for (const row of disagreements.slice(0, 10)) {
    console.log(`    ${row.id}: model=${row.model}, target=${row.target}, input=${JSON.stringify(row.input)}`);
  }
}

console.log("");
