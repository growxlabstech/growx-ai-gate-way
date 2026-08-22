import type { PromptVersion } from "@growx/contracts";

export interface PromptVersionDiff {
  versionA: number;
  versionB: number;
  templateChanged: boolean;
  messagesChanged: boolean;
  variablesAdded: string[];
  variablesRemoved: string[];
  variablesModified: string[];
  capabilitiesChanged: boolean;
}

export class PromptDiffUtil {
  public static diff(vA: PromptVersion, vB: PromptVersion): PromptVersionDiff {
    const templateChanged = (vA.template || "") !== (vB.template || "");
    const messagesChanged =
      JSON.stringify(vA.messages || []) !== JSON.stringify(vB.messages || []);

    const schemaA = new Map(vA.variableSchema.map((s) => [s.name, s]));
    const schemaB = new Map(vB.variableSchema.map((s) => [s.name, s]));

    const variablesAdded: string[] = [];
    const variablesRemoved: string[] = [];
    const variablesModified: string[] = [];

    for (const name of schemaB.keys()) {
      if (!schemaA.has(name)) {
        variablesAdded.push(name);
      } else {
        const defA = schemaA.get(name)!;
        const defB = schemaB.get(name)!;
        if (JSON.stringify(defA) !== JSON.stringify(defB)) {
          variablesModified.push(name);
        }
      }
    }

    for (const name of schemaA.keys()) {
      if (!schemaB.has(name)) {
        variablesRemoved.push(name);
      }
    }

    const capabilitiesChanged =
      JSON.stringify(vA.requiredCapabilities || []) !==
      JSON.stringify(vB.requiredCapabilities || []);

    return {
      versionA: vA.version,
      versionB: vB.version,
      templateChanged,
      messagesChanged,
      variablesAdded,
      variablesRemoved,
      variablesModified,
      capabilitiesChanged,
    };
  }
}
