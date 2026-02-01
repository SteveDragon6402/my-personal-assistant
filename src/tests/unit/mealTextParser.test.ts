import { describe, it, expect } from 'vitest';
import { parseMealText } from '../../adapters/meal/mealTextParser.js';

describe('mealTextParser', () => {
  it('parses description only', () => {
    const r = parseMealText('chicken salad');
    expect(r.description).toBe('chicken salad');
    expect(r.calories).toBeUndefined();
    expect(r.protein).toBeUndefined();
  });

  it('parses calories and macros with shorthand', () => {
    const r = parseMealText('2 eggs toast 350 cal 25p 30c 15f');
    expect(r.description).toBe('2 eggs toast');
    expect(r.calories).toBe(350);
    expect(r.protein).toBe(25);
    expect(r.carbs).toBe(30);
    expect(r.fat).toBe(15);
  });

  it('parses kcal and g protein/carbs/fat', () => {
    const r = parseMealText('chicken salad 450 kcal 35g p 30c 20f');
    expect(r.description).toContain('chicken salad');
    expect(r.calories).toBe(450);
    expect(r.protein).toBe(35);
    expect(r.carbs).toBe(30);
    expect(r.fat).toBe(20);
  });

  it('returns Meal for empty input', () => {
    const r = parseMealText('');
    expect(r.description).toBe('Meal');
  });
});
