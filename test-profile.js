const { setupBrowser, createPage } = require('./utils/browser');
const { crawlProfile } = require('./crawlers/profileCrawler');
const fs = require('fs');
const path = require('path');

/**
 * Test crawling a TikTok profile
 */
async function testProfile() {
  // Tạo thư mục logs nếu chưa tồn tại
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Tạo log stream
  const logFile = path.join(logsDir, `test-profile-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  // Hàm ghi log
  const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
  };

  log('Starting TikTok profile test');

  // Danh sách profile để test
  const profileUrls = [
    'https://www.tiktok.com/@tuitenbo.official',
    'https://www.tiktok.com/@anhthe_280'
  ];

  let browser;

  try {
    // Khởi động browser
    log('Setting up browser in visible mode...');
    browser = await setupBrowser(false); // false = không headless, để có thể thấy quá trình crawl
    log('Browser launched successfully in visible mode')

    // Tạo page mới
    log('Creating new page...');
    const page = await createPage(browser);

    // Test từng profile
    for (const profileUrl of profileUrls) {
      log(`Testing profile: ${profileUrl}`);

      try {
        // Crawl profile
        const videoUrls = await crawlProfile(page, profileUrl);

        // Ghi kết quả vào file
        const resultsFile = path.join(logsDir, `profile-results-${Date.now()}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify({
          profile: profileUrl,
          timestamp: new Date().toISOString(),
          videoCount: videoUrls.length,
          videos: videoUrls
        }, null, 2));

        log(`Found ${videoUrls.length} videos on profile: ${profileUrl}`);
        log(`Results saved to ${resultsFile}`);

        if (videoUrls.length > 0) {
          log(`First 5 video URLs:`);
          videoUrls.slice(0, 5).forEach((url, index) => {
            log(`  ${index + 1}. ${url}`);
          });
        }
      } catch (error) {
        log(`Error testing profile ${profileUrl}: ${error.message}`);
      }

      // Chờ một chút trước khi test profile tiếp theo
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    log('Profile test completed');
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
  } finally {
    // Đóng browser
    if (browser) {
      log('Closing browser...');
      await browser.close();
    }

    // Đóng log stream
    logStream.end();
    log(`Log saved to ${logFile}`);
  }
}

// Chạy test
testProfile().catch(console.error);
