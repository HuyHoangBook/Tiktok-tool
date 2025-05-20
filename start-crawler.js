const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Tạo interface để đọc input từ người dùng
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Kiểm tra xem file .env đã tồn tại chưa
const checkEnvFile = () => {
  if (!fs.existsSync('.env')) {
    console.log('File .env không tồn tại. Vui lòng tạo file .env từ .env.example');
    console.log('Ví dụ: MONGO_URI=mongodb://localhost:27017/tiktok-crawler');
    
    rl.question('Bạn có muốn tạo file .env ngay bây giờ không? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        rl.question('Nhập MongoDB URI (ví dụ: mongodb://localhost:27017/tiktok-crawler): ', (mongoUri) => {
          fs.writeFileSync('.env', `MONGO_URI=${mongoUri}\n`);
          console.log('Đã tạo file .env thành công!');
          showMenu();
        });
      } else {
        console.log('Vui lòng tạo file .env trước khi chạy crawler.');
        rl.close();
      }
    });
    return false;
  }
  return true;
};

// Hiển thị menu chính
const showMenu = () => {
  console.log('\n===== TikTok Crawler =====');
  console.log('1. Chạy crawler');
  console.log('2. Kiểm tra kết nối MongoDB');
  console.log('3. Xem cấu hình');
  console.log('4. Thoát');
  
  rl.question('Chọn một tùy chọn (1-4): ', (choice) => {
    switch (choice) {
      case '1':
        runCrawler();
        break;
      case '2':
        testMongoDBConnection();
        break;
      case '3':
        showConfig();
        break;
      case '4':
        console.log('Tạm biệt!');
        rl.close();
        break;
      default:
        console.log('Tùy chọn không hợp lệ. Vui lòng chọn lại.');
        showMenu();
        break;
    }
  });
};

// Chạy crawler
const runCrawler = () => {
  console.log('\n===== Chạy Crawler =====');
  console.log('1. Chạy crawler với cấu hình mặc định');
  console.log('2. Chạy crawler với số lượng video tùy chỉnh');
  console.log('3. Quay lại menu chính');
  
  rl.question('Chọn một tùy chọn (1-3): ', (choice) => {
    switch (choice) {
      case '1':
        startCrawler();
        break;
      case '2':
        rl.question('Nhập số lượng video tối đa để crawl từ mỗi profile: ', (maxVideos) => {
          startCrawler(parseInt(maxVideos));
        });
        break;
      case '3':
        showMenu();
        break;
      default:
        console.log('Tùy chọn không hợp lệ. Vui lòng chọn lại.');
        runCrawler();
        break;
    }
  });
};

// Bắt đầu crawler
const startCrawler = (maxVideos = null) => {
  console.log('\nĐang khởi động crawler...');
  
  // Nếu có maxVideos, cập nhật file index.js tạm thời
  if (maxVideos) {
    const indexContent = fs.readFileSync('index.js', 'utf8');
    const updatedContent = indexContent.replace(
      /maxVideosPerProfile: \d+/,
      `maxVideosPerProfile: ${maxVideos}`
    );
    fs.writeFileSync('index.js.tmp', updatedContent);
    
    console.log(`Đã cập nhật số lượng video tối đa thành ${maxVideos}`);
    
    // Chạy crawler với file tạm
    const crawler = spawn('node', ['index.js.tmp'], { stdio: 'inherit' });
    
    crawler.on('close', (code) => {
      console.log(`Crawler đã kết thúc với mã thoát: ${code}`);
      // Xóa file tạm
      fs.unlinkSync('index.js.tmp');
      showMenu();
    });
  } else {
    // Chạy crawler với cấu hình mặc định
    const crawler = spawn('node', ['index.js'], { stdio: 'inherit' });
    
    crawler.on('close', (code) => {
      console.log(`Crawler đã kết thúc với mã thoát: ${code}`);
      showMenu();
    });
  }
};

// Kiểm tra kết nối MongoDB
const testMongoDBConnection = () => {
  console.log('\nĐang kiểm tra kết nối MongoDB...');
  
  const tester = spawn('node', ['test-db.js'], { stdio: 'inherit' });
  
  tester.on('close', (code) => {
    if (code === 0) {
      console.log('Kết nối MongoDB thành công!');
    } else {
      console.log('Kết nối MongoDB thất bại. Vui lòng kiểm tra lại cấu hình trong file .env');
    }
    showMenu();
  });
};

// Hiển thị cấu hình
const showConfig = () => {
  console.log('\n===== Cấu hình hiện tại =====');
  
  // Đọc file .env
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    console.log('File .env:');
    console.log(envContent);
  } else {
    console.log('File .env không tồn tại.');
  }
  
  // Đọc cấu hình từ index.js
  const indexContent = fs.readFileSync('index.js', 'utf8');
  const configMatch = indexContent.match(/const CONFIG = \{[\s\S]*?\};/);
  
  if (configMatch) {
    console.log('\nCấu hình crawler:');
    console.log(configMatch[0]);
  }
  
  // Đọc danh sách profile
  const profileMatch = indexContent.match(/const profileUrls = \[[\s\S]*?\];/);
  
  if (profileMatch) {
    console.log('\nDanh sách profile:');
    console.log(profileMatch[0]);
  }
  
  rl.question('\nNhấn Enter để quay lại menu chính...', () => {
    showMenu();
  });
};

// Bắt đầu chương trình
console.log('===== TikTok Crawler =====');
console.log('Chào mừng đến với TikTok Crawler!');

if (checkEnvFile()) {
  showMenu();
}
