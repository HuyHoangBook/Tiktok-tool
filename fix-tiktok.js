const fs = require('fs');
const path = require('path');

/**
 * Hàm trích xuất ID video từ URL TikTok
 * @param {string} url - URL của video TikTok
 * @returns {string|null} ID của video hoặc null nếu không tìm thấy
 */
function extractVideoId(url) {
  try {
    // Loại bỏ tham số query
    const cleanUrl = url.split('?')[0];

    // Lấy phần cuối cùng của URL (thường là ID video)
    const parts = cleanUrl.split('/');
    const lastPart = parts[parts.length - 1];

    // Nếu phần cuối cùng không rỗng, đó có thể là ID video
    if (lastPart && lastPart.length > 0) {
      return lastPart;
    }

    return null;
  } catch (error) {
    console.error(`Lỗi khi trích xuất ID video: ${error.message}`);
    return null;
  }
}

/**
 * Hàm tải file từ URL
 * @param {string} url - URL của file cần tải
 * @param {string} outputPath - Đường dẫn để lưu file
 * @returns {Promise<void>}
 */
async function downloadFile(url, outputPath) {
  const axios = require('axios');
  const { promisify } = require('util');
  const stream = require('stream');
  const pipeline = promisify(stream.pipeline);

  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*'
      }
    });

    await pipeline(response.data, fs.createWriteStream(outputPath));
    console.log(`File đã được tải về: ${outputPath}`);
  } catch (error) {
    console.error(`Lỗi khi tải file: ${error.message}`);
    throw error;
  }
}

/**
 * Hàm tải video TikTok sử dụng Puppeteer
 * @param {string} videoUrl - URL của video TikTok
 * @param {string} outputPath - Đường dẫn để lưu video
 * @returns {Promise<boolean>} True nếu tải thành công, false nếu thất bại
 */
