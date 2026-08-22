import { VoiceUnsupportedError } from "./types.js";

export const CANONICAL_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

export type CanonicalVoiceName = (typeof CANONICAL_VOICES)[number];

export class VoiceRegistry {
  private static readonly providerVoiceMap: Record<
    string,
    Record<string, string>
  > = {
    openai: {
      alloy: "alloy",
      echo: "echo",
      fable: "fable",
      onyx: "onyx",
      nova: "nova",
      shimmer: "shimmer",
    },
  };

  public static isCanonicalVoice(voice: string): boolean {
    return CANONICAL_VOICES.includes(voice.toLowerCase() as CanonicalVoiceName);
  }

  public static validateVoice(
    voice: string,
    modelSupportedVoices?: readonly string[],
  ): void {
    const norm = voice.toLowerCase().trim();
    const allowed =
      modelSupportedVoices && modelSupportedVoices.length > 0
        ? modelSupportedVoices
        : CANONICAL_VOICES;

    if (!allowed.includes(norm)) {
      throw new VoiceUnsupportedError(voice, Array.from(allowed));
    }
  }

  public static mapToProviderVoice(voice: string, providerId: string): string {
    const norm = voice.toLowerCase().trim();
    const providerMap = this.providerVoiceMap[providerId];
    if (providerMap && providerMap[norm]) {
      return providerMap[norm]!;
    }
    return norm;
  }
}
