export interface CaptureInput {
  rawText: string;
  content: string;
  tags: string[];
  categoryHint?: string;
}

export interface CategorySuggestion {
  category: string;
  confidence: number;
  title?: string;
}

export type CaptureOutcome =
  | {
      status: 'created';
      path: string;
      category: string;
      title: string;
    }
  | {
      status: 'appended';
      path: string;
    }
  | {
      status: 'pending';
      suggestedCategory?: string;
      confidence?: number;
    };
