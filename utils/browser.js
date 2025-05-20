const puppeteer = require('puppeteer');
const { getRandomUserAgent } = require('../config/userAgents');
const path = require('path');
const fs = require('fs');

/**
 * Setup and launch a Puppeteer browser instance
 * @param {boolean} headless - Whether to run browser in headless mode
 * @returns {Promise<Browser>} Puppeteer browser instance
 */
const setupBrowser = async (headless = false) => {
  console.log(`Launching browser in ${headless ? 'headless' : 'visible'} mode`);

  // Tìm đường dẫn Chrome
  let executablePath;

  // Ưu tiên sử dụng đường dẫn từ biến môi trường
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    executablePath = process.env.CHROME_PATH;
    console.log(`Sử dụng Chrome từ biến môi trường: ${executablePath}`);
  } else {
    // Các đường dẫn Chrome phổ biến
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\' + (process.env.USERNAME || 'vuduy') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\' + (process.env.USERNAME || 'vuduy') + '\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe'
    ];

    // Kiểm tra từng đường dẫn
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        executablePath = path;
        console.log(`Tìm thấy Chrome tại: ${path}`);
        break;
      }
    }

    if (!executablePath) {
      console.log('Không tìm thấy Chrome, sử dụng Chromium mặc định của Puppeteer');
    }
  }

  // Xác định thư mục profile
  let userDataDir;

  // Ưu tiên sử dụng đường dẫn từ biến môi trường
  if (process.env.USER_DATA_DIR && fs.existsSync(process.env.USER_DATA_DIR)) {
    userDataDir = process.env.USER_DATA_DIR;
    console.log(`Sử dụng profile Chrome từ biến môi trường: ${userDataDir}`);
  } else {
    // Tạo thư mục profile riêng cho crawler
    userDataDir = path.join(__dirname, '..', 'chrome-profile');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
      console.log(`Đã tạo thư mục profile mới tại: ${userDataDir}`);
    }
    console.log(`Sử dụng profile tại: ${userDataDir}`);
  }

  try {
    // Tạo thư mục cookies nếu chưa tồn tại
    const cookiesDir = path.join(__dirname, '..', 'cookies');
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
      console.log(`Đã tạo thư mục cookies tại: ${cookiesDir}`);
    }

    const browser = await puppeteer.launch({
      headless: headless ? 'new' : false, // Sử dụng headless: 'new' cho Puppeteer mới
      executablePath: executablePath, // Sử dụng đường dẫn đã tìm thấy hoặc mặc định
      userDataDir: userDataDir, // Sử dụng profile đã cấu hình
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920x1080',
        '--disable-extensions', // Tắt extensions để tránh xung đột
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process', // Giúp với iframe
        // '--disable-web-security', // Tắt CORS - gây lỗi với Chrome thật
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      },
      ignoreDefaultArgs: ['--enable-automation']
    });

    console.log('Browser launched successfully');
    return browser;
  } catch (error) {
    console.error('Error launching browser:', error.message);

    // Thử lại với Chromium mặc định nếu Chrome không khởi động được
    if (executablePath) {
      console.log('Retrying with default Chromium...');
      const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });

      console.log('Browser launched with default Chromium');
      return browser;
    }

    throw error;
  }
};

/**
 * Lưu cookies vào file
 * @param {Page} page - Puppeteer page instance
 * @param {string} domain - Tên miền (ví dụ: 'tiktok.com')
 */
const saveCookies = async (page, domain) => {
  try {
    const cookies = await page.cookies();
    const cookiesPath = path.join(__dirname, '..', 'cookies', `${domain}.json`);
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log(`Đã lưu cookies cho ${domain} vào ${cookiesPath}`);
  } catch (error) {
    console.error(`Lỗi khi lưu cookies: ${error.message}`);
  }
};

/**
 * Tải cookies từ file
 * @param {Page} page - Puppeteer page instance
 * @param {string} domain - Tên miền (ví dụ: 'tiktok.com')
 * @returns {Promise<boolean>} Thành công hay không
 */
const loadCookies = async (page, domain) => {
  try {
    const cookiesPath = path.join(__dirname, '..', 'cookies', `${domain}.json`);

    if (fs.existsSync(cookiesPath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));

      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`Đã tải ${cookies.length} cookies cho ${domain}`);
        return true;
      }
    }

    console.log(`Không tìm thấy cookies cho ${domain}`);
    return false;
  } catch (error) {
    console.error(`Lỗi khi tải cookies: ${error.message}`);
    return false;
  }
};

/**
 * Kiểm tra xem đã đăng nhập chưa
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<boolean>} Đã đăng nhập hay chưa
 */
const checkLogin = async (page) => {
  try {
    // Kiểm tra các phần tử chỉ xuất hiện khi đã đăng nhập
    const isLoggedIn = await page.evaluate(() => {
      // Kiểm tra nút upload hoặc avatar người dùng
      const uploadButton = document.querySelector('[data-e2e="upload-icon"]');
      const userAvatar = document.querySelector('[data-e2e="user-avatar"]');

      return !!(uploadButton || userAvatar);
    });

    return isLoggedIn;
  } catch (error) {
    console.error(`Lỗi khi kiểm tra đăng nhập: ${error.message}`);
    return false;
  }
};

/**
 * Create a new page with custom settings
 * @param {Browser} browser - Puppeteer browser instance
 * @returns {Promise<Page>} Puppeteer page instance
 */