async function downloadTikTokVideo(videoUrl, outputPath) {
  let browser = null;

  try {
    // Tạo thư mục nếu chưa tồn tại
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`Đang tải video từ: ${videoUrl}`);

    // Khởi tạo Puppeteer với các tùy chọn stealth
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    // Khởi động trình duyệt
    browser = await puppeteer.launch({
      headless: false, // Hiển thị trình duyệt để dễ debug
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
    });

    // Tạo trang mới
    const page = await browser.newPage();

    // Thiết lập viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Thiết lập user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Mảng để lưu các URL video tìm thấy
    let videoUrls = [];

    // Bắt các request/response để tìm URL video
    await page.setRequestInterception(true);

    page.on('request', request => {
      request.continue();
    });

    page.on('response', async response => {
      const url = response.url();

      // Tìm các URL video từ response
      if (url.includes('.mp4') || url.includes('videoplayback') || url.includes('media') || url.includes('play')) {
        const contentType = response.headers()['content-type'];
        if (contentType && (contentType.includes('video') || contentType.includes('mp4'))) {
          const contentLength = response.headers()['content-length'];
          if (contentLength && parseInt(contentLength) > 500000) {
            console.log(`Tìm thấy URL video từ network: ${url} (${contentLength} bytes)`);
            videoUrls.push({
              url: url,
              size: parseInt(contentLength),
              source: 'network'
            });
          }
        }
      }

      // Đặc biệt tìm URL từ aweme API (thường là video gốc đầy đủ)
      if (url.includes('aweme/v1/play') || url.includes('api/aweme/detail')) {
        console.log(`Tìm thấy URL API TikTok: ${url}`);
        videoUrls.push({
          url: url,
          size: 2000000, // Giả định kích thước lớn để ưu tiên
          source: 'aweme_api'
        });
      }
    });

    // Truy cập trang TikTok
    await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Đợi video load
    await page.waitForSelector('video', { timeout: 30000 });

    // Click vào video để phát
    await page.click('video');

    // Đợi thêm thời gian để video load
    await page.waitForTimeout(5000);

    // Tìm tất cả các URL video từ element video
    const videoSources = await page.evaluate(() => {
      const videoElement = document.querySelector('video');
      if (!videoElement) return [];

      // Lấy URL từ thuộc tính src
      const sources = [];
      if (videoElement.src) {
        sources.push(videoElement.src);
      }

      // Lấy URL từ tất cả các thẻ source con
      const sourceElements = videoElement.querySelectorAll('source');
      for (let i = 0; i < sourceElements.length; i++) {
        if (sourceElements[i].src) {
          sources.push(sourceElements[i].src);
        }
      }

      return sources;
    });

    if (videoSources && videoSources.length > 0) {
      console.log(`Tìm thấy ${videoSources.length} URL video từ element video`);

      // Thêm tất cả các URL vào danh sách
      for (const src of videoSources) {
        if (src && src.length > 10) {
          console.log(`URL video từ element: ${src}`);
          videoUrls.push({
            url: src,
            size: 1000000, // Giả định kích thước lớn
            source: 'video_element'
          });
        }
      }
    }

    // Tìm tất cả các URL video từ HTML
    const html = await page.content();

    // Tìm tất cả các URL video trong HTML
    const videoUrlMatches = html.match(/https:\/\/[^"']*\.mp4[^"']*/g) || [];

    if (videoUrlMatches.length > 0) {
      console.log(`Tìm thấy ${videoUrlMatches.length} URL video từ HTML`);

      // Thêm tất cả các URL vào danh sách
      for (const match of videoUrlMatches) {
        const htmlVideoSrc = match.replace(/\\u002F/g, '/');
        console.log(`URL video từ HTML: ${htmlVideoSrc}`);
        videoUrls.push({
          url: htmlVideoSrc,
          size: 1000000, // Giả định kích thước lớn
          source: 'html'
        });
      }
    }

    // Tìm URL video từ aweme/v1/play API (thường là video gốc đầy đủ)
    const awemeUrlMatch = html.match(/https:\/\/www\.tiktok\.com\/aweme\/v1\/play\/[^"']*/g) || [];

    if (awemeUrlMatch.length > 0) {
      console.log(`Tìm thấy ${awemeUrlMatch.length} URL video từ aweme API`);

      // Thêm tất cả các URL vào danh sách với ưu tiên cao
      for (const match of awemeUrlMatch) {
        const awemeVideoSrc = match.replace(/\\u002F/g, '/');
        console.log(`URL video từ aweme API: ${awemeVideoSrc}`);
        videoUrls.push({
          url: awemeVideoSrc,
          size: 2000000, // Giả định kích thước lớn hơn để ưu tiên
          source: 'aweme_api'
        });
      }
    }

    // Sắp xếp các URL video theo nguồn và kích thước
    videoUrls.sort((a, b) => {
      // Ưu tiên theo nguồn: aweme_api > video_element > html > network
      const sourceOrder = {
        'aweme_api': 4,
        'video_element': 3,
        'html': 2,
        'network': 1
      };

      const sourceA = sourceOrder[a.source] || 0;
      const sourceB = sourceOrder[b.source] || 0;

      // Nếu nguồn khác nhau, sắp xếp theo nguồn
      if (sourceA !== sourceB) {
        return sourceB - sourceA;
      }

      // Nếu nguồn giống nhau, sắp xếp theo kích thước
      return b.size - a.size;
    });

    // Nếu không tìm thấy URL video nào, thử tải trực tiếp từ video element
    if (videoUrls.length === 0) {
      console.log('Không tìm thấy URL video, thử tải trực tiếp từ video element...');

      // Tải video trực tiếp từ trang web
      const videoBuffer = await page.evaluate(async () => {
        const videoElement = document.querySelector('video');
        if (!videoElement || !videoElement.src) return null;

        try {
          const response = await fetch(videoElement.src);
          const buffer = await response.arrayBuffer();
          return Array.from(new Uint8Array(buffer));
        } catch (error) {
          console.error('Lỗi khi tải video:', error);
          return null;
        }
      });

      if (videoBuffer) {
        console.log('Đã tải video trực tiếp từ trang web');
        fs.writeFileSync(outputPath, Buffer.from(videoBuffer));

        // Kiểm tra kích thước file
        const fileStats = fs.statSync(outputPath);
        const fileSizeInBytes = fileStats.size;
        console.log(`Kích thước file từ tải trực tiếp: ${fileSizeInBytes} bytes`);

        if (fileSizeInBytes > 500000) {
          console.log('Tải video thành công!');
          await browser.close();
          return true;
        } else {
          console.log('File quá nhỏ, thử phương pháp khác...');
        }
      }
    }

    // Thử tải video từ các URL tìm được
    let videoDownloaded = false;

    for (const videoUrlObj of videoUrls) {
      try {
        console.log(`Đang thử tải video từ URL: ${videoUrlObj.url}`);

        // Tạo tab mới để tải video
        const downloadPage = await browser.newPage();

        // Thiết lập download behavior
        const client = await downloadPage.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: path.dirname(outputPath)
        });

        // Thiết lập headers
        await downloadPage.setExtraHTTPHeaders({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': videoUrl,
          'Accept': 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Range': 'bytes=0-'
        });

        // Tải video bằng cách truy cập URL trực tiếp
        await downloadPage.goto(videoUrlObj.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Tải video bằng fetch API
        const videoBuffer = await downloadPage.evaluate(async (url) => {
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Range': 'bytes=0-'
              }
            });
            const buffer = await response.arrayBuffer();
            return Array.from(new Uint8Array(buffer));
          } catch (error) {
            console.error('Lỗi khi tải video:', error);
            return null;
          }
        }, videoUrlObj.url);

        if (videoBuffer) {
          console.log('Đã tải video bằng fetch API');
          fs.writeFileSync(outputPath, Buffer.from(videoBuffer));

          // Kiểm tra kích thước file
          const fileStats = fs.statSync(outputPath);
          const fileSizeInBytes = fileStats.size;
          console.log(`Kích thước file: ${fileSizeInBytes} bytes`);

          if (fileSizeInBytes > 500000) {
            console.log('Tải video thành công!');
            videoDownloaded = true;
            await downloadPage.close();
            break;
          } else {
            console.log('File quá nhỏ, thử URL tiếp theo...');
            await downloadPage.close();
          }
        } else {
          console.log('Không thể tải video bằng fetch API, thử URL tiếp theo...');
          await downloadPage.close();
        }
      } catch (downloadError) {
        console.log(`Không thể tải video từ URL ${videoUrlObj.url}: ${downloadError.message}`);
      }
    }

    // Đóng browser
    await browser.close();
    browser = null;

    // Kiểm tra kết quả
    if (videoDownloaded) {
      return true;
    } else {
      console.log('Không thể tải video từ bất kỳ URL nào.');
      return false;
    }
  } catch (error) {
    console.error(`Lỗi khi tải video: ${error.message}`);
    return false;
  } finally {
    // Đảm bảo browser được đóng
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`Lỗi khi đóng browser: ${closeError.message}`);
      }
    }
  }
}

// Nếu script được chạy trực tiếp
if (require.main === module) {
  // Lấy URL video từ tham số dòng lệnh
  const videoUrl = process.argv[2];

  if (!videoUrl) {
    console.error('Vui lòng cung cấp URL video TikTok');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, 'downloads', `tiktok_${Date.now()}.mp4`);

  downloadTikTokVideo(videoUrl, outputPath)
    .then(success => {
      if (success) {
        console.log('Video đã được tải thành công!');
        process.exit(0);
      } else {
        console.error('Không thể tải video.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Lỗi:', error.message);
      process.exit(1);
    });
}

module.exports = {
  extractVideoId,
  downloadFile,
  downloadTikTokVideo
};
