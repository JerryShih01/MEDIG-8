import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Search, Calendar, Stethoscope, ExternalLink, Sparkles, ChevronRight, Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Download, Copy, Check, Table as TableIcon, Pill, AlertCircle } from 'lucide-react';

// --- Types ---

export interface SearchResult {
  id: string;
  title: string;
  source: string;
  url: string;
  summary: string;
  date: string;
}

export interface TableRow {
  aspect: string;
  value1: string; // e.g., Old Drug / Placebo
  value2: string; // e.g., New Drug / Intervention
}

export interface IgPostContent {
  headline: string;
  caption: string;
  hashtags: string[];
  comparisonTable: {
    title: string;
    headers: [string, string, string]; // Aspect, Item A, Item B
    rows: TableRow[];
  };
}

export interface GeneratedPost {
  content: IgPostContent;
  imageUrl: string;
}

export enum LoadingState {
  IDLE,
  SEARCHING,
  GENERATING_POST,
  GENERATING_IMAGE,
  COMPLETE,
  ERROR
}

// --- Services ---

// Helper to initialize the client safely
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please ensure process.env.API_KEY is available.");
  }
  return new GoogleGenAI({ apiKey });
};

export const searchMedicalArticles = async (topic: string, startDate: string, endDate: string): Promise<SearchResult[]> => {
  const ai = getAiClient();
  
  const query = topic.trim() 
    ? `"${topic}"` 
    : "top trending medical news, new drug approvals, or significant clinical trial results (Phase 3)";

  const prompt = `
    Find recent ${query} published between ${startDate} and ${endDate}.
    Focus on reputable medical sources (FDA, EMA, NEJM, Lancet, etc.).
    
    For each finding, provide:
    1. A concise title.
    2. The source name.
    3. The URL.
    4. A brief summary in Traditional Chinese (Taiwan).
    5. The publication date.

    Limit to the top 5 most significant results to ensure high quality and fast response.
    Use the Google Search tool to find real-time information.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 8192,
      },
    });

    const text = response.text;
    if (!text) return [];
    
    // Clean potential markdown fencing just in case
    const cleanText = text.replace(/```json|```/g, '').trim();
    let results = JSON.parse(cleanText);
    
    // Safety check: if results is wrapped in an object like { results: [...] }, unwrap it
    if (!Array.isArray(results)) {
       if (results && typeof results === 'object') {
          if (Array.isArray(results.results)) results = results.results;
          else if (Array.isArray(results.items)) results = results.items;
          else if (Array.isArray(results.data)) results = results.data;
          else return []; // Could not find an array
       } else {
          return [];
       }
    }

    return results.map((r: any, index: number) => ({
      ...r,
      id: `res-${index}-${Date.now()}`
    }));
  } catch (error) {
    console.error("Search failed:", error);
    throw error;
  }
};

export const generateIgContent = async (article: SearchResult): Promise<IgPostContent> => {
  const ai = getAiClient();

  const prompt = `
    You are a popular medical influencer on Instagram in Taiwan.
    Create an engaging Instagram post based on this article:
    Title: ${article.title}
    Summary: ${article.summary}
    Source: ${article.source}

    Requirements:
    1. Tone: Professional yet accessible, cute, and engaging. Use emojis.
    2. Language: Traditional Chinese (Taiwan).
    3. Structure:
       - Catchy Headline (short, punchy).
       - Caption body (explain the 'What', 'Why', and 'Impact' simply). **Keep the caption concise (under 400 words) to avoid truncation.**
       - Hashtags (5-10 relevant tags).
       - Comparison Table: Create a comparison table relevant to the news (e.g., New Drug vs. Old Drug, or Treatment Group vs. Control Group, or Before vs. After). If no direct comparison exists, compare "Key Features" vs "Benefits".

    Output JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            caption: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            comparisonTable: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                headers: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 3, maxItems: 3 },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      aspect: { type: Type.STRING },
                      value1: { type: Type.STRING },
                      value2: { type: Type.STRING },
                    }
                  }
                }
              }
            }
          }
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No content generated");
    
    // Clean potential markdown fencing just in case
    const cleanText = text.replace(/```json|```/g, '').trim();
    const json = JSON.parse(cleanText);

    // Defensive default values in case parsed JSON is missing fields
    if (!json.hashtags) json.hashtags = [];
    if (!json.comparisonTable) {
      json.comparisonTable = { title: "資訊整理", headers: ["項目", "內容", "備註"], rows: [] };
    } else {
      if (!json.comparisonTable.rows) json.comparisonTable.rows = [];
      if (!json.comparisonTable.headers) json.comparisonTable.headers = ["項目", "A", "B"];
    }

    return json;
  } catch (error) {
    console.error("Content generation failed:", error);
    throw error;
  }
};

