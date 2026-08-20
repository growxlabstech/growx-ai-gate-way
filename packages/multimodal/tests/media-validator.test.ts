import { describe, it, expect } from 'vitest';
import {
  MediaValidator,
  DEFAULT_ALLOWED_IMAGE_MIMES,
  DEFAULT_ALLOWED_AUDIO_MIMES,
} from '../src/media-validator.js';
import { MediaValidationError, PixelBombError } from '../src/types.js';

describe('MediaValidator', () => {
  it('validates standard image MIME types', () => {
    expect(() => MediaValidator.validateImageMime('image/png')).not.toThrow();
    expect(() => MediaValidator.validateImageMime('IMAGE/JPEG')).not.toThrow();
    expect(() => MediaValidator.validateImageMime('image/webp')).not.toThrow();
  });

  it('rejects unsupported image MIME types', () => {
    expect(() => MediaValidator.validateImageMime('image/svg+xml')).toThrow(MediaValidationError);
    expect(() => MediaValidator.validateImageMime('application/pdf')).toThrow(MediaValidationError);
  });

  it('validates safe image dimensions', () => {
    expect(() => MediaValidator.validateImageDimensions(1024, 1024)).not.toThrow();
    expect(() => MediaValidator.validateImageDimensions(4096, 4096)).not.toThrow();
  });

  it('rejects zero or negative image dimensions', () => {
    expect(() => MediaValidator.validateImageDimensions(0, 100)).toThrow(MediaValidationError);
    expect(() => MediaValidator.validateImageDimensions(100, -5)).toThrow(MediaValidationError);
  });

  it('detects and blocks pixel bombs (extremely large pixel count)', () => {
    // 10,000 x 10,000 = 100,000,000 pixels > 64,000,000 limit
    expect(() => MediaValidator.validateImageDimensions(10000, 10000, 64_000_000)).toThrow(PixelBombError);
  });

  it('validates audio MIME types', () => {
    expect(() => MediaValidator.validateAudioMime('audio/mp3')).not.toThrow();
    expect(() => MediaValidator.validateAudioMime('audio/wav')).not.toThrow();
    expect(() => MediaValidator.validateAudioMime('audio/flac')).not.toThrow();
  });

  it('rejects unsupported audio MIME types', () => {
    expect(() => MediaValidator.validateAudioMime('video/mp4')).toThrow(MediaValidationError);
    expect(() => MediaValidator.validateAudioMime('text/plain')).toThrow(MediaValidationError);
  });

  it('validates audio duration limits', () => {
    expect(() => MediaValidator.validateAudioDuration(120)).not.toThrow();
    expect(() => MediaValidator.validateAudioDuration(3600)).not.toThrow();
  });

  it('rejects negative or excessive audio duration', () => {
    expect(() => MediaValidator.validateAudioDuration(-10)).toThrow(MediaValidationError);
    expect(() => MediaValidator.validateAudioDuration(5000, 3600)).toThrow(MediaValidationError);
  });

  it('parses and validates base64 data URIs', () => {
    const rawData = 'Hello world buffer';
    const b64 = Buffer.from(rawData).toString('base64');
    const dataUri = `data:image/png;base64,${b64}`;

    const res = MediaValidator.validateBase64DataUri(dataUri, 1000);
    expect(res.mimeType).toBe('image/png');
    expect(res.byteLength).toBe(rawData.length);
  });

  it('rejects oversized data URIs', () => {
    const hugeData = 'x'.repeat(2000);
    const b64 = Buffer.from(hugeData).toString('base64');
    const dataUri = `data:image/jpeg;base64,${b64}`;

    expect(() => MediaValidator.validateBase64DataUri(dataUri, 500)).toThrow(MediaValidationError);
  });
});
