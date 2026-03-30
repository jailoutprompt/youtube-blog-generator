import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 레거시 OpenAI 호환용 (블로그 생성 등 기존 코드)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'unused',
});

export default openai;
