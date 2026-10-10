/**
 * `pnpm eval --stage-model <stage>=<model>[:<effort>]` (repeatable): runs that stage on another model, and optionally
 * another effort, for this run only, e.g. `--stage-model content=claude-haiku-5-5:low --stage-model critique=claude-haiku-5-5`.
 * For the design studio's model bake-off (S0): the same fixtures with different stage setups.
 * Without `:effort` the stage keeps its configured effort; a model with config modelTraits gets its defaultEffort and
 * max_tokens floor from the client as on the platform.
 */
import { EFFORT_LEVELS, type AppConfig, type ModelStageConfig, type ModelStageName } from "@sb/config";

export interface StageModelOverride {
  stage: ModelStageName;
  model: string;
  effort?: NonNullable<ModelStageConfig["effort"]>;
}

/** Every `--stage-model` value in `args`, parsed and checked against `config` (a known stage, a priced model). Throws a usage message. */
export function parseStageModels(args: readonly string[], config: AppConfig): StageModelOverride[] {
  const out: StageModelOverride[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--stage-model") continue;
    const raw = args[i + 1];
    const m = raw === undefined ? null : /^([A-Za-z]+)=([^:=\s]+)(?::([a-z]+))?$/.exec(raw);
    if (!m) throw new Error(`--stage-model takes <stage>=<model>[:<effort>], e.g. content=claude-haiku-5-5:low, not ${raw ?? "nothing"}`);
    const [, stage, model, effort] = m as unknown as [string, string, string, string | undefined];
    if (!(stage in config.models)) throw new Error(`--stage-model: unknown stage ${stage}. Known: ${Object.keys(config.models).join(", ")}.`);
    if (!config.pricesUsdPerMTok[model]) throw new Error(`--stage-model: no price configured for ${model} (config pricesUsdPerMTok), so its spend couldn't be counted.`);
    if (effort !== undefined && !(EFFORT_LEVELS as readonly string[]).includes(effort)) throw new Error(`--stage-model: unknown effort ${effort}. Known: ${EFFORT_LEVELS.join(", ")}.`);
    if (out.some((o) => o.stage === stage)) throw new Error(`--stage-model: stage ${stage} is given twice`);
    out.push({ stage: stage as ModelStageName, model, ...(effort ? { effort: effort as StageModelOverride["effort"] } : {}) });
  }
  return out;
}

/** Sets each overridden stage's model (and effort) in `config.models`; every other stage is untouched. */
export function applyStageModels(config: AppConfig, overrides: readonly StageModelOverride[]): void {
  for (const o of overrides) {
    const stage: ModelStageConfig = { ...config.models[o.stage], model: o.model };
    if (o.effort) stage.effort = o.effort;
    config.models[o.stage] = stage;
  }
}

/**
 * A directory name for a run's overrides (sorted by stage): its recordings never mix with the default ones or with
 * another setup's, e.g. `content=claude-haiku-5-5@low,critique=claude-haiku-5-5`.
 */
export function stageModelsSlug(overrides: readonly StageModelOverride[]): string {
  return [...overrides]
    .sort((a, b) => a.stage.localeCompare(b.stage))
    .map((o) => `${o.stage}=${o.model}${o.effort ? `@${o.effort}` : ""}`)
    .join(",");
}
