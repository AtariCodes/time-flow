import { describe, expect, it } from 'vitest';
import { isHexColor, readableTextColor } from '../src/lib/color';

describe('color', () => {
  it('picks a readable text color', () => {
    expect(readableTextColor('#4f46e5')).toBe('#ffffff');
    expect(readableTextColor('#facc15')).toBe('#0f172a');
    expect(readableTextColor('#ffffff')).toBe('#0f172a');
    expect(readableTextColor('not-a-color')).toBe('#ffffff');
  });

  it('validates hex colors', () => {
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('red; background:url(x)')).toBe(false);
  });
});
