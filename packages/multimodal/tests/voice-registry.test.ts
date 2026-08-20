import { describe, it, expect } from 'vitest';
import { VoiceRegistry, CANONICAL_VOICES } from '../src/voice-registry.js';
import { VoiceUnsupportedError } from '../src/types.js';

describe('VoiceRegistry', () => {
  it('recognizes all canonical voices', () => {
    for (const voice of CANONICAL_VOICES) {
      expect(VoiceRegistry.isCanonicalVoice(voice)).toBe(true);
      expect(() => VoiceRegistry.validateVoice(voice)).not.toThrow();
    }
  });

  it('rejects unsupported voices', () => {
    expect(VoiceRegistry.isCanonicalVoice('unknown_celebrity')).toBe(false);
    expect(() => VoiceRegistry.validateVoice('unknown_celebrity')).toThrow(VoiceUnsupportedError);
  });

  it('maps canonical voices to provider-specific voice names', () => {
    expect(VoiceRegistry.mapToProviderVoice('alloy', 'openai')).toBe('alloy');
    expect(VoiceRegistry.mapToProviderVoice('nova', 'openai')).toBe('nova');
  });
});
