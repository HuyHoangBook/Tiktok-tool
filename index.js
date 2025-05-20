const { setupBrowser, createPage } = require('./utils/browser');
const { crawlProfile } = require('./crawlers/profileCrawler');
const { crawlVideo } = require('./crawlers/videoCrawler');
const { crawlCommentReplies } = require('./crawlers/commentCrawler');
const { exportVideoToSheet, exportMultipleVideos } = require('./exportToSheet');
const connectDB = require('./config/db');
const Comment = require('./models/Comment');
const Video = require('./models/Video');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Cấu hình
const CONFIG = {
  // Số lượng video tối đa để crawl từ mỗi profile
  maxVideosPerProfile: 4,

  // Thời gian chờ giữa các video (ms)
  delayBetweenVideos: 5000,

  // Thời gian chờ giữa các profile (ms)
  delayBetweenProfiles: 10000,

  // Thời gian chờ giữa các comment (ms)
  delayBetweenComments: 2000,

  // Số lần thử lại khi gặp lỗi
  maxRetries: 3,

  // Thư mục lưu trữ log
  logDir: 'logs',

  // Chế độ headless (true: không hiển thị giao diện, false: hiển thị giao diện)
  headless: process.env.HEADLESS === 'true' || false
};

// List of TikTok profile URLs to crawl
const profileUrls = [
  'https://www.tiktok.com/@fahasa_official',
];

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
    const logFile = path.join(CONFIG.logDir, `crawler-${dateStr}.log`);

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
 * Thực hiện một hành động với cơ chế thử lại
 * @param {Function} action - Hàm cần thực hiện
 * @param {string} actionName - Tên hành động (để ghi log)
 * @param {number} maxRetries - Số lần thử lại tối đa
 * @returns {Promise<any>} Kết quả của hành động
 */
const withRetry = async (action, actionName, maxRetries = CONFIG.maxRetries) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      logToFile(`Attempt ${attempt}/${maxRetries} failed for ${actionName}: ${error.message}`, 'error');

      if (attempt < maxRetries) {
        const delay = 1000 * attempt; // Tăng thời gian chờ theo số lần thử
        logToFile(`Waiting ${delay}ms before retry...`, 'info');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`All ${maxRetries} attempts failed for ${actionName}: ${lastError.message}`);
};

/**
 * Main function to run the crawler
 */
const runCrawler = async () => {
  logToFile('Starting TikTok crawler', 'info');

  try {
    // Connect to MongoDB
    await withRetry(
      async () => await connectDB(),
      'MongoDB connection'
    );
    logToFile('Connected to MongoDB', 'info');

    // Setup browser
    const browser = await withRetry(
      async () => await setupBrowser(CONFIG.headless),
      'Browser setup'
    );
    logToFile('Browser setup completed', 'info');

    try {
      // Create a new page
      const page = await withRetry(
        async () => await createPage(browser),
        'Page creation'
      );
      logToFile('Page created successfully', 'info');

      // Process each profile
      for (const profileUrl of profileUrls) {
        logToFile(`Processing profile: ${profileUrl}`, 'info');

        try {
          // Crawl profile to get video URLs
          const videoUrls = await withRetry(
            async () => await crawlProfile(page, profileUrl),
            `Profile crawling: ${profileUrl}`
          );

          // Giới hạn số lượng video để crawl
          const videosToProcess = videoUrls.slice(0, CONFIG.maxVideosPerProfile);
          logToFile(`Found ${videoUrls.length} videos, will process ${videosToProcess.length}`, 'info');

          // Process each video
          for (const [index, videoUrl] of videosToProcess.entries()) {
            logToFile(`Processing video ${index + 1}/${videosToProcess.length}: ${videoUrl}`, 'info');

            try {
              // Kiểm tra xem video đã tồn tại trong database chưa
              const existingVideo = await Video.findOne({ url: videoUrl });

              if (existingVideo) {
                logToFile(`Video already exists in database: ${videoUrl}`, 'info');
                continue;
              }

              // Crawl video details and comments
              const video = await withRetry(
                async () => await crawlVideo(page, videoUrl),
                `Video crawling: ${videoUrl}`
              );

              if (video) {
                logToFile(`Successfully crawled video: ${videoUrl}`, 'info');
                
                // Export video to Google Sheet after crawling
                try {
                  logToFile(`Exporting video to Google Sheet: ${videoUrl}`, 'info');
                  await exportVideoToSheet(videoUrl);
                  logToFile(`Successfully exported video to Google Sheet: ${videoUrl}`, 'info');
                } catch (exportError) {
                  logToFile(`Failed to export video to Google Sheet: ${exportError.message}`, 'error');
                }

                // Find comments for this video that have replies
                const comments = await Comment.find({
                  video_id: video._id,
                  has_replies: true,
                  is_reply: false
                });

                logToFile(`Found ${comments.length} comments with replies`, 'info');

                // Crawl replies for each comment
                for (let i = 0; i < comments.length; i++) {
                  logToFile(`Processing comment ${i + 1}/${comments.length}`, 'info');

                  try {
                    await withRetry(
                      async () => await crawlCommentReplies(page, videoUrl, i, comments[i]),
                      `Comment replies crawling for comment #${i + 1}`
                    );

                    // Add a delay between processing comments
                    await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenComments));
                  } catch (commentError) {
                    logToFile(`Failed to crawl replies for comment #${i + 1}: ${commentError.message}`, 'error');
                    // Continue with next comment
                  }
                }
              } else {
                logToFile(`Failed to crawl video: ${videoUrl}`, 'warning');
              }
            } catch (videoError) {
              logToFile(`Error processing video ${videoUrl}: ${videoError.message}`, 'error');
              // Continue with next video
            }

            // Add a delay between processing videos to avoid rate limiting
            logToFile(`Waiting ${CONFIG.delayBetweenVideos}ms before next video...`, 'info');
            await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenVideos));
          }
        } catch (profileError) {
          logToFile(`Error processing profile ${profileUrl}: ${profileError.message}`, 'error');
          // Continue with next profile
        }

        // Add a delay between processing profiles to avoid rate limiting
        logToFile(`Waiting ${CONFIG.delayBetweenProfiles}ms before next profile...`, 'info');
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenProfiles));
      }

      logToFile('Crawling completed successfully!', 'info');
      
      // Export all videos to Google Sheet at the end
      try {
        logToFile('Exporting all videos to Google Sheet...', 'info');
        await exportMultipleVideos([]);
        logToFile('Successfully exported all videos to Google Sheet', 'info');
      } catch (exportError) {
        logToFile(`Failed to export all videos to Google Sheet: ${exportError.message}`, 'error');
      }

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