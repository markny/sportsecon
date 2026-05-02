import { readFile } from "node:fs/promises";
import { buildArtifacts, evaluateDecision } from "./core.mjs";

const DEFAULT_DECISION_INPUTS_URL = new URL(
  "../../data/processed/decision_inputs.json",
  import.meta.url
);
const DEFAULT_WP_INPUTS_URL = new URL(
  "../../data/processed/wp_model.json",
  import.meta.url
);

export async function loadSimulatorArtifacts({
  decisionInputsUrl = DEFAULT_DECISION_INPUTS_URL,
  winProbabilityUrl = DEFAULT_WP_INPUTS_URL,
} = {}) {
  const [decisionRaw, wpRaw] = await Promise.all([
    readFile(decisionInputsUrl, "utf8"),
    readFile(winProbabilityUrl, "utf8"),
  ]);

  return buildArtifacts(JSON.parse(decisionRaw), JSON.parse(wpRaw));
}
export { evaluateDecision } from "./core.mjs";
