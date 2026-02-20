export interface GenerateBlogRequest {
  youtubeUrl: string;
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
