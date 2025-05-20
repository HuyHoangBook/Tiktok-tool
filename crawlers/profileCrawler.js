const { extractVideoUrls } = require('../utils/parser');
const { navigateToUrl, saveCookies } = require('../utils/browser');
const fs = require('fs');
const path = require('path');

/**
 * Trích xuất URL video từ trang profile bằng JavaScript
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<Array<string>>} Array of video URLs
 */
const extractVideoUrlsFromPage = async (page) => {
  try {
    // Trích xuất URL video bằng JavaScript trực tiếp trên trang
    const videoUrls = await page.evaluate(() => {
      const urls = [];

      // Tìm tất cả các thẻ a có href chứa "/video/"
      const videoLinks = document.querySelectorAll('a[href*="/video/"]');

      videoLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          // Chuyển đổi URL tương đối thành URL tuyệt đối
          const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;

          // Kiểm tra xem URL đã tồn tại trong mảng chưa
          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl);
          }
        }
      });

      return urls;
    });

    return videoUrls;
  } catch (error) {
    console.error(`Lỗi khi trích xuất URL video từ trang: ${error.message}`);
    return [];
  }
};

/**
 * Crawl a TikTok profile to extract video URLs
 * @param {Page} page - Puppeteer page instance
 * @param {string} profileUrl - TikTok profile URL
 * @returns {Promise<Array<string>>} Array of video URLs
 */
const crawlProfile = async (page, profileUrl) => {
  console.log(`Crawling profile: ${profileUrl}`);

  // Tạo thư mục debug nếu chưa tồn tại
  const debugDir = path.join(__dirname, '..', 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  // Navigate to the profile page
  const navigationSuccess = await navigateToUrl(page, profileUrl);

  if (!navigationSuccess) {
    console.error(`Failed to navigate to profile: ${profileUrl}`);
    return [];
  }

  // Lưu cookies sau khi truy cập thành công
  await saveCookies(page, 'tiktok.com');

  // Đợi trang tải
  await page.waitForTimeout(5000);

  // Thử tìm container video với nhiều selector khác nhau
  const selectors = [
    'div[class*="DivThreeColumnContainer"]',
    'div[data-e2e="user-post-item-list"]',
    'div[class*="DivItemContainer"]',
    'div[class*="video-feed"]'
  ];

  let containerFound = false;

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      console.log(`Tìm thấy container video với selector: ${selector}`);
      containerFound = true;
      break;
    } catch (error) {
      console.log(`Không tìm thấy container video với selector: ${selector}`);
    }
  }

  if (!containerFound) {
    console.log('Videos container not found, proceeding anyway');
  }

  // Scroll down to load more videos (adjust the number of scrolls as needed)
  const scrollsCount = 10; // Tăng số lần scroll
  for (let i = 0; i < scrollsCount; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    // Wait for new content to load
    await page.waitForTimeout(2000);

    // Chụp ảnh màn hình để debug
    if (i === 0 || i === scrollsCount - 1) {
      await page.screenshot({ path: path.join(debugDir, `profile-scroll-${i}-${Date.now()}.png`) });
    }
  }

  // Trích xuất URL video bằng JavaScript trực tiếp trên trang
  const jsVideoUrls = await extractVideoUrlsFromPage(page);
  console.log(`Tìm thấy ${jsVideoUrls.length} video URLs bằng JavaScript`);

  // Get the page content
  const content = await page.content();

  // Lưu HTML để debug
  fs.writeFileSync(path.join(debugDir, `profile-${Date.now()}.html`), content);

  // Extract video URLs bằng Cheerio
  const cheerioVideoUrls = extractVideoUrls(content);
  console.log(`Tìm thấy ${cheerioVideoUrls.length} video URLs bằng Cheerio`);

  // Kết hợp kết quả từ cả hai phương pháp
  const combinedUrls = [...new Set([...jsVideoUrls, ...cheerioVideoUrls])];

  console.log(`Found ${combinedUrls.length} videos on profile: ${profileUrl}`);

  return combinedUrls;
};

module.exports = {
  crawlProfile
};
