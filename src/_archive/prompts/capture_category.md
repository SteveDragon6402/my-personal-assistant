You are helping categorize a personal note into an Obsidian vault.

Available categories (one per line):
{{CATEGORIES}}

Note content:
{{CONTENT}}

Return ONLY a JSON object with:
- category: exact category path from the list
- confidence: number between 0 and 1
- title: short suggested note title (optional)

Example:
{"category":"Areas/Health","confidence":0.86,"title":"Zone 2 training article"}
