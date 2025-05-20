const { extractVideoDetails, extractComments } = require('../utils/parser');
const { navigateToUrl } = require('../utils/browser');
// Bỏ import các hàm tải video vì không sử dụng
// const { downloadAndUploadVideo } = require('../utils/videoDownloader');
// const { downloadTikTokVideo } = require('../fix-tiktok');
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const fs = require('fs');
const path = require('path');

/**
 * Crawl a TikTok video to extract details and comments
 * @param {Page} page - Puppeteer page instance
 * @param {string} videoUrl - TikTok video URL
 * @returns {Promise<Object>} Video data
 */
const crawlVideo = async (page, videoUrl) => {
  console.log(`Crawling video: ${videoUrl}`);

  // Check if video already exists in database
  const existingVideo = await Video.findOne({ url: videoUrl });
  if (existingVideo) {
    console.log(`Video already exists in database: ${videoUrl}`);
    return existingVideo;
  }

  // Navigate to the video page
  const navigationSuccess = await navigateToUrl(page, videoUrl);

  if (!navigationSuccess) {
    console.error(`Failed to navigate to video: ${videoUrl}`);
    return null;
  }

  // Wait for the video to load
  await page.waitForSelector('.css-19j62s8-DivVideoDetailContainer', { timeout: 30000 })
    .catch(() => console.log('Video container not found, proceeding anyway'));

  // Click "more" button to expand video description if it exists
  try {
    // Thử tìm và click button "more" với class mới
    await page.waitForSelector('.css-1fhxeoe-DivBtnWrapper button', { timeout: 5000 });
    await page.click('.css-1fhxeoe-DivBtnWrapper button');
    console.log('Clicked on "more" button with new class');
    await page.waitForTimeout(1000);
  } catch (error) {
    console.log('New more button not found, trying alternative selectors');
    try {
      // Thử tìm và click button với các class cũ
      const moreButtonSelectors = [
        '.css-vann6c-ButtonExpand-StyledButtonBottom',
        'button.css-1r94cis-ButtonExpand',
        'button[class*="ButtonExpand"]',
        'button:contains("more")'
      ];
      
      for (const selector of moreButtonSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          await page.click(selector);
          console.log(`Clicked on "more" button with selector: ${selector}`);
          await page.waitForTimeout(1000);
          break;
        } catch (selectorError) {
          console.log(`Selector ${selector} not found`);
        }
      }
    } catch (altError) {
      console.log('Alternative more buttons not found or not clickable');
    }
  }

  // Get the page content
  const content = await page.content();

  // Extract video details
  const videoDetails = extractVideoDetails(content, videoUrl);

  // Tạo thư mục downloads nếu chưa tồn tại
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  // Thông tin về video trên Google Drive (nếu tải thành công)
  let driveInfo = {
    id: null,
    webViewLink: null,
    directLink: null,
    downloadError: 'Bỏ qua việc tải video theo yêu cầu'
  };

  // Chỉ ghi log thông tin video, không tải
  console.log(`Bỏ qua việc tải video: ${videoUrl}`);
  console.log(`Tiêu đề video: ${videoDetails.title}`);
  console.log(`URL nguồn video: ${videoDetails.url_source || 'Không có'}`);
  console.log(`Hashtags: ${videoDetails.hashtags ? videoDetails.hashtags.join(', ') : 'Không có'}`);

  // Nếu muốn thử tải video, bỏ comment đoạn code dưới đây
  /*
  try {
    console.log(`Đang tải và upload video lên Google Drive: ${videoUrl}`);

    // Thử phương pháp 1: Sử dụng phương pháp mới
    try {
      // Tạo đường dẫn tạm thời để lưu video
      const tempFilePath = path.join(downloadsDir, `tiktok_${Date.now()}.mp4`);

      // Tải video TikTok
      const downloadSuccess = await downloadTikTokVideo(videoUrl, tempFilePath);

      if (downloadSuccess) {
        // Upload video lên Google Drive
        driveInfo = await downloadAndUploadVideo(videoUrl, tempFilePath, videoDetails.title);
        console.log(`Video đã được upload lên Google Drive: ${driveInfo.webViewLink}`);
      } else {
        throw new Error('Không thể tải video TikTok');
      }
    } catch (downloadError) {
      console.error(`Lỗi khi tải video: ${downloadError.message}`);

      // Tạo thông tin giả nếu không thể tải video
      driveInfo = {
        id: null,
        webViewLink: null,
        downloadError: downloadError.message
      };
    }
  } catch (error) {
    console.error(`Lỗi khi tải và upload video: ${error.message}`);

    // Tạo thông tin giả nếu không thể tải video
    driveInfo = {
      id: null,
      webViewLink: null,
      downloadError: error.message
    };
  }
  */

  // Create a new video document
  const video = new Video({
    url: videoUrl,
    title: videoDetails.title,
    url_source: videoDetails.url_source,
    channel: videoDetails.channel,
    likes: videoDetails.likes,
    comments_count: videoDetails.comments_count,
    saved: videoDetails.saved,
    shared: videoDetails.shared,
    hashtags: videoDetails.hashtags || [],
    drive_file_id: driveInfo?.id || null,
    drive_view_link: driveInfo?.webViewLink || null,
    drive_direct_link: driveInfo?.directLink || null,
    download_error: driveInfo?.downloadError || null
  });

  // Save the video to the database
  await video.save();

  console.log(`Saved video to database: ${videoUrl}`);

  // Đợi comments tải với nhiều selector khác nhau
  const commentSelectors = [
    '.css-13wx63w-DivCommentObjectWrapper',
    'div[class*="DivCommentObjectWrapper"]',
    'div[class*="DivCommentItemContainer"]',
    'div[class*="CommentItemContainer"]',
    '[data-e2e="comment-item"]'
  ];

  let commentsFound = false;

  for (const selector of commentSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      console.log(`Tìm thấy comments với selector: ${selector}`);
      commentsFound = true;
      break;
    } catch (error) {
      console.log(`Không tìm thấy comments với selector: ${selector}`);
    }
  }

  if (!commentsFound) {
    console.log('Comments container not found, proceeding anyway');
  }

  // Scroll để tải thêm comments
  console.log('Đang scroll để tải thêm comments...');

  // Tìm tất cả các selector có thể cho container comments
  const commentContainerSelectors = [
    '.css-7whb78-DivCommentListContainer',
    'div[class*="DivCommentListContainer"]',
    'div[class*="CommentListContainer"]',
    '[data-e2e="comment-list"]',
    'div[class*="comment-list"]',
    '.comment-list'
  ];

  // Track số lượng comments giữa các lần scroll để biết khi nào đã tải hết
  let prevCommentCount = 0;
  let sameCountIterations = 0;
  
  // Scroll xuống nhiều lần để tải thêm comments (tăng từ 15 lên 30 lần)
  // Tăng thời gian chờ giữa các lần scroll từ 1.5s lên 5s
  for (let i = 0; i < 30 && sameCountIterations < 5; i++) {
    // Dùng nhiều phương pháp scroll khác nhau để đảm bảo hiệu quả
    try {
      // Phương pháp 1: Sử dụng scroll trong container
      await page.evaluate((selectors) => {
        // Tìm container comments
        let commentsContainer = null;
        for (const selector of selectors) {
          commentsContainer = document.querySelector(selector);
          if (commentsContainer) break;
        }

        // Nếu tìm thấy container, scroll trong container đó
        if (commentsContainer) {
          commentsContainer.scrollTop = commentsContainer.scrollHeight;
          return true;
        }
        
        // Nếu không tìm thấy container, scroll toàn trang
        window.scrollBy(0, 1000);
        return false;
      }, commentContainerSelectors);

      // Đợi một chút để tránh thực hiện quá nhiều thao tác cùng lúc
      await page.waitForTimeout(500);

      // Phương pháp 2: Sử dụng keyboard để kéo xuống
      await page.keyboard.press('End');
      await page.waitForTimeout(500);
      
      // Phương pháp 3: Scroll đến element cuối cùng nếu có
      await page.evaluate(() => {
        const comments = document.querySelectorAll('.css-13wx63w-DivCommentObjectWrapper, div[class*="DivCommentObjectWrapper"]');
        if (comments && comments.length > 0) {
          const lastComment = comments[comments.length - 1];
          lastComment.scrollIntoView();
          return true;
        }
        return false;
      });

      // Kiểm tra số lượng comments đã tải
      const commentCount = await page.evaluate(() => {
        return document.querySelectorAll('.css-13wx63w-DivCommentObjectWrapper, div[class*="DivCommentObjectWrapper"]').length;
      });
      
      console.log(`Đã tải được ${commentCount} comments sau lần scroll thứ ${i + 1}`);
      
      // Kiểm tra xem số lượng comments có tăng không
      if (commentCount === prevCommentCount) {
        sameCountIterations++;
        console.log(`Không tải thêm được comments mới, lần ${sameCountIterations}/5`);
        
        // Thử thêm một cách khác để tải comments
        if (sameCountIterations === 3) {
          console.log('Thử phương pháp khác để tải thêm comments...');
          
          // Click vào nút load more comments nếu có
          try {
            const moreButtonExists = await page.evaluate(() => {
              // Danh sách các selector cho nút "load more"
              const selectors = [
                '.css-1i8wr2j-DivLoadMoreContainer',
                'button[data-e2e="view-more-comments"]',
                'button[class*="ButtonMore"]',
                'button[class*="load-more"]',
                'div[class*="LoadMore"]',
                'span[class*="load-more"]'
              ];
              
              // Tìm và click nút load more
              for (const sel of selectors) {
                const btn = document.querySelector(sel);
                if (btn) {
                  btn.click();
                  return `Clicked ${sel}`;
                }
              }
              return false;
            });
            
            if (moreButtonExists) {
              console.log(`Đã click nút load more: ${moreButtonExists}`);
              await page.waitForTimeout(5000);
            }
          } catch (err) {
            console.log(`Lỗi khi tìm/click nút load more: ${err.message}`);
          }
        }
      } else {
        // Reset counter khi số lượng comments tăng
        sameCountIterations = 0;
        prevCommentCount = commentCount;
      }
      
      // Đợi comments tải (giảm từ 5s xuống 3s để tránh timeout)
      await page.waitForTimeout(3000);
    } catch (error) {
      console.error(`Lỗi khi scroll lần ${i + 1}: ${error.message}`);
      // Ngắt quá trình nếu gặp lỗi timeout
      if (error.message.includes('timeout')) {
        console.error('Phát hiện lỗi timeout, hủy quá trình scroll để tiếp tục với các bước khác');
        break;
      }
    }
  }
  
  // Thông báo kết quả sau khi scroll
  const finalCommentCount = await page.evaluate(() => {
    return document.querySelectorAll('.css-13wx63w-DivCommentObjectWrapper, div[class*="DivCommentObjectWrapper"]').length;
  });
  console.log(`Đã kết thúc quá trình scroll, tổng số comments tải được: ${finalCommentCount}`);
  
  if (finalCommentCount < 30 && videoDetails.comments_count > 100) {
    console.log(`Cảnh báo: Đã tải được ít comments (${finalCommentCount}) so với tổng số comments của video (${videoDetails.comments_count})`);
    console.log('Có thể TikTok đang giới hạn số lượng comments hiển thị hoặc cần đăng nhập để xem thêm.');
  }

  // Thử click vào tất cả các nút "View replies" để xem các comment con
  console.log('Đang tìm và mở tất cả các reply comments...');
  
  try {
    console.log('Thử phương pháp tìm và click trực tiếp từng nút "View X replies"...');
    
    // Thay đổi cách tìm và click: tìm lại nút sau mỗi lần click
    let clickedCount = 0;
    let maxClicks = 100; // Giới hạn số lần click để tránh vòng lặp vô hạn
    
    // Hàm tìm và click nút "View replies" đầu tiên
    const findAndClickFirstViewRepliesButton = async () => {
      try {
        // Tìm nút đầu tiên phù hợp
        const button = await page.$('.css-9kgp5o-DivReplyContainer, .css-1idgi02-DivViewRepliesContainer');
        if (!button) {
          return false; // Không tìm thấy nút nào
        }
        
        // Kiểm tra xem nút này có phải là nút "View replies" không
        const hasViewRepliesText = await page.evaluate(element => {
          const text = element.textContent.toLowerCase();
          return text.includes('view') && text.includes('repl');
        }, button);
        
        if (!hasViewRepliesText) {
          return false; // Không phải nút "View replies"
        }
        
        // Click vào nút
        await button.click();
        clickedCount++;
        console.log(`Đã click vào nút "View replies" thứ ${clickedCount}`);
        
        // Đợi để replies hiển thị và DOM cập nhật
        await page.waitForTimeout(1500);
        return true;
      } catch (error) {
        console.log(`Lỗi khi tìm/click nút "View replies": ${error.message}`);
        return false;
      }
    };
    
    // Click lần lượt vào từng nút "View replies" cho đến khi không còn nút nào
    while (clickedCount < maxClicks) {
      const buttonFound = await findAndClickFirstViewRepliesButton();
      if (!buttonFound) {
        console.log('Không tìm thấy thêm nút "View replies" nào.');
        break;
      }
    }
    
    console.log(`Tổng cộng đã click ${clickedCount} nút "View replies"`);
    
    // Thử lại một lần nữa với phương pháp DOM trực tiếp
    if (clickedCount > 0) {
      console.log('Đợi 5 giây để tất cả replies hiển thị...');
      await page.waitForTimeout(5000);
      
      // Thử phương pháp tìm lại tất cả các nút "View more replies" còn lại
      const remainingButtons = await page.evaluate(() => {
        // Tìm tất cả các nút còn lại
        const viewMoreButtons = Array.from(document.querySelectorAll(
          '.css-9kgp5o-DivReplyContainer, .css-1idgi02-DivViewRepliesContainer, div[class*="ViewReplies"]'
        )).filter(el => {
          const text = el.textContent.toLowerCase();
          return text.includes('view') && text.includes('repl');
        });
        
        console.log(`Còn ${viewMoreButtons.length} nút "View replies" chưa được click`);
        
        // Click vào tất cả các nút còn lại
        let clickCount = 0;
        viewMoreButtons.forEach(button => {
          try {
            button.click();
            clickCount++;
          } catch (e) {
            console.error('Lỗi khi click:', e);
          }
        });
        
        return clickCount;
      });
      
      console.log(`Đã click thêm ${remainingButtons} nút "View replies" với DOM trực tiếp`);
      await page.waitForTimeout(5000);
    }
    
    // Phương pháp cuối cùng: Click các nút có text là "View X replies"
    console.log('Thử phương pháp cuối cùng: click các nút có text "View X replies"...');
    
    const finalClicks = await page.evaluate(() => {
      // Tìm tất cả các element chứa text "View X replies"
      const elements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent || '';
        return text.match(/view\s+\d+\s+repl/i) !== null;
      });
      
      console.log(`Tìm thấy ${elements.length} phần tử có text "View X replies"`);
      
      // Click vào tất cả các phần tử này
      let clicked = 0;
      elements.forEach(el => {
        try {
          el.click();
          clicked++;
        } catch (e) {
          // Bỏ qua lỗi
        }
      });
      
      return clicked;
    });
    
    console.log(`Đã click thêm ${finalClicks} nút "View X replies" trong phương pháp cuối cùng`);
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error(`Lỗi khi thử phương pháp click trực tiếp: ${error.message}`);
  }

  // Lấy nội dung trang sau khi đã scroll và tải thêm comments
  const updatedContent = await page.content();

  // Extract and save comments
  const comments = extractComments(updatedContent);

  console.log(`Đã tìm thấy tổng cộng ${comments.length} comments (bao gồm cả replies)`);

  // Map để lưu trữ ID comments gốc
  const commentMap = new Map();
  
  for (const commentData of comments) {
    const isReply = commentData.is_reply || false;
    const parentCommentId = commentData.parent_comment_id || null;
    
    const comment = new Comment({
      video_id: video._id,
      video_url: videoUrl,
      content: commentData.content,
      author: commentData.author,
      author_profile: commentData.author_profile,
      likes: commentData.likes,
      date: commentData.date,
      is_reply: isReply,
      parent_comment_id: parentCommentId
    });

    await comment.save();
    
    // Lưu ID comment vào map để dùng cho các reply
    commentMap.set(commentData.id || commentData.content, comment._id);
  }

  console.log(`Saved ${comments.length} comments for video: ${videoUrl}`);

  return video;
};

module.exports = {
  crawlVideo
};