export const generateCuteImage = async (topic: string, summary: string): Promise<string> => {
  const ai = getAiClient();

  const prompt = `
    Create a cute, flat vector art style illustration explaining the mechanism of action or the main concept of: ${topic}.
    Context: ${summary}.
    
    IMPORTANT: Do NOT include any text, letters, or words in the image. The image should be textless.
    
    Style:
    - Pastel colors (soft blues, pinks, teals).
    - Clean white background.
    - Minimalist, kawaii medical icons (e.g., happy pills, cute organs, clean DNA strands).
    - Educational but visually pleasing for Instagram.
    - High quality, vector-like aesthetic.
    - Center the main subject.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: prompt,
      config: {
        // No strict schema/mime for image generation call, rely on inlineData
      }
    });

    let base64Image = "";
    
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
        }
      }
    }

    if (!base64Image) {
        throw new Error("No image generated");
    }

    return `data:image/png;base64,${base64Image}`;
  } catch (error) {
    console.error("Image generation failed:", error);
    // Return a 1x1 transparent png to avoid crashing. 
    // This allows the canvas download to proceed without tainting (base64 is safe).
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  }
};

// --- Components ---

interface SearchFormProps {
  onSearch: (topic: string, start: string, end: string) => void;
  loadingState: LoadingState;
}

const MedicalSearchForm: React.FC<SearchFormProps> = ({ onSearch, loadingState }) => {
  const [topic, setTopic] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (startDate && endDate) {
      onSearch(topic, startDate, endDate);
    }
  };

  const isLoading = loadingState !== LoadingState.IDLE && loadingState !== LoadingState.COMPLETE && loadingState !== LoadingState.ERROR;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Stethoscope className="w-6 h-6 text-teal-500" />
        搜尋醫藥新知
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">
            關鍵字 <span className="text-slate-400 font-normal">(選填，若空白則搜尋熱門新知)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如: 糖尿病, Semaglutide... (空白則搜尋全部)"
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">開始日期</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                required
              />
              <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">結束日期</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                required
              />
              <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 rounded-lg font-semibold text-white shadow-md transition-all flex items-center justify-center gap-2
            ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98]'}`}
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              搜尋中...
            </>
          ) : (
            '開始搜尋'
          )}
        </button>
      </form>
    </div>
  );
};

interface ResultListProps {
  results: SearchResult[];
  onGenerate: (result: SearchResult) => void;
  loadingState: LoadingState;
}

