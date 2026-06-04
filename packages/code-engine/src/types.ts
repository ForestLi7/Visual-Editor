import type { DiffDisplayLine } from './unifiedDiff.js';
import type { SideBySideRow } from './sideBySideDiff.js';

export interface FileHunk {
  id: string;
  file: string;
  description: string;
  oldLines: string[];
  newLines: string[];
  selected: boolean;
  diffLines?: DiffDisplayLine[];
  sideBySideRows?: SideBySideRow[];
  additions?: number;
  deletions?: number;
}

export interface VisualEditorConfig {
  projectId: string;
  tokens: Record<string, string>;
  fileMap: Record<string, string>;
}
