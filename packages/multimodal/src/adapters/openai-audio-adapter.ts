import type {
  TranscriptionRequest,
  TranscriptionResponse,
  SpeechRequest,
  SpeechResponse,
} from "@growx/contracts";
import type { ProviderAudioAdapter } from "./provider-audio-adapter.js";
import { MediaValidationError } from "../types.js";
import { VoiceRegistry } from "../voice-registry.js";

export class OpenAIAudioAdapter implements ProviderAudioAdapter {
  public readonly providerId = "openai";

  public translateTranscriptionRequest(
    request: TranscriptionRequest,
    audioData?: string | Buffer,
  ) {
    const body: Record<string, unknown> = {
      model: request.model,
      response_format: request.response_format || "json",
      temperature: request.temperature,
    };

    if (request.language) {
      body.language = request.language;
    }
    if (request.prompt) {
      body.prompt = request.prompt;
    }
    if (
      request.timestamp_granularities &&
      request.timestamp_granularities.length > 0
    ) {
      body.timestamp_granularities = request.timestamp_granularities;
    }
    if (audioData) {
      body.file = audioData;
    }

    return {
      urlPath: "/v1/audio/transcriptions",
      method: "POST" as const,
      body,
    };
  }

  public parseTranscriptionResponse(
    rawResponse: unknown,
    request: TranscriptionRequest,
  ): TranscriptionResponse {
    if (!rawResponse || typeof rawResponse !== "object") {
      if (typeof rawResponse === "string") {
        return {
          text: rawResponse,
          task: "transcribe",
        };
      }
      throw new MediaValidationError(
        "OPENAI_TRANSCRIPTION_MALFORMED",
        "OpenAI transcription response is invalid",
      );
    }

    const data = rawResponse as any;
    return {
      text: data.text || "",
      task: "transcribe",
      language: data.language,
      duration: data.duration,
      segments: data.segments?.map((s: any) => ({
        id: s.id,
        seek: s.seek,
        start: s.start,
        end: s.end,
        text: s.text,
        tokens: s.tokens,
        temperature: s.temperature,
        avg_logprob: s.avg_logprob,
        compression_ratio: s.compression_ratio,
        no_speech_prob: s.no_speech_prob,
      })),
      words: data.words?.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })),
    };
  }

  public translateSpeechRequest(request: SpeechRequest) {
    VoiceRegistry.validateVoice(request.voice);
    const providerVoice = VoiceRegistry.mapToProviderVoice(
      request.voice,
      this.providerId,
    );

    const body: Record<string, unknown> = {
      model: request.model,
      input: request.input,
      voice: providerVoice,
      response_format: request.response_format || "mp3",
      speed: request.speed || 1.0,
    };

    return {
      urlPath: "/v1/audio/speech",
      method: "POST" as const,
      body,
    };
  }

  public parseSpeechResponse(
    rawResponse: unknown,
    request: SpeechRequest,
  ): SpeechResponse {
    if (Buffer.isBuffer(rawResponse)) {
      return {
        mimeType: `audio/${request.response_format || "mp3"}`,
        sizeBytes: rawResponse.length,
        audioBase64: rawResponse.toString("base64"),
      };
    }

    if (
      rawResponse &&
      typeof rawResponse === "object" &&
      (rawResponse as any).audioBase64
    ) {
      const b64 = (rawResponse as any).audioBase64;
      return {
        mimeType: `audio/${request.response_format || "mp3"}`,
        sizeBytes: Buffer.from(b64, "base64").length,
        audioBase64: b64,
      };
    }

    throw new MediaValidationError(
      "OPENAI_SPEECH_MALFORMED",
      "Invalid speech response payload",
    );
  }
}
