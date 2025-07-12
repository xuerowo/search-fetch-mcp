// 超輕量級 Node.js Playwright Worker Script
const { chromium } = require('playwright');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

// 提取網頁發布時間和修改時間的函數（增強版）
function extractDateInfo(document) {
  const result = {};

  // 1. 檢查 meta 標籤 - 分別處理修改日期和發布日期
  const modifiedSelectors = [
    'meta[itemprop="dateModified"]',
    'meta[property="article:modified_time"]',
    'meta[name="article:modified_time"]',
    'meta[property="og:updated_time"]',
  ];

  const publishedSelectors = [
    'meta[itemprop="datePublished"]',
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="publishdate"]',
    'meta[name="date"]',
    'meta[property="og:published_time"]',
  ];

  // 提取修改日期
  for (const selector of modifiedSelectors) {
    const metaElement = document.querySelector(selector);
    if (metaElement) {
      const content = metaElement.getAttribute("content");
      if (content) {
        const cleanDate = formatDate(content);
        if (cleanDate) {
          result.modifiedDate = cleanDate;
          break;
        }
      }
    }
  }

  // 提取發布日期
  for (const selector of publishedSelectors) {
    const metaElement = document.querySelector(selector);
    if (metaElement) {
      const content = metaElement.getAttribute("content");
      if (content) {
        const cleanDate = formatDate(content);
        if (cleanDate) {
          result.publishedDate = cleanDate;
          break;
        }
      }
    }
  }

  // 2. 檢查 JSON-LD 結構化資料
  const scriptElements = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scriptElements) {
    try {
      const jsonData = JSON.parse(script.textContent || "");
      const dateInfo = extractDateFromJsonLd(jsonData);

      // 如果還沒有相應的日期，則設定它們
      if (dateInfo.modifiedDate && !result.modifiedDate) {
        result.modifiedDate = formatDate(dateInfo.modifiedDate) || undefined;
      }
      if (dateInfo.publishedDate && !result.publishedDate) {
        result.publishedDate = formatDate(dateInfo.publishedDate) || undefined;
      }

      // 如果兩個日期都找到了，就停止搜索
      if (result.modifiedDate && result.publishedDate) {
        break;
      }
    } catch {
      // 忽略 JSON 解析錯誤
    }
  }

  // 3. 檢查 time 元素作為備用
  if (!result.publishedDate && !result.modifiedDate) {
    const timeElement = document.querySelector("time[datetime]");
    if (timeElement) {
      const datetime = timeElement.getAttribute("datetime");
      if (datetime) {
        const cleanDate = formatDate(datetime);
        if (cleanDate) {
          // 如果不確定是哪種日期，優先當作發布日期
          result.publishedDate = cleanDate;
        }
      }
    }
  }

  // 4. 嘗試從傳統 CSS 類名中提取（降級選項）
  if (!result.publishedDate) {
    const traditionalSelectors = [
      'time[pubdate]',
      '.published',
      '.date',
      '.post-date',
      '.article-date'
    ];
    
    for (const selector of traditionalSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        let dateStr = element.getAttribute('datetime') || 
                     element.textContent;
        
        if (dateStr) {
          dateStr = dateStr.trim();
          const cleanDate = formatDate(dateStr);
          if (cleanDate) {
            result.publishedDate = cleanDate;
            break;
          }
        }
      }
    }
  }

  return result;
}

// 從 JSON-LD 結構化資料中提取日期
function extractDateFromJsonLd(jsonData) {
  const result = {};

  if (!jsonData) {
    return result;
  }

  // 處理陣列格式的 JSON-LD
  if (Array.isArray(jsonData)) {
    for (const item of jsonData) {
      const dateInfo = extractDateFromJsonLd(item);
      // 合併結果，優先保留已找到的日期
      if (dateInfo.modifiedDate && !result.modifiedDate) {
        result.modifiedDate = dateInfo.modifiedDate;
      }
      if (dateInfo.publishedDate && !result.publishedDate) {
        result.publishedDate = dateInfo.publishedDate;
      }

      // 如果兩個日期都找到了，就停止搜索
      if (result.modifiedDate && result.publishedDate) {
        break;
      }
    }
    return result;
  }

  // 檢查修改日期欄位
  const modifiedFields = ["dateModified"];
  for (const field of modifiedFields) {
    if (jsonData[field] && !result.modifiedDate) {
      result.modifiedDate = jsonData[field];
      break;
    }
  }

  // 檢查發布日期欄位
  const publishedFields = [
    "datePublished",
    "dateCreated",
    "publishDate",
    "uploadDate",
  ];
  for (const field of publishedFields) {
    if (jsonData[field] && !result.publishedDate) {
      result.publishedDate = jsonData[field];
      break;
    }
  }

  // 檢查嵌套的對象
  if (jsonData["@graph"] && (!result.modifiedDate || !result.publishedDate)) {
    const nestedInfo = extractDateFromJsonLd(jsonData["@graph"]);
    if (nestedInfo.modifiedDate && !result.modifiedDate) {
      result.modifiedDate = nestedInfo.modifiedDate;
    }
    if (nestedInfo.publishedDate && !result.publishedDate) {
      result.publishedDate = nestedInfo.publishedDate;
    }
  }

  return result;
}

