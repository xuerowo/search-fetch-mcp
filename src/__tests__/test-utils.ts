/**
 * 測試工具函數
 */

// 模擬 fetch 響應
export function createMockFetchResponse(
  html: string,
  ok = true,
  status = 200
) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(html),
    json: () => Promise.resolve({}),
  };
}

// 創建長 HTML 內容以通過反爬蟲檢測
export function createLongHtmlContent(content = "") {
  return (
    "<html><body>" +
    "a".repeat(1500) +
    content +
    "</body></html>"
  );
}

// 創建搜索結果 HTML
export function createSearchResultHtml(results: Array<{ title: string; url: string; snippet: string }>) {
  const resultsHtml = results
    .map(
      (result) => `
        <div class="result">
          <a class="result__a" href="${result.url}">
            <h2 class="result__title">${result.title}</h2>
          </a>
          <div class="result__snippet">${result.snippet}</div>
        </div>
      `
    )
    .join("");

  return createLongHtmlContent(`
    <div class="results">
      ${resultsHtml}
    </div>
  `);
}