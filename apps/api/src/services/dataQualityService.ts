import { HttpError } from "./dataIntelligenceErrors.js";
import { prisma } from "@flowforge/database";
import {
  CreateDataQualityRuleInput,
  DataQualityStatus,
  DataQualityRuleType,
} from "@flowforge/shared";
import { incidentService } from "./incidentService.js";

export interface EvaluatedRuleResult {
  ruleId: string;
  ruleName: string;
  ruleType: DataQualityRuleType;
  status: DataQualityStatus;
  recordsEvaluated: number;
  recordsPassed: number;
  recordsFailed: number;
  failureSamples: any[];
  errorMessage?: string;
}

export class DataQualityService {
  /**
   * Creates a new quality rule bound to a data product.
   */
  public async createRule(
    workspaceId: string,
    dataProductId: string,
    input: CreateDataQualityRuleInput
  ) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: { id: dataProductId, workspaceId },
    });
    if (!product) throw new HttpError(404, `Data Product '${dataProductId}' not found.`);

    return prisma.dataQualityRule.create({
      data: {
        workspaceId,
        dataProductId,
        name: input.name,
        description: input.description,
        ruleType: input.ruleType,
        configuration: input.configuration,
        severity: input.severity || "ERROR",
        isBlocking: input.isBlocking ?? true,
        enabled: input.enabled ?? true,
      },
    });
  }

  /**
   * Lists quality rules for a data product.
   */
  public async listRules(workspaceId: string, dataProductId: string) {
    return prisma.dataQualityRule.findMany({
      where: { workspaceId, dataProductId },
      orderBy: { createdAt: "desc" },
      include: {
        evaluations: {
          orderBy: { evaluatedAt: "desc" },
          take: 3,
        },
      },
    });
  }

  /**
   * Retrieves a quality rule with its evaluation history.
   */
  public async getRule(workspaceId: string, ruleId: string) {
    const rule = await prisma.dataQualityRule.findFirst({
      where: { id: ruleId, workspaceId },
      include: {
        evaluations: {
          orderBy: { evaluatedAt: "desc" },
          take: 10,
        },
      },
    });
    if (!rule) throw new HttpError(404, `Data Quality Rule '${ruleId}' not found.`);
    return rule;
  }

  /**
   * Updates an existing quality rule.
   */
  public async updateRule(
    workspaceId: string,
    ruleId: string,
    input: Partial<CreateDataQualityRuleInput>
  ) {
    const rule = await prisma.dataQualityRule.findFirst({
      where: { id: ruleId, workspaceId },
    });
    if (!rule) throw new HttpError(404, `Data Quality Rule '${ruleId}' not found.`);

    return prisma.dataQualityRule.update({
      where: { id: ruleId },
      data: {
        name: input.name,
        description: input.description,
        ruleType: input.ruleType,
        configuration: input.configuration,
        severity: input.severity,
        isBlocking: input.isBlocking,
        enabled: input.enabled,
      },
    });
  }

  /**
   * Deletes a quality rule.
   */
  public async deleteRule(workspaceId: string, ruleId: string) {
    const rule = await prisma.dataQualityRule.findFirst({
      where: { id: ruleId, workspaceId },
    });
    if (!rule) throw new HttpError(404, `Data Quality Rule '${ruleId}' not found.`);

    await prisma.dataQualityRule.delete({ where: { id: ruleId } });
    return { success: true };
  }

  /**
   * Redacts sensitive sample fields for failure reporting.
   */
  private redactSample(item: any): any {
    if (!item || typeof item !== "object") return item;
    const copy = { ...item };
    for (const k of Object.keys(copy)) {
      const lower = k.toLowerCase();
      if (lower.includes("password") || lower.includes("secret") || lower.includes("token")) {
        copy[k] = "[REDACTED]";
      } else if (lower.includes("email") && typeof copy[k] === "string") {
        const parts = copy[k].split("@");
        copy[k] = parts.length === 2 ? parts[0].slice(0, 2) + "***@" + parts[1] : "***";
      }
    }
    return copy;
  }

  /**
   * Deterministically evaluates enabled quality rules against a dataset.
   */
  public async evaluateRulesOnDataset(
    workspaceId: string,
    dataProductId: string,
    records: any[],
    versionId?: string,
    pipelineRunId?: string
  ): Promise<EvaluatedRuleResult[]> {
    const rules = await prisma.dataQualityRule.findMany({
      where: { workspaceId, dataProductId, enabled: true },
    });

    const results: EvaluatedRuleResult[] = [];
    const recordCount = Array.isArray(records) ? records.length : 0;
    let anyFail = false;
    let anyWarn = false;

    for (const rule of rules) {
      const startTime = Date.now();
      const cfg = (rule.configuration || {}) as Record<string, any>;
      let passed = 0;
      let failed = 0;
      const failureSamples: any[] = [];
      let ruleStatus: DataQualityStatus = "PASS";
      let errorMsg: string | undefined;

      if (recordCount === 0) {
        if (rule.ruleType === "MIN_RECORD_COUNT" && (cfg.minCount || 1) > 0) {
          ruleStatus = "FAIL";
          failed = 1;
          errorMsg = `Dataset contains 0 records, minimum expected is ${cfg.minCount || 1}`;
        } else {
          ruleStatus = "INSUFFICIENT_DATA";
        }
      } else {
        switch (rule.ruleType) {
          case "REQUIRED_FIELD": {
            const field = cfg.field;
            for (const row of records) {
              const val = row?.[field];
              if (val !== undefined && val !== null && val !== "") {
                passed++;
              } else {
                failed++;
                if (failureSamples.length < 5) {
                  failureSamples.push({ reason: `Missing required field '${field}'`, row: this.redactSample(row) });
                }
              }
            }
            ruleStatus = failed > 0 ? "FAIL" : "PASS";
            break;
          }

          case "NULL_RATE": {
            const field = cfg.field;
            const maxThreshold = cfg.maxNullPercent !== undefined ? cfg.maxNullPercent : 0.05;
            let nullCount = 0;
            for (const row of records) {
              const val = row?.[field];
              if (val === undefined || val === null) nullCount++;
            }
            const actualRate = nullCount / recordCount;
            if (actualRate > maxThreshold) {
              ruleStatus = "FAIL";
              failed = nullCount;
              passed = recordCount - nullCount;
              errorMsg = `Null rate ${(actualRate * 100).toFixed(1)}% exceeded maximum ${(maxThreshold * 100).toFixed(1)}%`;
            } else {
              ruleStatus = "PASS";
              passed = recordCount;
            }
            break;
          }

          case "ALLOWED_VALUES": {
            const field = cfg.field;
            const allowed = new Set(Array.isArray(cfg.allowedValues) ? cfg.allowedValues : []);
            for (const row of records) {
              const val = row?.[field];
              if (allowed.has(val)) {
                passed++;
              } else {
                failed++;
                if (failureSamples.length < 5) {
                  failureSamples.push({ reason: `Value '${val}' not in allowed set`, row: this.redactSample(row) });
                }
              }
            }
            ruleStatus = failed > 0 ? "FAIL" : "PASS";
            break;
          }

          case "NUMERIC_RANGE": {
            const field = cfg.field;
            const min = cfg.min !== undefined ? Number(cfg.min) : -Infinity;
            const max = cfg.max !== undefined ? Number(cfg.max) : Infinity;
            for (const row of records) {
              const num = Number(row?.[field]);
              if (!isNaN(num) && num >= min && num <= max) {
                passed++;
              } else {
                failed++;
                if (failureSamples.length < 5) {
                  failureSamples.push({ reason: `Value '${row?.[field]}' out of range [${min}, ${max}]`, row: this.redactSample(row) });
                }
              }
            }
            ruleStatus = failed > 0 ? "FAIL" : "PASS";
            break;
          }

          case "REGEX_FORMAT": {
            const field = cfg.field;
            const regex = new RegExp(cfg.pattern || ".*");
            for (const row of records) {
              const val = String(row?.[field] ?? "");
              if (regex.test(val)) {
                passed++;
              } else {
                failed++;
                if (failureSamples.length < 5) {
                  failureSamples.push({ reason: `Value did not match pattern '${cfg.pattern}'`, row: this.redactSample(row) });
                }
              }
            }
            ruleStatus = failed > 0 ? "FAIL" : "PASS";
            break;
          }

          case "UNIQUENESS": {
            const field = cfg.field;
            const seen = new Set<any>();
            for (const row of records) {
              const val = row?.[field];
              if (seen.has(val)) {
                failed++;
                if (failureSamples.length < 5) {
                  failureSamples.push({ reason: `Duplicate value '${val}' on key '${field}'`, row: this.redactSample(row) });
                }
              } else {
                seen.add(val);
                passed++;
              }
            }
            ruleStatus = failed > 0 ? "FAIL" : "PASS";
            break;
          }

          case "MIN_RECORD_COUNT": {
            const minCount = Number(cfg.minCount || 1);
            if (recordCount >= minCount) {
              passed = recordCount;
              ruleStatus = "PASS";
            } else {
              failed = minCount - recordCount;
              ruleStatus = "FAIL";
              errorMsg = `Dataset had ${recordCount} records, required at least ${minCount}`;
            }
            break;
          }

          default: {
            passed = recordCount;
            ruleStatus = "PASS";
            break;
          }
        }
      }

      if (ruleStatus === "FAIL") {
        if (rule.severity === "WARN") {
          ruleStatus = "WARN";
          anyWarn = true;
        } else {
          anyFail = true;
        }
      }

      const durationMs = Date.now() - startTime;

      // Persist evaluation record
      await prisma.dataQualityEvaluation.create({
        data: {
          workspaceId,
          ruleId: rule.id,
          dataProductId,
          versionId,
          pipelineRunId,
          status: ruleStatus,
          recordsEvaluated: recordCount,
          recordsPassed: passed,
          recordsFailed: failed,
          failureSamples: failureSamples.length > 0 ? failureSamples : undefined,
          evaluationDurationMs: durationMs,
          errorMessage: errorMsg,
        },
      });

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.ruleType as DataQualityRuleType,
        status: ruleStatus,
        recordsEvaluated: recordCount,
        recordsPassed: passed,
        recordsFailed: failed,
        failureSamples,
        errorMessage: errorMsg,
      });
    }

    // Determine overall product quality status
    let overallStatus: DataQualityStatus = "PASS";
    if (rules.length === 0 || recordCount === 0) {
      overallStatus = "INSUFFICIENT_DATA";
    } else if (anyFail) {
      overallStatus = "FAIL";
    } else if (anyWarn) {
      overallStatus = "WARN";
    }

    // Update Product Definition quality status
    await prisma.dataProductDefinition.update({
      where: { id: dataProductId },
      data: {
        qualityStatus: overallStatus,
        lastEvaluatedAt: new Date(),
      },
    });

    // If critical failure, report operational incident (deduplicated)
    if (overallStatus === "FAIL") {
      try {
        await incidentService.reportIncident({
          workspaceId,
          title: `Data Quality Gate Failure on Data Product ${dataProductId}`,
          severity: "HIGH",
          category: "SLO_BREACH",
          sourceService: "data-quality-service",
          correlationKey: `data-quality-fail:${dataProductId}`,
          rootCauseSummary: `Data product quality rules failed during dataset evaluation.`,
          metadata: {
            dataProductId,
            failedRules: results.filter((r) => r.status === "FAIL").map((r) => r.ruleName),
          },
        });
      } catch (err: any) {
        // Log incident reporting failure without aborting evaluation
        console.warn("Failed to report quality failure incident:", err.message);
      }
    }

    return results;
  }
}

export const dataQualityService = new DataQualityService();