const createPage = async (browser) => {
  const page = await browser.newPage();

  // Không sử dụng user agent ngẫu nhiên nữa vì chúng ta đang dùng Chrome thật
  // Thay vào đó, chúng ta sẽ sử dụng một user agent giống người dùng thật
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  // Set extra HTTP headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7', // Sử dụng tiếng Việt làm ngôn ngữ chính
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'sec-ch-ua': '"Google Chrome";v="91", "Chromium";v="91", ";Not A Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  });

  // Tắt việc chặn tài nguyên để trang web hoạt động bình thường
  // await page.setRequestInterception(true);
  // page.on('request', (req) => {
  //   req.continue();
  // });

  // Thêm script để ẩn dấu hiệu automation
  await page.evaluateOnNewDocument(() => {
    // Ghi đè thuộc tính navigator.webdriver để tránh bị phát hiện
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Ghi đè các phương thức phát hiện automation khác
    window.navigator.chrome = {
      runtime: {},
    };

    // Xóa các thuộc tính cdr_ từ window
    Object.defineProperty(window, 'cdc_adoQpoasnfa76pfcZLmcfl_Array', {
      get: () => undefined
    });
    Object.defineProperty(window, 'cdc_adoQpoasnfa76pfcZLmcfl_Promise', {
      get: () => undefined
    });
    Object.defineProperty(window, 'cdc_adoQpoasnfa76pfcZLmcfl_Symbol', {
      get: () => undefined
    });
  });

  return page;
};

/**
 * Xử lý trang đăng nhập TikTok
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<boolean>} Thành công hay không
 */
const handleLoginPage = async (page) => {
  try {
    console.log('Phát hiện trang đăng nhập, đang xử lý...');

    // Thử tải cookies đã lưu trước
    const cookiesLoaded = await loadCookies(page, 'tiktok.com');

    if (cookiesLoaded) {
      // Tải lại trang để áp dụng cookies
      await page.reload({ waitUntil: ['load', 'domcontentloaded', 'networkidle0'] });
      await page.waitForTimeout(5000);

      // Kiểm tra xem đã đăng nhập thành công chưa
      const isLoggedIn = await checkLogin(page);

      if (isLoggedIn) {
        console.log('Đăng nhập thành công bằng cookies');
        return true;
      }
    }

    console.log('Không thể đăng nhập tự động. Vui lòng đăng nhập thủ công trong cửa sổ trình duyệt.');
    console.log('Sau khi đăng nhập, cookies sẽ được lưu tự động cho lần sau.');

    // Chờ người dùng đăng nhập thủ công (tối đa 5 phút)
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(10000); // Chờ 10 giây

      // Kiểm tra xem đã đăng nhập chưa
      const isLoggedIn = await checkLogin(page);

      if (isLoggedIn) {
        console.log('Đã phát hiện đăng nhập thành công');

        // Lưu cookies để sử dụng lần sau
        await saveCookies(page, 'tiktok.com');

        return true;
      }

      console.log(`Đang chờ đăng nhập... (${i + 1}/30)`);
    }

    console.error('Hết thời gian chờ đăng nhập');
    return false;
  } catch (error) {
    console.error(`Lỗi khi xử lý trang đăng nhập: ${error.message}`);
    return false;
  }
};

/**
 * Navigate to a URL with retry mechanism
 * @param {Page} page - Puppeteer page instance
 * @param {string} url - URL to navigate to
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<boolean>} Success status
 */
const navigateToUrl = async (page, url, maxRetries = 3) => {
  let retries = 0;

  // Thử tải cookies trước khi truy cập
  await loadCookies(page, 'tiktok.com');

  while (retries < maxRetries) {
    try {
      // Tăng thời gian chờ và sử dụng nhiều điều kiện chờ hơn
      await page.goto(url, {
        waitUntil: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
        timeout: 120000 // Tăng timeout lên 2 phút
      });

      // Chờ thêm một chút để đảm bảo trang đã tải hoàn toàn
      await page.waitForTimeout(5000);

      // Kiểm tra xem trang có hiển thị nội dung chính không
      const pageContent = await page.content();

      // Kiểm tra xem có phải trang đăng nhập không
      if (pageContent.includes('login-modal') ||
          pageContent.includes('login-title') ||
          pageContent.includes('login-container') ||
          await page.evaluate(() => !!document.querySelector('[data-e2e="login-modal"]'))) {

        // Xử lý trang đăng nhập
        const loginSuccess = await handleLoginPage(page);

        if (loginSuccess) {
          // Sau khi đăng nhập, truy cập lại URL ban đầu
          return await navigateToUrl(page, url, maxRetries - retries);
        } else {
          console.error('Không thể đăng nhập, không thể tiếp tục crawl');
          return false;
        }
      }

      if (pageContent.includes('TikTok') && !pageContent.includes('Access Denied')) {
        console.log(`Successfully navigated to ${url}`);
        return true;
      } else {
        console.error(`Page loaded but content verification failed for ${url}`);
        retries++;
      }
    } catch (error) {
      console.error(`Error navigating to ${url}: ${error.message}`);
      retries++;

      // Chụp ảnh màn hình để debug
      try {
        await page.screenshot({ path: `error-screenshot-${Date.now()}.png` });
        console.log('Error screenshot saved');
      } catch (screenshotError) {
        console.error('Failed to save error screenshot:', screenshotError.message);
      }

      if (retries >= maxRetries) {
        console.error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
        return false;
      }

      // Tăng thời gian chờ giữa các lần thử
      const waitTime = 5000 + (retries * 2000); // Tăng thời gian chờ theo số lần thử
      console.log(`Waiting ${waitTime}ms before retry ${retries + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return false;
};

module.exports = {
  setupBrowser,
  createPage,
  navigateToUrl,
  saveCookies,
  loadCookies,
  checkLogin,
  handleLoginPage
};
