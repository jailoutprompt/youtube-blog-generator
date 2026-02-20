export type BlogTone = 'informative' | 'casual' | 'expert';
export type BlogModel = 'gpt-4o-mini' | 'gpt-4o';

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
