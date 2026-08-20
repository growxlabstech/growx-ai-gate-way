import type {
  TranscriptionRequest,
  TranscriptionResponse,
  SpeechRequest,
  SpeechResponse,
} from "@growx/contracts";

export interface ProviderAudioAdapter {
  readonly providerId: string;

  translateTranscriptionRequest(
    request: TranscriptionRequest,
    audioData?: string | Buffer
  ): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  };

  parseTranscriptionResponse(rawResponse: unknown, request: TranscriptionRequest): TranscriptionResponse;

  translateSpeechRequest(request: SpeechRequest): {
    urlPath: string;
    method: "POST";
    body: Record<string, unknown>;
  };

  parseSpeechResponse(rawResponse: unknown, request: SpeechRequest): SpeechResponse;
}
