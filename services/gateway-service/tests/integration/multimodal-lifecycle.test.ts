import { describe, it, expect, beforeEach } from "vitest";
import { GatewayEngine } from "../../src/application/gateway-engine.js";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";
import type { MachineAuthContext } from "@growx/api-key-service";

function createMockAuth(
  overrides: Partial<MachineAuthContext> = {},
): MachineAuthContext {
  return {
    actorType: "apiKey",
    apiKeyId: "key_test_mm_123",
    organizationId: "org_gw_mm",
    workspaceId: "ws_test_mm",
    environmentId: "env_test_mm",
    environment: "production",
    permissions: [
      "images.generate",
      "images.edit",
      "audio.transcribe",
      "audio.speech",
      "chat.completions.create",
      "responses.create",
      "models.read",
    ],
    modelRules: [],
    rateLimits: [],
    ...overrides,
  } as MachineAuthContext;
}

describe("Multimodal Gateway Integration (Phase 33)", () => {
  let fixture: TestGatewayFixture;
  let engine: GatewayEngine;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    engine = fixture.gatewayEngine;

    // Seed DALL-E 3 Image Generation Model
    const dalle3 = await fixture.modelService.createModel(
      {
        canonicalId: "openai/dall-e-3",
        displayName: "DALL-E 3",
        family: "dall-e",
        category: "image",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 4096,
        maxOutputTokens: 1024,
        supportsStreaming: false,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        capabilities: ["images.generate" as any, "images.edit" as any],
        inputModalities: ["text"],
        outputModalities: ["image" as any],
        metadata: {
          multimodal: {
            supportsImageGeneration: true,
            supportsImageEdit: true,
            supportedImageSizes: ["1024x1024", "1024x1792", "1792x1024"],
            supportedImageQualities: ["standard", "hd"],
          },
        },
      },
      "usr_operator",
    );

    await fixture.modelService.addProviderRoute(
      {
        modelId: dalle3.id,
        providerId: "deterministic",
        providerModelId: "dall-e-3",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 100,
      },
      "usr_operator",
    );

    // Seed Whisper Audio Transcription Model
    const whisper = await fixture.modelService.createModel(
      {
        canonicalId: "openai/whisper-1",
        displayName: "Whisper 1",
        family: "whisper",
        category: "transcription" as any,
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 4096,
        maxOutputTokens: 1024,
        supportsStreaming: false,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        capabilities: ["audio.transcribe" as any],
        inputModalities: ["audio" as any],
        outputModalities: ["text"],
        metadata: {
          multimodal: {
            supportsTranscription: true,
            maxAudioSeconds: 3600,
            supportedAudioFormats: ["audio/mp3", "audio/wav", "audio/m4a"],
          },
        },
      },
      "usr_operator",
    );

    await fixture.modelService.addProviderRoute(
      {
        modelId: whisper.id,
        providerId: "deterministic",
        providerModelId: "whisper-1",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 100,
      },
      "usr_operator",
    );

    // Seed TTS Speech Synthesis Model
    const tts = await fixture.modelService.createModel(
      {
        canonicalId: "openai/tts-1",
        displayName: "Text to Speech 1",
        family: "tts",
        category: "speech" as any,
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 4096,
        maxOutputTokens: 1024,
        supportsStreaming: false,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        capabilities: ["audio.speech" as any],
        inputModalities: ["text"],
        outputModalities: ["audio" as any],
        metadata: {
          multimodal: {
            supportsSpeech: true,
            supportedVoices: [
              "alloy",
              "echo",
              "fable",
              "onyx",
              "nova",
              "shimmer",
            ],
            supportedSpeechFormats: ["mp3", "wav", "opus", "aac", "flac"],
          },
        },
      },
      "usr_operator",
    );

    await fixture.modelService.addProviderRoute(
      {
        modelId: tts.id,
        providerId: "deterministic",
        providerModelId: "tts-1",
        region: "global",
        status: "active",
        routingEligible: true,
        priority: 100,
      },
      "usr_operator",
    );
  });

  it("executes image generation and returns valid image items", async () => {
    const auth = createMockAuth();
    const response = await engine.executeImageGeneration(auth, {
      model: "openai/dall-e-3",
      prompt: "A neon cyberpunk cityscape with flying cars",
      n: 1,
      size: "1024x1024",
      quality: "hd",
    });

    expect(response).toBeDefined();
    expect(response.data.length).toBe(1);
    expect(response.data[0]!.b64_json).toBeDefined();
    expect(response.data[0]!.revised_prompt).toContain(
      "A neon cyberpunk cityscape",
    );
    expect(response.usage?.images_generated).toBe(1);
  });

  it("rejects image generation when API key lacks images.generate permission", async () => {
    const auth = createMockAuth({
      permissions: ["chat.completions.create"], // missing images.generate
    });

    await expect(
      engine.executeImageGeneration(auth, {
        model: "openai/dall-e-3",
        prompt: "A beautiful mountain landscape",
      }),
    ).rejects.toThrow(/API key lacks 'images.generate' capability/);
  });

  it("rejects image generation on non-image models", async () => {
    const auth = createMockAuth();
    await expect(
      engine.executeImageGeneration(auth, {
        model: "openai/gpt-4o-mini",
        prompt: "Try to generate image with text model",
      }),
    ).rejects.toThrow(/not an image generation model/);
  });

  it("executes image editing request", async () => {
    const auth = createMockAuth();
    const response = await engine.executeImageEdit(auth, {
      model: "openai/dall-e-3",
      image:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      prompt: "Add a red hat to the subject",
      n: 1,
    });

    expect(response).toBeDefined();
    expect(response.data.length).toBe(1);
  });

  it("rejects image editing when API key lacks images.edit permission", async () => {
    const auth = createMockAuth({
      permissions: ["images.generate" as any], // missing images.edit
    });

    await expect(
      engine.executeImageEdit(auth, {
        model: "openai/dall-e-3",
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        prompt: "Edit this image",
      }),
    ).rejects.toThrow(/API key lacks 'images.edit' capability/);
  });

  it("executes audio transcription with normalized segments and words", async () => {
    const auth = createMockAuth();
    const response = await engine.executeTranscription(auth, {
      model: "openai/whisper-1",
      language: "en",
    });

    expect(response).toBeDefined();
    expect(response.task).toBe("transcribe");
    expect(response.text.length).toBeGreaterThan(0);
    expect(response.duration).toBeGreaterThan(0);
    expect(response.segments && response.segments.length > 0).toBe(true);
    expect(response.words && response.words.length > 0).toBe(true);
  });

  it("rejects audio transcription when API key lacks audio.transcribe permission", async () => {
    const auth = createMockAuth({
      permissions: ["images.generate" as any], // missing audio.transcribe
    });

    await expect(
      engine.executeTranscription(auth, {
        model: "openai/whisper-1",
      }),
    ).rejects.toThrow(/API key lacks 'audio.transcribe' capability/);
  });

  it("executes text-to-speech synthesis with canonical voice", async () => {
    const auth = createMockAuth();
    const response = await engine.executeSpeech(auth, {
      model: "openai/tts-1",
      input:
        "GrowX AI Multimodal Gateway brings unified multimodal intelligence.",
      voice: "alloy",
      response_format: "wav",
    });

    expect(response).toBeDefined();
    expect(response.mimeType).toBe("audio/wav");
    expect(response.sizeBytes).toBeGreaterThan(44); // WAV header
    expect(response.audioBase64).toBeDefined();
  });

  it("rejects speech synthesis with unsupported voice", async () => {
    const auth = createMockAuth();
    await expect(
      engine.executeSpeech(auth, {
        model: "openai/tts-1",
        input: "Test voice",
        voice: "invalid_alien_voice" as any,
      }),
    ).rejects.toThrow(/Voice 'invalid_alien_voice' is unsupported/);
  });

  it("rejects speech synthesis when API key lacks audio.speech permission", async () => {
    const auth = createMockAuth({
      permissions: ["images.generate" as any], // missing audio.speech
    });

    await expect(
      engine.executeSpeech(auth, {
        model: "openai/tts-1",
        input: "Test speech permission",
        voice: "alloy",
      }),
    ).rejects.toThrow(/API key lacks 'audio.speech' capability/);
  });
});
