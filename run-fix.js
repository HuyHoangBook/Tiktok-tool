const { setupBrowser, createPage } = require('./utils/browser');
const { crawlVideo } = require('./crawlers/videoCrawler');
const connectDB = require('./config/db');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Cấu hình
const CONFIG = {
  // Thư mục lưu trữ log
  logDir: 'logs',

  // Chế độ headless (true: không hiển thị giao diện, false: hiển thị giao diện)
  headless: false
};

// URL video TikTok để test
const videoUrl = 'https://www.tiktok.com/@fahasa_official/video/7078557440614190337';

/**
 * Ghi log ra file
 * @param {string} message - Thông điệp log
 * @param {string} type - Loại log (info, error, warning)
 */
const logToFile = (message, type = 'info') => {
  try {
    // Tạo thư mục logs nếu chưa tồn tại
    if (!fs.existsSync(CONFIG.logDir)) {
      fs.mkdirSync(CONFIG.logDir);
    }

    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0];
    const logFile = path.join(CONFIG.logDir, `crawler-fix-${dateStr}.log`);

    const logMessage = `[${timeStr}] [${type.toUpperCase()}] ${message}\n`;

    // Ghi log ra file
    fs.appendFileSync(logFile, logMessage);

    // In ra console
    if (type === 'error') {
      console.error(message);
    } else if (type === 'warning') {
      console.warn(message);
    } else {
      console.log(message);
    }
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
};

/**
 * Main function to run the crawler
 */
const runCrawler = async () => {
  logToFile('Starting TikTok crawler test', 'info');

  try {
    // Connect to MongoDB
    await connectDB();
    logToFile('Connected to MongoDB', 'info');

    // Setup browser
    const browser = await setupBrowser(CONFIG.headless);
    logToFile('Browser setup completed', 'info');

    try {
      // Create a new page
      const page = await createPage(browser);
      logToFile('Page created successfully', 'info');

      // Process the test video
      logToFile(`Processing video: ${videoUrl}`, 'info');

      try {
        // Crawl video details and comments
        const video = await crawlVideo(page, videoUrl);

        if (video) {
          logToFile(`Successfully crawled video: ${videoUrl}`, 'info');
          logToFile(`Video title: ${video.title}`, 'info');
          logToFile(`Video Google Drive link: ${video.drive_view_link}`, 'info');
        } else {
          logToFile(`Failed to crawl video: ${videoUrl}`, 'warning');
        }
      } catch (videoError) {
        logToFile(`Error processing video ${videoUrl}: ${videoError.message}`, 'error');
      }

      logToFile('Test completed!', 'info');

    } catch (error) {
      logToFile(`Error during crawling: ${error.message}`, 'error');
    } finally {
      // Close the browser
      logToFile('Closing browser...', 'info');
      await browser.close();
      logToFile('Browser closed', 'info');
    }
  } catch (error) {
    logToFile(`Fatal error: ${error.message}`, 'error');
  }
};

// Run the crawler
runCrawler().catch(console.error);