const ResultList: React.FC<ResultListProps> = ({ results, onGenerate, loadingState }) => {
  if (results.length === 0) return null;

  const isGenerating = loadingState === LoadingState.GENERATING_POST || loadingState === LoadingState.GENERATING_IMAGE;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-700 mb-2">搜尋結果 ({results.length})</h3>
      {results.map((result) => (
        <div key={result.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold px-2 py-1 bg-teal-50 text-teal-600 rounded-full">{result.source}</span>
            <span className="text-xs text-slate-400">{result.date}</span>
          </div>
          <h4 className="text-lg font-bold text-slate-800 mb-2 leading-tight">{result.title}</h4>
          <p className="text-sm text-slate-600 mb-4 line-clamp-3">{result.summary}</p>
          
          <div className="flex items-center justify-between gap-3 mt-4">
            <a 
              href={result.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-slate-500 hover:text-teal-600 flex items-center gap-1 transition-colors"
            >
              閱讀原文 <ExternalLink className="w-3 h-3" />
            </a>
            
            <button
              onClick={() => onGenerate(result)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 text-sm font-semibold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              生成 IG 貼文
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface IgPreviewProps {
  post: GeneratedPost;
  onClose: () => void;
}

const IgPreview: React.FC<IgPreviewProps> = ({ post, onClose }) => {
  const { content, imageUrl } = post;
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingTable, setIsDownloadingTable] = useState(false);

  // Helper to draw text-overlaid image for download (Main Image)
  const generateCompositeImage = async (): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const size = 1080;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(imageUrl);

      const img = new Image();
      img.crossOrigin = "anonymous"; 
      
      img.onload = () => {
        const scale = Math.max(size / img.width, size / img.height);
        const x = (size - img.width * scale) / 2;
        const y = (size - img.height * scale) / 2;
        
        ctx.fillStyle = '#f8fafc'; 
        ctx.fillRect(0,0, size, size);
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        
        resolve(canvas.toDataURL('image/png'));
      };
      
      img.onerror = () => {
        resolve(imageUrl);
      };
      
      img.src = imageUrl;
    });
  };

  // Helper to generate Table Image
  const generateTableImage = async (): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const size = 1080;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');

      // 1. Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      // Data setup
      const table = content.comparisonTable;
      const headers = table?.headers || ["項目", "A", "B"];
      const rows = table?.rows || [];
      const title = table?.title || "比較表";

      // 2. Title
      ctx.fillStyle = '#0f172a'; // Slate 900
      ctx.font = 'bold 60px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, size / 2, 120);

      // Configuration
      const startX = 60;
      const startY = 200;
      const rowHeight = (size - startY - 100) / (rows.length + 1); // Dynamic height
      const colWidths = [240, 360, 360]; // 3 columns widths (Total ~960 + margins)
      const colX = [startX, startX + colWidths[0], startX + colWidths[0] + colWidths[1]];

      // Helper for text wrapping
      const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
        const words = text.split(''); // Split by char for CJK
        let line = '';
        let currentY = y;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n];
          const metrics = ctx.measureText(testLine);
          const testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n];
            currentY += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, x, currentY);
      };

      // 3. Draw Headers
      ctx.fillStyle = '#f1f5f9'; // Slate 100 header bg
      ctx.fillRect(40, startY, size - 80, 80);
      
      ctx.fillStyle = '#334155'; // Slate 700 text
      ctx.font = 'bold 36px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'left';
      
      // Header 1
      ctx.fillText(headers[0], colX[0] + 20, startY + 55);
      // Header 2 (Teal)
      ctx.fillStyle = '#0d9488'; 
      ctx.fillText(headers[1], colX[1] + 20, startY + 55);
      // Header 3 (Pink)
      ctx.fillStyle = '#db2777'; 
      ctx.fillText(headers[2], colX[2] + 20, startY + 55);

      // 4. Draw Rows
      ctx.font = '32px "Noto Sans TC", sans-serif';
      ctx.fillStyle = '#475569'; // Slate 600

      rows.forEach((row, i) => {
        const yPos = startY + 120 + (i * 140); // Fixed spacing approximation
        
        // Draw divider line
        ctx.beginPath();
        ctx.strokeStyle = '#e2e8f0';
        ctx.moveTo(40, yPos - 40);
        ctx.lineTo(size - 40, yPos - 40);
        ctx.stroke();

        // Column 1 (Aspect) - Bold
        ctx.font = 'bold 32px "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#1e293b';
        wrapText(row.aspect, colX[0] + 20, yPos, colWidths[0] - 40, 40);

        // Column 2
        ctx.font = '32px "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#475569';
        wrapText(row.value1, colX[1] + 20, yPos, colWidths[1] - 40, 40);

        // Column 3
        wrapText(row.value2, colX[2] + 20, yPos, colWidths[2] - 40, 40);
      });

      // 5. Footer / Branding (Minimal)
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '24px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText("Generated by MediTrend", size - 60, size - 40);

      resolve(canvas.toDataURL('image/png'));
    });
  };

  const handleDownloadImage = async () => {
    setIsDownloading(true);
    try {
      const compositeUrl = await generateCompositeImage();
      const link = document.createElement('a');
      link.href = compositeUrl;
      link.download = `meditrend-post-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
    }
    setIsDownloading(false);
  };

  const handleDownloadTable = async () => {
    setIsDownloadingTable(true);
    try {
      const tableUrl = await generateTableImage();
      const link = document.createElement('a');
      link.href = tableUrl;
      link.download = `meditrend-table-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Table download failed", e);
    }
    setIsDownloadingTable(false);
  };

  const handleCopyCaption = () => {
    const table = content.comparisonTable;
    const rows = table?.rows || [];
    const hashtags = content.hashtags || [];
    const headers = table?.headers || ["項目", "內容 A", "內容 B"];

    const tableText = (table && rows.length > 0) ? `
📊 ${table.title || '比較表'}
${headers[0] || '-'} | ${headers[1] || '-'} | ${headers[2] || '-'}
${rows.map(row => `${row.aspect} | ${row.value1} | ${row.value2}`).join('\n')}
    `.trim() : '';

    const textToCopy = `
${content.headline || ''}

${content.caption || ''}

${tableText}

${hashtags.map(tag => `#${tag}`).join(' ')}
    `.trim();

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const table = content.comparisonTable;
  const rows = table?.rows || [];
  const hashtags = content.hashtags || [];
  const headers = table?.headers || ["項目", "內容 A", "內容 B"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="flex flex-col items-center gap-4 w-full max-w-md my-8">
        <div className="relative w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-[2px]">
                <div className="w-full h-full bg-white rounded-full p-[2px]">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full rounded-full" />
                </div>
              </div>
              <span className="text-sm font-semibold">dr.meditrend</span>
            </div>
            <MoreHorizontal className="w-5 h-5 text-slate-600" />
          </div>

          {/* Image Area */}
          <div className="relative bg-slate-100 aspect-square w-full overflow-hidden group">
            <img src={imageUrl} alt="Generated Medical Illustration" className="w-full h-full object-cover" />
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              <Heart className="w-6 h-6 text-slate-800 hover:text-red-500 cursor-pointer transition-colors" />
              <MessageCircle className="w-6 h-6 text-slate-800 -rotate-90" />
              <Send className="w-6 h-6 text-slate-800" />
            </div>
            <Bookmark className="w-6 h-6 text-slate-800" />
          </div>

          {/* Likes */}
          <div className="px-4 text-sm font-semibold text-slate-900 mb-2">
            8,888 likes
          </div>

          {/* Caption & Content */}
          <div className="px-4 pb-6 space-y-2">
            <div className="text-sm">
              <span className="font-semibold mr-2">dr.meditrend</span>
              <span className="font-bold text-slate-900">{content.headline}</span>
            </div>
            
            <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {content.caption}
            </div>

            {/* Comparison Table Visualization */}
            {table && rows.length > 0 && (
              <div className="mt-4 bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-bold text-indigo-600">{table.title}</h5>
                  <button 
                    onClick={handleDownloadTable}
                    disabled={isDownloadingTable}
                    className="text-xs flex items-center gap-1 text-teal-600 font-semibold hover:text-teal-700 disabled:opacity-50"
                  >
                    {isDownloadingTable ? '處理中...' : (
                      <>
                        <Download className="w-3 h-3" /> 下載表格圖
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-200 font-semibold text-slate-500">
                    <div className="text-center">{headers[0]}</div>
                    <div className="text-center text-teal-600">{headers[1]}</div>
                    <div className="text-center text-pink-500">{headers[2]}</div>
                </div>
                <div className="space-y-2 mt-2">
                  {rows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-2 items-center">
                      <div className="font-medium text-slate-700 text-center bg-white py-1 rounded shadow-sm">{row.aspect}</div>
                      <div className="text-slate-600 text-center">{row.value1}</div>
                      <div className="text-slate-600 text-center">{row.value2}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-indigo-600 text-sm mt-2 font-medium">
              {hashtags.map(tag => `#${tag} `)}
            </div>
            
            <div className="text-xs text-slate-400 uppercase mt-2">
              2 HOURS AGO
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <button 
            onClick={handleDownloadImage}
            disabled={isDownloading}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-800 rounded-xl shadow-md font-semibold hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-70 text-sm"
          >
            {isDownloading ? (
               <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            下載主圖
          </button>
          
          <button 
            onClick={handleDownloadTable}
            disabled={isDownloadingTable}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-800 rounded-xl shadow-md font-semibold hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-70 text-sm"
          >
            {isDownloadingTable ? (
               <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <TableIcon className="w-4 h-4" />
            )}
            下載表格
          </button>

          <button 
            onClick={handleCopyCaption}
            className={`col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl shadow-md font-semibold transition-all active:scale-95 text-white text-sm
              ${copied ? 'bg-green-500 hover:bg-green-600' : 'bg-slate-800 hover:bg-slate-900'}`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已複製！' : '複製貼文文案'}
          </button>
        </div>
      </div>

      {/* Footer Close Button */}
      <button 
        onClick={onClose}
        className="fixed top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors z-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);

  const handleSearch = useCallback(async (topic: string, start: string, end: string) => {
    setLoadingState(LoadingState.SEARCHING);
    setError(null);
    setResults([]);
    
    try {
      const data = await searchMedicalArticles(topic, start, end);
      if (data.length === 0) {
        setError("找不到相關資料，請嘗試放寬日期或更換關鍵字。");
      }
      setResults(data);
      setLoadingState(LoadingState.COMPLETE);
  } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || "搜尋發生錯誤，請稍後再試。";
      setError(errorMessage.includes("API Key") ? "API Key 未設定，請在 Vercel 環境變數中設定 GEMINI_API_KEY" : errorMessage);
      setLoadingState(LoadingState.ERROR);
    }
  }, []);

  const handleGenerate = useCallback(async (result: SearchResult) => {
    setLoadingState(LoadingState.GENERATING_POST);
    setError(null);

    try {
      // Parallel generation for speed, but careful with rate limits if any.
      // We will do them sequentially to ensure we don't hit complex race conditions or confusing UI states.
      
      // 1. Generate Text Content
      const content = await generateIgContent(result);
      
      setLoadingState(LoadingState.GENERATING_IMAGE);
      
      // 2. Generate Image (Topic + Summary context)
      const imageUrl = await generateCuteImage(result.title, result.summary);

      setGeneratedPost({
        content,
        imageUrl
      });
      
      setLoadingState(LoadingState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      setError("生成內容時發生錯誤。");
      setLoadingState(LoadingState.ERROR);
    }
  }, []);

  const closePreview = () => setGeneratedPost(null);

  const handleReset = () => {
    setResults([]);
    setLoadingState(LoadingState.IDLE);
    setError(null);
    setGeneratedPost(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50">
      {/* Navbar */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none"
          >
            <div className="bg-teal-500 p-2 rounded-lg text-white">
              <Pill className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-indigo-600">
              MediTrend
            </h1>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-800 mb-3">
            一鍵生成醫藥社群貼文
          </h2>
          <p className="text-slate-600">
            輸入日期區間，自動搜尋最新文獻並轉化為可愛的 IG 圖文。
          </p>
        </div>

        <MedicalSearchForm onSearch={handleSearch} loadingState={loadingState} />

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {loadingState === LoadingState.SEARCHING && (
          <div className="text-center py-12">
            <div className="animate-pulse flex flex-col items-center">
               <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
               <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            </div>
            <p className="text-slate-500 mt-4 text-sm">正在分析醫學數據庫...</p>
          </div>
        )}

        {/* Loading Overlay for Generation */}
        {(loadingState === LoadingState.GENERATING_POST || loadingState === LoadingState.GENERATING_IMAGE) && (
           <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center">
                 <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                 <h3 className="text-xl font-bold text-slate-800">
                   {loadingState === LoadingState.GENERATING_POST ? "正在撰寫文案..." : "正在繪製圖說..."}
                 </h3>
                 <p className="text-slate-500">AI 正在努力工作中 💊✨</p>
              </div>
           </div>
        )}

        <ResultList 
          results={results} 
          onGenerate={handleGenerate} 
          loadingState={loadingState} 
        />
      </main>

      {generatedPost && (
        <IgPreview post={generatedPost} onClose={closePreview} />
      )}
    </div>
  );
};

export default App;