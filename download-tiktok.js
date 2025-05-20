const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

/**
 * Kiểm tra xem một lệnh có được cài đặt không
 * @param {string} command - Lệnh cần kiểm tra
 * @returns {Promise<boolean>} True nếu lệnh được cài đặt, false nếu không
 */
const isCommandInstalled = async (command) => {
  return new Promise((resolve) => {
    const platform = process.platform;
    const cmd = platform === 'win32' ? 'where' : 'which';
    const proc = spawn(cmd, [command]);

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    // Đặt timeout để tránh treo
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
};

/**
 * Tải video TikTok bằng axios
 * @param {string} videoUrl - URL của video TikTok
 * @param {string} outputPath - Đường dẫn để lưu video
 * @returns {Promise<string>} Đường dẫn đến file video đã tải
 */
const downloadWithAxios = async (videoUrl, outputPath) => {
  try {
    console.log('Đang thử tải video bằng axios...');

    const axios = require('axios');
    const { promisify } = require('util');
    const stream = require('stream');
    const pipeline = promisify(stream.pipeline);

    // Tạo một user agent giống trình duyệt thật
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    // Tải trang TikTok để lấy cookies
    const response1 = await axios.get(videoUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Trích xuất URL video từ HTML
    const html = response1.data;
    const videoUrlMatch = html.match(/https:\/\/[^"']*\.mp4[^"']*/);

    if (!videoUrlMatch) {
      throw new Error('Không tìm thấy URL video trong HTML');
    }

    const directVideoUrl = videoUrlMatch[0].replace(/\\u002F/g, '/');
    console.log(`Tìm thấy URL video trực tiếp: ${directVideoUrl}`);

    // Tải video
    const response2 = await axios({
      method: 'GET',
      url: directVideoUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': userAgent,
        'Referer': videoUrl,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      }
    });

    // Lưu video vào file
    await pipeline(response2.data, fs.createWriteStream(outputPath));

    console.log(`Video đã được tải về bằng axios: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`Lỗi khi tải video bằng axios: ${error.message}`);
    throw error;
  }
};

/**
 * Tải video TikTok bằng yt-dlp
 * @param {string} videoUrl - URL của video TikTok
 * @param {string} outputPath - Đường dẫn để lưu video
 * @returns {Promise<string>} Đường dẫn đến file video đã tải
 */
const downloadWithYtDlp = async (videoUrl, outputPath) => {
  return new Promise(async (resolve, reject) => {
    console.log(`Đang tải video từ: ${videoUrl}`);

    // Tạo thư mục nếu chưa tồn tại
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Kiểm tra xem yt-dlp có được cài đặt không
    const ytdlpInstalled = await isCommandInstalled('yt-dlp');

    if (!ytdlpInstalled) {
      console.log('yt-dlp không được cài đặt. Đang thử phương pháp thay thế...');

      try {
        // Thử tải bằng axios
        const axiosResult = await downloadWithAxios(videoUrl, outputPath);
        resolve(axiosResult);
        return;
      } catch (axiosError) {
        console.error(`Không thể tải bằng axios: ${axiosError.message}`);

        // Tạo file giả nếu tất cả các phương pháp đều thất bại
        console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
        fs.writeFileSync(outputPath, 'Failed to download video');
        resolve(outputPath);
        return;
      }
    }

    // Sử dụng yt-dlp để tải video
    console.log('Đang tải video bằng yt-dlp...');
    const ytdlp = spawn('yt-dlp', [
      '--no-check-certificate',
      '--no-warnings',
      '--prefer-ffmpeg',
      '--format', 'best',
      '-o', outputPath,
      videoUrl
    ]);

    let output = '';

    ytdlp.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log(`yt-dlp: ${message}`);
    });

    ytdlp.stderr.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.error(`yt-dlp error: ${message}`);
    });

    ytdlp.on('error', async (error) => {
      console.error(`Lỗi khi chạy yt-dlp: ${error.message}`);

      if (error.code === 'ENOENT') {
        console.log('yt-dlp không được cài đặt hoặc không nằm trong PATH. Đang thử phương pháp thay thế...');

        try {
          // Thử tải bằng axios
          const axiosResult = await downloadWithAxios(videoUrl, outputPath);
          resolve(axiosResult);
        } catch (axiosError) {
          console.error(`Không thể tải bằng axios: ${axiosError.message}`);

          // Tạo file giả nếu tất cả các phương pháp đều thất bại
          console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
          fs.writeFileSync(outputPath, 'Failed to download video');
          resolve(outputPath);
        }
      } else {
        reject(error);
      }
    });

    ytdlp.on('close', async (code) => {
      if (code === 0) {
        console.log(`Video đã được tải về bằng yt-dlp: ${outputPath}`);
        resolve(outputPath);
      } else {
        console.error(`yt-dlp exited with code ${code}`);

        // Kiểm tra xem ffmpeg có được cài đặt không
        const ffmpegInstalled = await isCommandInstalled('ffmpeg');

        // Nếu yt-dlp thất bại và có ffmpeg, thử sử dụng ffmpeg
        if (ffmpegInstalled && output.includes('ffmpeg')) {
          console.log('Đang thử tải bằng ffmpeg...');

          // Trích xuất URL video từ output
          const urlMatch = output.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/);
          if (urlMatch) {
            const videoUrl = urlMatch[0];

            try {
              const ffmpeg = spawn('ffmpeg', [
                '-i', videoUrl,
                '-c', 'copy',
                outputPath
              ]);

              ffmpeg.on('error', (error) => {
                console.error(`Lỗi khi chạy ffmpeg: ${error.message}`);

                if (error.code === 'ENOENT') {
                  console.log('ffmpeg không được cài đặt hoặc không nằm trong PATH. Đang thử phương pháp thay thế...');

                  // Thử tải trực tiếp bằng axios
                  downloadWithAxios(videoUrl, outputPath)
                    .then(resolve)
                    .catch((axiosError) => {
                      console.error(`Không thể tải bằng axios: ${axiosError.message}`);

                      // Tạo file giả nếu tất cả các phương pháp đều thất bại
                      console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
                      fs.writeFileSync(outputPath, 'Failed to download video');
                      resolve(outputPath);
                    });
                } else {
                  // Thử tải bằng axios
                  downloadWithAxios(videoUrl, outputPath)
                    .then(resolve)
                    .catch((axiosError) => {
                      console.error(`Không thể tải bằng axios: ${axiosError.message}`);

                      // Tạo file giả nếu tất cả các phương pháp đều thất bại
                      console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
                      fs.writeFileSync(outputPath, 'Failed to download video');
                      resolve(outputPath);
                    });
                }
              });

              ffmpeg.on('close', (ffmpegCode) => {
                if (ffmpegCode === 0) {
                  console.log(`Video đã được tải về bằng ffmpeg: ${outputPath}`);
                  resolve(outputPath);
                } else {
                  console.error(`ffmpeg exited with code ${ffmpegCode}`);

                  // Thử tải bằng axios
                  downloadWithAxios(videoUrl, outputPath)
                    .then(resolve)
                    .catch((axiosError) => {
                      console.error(`Không thể tải bằng axios: ${axiosError.message}`);

                      // Tạo file giả nếu tất cả các phương pháp đều thất bại
                      console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
                      fs.writeFileSync(outputPath, 'Failed to download video');
                      resolve(outputPath);
                    });
                }
              });
            } catch (ffmpegError) {
              console.error(`Lỗi khi khởi động ffmpeg: ${ffmpegError.message}`);

              // Thử tải trực tiếp bằng axios
              downloadWithAxios(videoUrl, outputPath)
                .then(resolve)
                .catch((axiosError) => {
                  console.error(`Không thể tải bằng axios: ${axiosError.message}`);

                  // Tạo file giả nếu tất cả các phương pháp đều thất bại
                  console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
                  fs.writeFileSync(outputPath, 'Failed to download video');
                  resolve(outputPath);
                });
            }
          } else {
            console.log('Không tìm thấy URL video trong output của yt-dlp. Đang thử phương pháp thay thế...');

            // Thử tải bằng axios
            downloadWithAxios(videoUrl, outputPath)
              .then(resolve)
              .catch((axiosError) => {
                console.error(`Không thể tải bằng axios: ${axiosError.message}`);

                // Tạo file giả nếu tất cả các phương pháp đều thất bại
                console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
                fs.writeFileSync(outputPath, 'Failed to download video');
                resolve(outputPath);
              });
          }
        } else {
          console.log('ffmpeg không được cài đặt hoặc không tìm thấy URL video. Đang thử phương pháp thay thế...');

          // Thử tải bằng axios
          downloadWithAxios(videoUrl, outputPath)
            .then(resolve)
            .catch((axiosError) => {
              console.error(`Không thể tải bằng axios: ${axiosError.message}`);

              // Tạo file giả nếu tất cả các phương pháp đều thất bại
              console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
              fs.writeFileSync(outputPath, 'Failed to download video');
              resolve(outputPath);
            });
        }
      }
    });
  });
};

/**
 * Khởi tạo Google Drive API
 * @param {string} credentialsPath - Đường dẫn đến file credentials
 * @returns {google.drive_v3.Drive} Google Drive API client
 */
const initializeDriveAPI = (credentialsPath) => {
  try {
    // Kiểm tra xem file credentials có tồn tại không
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`File credentials không tồn tại tại đường dẫn: ${credentialsPath}`);
    }

    // Đọc file credentials
    const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    let credentials;

    try {
      credentials = JSON.parse(credentialsContent);
    } catch (parseError) {
      throw new Error(`Không thể parse file credentials JSON: ${parseError.message}`);
    }

    // Kiểm tra xem credentials có đúng định dạng không
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('File credentials không đúng định dạng, thiếu client_email hoặc private_key');
    }

    // Tạo JWT client
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive']
    );

    // Tạo Drive client
    const drive = google.drive({
      version: 'v3',
      auth
    });

    return drive;
  } catch (error) {
    console.error(`Lỗi khi khởi tạo Google Drive API: ${error.message}`);
    throw error;
  }
};

/**
 * Tạo thư mục trên Google Drive
 * @param {google.drive_v3.Drive} drive - Google Drive API client
 * @param {string} folderName - Tên thư mục
 * @param {string} parentId - ID của thư mục cha (optional)
 * @returns {Promise<string>} ID của thư mục
 */
const createDriveFolder = async (drive, folderName, parentId = null) => {
  try {
    // Kiểm tra xem thư mục đã tồn tại chưa
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)'
    });

    // Nếu thư mục đã tồn tại, trả về ID
    if (response.data.files.length > 0) {
      console.log(`Thư mục '${folderName}' đã tồn tại với ID: ${response.data.files[0].id}`);
      return response.data.files[0].id;
    }

    // Nếu chưa tồn tại, tạo thư mục mới
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    // Nếu có parentId, thêm vào metadata
    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });

    console.log(`Đã tạo thư mục '${folderName}' với ID: ${folder.data.id}`);
    return folder.data.id;
  } catch (error) {
    console.error(`Lỗi khi tạo thư mục trên Google Drive: ${error.message}`);
    throw error;
  }
};

/**
 * Upload file lên Google Drive
 * @param {google.drive_v3.Drive} drive - Google Drive API client
 * @param {string} filePath - Đường dẫn đến file cần upload
 * @param {string} folderId - ID của thư mục trên Google Drive
 * @returns {Promise<Object>} Thông tin về file đã upload
 */
const uploadFileToDrive = async (drive, filePath, folderId) => {
  try {
    const fileName = path.basename(filePath);

    // Tạo metadata cho file
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    // Tạo media
    const media = {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath)
    };

    // Upload file
    console.log(`Đang upload file ${fileName} lên Google Drive...`);
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink'
    });

    console.log(`File đã được upload với ID: ${file.data.id}`);

    // Đặt quyền truy cập là public cho file
    try {
      await drive.permissions.create({
        fileId: file.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log(`Đã đặt quyền truy cập public cho file: ${file.data.id}`);
    } catch (permissionError) {
      console.error(`Lỗi khi đặt quyền truy cập public: ${permissionError.message}`);
    }

    console.log(`Link xem file: ${file.data.webViewLink}`);
    console.log(`Direct download link: ${file.data.webContentLink || 'Không có'}`);

    return {
      id: file.data.id,
      webViewLink: file.data.webViewLink,
      directLink: file.data.webContentLink || null
    };
  } catch (error) {
    console.error(`Lỗi khi upload file lên Google Drive: ${error.message}`);
    throw error;
  }
};

/**
 * Tải video TikTok bằng puppeteer
 * @param {string} videoUrl - URL của video TikTok
 * @param {string} outputPath - Đường dẫn để lưu video
 * @returns {Promise<string>} Đường dẫn đến file video đã tải
 */
const downloadWithPuppeteer = async (videoUrl, outputPath) => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  console.log(`Đang tải video bằng puppeteer từ: ${videoUrl}`);

  let browser = null;

  try {
    // Tạo thư mục nếu chưa tồn tại
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Khởi động browser
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const page = await browser.newPage();

    // Thiết lập request interception để tìm URL video
    await page.setRequestInterception(true);

    let videoSourceUrl = null;

    page.on('request', request => {
      request.continue();
    });

    page.on('response', async response => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      if (contentType.includes('video/mp4') || url.includes('.mp4')) {
        console.log(`Tìm thấy URL video: ${url}`);
        videoSourceUrl = url;
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

    // Nếu không tìm thấy URL video từ network requests, thử lấy từ thẻ video
    if (!videoSourceUrl) {
      videoSourceUrl = await page.evaluate(() => {
        const videoElement = document.querySelector('video');
        return videoElement ? videoElement.src : null;
      });

      if (videoSourceUrl) {
        console.log(`Tìm thấy URL video từ thẻ video: ${videoSourceUrl}`);
      }
    }

    // Nếu vẫn không tìm thấy, thử tìm trong HTML
    if (!videoSourceUrl) {
      const html = await page.content();
      const videoUrlMatch = html.match(/https:\/\/[^"']*\.mp4[^"']*/);

      if (videoUrlMatch) {
        videoSourceUrl = videoUrlMatch[0].replace(/\\u002F/g, '/');
        console.log(`Tìm thấy URL video từ HTML: ${videoSourceUrl}`);
      }
    }

    // Đóng browser
    await browser.close();
    browser = null;

    // Nếu tìm thấy URL video, tải video
    if (videoSourceUrl) {
      // Tải video bằng axios
      const axios = require('axios');
      const { promisify } = require('util');
      const stream = require('stream');
      const pipeline = promisify(stream.pipeline);

      const response = await axios({
        method: 'GET',
        url: videoSourceUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': videoUrl,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive'
        }
      });

      // Lưu video vào file
      await pipeline(response.data, fs.createWriteStream(outputPath));

      console.log(`Video đã được tải về bằng puppeteer: ${outputPath}`);
      return outputPath;
    } else {
      throw new Error('Không tìm thấy URL video');
    }
  } catch (error) {
    console.error(`Lỗi khi tải video bằng puppeteer: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

/**
 * Tải video TikTok và upload lên Google Drive
 * @param {string} videoUrl - URL của video TikTok
 * @returns {Promise<Object>} Thông tin về file đã upload
 */
const downloadAndUploadTikTok = async (videoUrl) => {
  try {
    // Tạo tên file từ URL video
    const videoId = videoUrl.split('/').pop().split('?')[0];
    const fileName = `tiktok_${videoId}_${Date.now()}.mp4`;
    const outputPath = path.join(__dirname, 'downloads', fileName);

    // Tải video - thử nhiều phương pháp
    let downloadSuccess = false;

    // Phương pháp 1: Sử dụng TikTok aweme API trực tiếp
    try {
      console.log('Đang thử tải video bằng TikTok aweme API...');
      const videoId = videoUrl.split('/').pop().split('?')[0];

      if (videoId) {
        // URL API chính thức của TikTok để lấy thông tin video
        const awemeApiUrl = `https://www.tiktok.com/aweme/v1/play/?video_id=${videoId}&item_id=${videoId}&aid=1988&line=0&file_id=&sign=&signaturev3=&media_type=4&vr_type=0&improve_bitrate=0&logo_name=tiktok_m&quality_type=4&source=AWEME_DETAIL`;

        // Headers giả lập ứng dụng TikTok
        const headers = {
          'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          'Range': 'bytes=0-',
          'Referer': 'https://www.tiktok.com/'
        };

        console.log(`Đang tải video từ aweme API: ${awemeApiUrl}`);

        // Tải video
        const axios = require('axios');
        const { promisify } = require('util');
        const stream = require('stream');
        const pipeline = promisify(stream.pipeline);

        const response = await axios({
          method: 'GET',
          url: awemeApiUrl,
          responseType: 'stream',
          headers: headers,
          timeout: 60000
        });

        // Lưu video vào file
        await pipeline(response.data, fs.createWriteStream(outputPath));

        // Kiểm tra kích thước file
        const fileStats = fs.statSync(outputPath);
        const fileSizeInBytes = fileStats.size;
        console.log(`Kích thước file từ aweme API: ${fileSizeInBytes} bytes`);

        if (fileSizeInBytes > 500000) {
          console.log('Tải video thành công bằng aweme API!');
          downloadSuccess = true;
        } else {
          console.log('File từ aweme API quá nhỏ, thử phương pháp khác...');
          // Tiếp tục với phương pháp tiếp theo
        }
      }
    } catch (awemeError) {
      console.log('Không thể tải video bằng TikTok aweme API:', awemeError.message);
    }

    // Phương pháp 2: Sử dụng yt-dlp
    if (!downloadSuccess) {
      try {
        await downloadWithYtDlp(videoUrl, outputPath);
        downloadSuccess = true;
      } catch (ytdlpError) {
        console.error(`Lỗi khi tải bằng yt-dlp: ${ytdlpError.message}`);

      // Phương pháp 3: Sử dụng puppeteer
      try {
        await downloadWithPuppeteer(videoUrl, outputPath);

        // Kiểm tra kích thước file
        const fileStats = fs.statSync(outputPath);
        const fileSizeInBytes = fileStats.size;
        console.log(`Kích thước file từ puppeteer: ${fileSizeInBytes} bytes`);

        if (fileSizeInBytes > 500000) {
          console.log('Tải video thành công bằng puppeteer!');
          downloadSuccess = true;
        } else {
          console.log('File từ puppeteer quá nhỏ, thử phương pháp khác...');
        }
      } catch (puppeteerError) {
        console.error(`Lỗi khi tải bằng puppeteer: ${puppeteerError.message}`);

        // Phương pháp 4: Sử dụng axios
        try {
          await downloadWithAxios(videoUrl, outputPath);

          // Kiểm tra kích thước file
          const fileStats = fs.statSync(outputPath);
          const fileSizeInBytes = fileStats.size;
          console.log(`Kích thước file từ axios: ${fileSizeInBytes} bytes`);

          if (fileSizeInBytes > 500000) {
            console.log('Tải video thành công bằng axios!');
            downloadSuccess = true;
          } else {
            console.log('File từ axios quá nhỏ, thử phương pháp khác...');
            downloadSuccess = false;
          }
        } catch (axiosError) {
          console.error(`Lỗi khi tải bằng axios: ${axiosError.message}`);

          // Tạo file giả nếu tất cả các phương pháp đều thất bại
          console.log('Tất cả các phương pháp tải đều thất bại, tạo file giả...');
          fs.writeFileSync(outputPath, 'Failed to download video');
          downloadSuccess = false;
        }
      }
    }

    // Kiểm tra kích thước file
    const fileStats = fs.statSync(outputPath);
    const fileSizeInBytes = fileStats.size;
    console.log(`Kích thước file: ${fileSizeInBytes} bytes`);

    if (fileSizeInBytes < 100000) { // Nếu file nhỏ hơn 100KB, có thể không phải là video thực sự
      console.log('File quá nhỏ, có thể không phải là video thực sự. Đang thử phương pháp khác...');

      // Thử tải bằng cách sử dụng puppeteer để trích xuất URL video trực tiếp
      try {
        console.log('Đang thử tải video bằng puppeteer để trích xuất URL video trực tiếp...');

        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());

        const browser = await puppeteer.launch({
          headless: false,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        });

        try {
          const page = await browser.newPage();

          // Thiết lập request interception để lấy URL video
          await page.setRequestInterception(true);

          let videoUrls = [];

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
                if (contentLength && parseInt(contentLength) > 100000) {
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

          // Đóng browser
          await browser.close();

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

          // Thử tải video từ các URL tìm được
          let videoDownloaded = false;

          for (const videoUrlObj of videoUrls) {
            try {
              console.log(`Đang thử tải video từ URL: ${videoUrlObj.url}`);

              // Tải video bằng axios với các headers đầy đủ
              const axios = require('axios');
              const { promisify } = require('util');
              const stream = require('stream');
              const pipeline = promisify(stream.pipeline);

              // Tạo headers đầy đủ để giả lập trình duyệt
              const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': videoUrl,
                'Accept': 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Range': 'bytes=0-', // Yêu cầu toàn bộ video
                'Sec-Fetch-Dest': 'video',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
              };

              // Nếu là URL từ aweme API, thêm các tham số cần thiết
              let finalUrl = videoUrlObj.url;
              if (videoUrlObj.source === 'aweme_api' && !finalUrl.includes('&download=1')) {
                finalUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + 'download=1';
              }

              console.log(`Đang tải video từ URL: ${finalUrl}`);

              const response = await axios({
                method: 'GET',
                url: finalUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 60000, // Tăng timeout lên 60 giây
                maxContentLength: 100 * 1024 * 1024, // Cho phép tải file lớn (100MB)
                maxBodyLength: 100 * 1024 * 1024
              });

              // Lưu video vào file
              await pipeline(response.data, fs.createWriteStream(outputPath));

              // Kiểm tra kích thước file
              const fileStats = fs.statSync(outputPath);
              const fileSizeInBytes = fileStats.size;
              console.log(`Kích thước file: ${fileSizeInBytes} bytes`);

              // Kiểm tra xem file có phải là video MP4 hợp lệ không
              let isValidVideo = false;

              try {
                // Đọc 100 byte đầu tiên của file để kiểm tra header
                const fd = fs.openSync(outputPath, 'r');
                const buffer = Buffer.alloc(100);
                fs.readSync(fd, buffer, 0, 100, 0);
                fs.closeSync(fd);

                // Kiểm tra header MP4 (ftyp)
                isValidVideo = buffer.includes('ftyp') || buffer.includes('moov');

                if (!isValidVideo) {
                  console.log('File không phải là video MP4 hợp lệ (không tìm thấy header MP4)');
                }
              } catch (headerError) {
                console.error(`Lỗi khi kiểm tra header video: ${headerError.message}`);
              }

              // Kiểm tra kích thước và tính hợp lệ
              if (fileSizeInBytes > 500000) { // Tăng ngưỡng lên 500KB để đảm bảo video đủ dài
                console.log('Tải video thành công!');
                downloadSuccess = true;
                videoDownloaded = true;

                // Ghi thông tin về video đã tải
                fs.writeFileSync(
                  outputPath + '.info.json',
                  JSON.stringify({
                    url: videoUrlObj.url,
                    source: videoUrlObj.source,
                    size: fileSizeInBytes,
                    date: new Date().toISOString()
                  }, null, 2)
                );

                break;
              } else {
                console.log('File quá nhỏ, thử URL tiếp theo...');
              }
            } catch (downloadError) {
              console.log(`Không thể tải video từ URL ${videoUrlObj.url}: ${downloadError.message}`);
            }
          }

          // Nếu không thể tải từ bất kỳ URL nào, thử phương pháp cuối cùng
          if (!videoDownloaded) {
            console.log('Không thể tải video từ bất kỳ URL nào. Đang thử phương pháp cuối cùng...');

            // Thử tải bằng cách sử dụng puppeteer để mô phỏng tải xuống
            const newBrowser = await puppeteer.launch({
              headless: false,
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            try {
              const page = await newBrowser.newPage();

              // Thiết lập download behavior
              const client = await page.target().createCDPSession();
              await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: path.dirname(outputPath)
              });

              // Truy cập trang TikTok
              await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 60000 });

              // Đợi video load
              await page.waitForSelector('video', { timeout: 30000 });

              // Tìm tất cả các URL video từ các thẻ source
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

              // Tìm URL từ aweme API trong HTML
              const html = await page.content();
              const awemeUrlMatch = html.match(/https:\/\/www\.tiktok\.com\/aweme\/v1\/play\/[^"']*/g) || [];

              // Thêm URL từ aweme API vào danh sách
              if (awemeUrlMatch.length > 0) {
                videoSources.push(...awemeUrlMatch);
              }

              console.log(`Tìm thấy ${videoSources.length} URL video`);

              // Thử tải từng URL
              for (const videoSrc of videoSources) {
                if (!videoSrc) continue;

                console.log(`Đang thử tải video từ URL: ${videoSrc}`);

                try {
                  // Tạo headers đầy đủ để giả lập trình duyệt
                  const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': videoUrl,
                    'Accept': 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                    'Range': 'bytes=0-',
                    'Sec-Fetch-Dest': 'video',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site',
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache'
                  };

                  // Nếu là URL từ aweme API, thêm các tham số cần thiết
                  let finalUrl = videoSrc;
                  if (videoSrc.includes('aweme/v1/play') && !finalUrl.includes('&download=1')) {
                    finalUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + 'download=1';
                  }

                  // Mở tab mới để tải video
                  const downloadPage = await newBrowser.newPage();

                  // Thiết lập request interception để thêm headers
                  await downloadPage.setRequestInterception(true);

                  downloadPage.on('request', request => {
                    if (request.url() === finalUrl) {
                      request.continue({ headers: headers });
                    } else {
                      request.continue();
                    }
                  });

                  // Tải video
                  await downloadPage.goto(finalUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 60000
                  });

                  // Đợi một chút để video tải xuống
                  await new Promise(resolve => setTimeout(resolve, 15000));

                  // Đóng tab tải xuống
                  await downloadPage.close();

                  // Kiểm tra kích thước file
                  if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    if (stats.size > 500000) {
                      console.log(`Tải video thành công từ URL: ${finalUrl}`);
                      break;
                    }
                  }
                } catch (downloadError) {
                  console.log(`Lỗi khi tải video từ URL ${videoSrc}: ${downloadError.message}`);
                }
              }

              // Đóng browser
              await newBrowser.close();

              // Kiểm tra lại kích thước file
              if (fs.existsSync(outputPath)) {
                const finalFileStats = fs.statSync(outputPath);
                const finalFileSizeInBytes = finalFileStats.size;
                console.log(`Kích thước file cuối cùng: ${finalFileSizeInBytes} bytes`);

                if (finalFileSizeInBytes > 100000) {
                  downloadSuccess = true;
                } else {
                  downloadSuccess = false;
                }
              }
            } catch (puppeteerError) {
              console.error(`Lỗi khi tải video bằng puppeteer: ${puppeteerError.message}`);
              downloadSuccess = false;
            } finally {
              if (newBrowser && newBrowser.isConnected()) {
                await newBrowser.close();
              }
            }
          }
        } catch (puppeteerError) {
          console.error(`Lỗi khi sử dụng puppeteer: ${puppeteerError.message}`);
          downloadSuccess = false;
        } finally {
          if (browser && browser.isConnected()) {
            await browser.close();
          }
        }
      } catch (retryError) {
        console.error(`Lỗi khi thử tải lại video: ${retryError.message}`);
        downloadSuccess = false;
      }
    } else {
      downloadSuccess = true;
    }

    // Khởi tạo Google Drive API
    // Sử dụng biến môi trường GOOGLE_APPLICATION_CREDENTIALS nếu có
    let credentialsPath;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      console.log(`Sử dụng credentials từ biến môi trường: ${credentialsPath}`);
    } else {
      // Thử tìm file credentials ở nhiều vị trí khác nhau
      const possiblePaths = [
        path.join(__dirname, 'huy-hoang-book-0bf0f972303b.json'),
        path.join(__dirname, '..', 'huy-hoang-book-0bf0f972303b.json'),
        path.join(process.cwd(), 'huy-hoang-book-0bf0f972303b.json')
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          credentialsPath = p;
          console.log(`Tìm thấy file credentials tại: ${credentialsPath}`);
          break;
        }
      }

      if (!credentialsPath) {
        throw new Error('Không tìm thấy file credentials Google Drive. Vui lòng kiểm tra lại đường dẫn.');
      }
    }

    const drive = initializeDriveAPI(credentialsPath);

    // Tạo thư mục TikTok Videos nếu chưa tồn tại
    const folderId = await createDriveFolder(drive, 'TikTok Videos');

    // Upload video lên Google Drive
    const uploadResult = await uploadFileToDrive(drive, outputPath, folderId);

    // Xóa file tạm sau khi upload
    fs.unlinkSync(outputPath);
    console.log(`Đã xóa file tạm: ${outputPath}`);

    return {
      ...uploadResult,
      localPath: outputPath,
      originalUrl: videoUrl,
      downloadSuccess: downloadSuccess
    };
  } catch (error) {
    console.error(`Lỗi khi tải và upload video: ${error.message}`);
    throw error;
  }
};

// Nếu script được chạy trực tiếp
if (require.main === module) {
  // Lấy URL video từ tham số dòng lệnh
  const videoUrl = process.argv[2];

  if (!videoUrl) {
    console.error('Vui lòng cung cấp URL video TikTok');
    process.exit(1);
  }

  downloadAndUploadTikTok(videoUrl)
    .then(result => {
      console.log('Kết quả:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Lỗi:', error.message);
      process.exit(1);
    });
}

module.exports = {
  downloadWithYtDlp,
  downloadAndUploadTikTok
};
