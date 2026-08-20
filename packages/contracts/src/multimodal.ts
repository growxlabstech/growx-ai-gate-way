import { z } from "zod";

// ==========================================
// 1. Multimodal Content Blocks (Chat / Vision)
// ==========================================

export const imageDetailSchema = z.enum(["auto", "low", "high"]);
export type ImageDetail = z.infer<typeof imageDetailSchema>;

export const imageContentBlockSchema = z.object({
  type: z.literal("image_url").default("image_url"),
  imageUrl: z.object({
    url: z.string().min(1),
    detail: imageDetailSchema.optional(),
  }),
  fileId: z.string().optional(),
});
export type ImageContentBlock = z.infer<typeof imageContentBlockSchema>;

export const audioContentBlockSchema = z.object({
  type: z.literal("input_audio").default("input_audio"),
  inputAudio: z.object({
    data: z.string().min(1),
    format: z.enum(["wav", "mp3", "flac", "ogg", "pcm16"]).default("mp3"),
  }),
  fileId: z.string().optional(),
});
export type AudioContentBlock = z.infer<typeof audioContentBlockSchema>;

// ==========================================
// 2. Image Generation & Editing Schemas
// ==========================================

export const imageSizeSchema = z.enum([
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1792",
  "1792x1024",
]);
export type ImageSize = z.infer<typeof imageSizeSchema>;

export const imageQualitySchema = z.enum(["standard", "hd"]);
export type ImageQuality = z.infer<typeof imageQualitySchema>;

export const imageResponseFormatSchema = z.enum(["url", "b64_json"]);
export type ImageResponseFormat = z.infer<typeof imageResponseFormatSchema>;

export const imageStyleSchema = z.enum(["vivid", "natural"]);
export type ImageStyle = z.infer<typeof imageStyleSchema>;

export const imageGenerationRequestSchema = z.object({
  model: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  n: z.number().int().min(1).max(10).optional().default(1),
  size: imageSizeSchema.optional().default("1024x1024"),
  quality: imageQualitySchema.optional().default("standard"),
  response_format: imageResponseFormatSchema.optional().default("url"),
  style: imageStyleSchema.optional(),
  user: z.string().max(256).optional(),
});
export type ImageGenerationRequest = z.input<typeof imageGenerationRequestSchema>;

export const imageGenerationDataItemSchema = z.object({
  url: z.string().optional(),
  b64_json: z.string().optional(),
  file_id: z.string().optional(),
  revised_prompt: z.string().optional(),
});
export type ImageGenerationDataItem = z.infer<typeof imageGenerationDataItemSchema>;

export const imageGenerationResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  data: z.array(imageGenerationDataItemSchema),
  usage: z.object({
    images_generated: z.number().int().nonnegative(),
  }).optional(),
});
export type ImageGenerationResponse = z.infer<typeof imageGenerationResponseSchema>;

export const imageEditRequestSchema = z.object({
  model: z.string().min(1).max(200),
  image: z.string().min(1), // fileId or base64
  mask: z.string().optional(), // fileId or base64
  prompt: z.string().min(1).max(4000),
  n: z.number().int().min(1).max(10).optional().default(1),
  size: imageSizeSchema.optional().default("1024x1024"),
  response_format: imageResponseFormatSchema.optional().default("url"),
  user: z.string().max(256).optional(),
});
export type ImageEditRequest = z.input<typeof imageEditRequestSchema>;

// ==========================================
// 3. Transcription (Speech-to-Text) Schemas
// ==========================================

export const transcriptionResponseFormatSchema = z.enum([
  "json",
  "text",
  "srt",
  "verbose_json",
  "vtt",
]);
export type TranscriptionResponseFormat = z.infer<typeof transcriptionResponseFormatSchema>;

export const transcriptionTimestampGranularitySchema = z.enum(["segment", "word"]);
export type TranscriptionTimestampGranularity = z.infer<typeof transcriptionTimestampGranularitySchema>;

