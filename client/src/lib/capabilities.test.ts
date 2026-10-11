import { describe, expect, it } from 'vitest';
import { isLowPowerDevice } from './capabilities';

describe('isLowPowerDevice', () => {
  it('falls back to the static background on data-saver, low memory, or few cores', () => {
    expect(isLowPowerDevice({ connection: { saveData: true } })).toBe(true);
    expect(isLowPowerDevice({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true);
    expect(isLowPowerDevice({ deviceMemory: 8, hardwareConcurrency: 2 })).toBe(true);
  });

  it('keeps the animation on capable devices and when hints are unavailable', () => {
    expect(isLowPowerDevice({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
    expect(isLowPowerDevice({})).toBe(false);
  });
});
