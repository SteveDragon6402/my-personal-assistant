import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, '../prompts');

export async function loadPrompt(name: string): Promise<string> {
  const filePath = join(promptsDir, name);
  return readFile(filePath, 'utf8');
}
