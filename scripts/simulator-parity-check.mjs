import fs from "node:fs";
import vm from "node:vm";

const base = process.cwd();
const modelPath = `${base}/assets/fourth-down-model.js`;
const benchmarkPath = `${base}/data/cfb4th-benchmark-template.json`;

const modelCode = fs.readFileSync(modelPath, "utf8");
const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(modelCode, sandbox);
const model = sandbox.window.FourthDownModel;

if (!model?.evaluateFourthDownDecision) {
  throw new Error("FourthDownModel.evaluateFourthDownDecision not available");
}

function fmt(n) {
  return n == null ? "n/a" : Number(n).toFixed(3);
}

console.log("\nSimulator parity check vs cfb4th targets (template-aware)\n");

for (const s of benchmark.scenarios) {
  const out = model.evaluateFourthDownDecision(s.input);
  const target = s.cfb4thTarget;

  console.log(`${s.id} — ${s.label}`);
  console.log(`  model rec:   ${out.recommendation}`);
  console.log(`  target rec:  ${target.recommendation ?? "(pending)"}`);

  if (target.goWinProb != null || target.puntWinProb != null || target.fgWinProb != null) {
    const modelGo = out.goForIt?.winProbability;
    const modelPunt = out.punt?.winProbability;
    const modelFg = out.fieldGoal?.winProbability;

    console.log(`  go WP   model/target: ${fmt(modelGo)} / ${fmt(target.goWinProb)}`);
    console.log(`  punt WP model/target: ${fmt(modelPunt)} / ${fmt(target.puntWinProb)}`);
    console.log(`  fg WP   model/target: ${fmt(modelFg)} / ${fmt(target.fgWinProb)}`);
  } else {
    console.log("  target WP:   (pending target import from cfb4th)");
  }

  console.log("");
}

console.log("Done. Populate data/cfb4th-benchmark-template.json with cfb4th outputs for full parity checks.\n");
