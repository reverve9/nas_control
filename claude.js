import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 다시 로드
config({ path: path.join(__dirname, '.env') });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// 프로젝트 폴더 목록 가져오기
export function getProjectFolders(basePath, year) {
  const yearPath = path.join(basePath, year);
  try {
    const items = fs.readdirSync(yearPath, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory() && !item.name.startsWith('00_temp'))
      .map(item => item.name);
  } catch (error) {
    console.error('폴더 목록 읽기 실패:', error);
    return [];
  }
}

// 파일 내용 읽기 (텍스트 파일인 경우)
function readFileContent(filePath) {
  const textExtensions = ['.txt', '.md', '.json', '.xml', '.html', '.css', '.js'];
  const ext = path.extname(filePath).toLowerCase();
  
  if (textExtensions.includes(ext)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.substring(0, 1000); // 처음 1000자만
    } catch {
      return null;
    }
  }
  return null;
}

// AI 분류 요청
export async function classifyFile(fileInfo, projectFolders) {
  const fileContent = readFileContent(fileInfo.path);
  
  const prompt = `당신은 파일 분류 전문가입니다. 아래 파일 정보를 보고 가장 적절한 프로젝트 폴더를 추천해주세요.

## 파일 정보
- 파일명: ${fileInfo.name}
- 확장자: ${fileInfo.extension}
- 크기: ${fileInfo.size} bytes
- 수정일: ${fileInfo.modified}
${fileContent ? `- 파일 내용 일부: ${fileContent}` : ''}

## 사용 가능한 프로젝트 폴더
${projectFolders.map(f => `- ${f}`).join('\n')}

## 각 프로젝트 폴더 내 일반적인 하위 구조
- 디자인/ (ai, psd, png, jpg 등)
- 영상/ (mp4, mov, prproj, aep 등)  
- 소스/ (원본 파일들)
- 계약/ (pdf, docx 등 계약 관련)
- 정산/ (xlsx, pdf 등 정산 관련)
- 기획/ (pptx, pdf, docx 등)

## 응답 형식 (JSON만 반환)
{
  "project": "추천 프로젝트 폴더명",
  "subfolder": "추천 하위 폴더명",
  "confidence": "high/medium/low",
  "reason": "추천 이유 (한국어로 간단히)"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    // JSON 부분만 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('JSON 파싱 실패');
  } catch (error) {
    console.error('AI 분류 실패:', error);
    throw error;
  }
}