export const transcriptionRequestSchema = z.object({
  model: z.string().min(1).max(200),
  file_id: z.string().optional(),
  file: z.string().optional(), // base64 or file reference
  language: z.string().max(10).optional(),
  prompt: z.string().max(1000).optional(),
  response_format: transcriptionResponseFormatSchema.optional().default("json"),
  temperature: z.number().min(0).max(1).optional().default(0),
  timestamp_granularities: z.array(transcriptionTimestampGranularitySchema).optional(),
});
export type TranscriptionRequest = z.input<typeof transcriptionRequestSchema>;

export const transcriptionSegmentSchema = z.object({
  id: z.number().int().nonnegative(),
  seek: z.number().nonnegative().optional(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  tokens: z.array(z.number().int()).optional(),
  temperature: z.number().optional(),
  avg_logprob: z.number().optional(),
  compression_ratio: z.number().optional(),
  no_speech_prob: z.number().optional(),
});
export type TranscriptionSegment = z.infer<typeof transcriptionSegmentSchema>;

export const transcriptionWordSchema = z.object({
  word: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});
export type TranscriptionWord = z.infer<typeof transcriptionWordSchema>;

export const transcriptionResponseSchema = z.object({
  text: z.string(),
  task: z.literal("transcribe").default("transcribe"),
  language: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  segments: z.array(transcriptionSegmentSchema).optional(),
  words: z.array(transcriptionWordSchema).optional(),
});
export type TranscriptionResponse = z.infer<typeof transcriptionResponseSchema>;

// ==========================================
// 4. Speech Synthesis (Text-to-Speech) Schemas
// ==========================================

export const canonicalVoiceSchema = z.enum([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);
export type CanonicalVoice = z.infer<typeof canonicalVoiceSchema>;

export const speechAudioFormatSchema = z.enum([
  "mp3",
  "opus",
  "aac",
  "flac",
  "wav",
  "pcm",
]);
export type SpeechAudioFormat = z.infer<typeof speechAudioFormatSchema>;

export const speechRequestSchema = z.object({
  model: z.string().min(1).max(200),
  input: z.string().min(1).max(4096),
  voice: z.union([canonicalVoiceSchema, z.string().min(1)]),
  response_format: speechAudioFormatSchema.optional().default("mp3"),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
});
export type SpeechRequest = z.input<typeof speechRequestSchema>;

export const speechResponseSchema = z.object({
  fileId: z.string().optional(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative().optional(),
  audioBase64: z.string().optional(),
});
export type SpeechResponse = z.infer<typeof speechResponseSchema>;

// ==========================================
// 5. Canonical Multimodal Model Capability Metadata
// ==========================================

export const multimodalModelMetadataSchema = z.object({
  supportsVision: z.boolean().default(false),
  supportsImageGeneration: z.boolean().default(false),
  supportsImageEdit: z.boolean().default(false),
  supportsAudioInput: z.boolean().default(false),
  supportsTranscription: z.boolean().default(false),
  supportsSpeech: z.boolean().default(false),
  maxImageCount: z.number().int().positive().default(10),
  maxImageBytes: z.number().int().positive().default(20 * 1024 * 1024),
  supportedImageFormats: z.array(z.string()).default(["image/jpeg", "image/png", "image/webp"]),
  supportedImageSizes: z.array(imageSizeSchema).optional(),
  supportedImageQualities: z.array(imageQualitySchema).optional(),
  maxAudioSeconds: z.number().int().positive().default(3600),
  maxAudioBytes: z.number().int().positive().default(25 * 1024 * 1024),
  supportedAudioFormats: z.array(z.string()).default(["audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/flac"]),
  supportedVoices: z.array(z.string()).optional(),
  supportedSpeechFormats: z.array(speechAudioFormatSchema).optional(),
});
export type MultimodalModelMetadata = z.infer<typeof multimodalModelMetadataSchema>;
