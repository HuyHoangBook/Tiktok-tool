const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { crawlVideo } = require('./crawlers/videoCrawler');
const { crawlProfile } = require('./crawlers/profileCrawler');
const { exportVideoToSheet, exportMultipleVideos } = require('./exportToSheet');

/**
 * Kiểm tra cấu hình và khởi động crawler
 */
async function runCrawler() {
  console.log('=== TikTok Crawler ===');
  
  // Kiểm tra MongoDB URI
  if (!process.env.MONGO_URI) {
    console.error('Lỗi: Không tìm thấy MONGO_URI trong file .env');
    console.error('Vui lòng cập nhật file .env với MONGO_URI hợp lệ');
    process.exit(1);
  }
  
  // Kiểm tra cài đặt Puppeteer
  console.log('Kiểm tra cài đặt Puppeteer...');
  try {
    await testPuppeteer();
  } catch (error) {
    console.error('Lỗi khi kiểm tra Puppeteer:', error.message);
    console.error('Vui lòng kiểm tra lại cài đặt Puppeteer');
    process.exit(1);
  }
  
  // Kiểm tra kết nối MongoDB
  console.log('Kiểm tra kết nối MongoDB...');
  try {
    await testMongoDB();
  } catch (error) {
    console.error('Lỗi khi kết nối MongoDB:', error.message);
    console.error('Vui lòng kiểm tra lại cấu hình MongoDB');
    process.exit(1);
  }
  
  // Khởi động crawler
  console.log('Khởi động crawler...');
  
  const crawler = spawn('node', ['index.js'], { stdio: 'inherit' });
  
  crawler.on('close', (code) => {
    if (code === 0) {
      console.log('Crawler đã hoàn thành thành công!');
    } else {
      console.error(`Crawler đã kết thúc với mã lỗi: ${code}`);
    }
  });
}

/**
 * Kiểm tra cài đặt Puppeteer
 */
async function testPuppeteer() {
  return new Promise((resolve, reject) => {
    const tester = spawn('node', ['test-puppeteer.js']);
    
    let output = '';
    
    tester.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    tester.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });
    
    tester.on('close', (code) => {
      if (code === 0 && output.includes('Puppeteer test completed successfully')) {
        console.log('Kiểm tra Puppeteer thành công!');
        resolve();
      } else {
        reject(new Error('Kiểm tra Puppeteer thất bại'));
      }
    });
  });
}

/**
 * Kiểm tra kết nối MongoDB
 */
async function testMongoDB() {
  return new Promise((resolve, reject) => {
    const tester = spawn('node', ['test-db.js']);
    
    let output = '';
    
    tester.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    tester.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });
    
    tester.on('close', (code) => {
      if (code === 0 && output.includes('MongoDB connection test successful')) {
        console.log('Kiểm tra MongoDB thành công!');
        resolve();
      } else {
        reject(new Error('Kiểm tra MongoDB thất bại'));
      }
    });
  });
}

// Chạy crawler
runCrawler().catch(console.error);
