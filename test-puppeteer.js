const puppeteer = require('puppeteer');

/**
 * Test Puppeteer installation
 */
async function testPuppeteer() {
  console.log('Testing Puppeteer installation...');
  
  try {
    // Thử khởi động browser với Chromium mặc định
    console.log('Launching browser with default Chromium...');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    console.log('Browser launched successfully!');
    
    // Tạo một trang mới
    const page = await browser.newPage();
    console.log('New page created');
    
    // Truy cập một trang web đơn giản
    console.log('Navigating to google.com...');
    await page.goto('https://www.google.com');
    console.log('Navigation successful');
    
    // Chụp ảnh màn hình
    await page.screenshot({ path: 'test-screenshot.png' });
    console.log('Screenshot saved to test-screenshot.png');
    
    // Đóng browser
    await browser.close();
    console.log('Browser closed');
    
    console.log('Puppeteer test completed successfully!');
  } catch (error) {
    console.error('Error testing Puppeteer:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Chạy test
testPuppeteer();
