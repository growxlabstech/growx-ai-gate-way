import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditRequest,
  TranscriptionRequest,
  TranscriptionResponse,
  SpeechRequest,
  SpeechResponse,
} from "@growx/contracts";
import type { ProviderImageAdapter } from "./provider-image-adapter.js";
import type { ProviderAudioAdapter } from "./provider-audio-adapter.js";

export class DeterministicMultimodalAdapter implements ProviderImageAdapter, ProviderAudioAdapter {
  public readonly providerId = "deterministic";

  // 1x1 transparent PNG base64
  private readonly TRANSPARENT_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  public translateGenerationRequest(request: ImageGenerationRequest) {
    return {
      urlPath: "/local/images/generations",
      method: "POST" as const,
      body: { prompt: request.prompt, n: request.n },
    };
  }

  public parseGenerationResponse(_rawResponse: unknown, request: ImageGenerationRequest): ImageGenerationResponse {
    const items = Array.from({ length: request.n || 1 }, (_, i) => ({
      b64_json: this.TRANSPARENT_PNG_BASE64,
      revised_prompt: `Enhanced prompt: ${request.prompt}`,
    }));

    return {
      created: Math.floor(Date.now() / 1000),
      data: items,
      usage: {
        images_generated: items.length,
      },
    };
  }

  public translateEditRequest(request: ImageEditRequest) {
    return {
      urlPath: "/local/images/edits",
      method: "POST" as const,
      body: { prompt: request.prompt, n: request.n },
    };
  }

  public parseEditResponse(_rawResponse: unknown, request: ImageEditRequest): ImageGenerationResponse {
    return this.parseGenerationResponse(_rawResponse, request as any);
  }

  public translateTranscriptionRequest(request: TranscriptionRequest) {
    return {
      urlPath: "/local/audio/transcriptions",
      method: "POST" as const,
      body: { model: request.model },
    };
  }

  public parseTranscriptionResponse(_rawResponse: unknown, request: TranscriptionRequest): TranscriptionResponse {
    const mockText = "This is a deterministic transcription output from GrowX multimodal engine.";
    return {
      text: mockText,
      task: "transcribe",
      language: request.language || "en",
      duration: 3.5,
      segments: [
        {
          id: 0,
          start: 0.0,
          end: 3.5,
          text: mockText,
          avg_logprob: -0.15,
          no_speech_prob: 0.01,
        },
      ],
      words: [
        { word: "This", start: 0.0, end: 0.4 },
        { word: "is", start: 0.5, end: 0.7 },
        { word: "a", start: 0.8, end: 0.9 },
        { word: "transcription", start: 1.0, end: 2.0 },
      ],
    };
  }

  public translateSpeechRequest(request: SpeechRequest) {
    return {
      urlPath: "/local/audio/speech",
      method: "POST" as const,
      body: { input: request.input, voice: request.voice },
    };
  }

  public parseSpeechResponse(_rawResponse: unknown, request: SpeechRequest): SpeechResponse {
    // Generate valid 44-byte standard WAV header + 100 bytes PCM silence
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = 200;
    const header = Buffer.alloc(44 + dataSize);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    const b64 = header.toString("base64");
    const estimatedDuration = dataSize / (sampleRate * (bitsPerSample / 8));

    return {
      mimeType: `audio/${request.response_format || "wav"}`,
      sizeBytes: header.length,
      durationSeconds: estimatedDuration,
      audioBase64: b64,
    };
  }
}
