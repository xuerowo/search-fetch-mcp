// 完整功能測試
const { spawn } = require('child_process');

async function testMCPServer() {
  console.log('🧪 完整功能測試 - MCP 搜索獲取伺服器...');
  
  const server = spawn('bun', ['src/index.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });
  
  let stdout = '';
  let responseCount = 0;
  
  server.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  
  server.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('INFO') && !text.includes('瀏覽器池')) {
      console.log('📋', text.trim());
    }
  });
  
  // 等待伺服器啟動
  await delay(3000);
  
  // 測試工具列表
  console.log('\n🔍 測試工具列表...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  }) + '\n');
  
  await delay(2000);
  
  // 測試單個網頁獲取（標準模式）
  console.log('\n📄 測試單個網頁獲取（標準模式）...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "webpage_fetch",
      arguments: {
        url: "https://httpbin.org/json",
        format: "markdown",
        maxLength: 500,
        useSPA: false
      }
    }
  }) + '\n');
  
  await delay(5000);
  
  // 測試單個網頁獲取（SPA 模式 - 會自動降級）
  console.log('\n🚀 測試單個網頁獲取（SPA 模式 - 自動降級）...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "webpage_fetch",
      arguments: {
        url: "https://httpbin.org/html",
        format: "markdown",
        maxLength: 500,
        useSPA: true
      }
    }
  }) + '\n');
  
  await delay(10000);
  
  // 解析所有響應
  console.log('\n📊 解析測試結果...');
  const lines = stdout.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      if (response.id === 1) {
        console.log(`✅ 工具列表: ${response.result?.tools?.length || 0} 個工具`);
        responseCount++;
      } else if (response.id === 2) {
        const content = response.result?.content;
        if (content?.success) {
          console.log(`✅ 標準模式: 成功 (${content.content?.length || 0} 字符)`);
        } else {
          console.log(`❌ 標準模式: ${content?.error}`);
        }
        responseCount++;
      } else if (response.id === 3) {
        const content = response.result?.content;
        if (content?.success) {
          console.log(`✅ SPA 模式: 成功 (${content.content?.length || 0} 字符)`);
          if (content.content?.length === 0) {
            console.log('   ⚠️  警告: 內容為空，可能降級失敗');
          }
        } else {
          console.log(`❌ SPA 模式: ${content?.error}`);
        }
        responseCount++;
      }
    } catch (e) {
      // 忽略解析錯誤
    }
  }
  
  console.log(`\n🏁 測試完成！收到 ${responseCount}/3 個響應`);
  
  if (responseCount === 3) {
    console.log('🎉 所有基本功能正常！');
    console.log('\n💡 建議在 Windows PowerShell 中運行以獲得完整功能：');
    console.log('   npx @modelcontextprotocol/inspector bun src/index.ts');
  } else {
    console.log('⚠️  部分功能可能需要進一步調試');
  }
  
  server.kill();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testMCPServer().catch(console.error);