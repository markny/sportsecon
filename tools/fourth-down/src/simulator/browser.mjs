import { buildArtifacts, evaluateDecision } from "./core.mjs?v=20260501e";

export async function loadSimulatorArtifacts({
  decisionInputsUrl = new URL("../../data/processed/decision_inputs.json", import.meta.url),
  winProbabilityUrl = new URL("../../data/processed/wp_model.json", import.meta.url),
} = {}) {
  const [decisionResponse, wpResponse] = await Promise.all([
    fetch(decisionInputsUrl),
    fetch(winProbabilityUrl),
  ]);

  if (!decisionResponse.ok) {
    throw new Error(`Failed to load decision inputs: ${decisionResponse.status}`);
  }
  if (!wpResponse.ok) {
    throw new Error(`Failed to load win probability inputs: ${wpResponse.status}`);
  }

  const [decisionInputs, wpInputs] = await Promise.all([
    decisionResponse.json(),
    wpResponse.json(),
  ]);

  return buildArtifacts(decisionInputs, wpInputs);
}

export { evaluateDecision } from "./core.mjs?v=20260501e";
