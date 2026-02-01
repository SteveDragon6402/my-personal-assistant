/**
 * Parse meal log text into description + optional macros.
 * Handles: "2 eggs toast 350 cal 25p 30c 15f", "chicken salad 450 kcal 35g p 30c 20f", etc.
 */
export interface ParsedMeal {
  description: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

const CAL_PATTERNS = [
  /(\d+)\s*(?:cal|kcal|calories?)\b/i,
  /\b(\d+)\s*(?:cal|kcal)\s*(?:\s|$)/i,
];
const PROTEIN_PATTERNS = [
  /(\d+)\s*g?\s*p\b/i,
  /(\d+)\s*(?:g\s*)?protein\b/i,
];
const CARBS_PATTERNS = [
  /(\d+)\s*g?\s*c\b/i,
  /(\d+)\s*(?:g\s*)?carbs?\b/i,
];
const FAT_PATTERNS = [
  /(\d+)\s*g?\s*f\b/i,
  /(\d+)\s*(?:g\s*)?fat\b/i,
];

export function parseMealText(text: string): ParsedMeal {
  const t = text.trim();
  if (!t) {
    return { description: 'Meal' };
  }

  let working = t;
  let calories: number | undefined;
  let protein: number | undefined;
  let carbs: number | undefined;
  let fat: number | undefined;

  for (const re of CAL_PATTERNS) {
    const m = working.match(re);
    if (m?.[1]) {
      calories = parseInt(m[1], 10);
      working = working.replace(m[0], ' ').trim();
      break;
    }
  }
  for (const re of PROTEIN_PATTERNS) {
    const m = working.match(re);
    if (m?.[1]) {
      protein = parseInt(m[1], 10);
      working = working.replace(m[0], ' ').trim();
      break;
    }
  }
  for (const re of CARBS_PATTERNS) {
    const m = working.match(re);
    if (m?.[1]) {
      carbs = parseInt(m[1], 10);
      working = working.replace(m[0], ' ').trim();
      break;
    }
  }
  for (const re of FAT_PATTERNS) {
    const m = working.match(re);
    if (m?.[1]) {
      fat = parseInt(m[1], 10);
      working = working.replace(m[0], ' ').trim();
      break;
    }
  }

  // Collapse multiple spaces and trim
  const description = working.replace(/\s+/g, ' ').trim() || 'Meal';

  const result: ParsedMeal = { description };
  if (calories !== undefined) result.calories = calories;
  if (protein !== undefined) result.protein = protein;
  if (carbs !== undefined) result.carbs = carbs;
  if (fat !== undefined) result.fat = fat;
  return result;
}
