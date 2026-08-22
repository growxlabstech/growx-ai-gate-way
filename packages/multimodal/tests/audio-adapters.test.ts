import { describe, it, expect } from "vitest";
import { OpenAIAudioAdapter } from "../src/adapters/openai-audio-adapter.js";
import { DeterministicMultimodalAdapter } from "../src/adapters/deterministic-multimodal-adapter.js";
import type { TranscriptionRequest, SpeechRequest } from "@growx/contracts";

describe("Provider Audio Adapters", () => {
  const transReq: TranscriptionRequest = {
    model: "whisper-1",
    language: "en",
    temperature: 0.2,
    response_format: "verbose_json",
    timestamp_granularities: ["segment", "word"],
  };

  const speechReq: SpeechRequest = {
    model: "tts-1",
    input: "Hello from GrowX multimodal speech service",
    voice: "alloy",
    response_format: "mp3",
    speed: 1.0,
  };

  it("OpenAI audio adapter translates transcription request", () => {
    const adapter = new OpenAIAudioAdapter();
    const translated = adapter.translateTranscriptionRequest(transReq);

    expect(translated.urlPath).toBe("/v1/audio/transcriptions");
    expect(translated.body.model).toBe("whisper-1");
    expect(translated.body.language).toBe("en");
    expect(translated.body.timestamp_granularities).toEqual([
      "segment",
      "word",
    ]);
  });

  it("OpenAI audio adapter parses transcription response with timestamps", () => {
    const adapter = new OpenAIAudioAdapter();
    const rawResponse = {
      text: "Hello world",
      language: "english",
      duration: 2.5,
      segments: [
        { id: 0, start: 0.0, end: 2.5, text: "Hello world", avg_logprob: -0.2 },
      ],
      words: [
        { word: "Hello", start: 0.0, end: 1.0 },
        { word: "world", start: 1.1, end: 2.5 },
      ],
    };

    const parsed = adapter.parseTranscriptionResponse(rawResponse, transReq);
    expect(parsed.text).toBe("Hello world");
    expect(parsed.duration).toBe(2.5);
    expect(parsed.segments?.length).toBe(1);
    expect(parsed.words?.length).toBe(2);
  });

  it("OpenAI audio adapter translates speech synthesis request", () => {
    const adapter = new OpenAIAudioAdapter();
    const translated = adapter.translateSpeechRequest(speechReq);

    expect(translated.urlPath).toBe("/v1/audio/speech");
    expect(translated.body.model).toBe("tts-1");
    expect(translated.body.voice).toBe("alloy");
    expect(translated.body.input).toBe(
      "Hello from GrowX multimodal speech service",
    );
  });

  it("Deterministic adapter generates mock transcription and speech WAV buffer", () => {
    const adapter = new DeterministicMultimodalAdapter();

    const transParsed = adapter.parseTranscriptionResponse({}, transReq);
    expect(transParsed.text.length).toBeGreaterThan(0);
    expect(transParsed.segments?.length).toBeGreaterThan(0);

    const speechParsed = adapter.parseSpeechResponse({}, speechReq);
    expect(speechParsed.mimeType).toBe("audio/mp3");
    expect(speechParsed.sizeBytes).toBeGreaterThan(44);
    expect(typeof speechParsed.audioBase64).toBe("string");
  });
});
