export type BlogTone = 'informative' | 'casual' | 'expert';
export type BlogModel = 'gpt-4o-mini' | 'gpt-4o' | 'gemini-2.0-flash';

export type BlogTemplate = 'general' | 'review' | 'tutorial' | 'news' | 'essay';

export interface GenerateBlogRequest {
  youtubeUrl: string;
  tone?: BlogTone;
  model?: BlogModel;
  template?: BlogTemplate;
}

export interface BlogData {
  title: string;
  subtitle: string;
  outline: string[];
  content: string;
  tags: string[];
  summary: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranscriptResult {
  text: string;
  source: 'subtitle' | 'whisper' | 'mock';
}

export interface EbookOutline {
  title: string;
  subtitle: string;
  chapterOrder: number[];
  chapterTitles: string[];
  introDirection: string;
  conclusionDirection: string;
}

export interface EbookChapterResult {
  content: string;
}

// ── 전자책 프리뷰 생성 (create-preview) ──

export interface EbookPreviewRequest {
  content: string;
  title?: string;
  author?: string;
}

export interface EbookPreviewChapter {
  title: string;
  subtitle?: string;
  sections: EbookPreviewSection[];
}

export interface EbookPreviewSection {
  type: 'text' | 'stats' | 'list' | 'quote' | 'table' | 'timeline' | 'comparison';
  content: any;
}

export type EbookColorScheme = 'business' | 'tech' | 'education' | 'creative' | 'minimal';

export interface EbookPreviewStructure {
  title: string;
  subtitle: string;
  author: string;
  colorScheme: EbookColorScheme;
  chapters: EbookPreviewChapter[];
  totalPages: number;
}

export interface EbookPreviewResult {
  htmlPath: string;
  pdfPath: string;
  previewUrl: string;
  pdfUrl: string;
  pages: number;
  orderId: string;
}