// 保留原始日期字符串
function formatDate(dateString) {
  try {
    // 簡單檢查是否是有效的日期格式，但不轉換
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }

    // 直接返回原始字符串，不進行格式化
    return dateString.trim();
  } catch {
    return null;
  }
}


async function fetchWithPlaywright() {
  let input = '';
  
  // 讀取輸入
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  
  process.stdin.on('end', async () => {
    let options;
    let browser = null;
    
    try {
      options = JSON.parse(input);
      
      // 超輕量級瀏覽器配置
      browser = await chromium.launch({
        headless: true,
        timeout: 90000, // 增加超時時間
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      
      const page = await browser.newPage();
      
      // 導航到頁面
      await page.goto(options.url, {
        timeout: options.timeout || 45000,
        waitUntil: 'domcontentloaded'
      });
      
      // 對於 GitHub 頁面，等待檔案列表加載
      if (options.url.includes('github.com')) {
        try {
          // 等待檔案列表容器出現
          await page.waitForSelector('[data-testid="file-tree-container"], .js-navigation-container, .Box-row', {
            timeout: 10000
          });
          // 額外等待確保內容完全加載
          await page.waitForTimeout(2000);
        } catch {
          // 如果等待失敗，使用基本等待
          await page.waitForTimeout(3000);
        }
      } else {
        // 非 GitHub 頁面使用基本等待
        await page.waitForTimeout(1000);
      }
      
      // 獲取內容
      const html = await page.content();
      const title = await page.title();
      
      await browser.close();
      
      // 處理內容
      let content = '';
      let description = '';
      let dateInfo = {};
      let processedContentLength = 0; // 記錄處理後但未截斷的內容長度
      
      if (html && html.trim().length > 0) {
        try {
          const dom = new JSDOM(html);
          
          // 檢查是否使用 Readability
          if (options.useReadability !== false) {
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            
            if (article) {
              content = article.content;
              description = article.excerpt || '';
              // Readability 可能提供發布時間
              if (article.publishedTime) {
                dateInfo.publishedDate = article.publishedTime;
              }
            } else {
              content = html;
            }
          } else {
            // 不使用 Readability，直接使用原始 HTML
            content = html;
          }
          
          // 使用增強的日期提取邏輯
          const extractedDateInfo = extractDateInfo(dom.window.document);
          
          // 合併日期資訊，優先保留已找到的
          if (extractedDateInfo.publishedDate && !dateInfo.publishedDate) {
            dateInfo.publishedDate = extractedDateInfo.publishedDate;
          }
          if (extractedDateInfo.modifiedDate && !dateInfo.modifiedDate) {
            dateInfo.modifiedDate = extractedDateInfo.modifiedDate;
          }
        } catch (readabilityError) {
          content = html;
        }
      } else {
        throw new Error('無法獲取頁面內容');
      }
      
      // 處理不同輸出格式
      let finalContent;
      const originalHtmlContent = content; // 保存原始 HTML
      
      switch (options.format) {
        case 'markdown':
          try {
            // 預處理：徹底移除 CSS 和 JavaScript
            let processedContent = content;
            
            // 移除 style 標籤及其內容
            processedContent = processedContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            
            // 移除 script 標籤及其內容
            processedContent = processedContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            
            // 移除內聯樣式屬性
            processedContent = processedContent.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '');
            
            // 移除 CSS 相關屬性
            processedContent = processedContent.replace(/\s+class\s*=\s*["'][^"']*["']/gi, '');
            
            // 移除 CSS 註釋
            processedContent = processedContent.replace(/\/\*[\s\S]*?\*\//g, '');
            
            const turndownService = new TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced'
            });
            turndownService.use(gfm);
            finalContent = turndownService.turndown(processedContent);
          } catch (turndownError) {
            finalContent = content; // 降級到原始內容
          }
          break;
          
        case 'text':
          // 提取純文字
          try {
            const dom = new JSDOM(content);
            finalContent = dom.window.document.body.textContent || '';
            // 清理多餘空白
            finalContent = finalContent.replace(/\s+/g, ' ').trim();
          } catch (textError) {
            finalContent = content.replace(/<[^>]*>/g, ''); // 簡單去除 HTML 標籤
          }
          break;
          
        case 'json':
          // 創建 JSON 格式輸出
          try {
            // 預處理：徹底移除 CSS 和 JavaScript（與 markdown 格式保持一致）
            let processedContent = content;
            
            // 移除 style 標籤及其內容
            processedContent = processedContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            
            // 移除 script 標籤及其內容
            processedContent = processedContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            
            // 移除內聯樣式屬性
            processedContent = processedContent.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '');
            
            // 移除 CSS 相關屬性
            processedContent = processedContent.replace(/\s+class\s*=\s*["'][^"']*["']/gi, '');
            
            // 移除 CSS 註釋
            processedContent = processedContent.replace(/\/\*[\s\S]*?\*\//g, '');
            
            const turndownService = new TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced'
            });
            turndownService.use(gfm);
            const markdownContent = turndownService.turndown(processedContent);
            
            const dom = new JSDOM(content);
            const textContent = dom.window.document.body.textContent || '';
            const cleanText = textContent.replace(/\s+/g, ' ').trim();
            
            // 使用用戶指定的 maxLength（已包含預設值 5000）
            const maxContentLength = options.maxLength;
            const wasTruncated = markdownContent.length > maxContentLength;
            let truncatedMarkdown = markdownContent;
            
            if (wasTruncated) {
              // 安全截斷：避免在特殊字符中間截斷
              let safeEnd = maxContentLength;
              const unsafeChars = ['"', "'", '`', '\\', '\n', '\r'];
              
              // 往前找安全的截斷位置（避免在特殊字符中間）
              while (safeEnd > maxContentLength - 100 && safeEnd > 0) {
                const char = markdownContent[safeEnd];
                if (!unsafeChars.includes(char) && char !== undefined) {
                  break;
                }
                safeEnd--;
              }
              
              truncatedMarkdown = markdownContent.substring(0, safeEnd) + "...";
              
              // 確保截斷後的內容能安全轉換為 JSON
              try {
                JSON.stringify(truncatedMarkdown);
              } catch {
                // 如果仍有問題，進一步清理並重新添加標記
                truncatedMarkdown = markdownContent
                  .substring(0, Math.min(safeEnd - 100, markdownContent.length))
                  .replace(/[^\x20-\x7E\u4e00-\u9fff]/g, '') // 只保留可見字符和中文
                  + "...";
              }
            }
            
            // 構建有序的 JSON 結果
            const jsonResult = {
              title: title || '',
              url: options.url,
            };
            
            // 添加日期資訊（只有當存在時才添加），放在 content 之前
            if (dateInfo.publishedDate) {
              jsonResult.published_at = dateInfo.publishedDate;
            }
            
            if (dateInfo.modifiedDate) {
              jsonResult.modified_at = dateInfo.modifiedDate;
            }
            
            // 添加網頁完整長度資訊
            jsonResult.total_length = markdownContent.length;
            
            // 最後添加內容
            jsonResult.content = truncatedMarkdown;
            
            // 如果內容被截斷，添加截斷提示（與其他格式保持一致）
            if (wasTruncated) {
              // 計算實際內容長度（不包括 "..." 標記）
              const actualContentLength = truncatedMarkdown.endsWith("...") 
                ? truncatedMarkdown.length - 3 
                : truncatedMarkdown.length;
              const nextStart = actualContentLength;
              jsonResult.note = `[內容截斷] 當前顯示: ${actualContentLength}/${markdownContent.length} 字符\n如當前內容無法滿足分析需求，可使用 webpage_fetch 並設置 start_index: ${nextStart} 獲取後續內容`;
            }
            
            // 安全的 JSON 生成
            try {
              finalContent = JSON.stringify(jsonResult, null, 2);
            } catch (jsonStringifyError) {
              // 如果 JSON.stringify 失敗，創建最小安全版本
              const safeResult = {
                title: (title || '').replace(/[^\x20-\x7E\u4e00-\u9fff]/g, ''),
                url: options.url,
                content: '內容包含無法解析的字符，已清理',
                error: 'JSON 格式化過程中發現問題，已使用安全模式'
              };
              finalContent = JSON.stringify(safeResult, null, 2);
            }
          } catch (jsonError) {
            finalContent = content; // 降級到原始內容
          }
          break;
          
        case 'html':
          finalContent = html; // 直接返回原始 HTML，不使用 Readability 處理
          break;
        default:
          // 默認使用 markdown 格式
          try {
            // 預處理：移除 style 和 script 標籤的內容
            let processedContent = content;
            
            // 總是移除 CSS 和 JavaScript
            processedContent = processedContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            processedContent = processedContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            
            const turndownService = new TurndownService({
              headingStyle: 'atx',
              codeBlockStyle: 'fenced'
            });
            turndownService.use(gfm);
            
            // 根據 useReadability 決定過濾的元素
            if (options.useReadability !== false) {
              // 當使用 Readability 時，移除導航元素
              turndownService.remove([
                'nav',
                'menu',
                'aside',
                'footer',
                'form',
                'input',
                'button',
                'select',
                'textarea',
                'iframe',
                'embed',
                'object',
                'video',
                'audio'
              ]);
            }
            
            finalContent = turndownService.turndown(processedContent);
          } catch (turndownError) {
            finalContent = content;
          }
          break;
      }
      
      // 記錄處理後的完整內容長度（截斷前）
      processedContentLength = finalContent.length;
      
      // JSON 格式已經在內部處理完截斷，通常不需要再次處理
      // 但如果用戶設置了 start_index，仍需要應用
      if (options.format === 'json') {
        const startIndex = options.startIndex || 0;
        
        // 如果用戶指定了 start_index，仍需要切片
        if (startIndex > 0) {
          if (startIndex >= finalContent.length) {
            finalContent = "<error>起始位置超出內容長度</error>";
          } else {
            // 對於 JSON，我們需要特殊處理以避免破壞 JSON 結構
            // 如果是完整的 JSON，直接返回（因為 JSON 不支援分片）
            if (finalContent.trim().startsWith('{') && finalContent.trim().endsWith('}')) {
              // 完整的 JSON 不支援 start_index，忽略該參數
            } else {
              finalContent = finalContent.substring(startIndex);
            }
          }
        }
        // JSON 格式不需要添加截斷提示，因為已經在內部處理
      } else {
        // 其他格式應用長度限制並添加截斷提示
        const maxLength = options.maxLength || 10000;
        const startIndex = options.startIndex || 0;
        
        if (startIndex >= finalContent.length) {
          finalContent = "<error>起始位置超出內容長度</error>";
        } else {
          const endIndex = Math.min(startIndex + maxLength, finalContent.length);
          const slicedContent = finalContent.substring(startIndex, endIndex);
          
          // 如果內容被截斷，添加提示
          if (endIndex < finalContent.length) {
            const nextStart = endIndex;
            const truncationMessage =
              `\n\n[內容截斷] 當前顯示: ${endIndex}/${finalContent.length} 字符\n` +
              `如當前內容無法滿足分析需求，可使用 webpage_fetch 並設置 start_index: ${nextStart} 獲取後續內容`;
            finalContent = slicedContent + "..." + truncationMessage;
          } else {
            finalContent = slicedContent;
          }
        }
      }
      
      // 檢測 Access Denied 標題或內容並添加提示
      const titleText = title || '';
      const contentText = finalContent || '';
      const isAccessDenied = titleText.toLowerCase().includes('access denied') ||
                           contentText.toLowerCase().includes('access denied') ||
                           contentText.includes('You don\'t have permission');
      
      let contentWithTip = finalContent;
      if (isAccessDenied) {
        const tip = '\n\n💡 提示：如果遇到 Access Denied 錯誤，建議嘗試設定 useSPA: false 或 useReadability: false。';
        contentWithTip = finalContent + tip;
      }

      const result = {
        success: true,
        url: options.url,
        title: title || '',
        description: description,
        content: contentWithTip,
        format: options.format || 'markdown',
        metadata: {
          title: title || '',
          description: description,
        },
        timestamp: new Date().toISOString(),
        originalLength: processedContentLength,
        publishedDate: dateInfo.publishedDate,
        modifiedDate: dateInfo.modifiedDate,
        mode: 'minimal-playwright'
      };
      
      console.log(JSON.stringify(result));
      
    } catch (error) {
      // 確保瀏覽器被關閉
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          // 忽略關閉錯誤
        }
      }
      
      const errorResult = {
        success: false,
        url: options?.url || '',
        content: '',
        error: error.message,
        originalLength: 0,
        mode: 'minimal-playwright'
      };
      console.log(JSON.stringify(errorResult));
    }
  });
}

fetchWithPlaywright();