const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

/**
 * Lưu HTML để debug
 * @param {string} html - HTML content
 * @param {string} filename - Tên file
 */
const saveHtmlForDebug = (html, filename) => {
  try {
    if (!fs.existsSync('debug')) {
      fs.mkdirSync('debug');
    }
    fs.writeFileSync(path.join('debug', filename), html);
    console.log(`Saved HTML to debug/${filename}`);
  } catch (error) {
    console.error(`Error saving HTML for debug: ${error.message}`);
  }
};

/**
 * Extract video URLs from a profile page
 * @param {string} html - HTML content of the profile page
 * @returns {Array<string>} Array of video URLs
 */
const extractVideoUrls = (html) => {
  // Lưu HTML để debug
  saveHtmlForDebug(html, `profile-${Date.now()}.html`);

  const $ = cheerio.load(html);
  const videoUrls = [];

  // Tìm tất cả các thẻ a có href chứa "/video/"
  $('a').each((index, element) => {
    const href = $(element).attr('href');

    if (href && href.includes('/video/')) {
      // Kiểm tra xem href có phải là URL đầy đủ không
      const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;

      // Kiểm tra xem URL đã tồn tại trong mảng chưa
      if (!videoUrls.includes(fullUrl)) {
        videoUrls.push(fullUrl);
      }
    }
  });

  // Nếu không tìm thấy URL nào, thử tìm theo class cụ thể
  if (videoUrls.length === 0) {
    // Tìm theo class cũ
    const videoContainer = $('.css-1qb12g8-DivThreeColumnContainer');
    if (videoContainer.length > 0) {
      const videoItems = videoContainer.find('.css-1uqux2o-DivItemContainerV2');

      videoItems.each((index, element) => {
        const videoLink = $(element).find('a').attr('href');

        if (videoLink) {
          const fullUrl = videoLink.startsWith('http') ? videoLink : `https://www.tiktok.com${videoLink}`;
          if (!videoUrls.includes(fullUrl)) {
            videoUrls.push(fullUrl);
          }
        }
      });
    }

    // Tìm theo các class khác có thể có
    $('div[class*="DivItemContainer"]').each((index, element) => {
      const videoLink = $(element).find('a').attr('href');

      if (videoLink && videoLink.includes('/video/')) {
        const fullUrl = videoLink.startsWith('http') ? videoLink : `https://www.tiktok.com${videoLink}`;
        if (!videoUrls.includes(fullUrl)) {
          videoUrls.push(fullUrl);
        }
      }
    });
  }

  console.log(`Found ${videoUrls.length} video URLs`);
  return videoUrls;
};

/**
 * Extract video details from a video page
 * @param {string} html - HTML content of the video page
 * @param {string} videoUrl - URL of the video (optional)
 * @returns {Object} Video details
 */
const extractVideoDetails = (html, videoUrl = '') => {
  // Lưu HTML để debug
  saveHtmlForDebug(html, `video-detail-${Date.now()}.html`);

  const $ = cheerio.load(html);

  // Extract title - thử nhiều cách khác nhau
  let title = '';
  let hashtags = [];

  // Cách mới: Tìm theo cấu trúc mới với các thẻ span trong div data-e2e="browse-video-desc"
  const newDescContainer = $('div[data-e2e="browse-video-desc"]');
  if (newDescContainer.length > 0) {
    // Lấy nội dung từ tất cả các thẻ span
    newDescContainer.find('span[data-e2e="new-desc-span"]').each((index, element) => {
      const spanText = $(element).text().trim();
      if (spanText) {
        if (title) {
          title += " " + spanText;
        } else {
          title = spanText;
        }
      }
    });

    // Lấy các hashtags từ các thẻ a
    newDescContainer.find('a[data-e2e="search-common-link"]').each((index, element) => {
      const href = $(element).attr('href');
      if (href && href.startsWith('/tag/')) {
        const tag = href.replace('/tag/', '');
        if (tag && !hashtags.includes(tag)) {
          hashtags.push(tag);
        }
      }
    });
  }

  // Cách 1: Tìm theo class cụ thể
  if (!title) {
    const titleElement = $('div[class*="DivDescriptionContainer"]');
    if (titleElement.length > 0) {
      titleElement.contents().each((index, node) => {
        if (node.type === 'text') {
          title += $(node).text().trim();
        }
      });
    }
  }

  // Cách 2: Tìm theo data-e2e attribute
  if (!title) {
    const videoDescElement = $('[data-e2e="video-desc"]');
    if (videoDescElement.length > 0) {
      title = videoDescElement.text().trim();
    }
  }

  // Cách 3: Tìm theo thẻ meta
  if (!title) {
    const metaTitle = $('meta[property="og:title"]').attr('content');
    if (metaTitle) {
      title = metaTitle;
    }
  }

  // Nếu không tìm thấy hashtags theo cách mới, thử tìm hashtags từ title hoặc các thẻ khác
  if (hashtags.length === 0) {
    // Tìm từ các thẻ a có chứa hashtag
    $('a[href*="/tag/"]').each((index, element) => {
      const href = $(element).attr('href');
      if (href) {
        const tag = href.replace('/tag/', '');
        if (tag && !hashtags.includes(tag)) {
          hashtags.push(tag);
        }
      }
    });

    // Tìm từ title nếu chứa hashtag
    const hashtagRegex = /#(\w+)/g;
    let match;
    while ((match = hashtagRegex.exec(title)) !== null) {
      const tag = match[1];
      if (!hashtags.includes(tag)) {
        hashtags.push(tag);
      }
    }
  }

  // Extract video source URL - thử nhiều cách khác nhau
  let videoSource = '';

  // Cách 1: Tìm theo thẻ video > source
  const videoSourceElements = $('video source');
  if (videoSourceElements.length > 0) {
    // Lấy tất cả các source và chọn cái đầu tiên
    videoSourceElements.each((index, element) => {
      const src = $(element).attr('src');
      if (src && !videoSource) {
        videoSource = src;
      }
    });
  }

  // Cách 2: Tìm theo thẻ video trực tiếp
  if (!videoSource) {
    const videoElements = $('video');
    if (videoElements.length > 0) {
      videoElements.each((index, element) => {
        const src = $(element).attr('src');
        if (src && !videoSource) {
          videoSource = src;
        }
      });
    }
  }

  // Cách 3: Tìm theo thẻ meta
  if (!videoSource) {
    const metaVideo = $('meta[property="og:video"]').attr('content');
    if (metaVideo) {
      videoSource = metaVideo;
    }
  }

  // Cách 4: Tìm trong script tags
  if (!videoSource) {
    const scripts = $('script');
    scripts.each((index, element) => {
      const scriptContent = $(element).html();
      if (scriptContent && scriptContent.includes('playAddr') && !videoSource) {
        const playAddrMatch = scriptContent.match(/"playAddr":"([^"]+)"/);
        if (playAddrMatch && playAddrMatch[1]) {
          videoSource = playAddrMatch[1].replace(/\\u002F/g, '/');
        }
      }
    });
  }

  // Cách 5: Tìm trong tất cả các thẻ a có href chứa .mp4
  if (!videoSource) {
    $('a[href*=".mp4"]').each((index, element) => {
      const href = $(element).attr('href');
      if (href && !videoSource) {
        videoSource = href;
      }
    });
  }

  // Extract channel information - thử nhiều cách khác nhau
  let channelUrl = '';
  let channel = '';

  // Cách 1: Tìm theo class cụ thể
  const channelElement = $('div[class*="DivAvatarContainer"] a, a[data-e2e="video-author-avatar"]');
  if (channelElement.length > 0) {
    channelUrl = channelElement.attr('href');
  }

  // Cách 2: Tìm theo data-e2e attribute
  if (!channelUrl) {
    const authorElement = $('[data-e2e="video-author-uniqueid"]');
    if (authorElement.length > 0) {
      const authorText = authorElement.text().trim();
      if (authorText.startsWith('@')) {
        channelUrl = `/${authorText}`;
      }
    }
  }

  // Cách 3: Lấy từ URL video
  if (!channelUrl) {
    // Tìm trong meta tags
    const metaAuthor = $('meta[property="og:creator"]').attr('content');
    if (metaAuthor) {
      channelUrl = `/@${metaAuthor.replace('@', '')}`;
    }
  }

  // Cách 4: Lấy từ tiêu đề video
  if (!channelUrl) {
    const metaTitle = $('meta[property="og:title"]').attr('content');
    if (metaTitle && metaTitle.includes('-')) {
      const authorPart = metaTitle.split('-')[1].trim();
      if (authorPart) {
        channelUrl = `/@${authorPart.replace('@', '')}`;
      }
    }
  }

  // Tạo URL đầy đủ cho channel
  if (channelUrl) {
    channel = channelUrl.startsWith('http') ? channelUrl : `https://www.tiktok.com${channelUrl}`;
  }

  // Nếu vẫn không tìm thấy channel, sử dụng giá trị mặc định từ URL video
  if (!channel && videoUrl) {
    const urlParts = videoUrl.split('/');
    const authorIndex = urlParts.findIndex(part => part.startsWith('@'));
    if (authorIndex !== -1) {
      const author = urlParts[authorIndex];
      channel = `https://www.tiktok.com/${author}`;
    }
  }

  // Nếu vẫn không có channel, sử dụng giá trị mặc định
  if (!channel) {
    channel = "Unknown Channel";
  }

  // Extract engagement metrics - thử nhiều cách khác nhau
  let likes = 0;
  let commentsCount = 0;
  let saved = 0;
  let shared = 0;

  // Cách 1: Tìm theo class cụ thể
  const metricElements = $('strong[class*="StrongText"]');
  if (metricElements.length >= 4) {
    likes = metricElements.eq(0).text().trim();
    commentsCount = metricElements.eq(1).text().trim();
    saved = metricElements.eq(2).text().trim();
    shared = metricElements.eq(3).text().trim();
  }

  // Cách 2: Tìm theo data-e2e attribute
  if (!likes) {
    const likeElement = $('[data-e2e="like-count"]');
    if (likeElement.length > 0) {
      likes = likeElement.text().trim();
    }

    const commentElement = $('[data-e2e="comment-count"]');
    if (commentElement.length > 0) {
      commentsCount = commentElement.text().trim();
    }

    const favoriteElement = $('[data-e2e="undefined-count"]').eq(0);
    if (favoriteElement.length > 0) {
      saved = favoriteElement.text().trim();
    }

    const shareElement = $('[data-e2e="share-count"]');
    if (shareElement.length > 0) {
      shared = shareElement.text().trim();
    }
  }

  // Chuyển đổi các giá trị thành số
  const parseMetric = (metric) => {
    if (!metric) return 0;

    // Xử lý các giá trị như "1.5M", "2.3K", v.v.
    const value = metric.replace(/[^0-9.KMB]/g, '');

    if (value.includes('K')) {
      return parseFloat(value.replace('K', '')) * 1000;
    } else if (value.includes('M')) {
      return parseFloat(value.replace('M', '')) * 1000000;
    } else if (value.includes('B')) {
      return parseFloat(value.replace('B', '')) * 1000000000;
    } else {
      return parseInt(value) || 0;
    }
  };

  console.log(`: Title="${title}", Channel="${channel}", Likes=${likes}, Comments=${commentsCount}, Saved=${saved}, Shared=${shared}, Hashtags=${hashtags.join(', ')}`);

  return {
    title: title.trim(),
    url_source: videoSource,
    channel,
    likes: parseMetric(likes),
    comments_count: parseMetric(commentsCount),
    saved: parseMetric(saved),
    shared: parseMetric(shared),
    hashtags
  };
};

/**
 * Extract comments from a video page
 * @param {string} html - HTML content of the video page
 * @returns {Array<Object>} Array of comments
 */
const extractComments = (html) => {
  // Lưu HTML để debug
  saveHtmlForDebug(html, `comments-${Date.now()}.html`);

  const $ = cheerio.load(html);
  const comments = [];

  // Kiểm tra xem có phần tử hiển thị số lượng comments không
  const commentsCountElement = $('p[class*="CommentTitle"], div[class*="comment-count"], span[class*="comment-count"]');
  if (commentsCountElement.length > 0) {
    console.log(`Comments count from page: ${commentsCountElement.text()}`);
  }

  // Kiểm tra xem có yêu cầu đăng nhập để xem comments không
  const loginRequired = $('div[class*="login-bar"], div[class*="LoginBar"], div[class*="comment-login"]').length > 0;
  if (loginRequired) {
    console.log('Login required to view comments');
  }

  // Tìm tất cả các container comment bằng nhiều cách khác nhau

  // Cách 1: Tìm theo class cụ thể từ ví dụ mới nhất
  let commentContainers = $('.css-13wx63w-DivCommentObjectWrapper');
  if (commentContainers.length > 0) {
    console.log(`Tìm thấy comments với selector: .css-13wx63w-DivCommentObjectWrapper`);
  } else {
    console.log(`Không tìm thấy comments với selector: .css-13wx63w-DivCommentObjectWrapper`);
  }

  // Cách 2: Tìm theo class cụ thể
  if (commentContainers.length === 0) {
    commentContainers = $('div[class*="DivCommentObjectWrapper"]');
    if (commentContainers.length > 0) {
      console.log(`Tìm thấy comments với selector: div[class*="DivCommentObjectWrapper"]`);
    } else {
      console.log(`Không tìm thấy comments với selector: div[class*="DivCommentObjectWrapper"]`);
    }
  }

  // Cách 3: Tìm theo class cụ thể
  if (commentContainers.length === 0) {
    commentContainers = $('div[class*="DivCommentItemContainer"], div[class*="CommentItemContainer"]');
    if (commentContainers.length > 0) {
      console.log(`Tìm thấy comments với selector: div[class*="DivCommentItemContainer"]`);
    } else {
      console.log(`Không tìm thấy comments với selector: div[class*="DivCommentItemContainer"]`);
    }
  }

  // Cách 4: Nếu không tìm thấy, thử tìm theo data-e2e attribute
  if (commentContainers.length === 0) {
    commentContainers = $('[data-e2e="comment-item"]');
    if (commentContainers.length > 0) {
      console.log(`Tìm thấy comments với selector: [data-e2e="comment-item"]`);
    } else {
      console.log(`Không tìm thấy comments với selector: [data-e2e="comment-item"]`);
    }
  }

  // Cách 5: Tìm theo các thuộc tính khác
  if (commentContainers.length === 0) {
    commentContainers = $('div[class*="comment-item"], div[class*="comment-container"]');
    if (commentContainers.length > 0) {
      console.log(`Tìm thấy comments với selector: div[class*="comment-item"]`);
    } else {
      console.log(`Không tìm thấy comments với selector: div[class*="comment-item"]`);
    }
  }

  // Cách 5: Tìm theo cấu trúc DOM
  if (commentContainers.length === 0) {
    // Tìm tất cả các div có chứa avatar và text
    $('div').each((index, element) => {
      const hasAvatar = $(element).find('img[class*="avatar"], img[class*="Avatar"]').length > 0 ||
                       $(element).find('img[alt*="avatar"]').length > 0;
      const hasText = $(element).find('p, span').length > 0;
      const hasUsername = $(element).text().includes('@');

      if (hasAvatar && hasText && hasUsername) {
        commentContainers = commentContainers.add(element);
      }
    });

    if (commentContainers.length > 0) {
      console.log(`Tìm thấy ${commentContainers.length} comments bằng cách tìm theo cấu trúc DOM`);
    }
  }

  // Cách 6: Tìm trong script tags
  if (commentContainers.length === 0) {
    const scripts = $('script');
    let commentsData = null;

    scripts.each((index, element) => {
      const scriptContent = $(element).html();
      if (scriptContent && scriptContent.includes('commentList')) {
        try {
          // Tìm dữ liệu comments trong script
          const match = scriptContent.match(/commentList":\s*(\[.*?\])/);
          if (match && match[1]) {
            commentsData = JSON.parse(match[1]);
          }
        } catch (error) {
          console.error('Lỗi khi parse dữ liệu comments từ script:', error.message);
        }
      }
    });

    if (commentsData && Array.isArray(commentsData)) {
      console.log(`Tìm thấy ${commentsData.length} comments từ script`);

      commentsData.forEach(comment => {
        if (comment.text) {
          const commentObj = {
            id: comment.id || comment.cid || null,
            content: comment.text,
            author: comment.user?.uniqueId || comment.user?.nickname || 'Unknown',
            author_profile: comment.user?.uniqueId ? `https://www.tiktok.com/@${comment.user.uniqueId}` : '',
            likes: comment.diggCount || 0,
            date: comment.createTime || '',
            has_replies: (comment.replyCommentTotal || 0) > 0,
            is_reply: false,
            parent_comment_id: null
          };
          
          comments.push(commentObj);
          
          // Xử lý các reply comments nếu có
          if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
            comment.replies.forEach(reply => {
              if (reply.text) {
                comments.push({
                  id: reply.id || reply.cid || null,
                  content: reply.text,
                  author: reply.user?.uniqueId || reply.user?.nickname || 'Unknown',
                  author_profile: reply.user?.uniqueId ? `https://www.tiktok.com/@${reply.user.uniqueId}` : '',
                  likes: reply.diggCount || 0,
                  date: reply.createTime || '',
                  has_replies: false,
                  is_reply: true,
                  parent_comment_id: comment.id || comment.cid || null
                });
              }
            });
          }
        }
      });

      console.log(`Successfully extracted ${comments.length} comments from script`);
      return comments;
    }
  }

  // Nếu không tìm thấy comments, thử tìm trong window.__INIT_PROPS__
  if (commentContainers.length === 0) {
    const scripts = $('script');
    let commentsData = null;

    scripts.each((index, element) => {
      const scriptContent = $(element).html();
      if (scriptContent && scriptContent.includes('window.__INIT_PROPS__')) {
        try {
          // Tìm dữ liệu comments trong script
          const match = scriptContent.match(/window\.__INIT_PROPS__\s*=\s*(\{.*\})/);
          if (match && match[1]) {
            const data = JSON.parse(match[1]);
            if (data && data.comments) {
              commentsData = data.comments;
            }
          }
        } catch (error) {
          console.error('Lỗi khi parse dữ liệu comments từ window.__INIT_PROPS__:', error.message);
        }
      }
    });

    if (commentsData && Array.isArray(commentsData)) {
      console.log(`Tìm thấy ${commentsData.length} comments từ window.__INIT_PROPS__`);

      commentsData.forEach(comment => {
        if (comment.text || comment.content) {
          const commentObj = {
            id: comment.id || comment.cid || null,
            content: comment.text || comment.content,
            author: comment.user?.uniqueId || comment.user?.nickname || comment.author || 'Unknown',
            author_profile: comment.user?.uniqueId ? `https://www.tiktok.com/@${comment.user.uniqueId}` :
                           (comment.author_profile || ''),
            likes: comment.diggCount || comment.likes || 0,
            date: comment.createTime || comment.date || '',
            has_replies: (comment.replyCommentTotal || comment.has_replies || 0) > 0,
            is_reply: false,
            parent_comment_id: null
          };
          
          comments.push(commentObj);
          
          // Xử lý các reply comments nếu có
          if (comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0) {
            comment.replies.forEach(reply => {
              if (reply.text || reply.content) {
                comments.push({
                  id: reply.id || reply.cid || null,
                  content: reply.text || reply.content,
                  author: reply.user?.uniqueId || reply.user?.nickname || reply.author || 'Unknown',
                  author_profile: reply.user?.uniqueId ? `https://www.tiktok.com/@${reply.user.uniqueId}` :
                                 (reply.author_profile || ''),
                  likes: reply.diggCount || reply.likes || 0,
                  date: reply.createTime || reply.date || '',
                  has_replies: false,
                  is_reply: true,
                  parent_comment_id: comment.id || comment.cid || null
                });
              }
            });
          }
        }
      });

      console.log(`Successfully extracted ${comments.length} comments from window.__INIT_PROPS__`);
      return comments;
    }
  }

  if (commentContainers.length === 0) {
    console.log('Comments container not found, proceeding anyway');
  } else {
    console.log(`Found ${commentContainers.length} comments`);
  }

  // Khởi tạo một bộ đếm để tạo ID cho comments không có ID
  let commentCounter = 1;
  
  // Map để lưu trữ parent comment đối với các reply comment
  const parentCommentMap = new Map();

  // Xử lý các comment chính (parent comments)
  commentContainers.each((index, element) => {
    // Tạo một ID duy nhất cho comment
    const commentId = `comment_${commentCounter++}`;
    
    // Extract comment content bằng nhiều cách khác nhau
    let content = '';

    // Cách 1: Tìm theo selector từ ví dụ mới nhất
    const contentElement = $(element).find('span[data-e2e="comment-level-1"] p');
    if (contentElement.length > 0) {
      content = contentElement.text().trim();
    }

    // Cách 2: Tìm theo data-e2e attribute
    if (!content) {
      const dataE2eElement = $(element).find('[data-e2e="comment-level-1"] p, [data-e2e="comment-text"] p');
      if (dataE2eElement.length > 0) {
        content = dataE2eElement.text().trim();
      }
    }

    // Cách 3: Tìm theo class cụ thể
    if (!content) {
      const contentDiv = $(element).find('div[class*="DivCommentText"], div[class*="CommentText"]');
      if (contentDiv.length > 0) {
        content = contentDiv.text().trim();
      }
    }

    // Cách 4: Tìm tất cả các thẻ p trong comment
    if (!content) {
      const allP = $(element).find('p');
      if (allP.length > 0) {
        // Lấy thẻ p dài nhất
        let longestText = '';
        allP.each((i, p) => {
          const text = $(p).text().trim();
          if (text.length > longestText.length) {
            longestText = text;
          }
        });
        content = longestText;
      }
    }

    // Cách 4: Lấy text trực tiếp từ element
    if (!content) {
      content = $(element).text().trim();

      // Loại bỏ các phần không phải nội dung comment
      content = content.replace(/@[\w.]+/g, ''); // Loại bỏ username
      content = content.replace(/\d+[KMB]?\s*likes?/gi, ''); // Loại bỏ số likes
      content = content.replace(/\d+[dhm]|\d+\s*(days?|hours?|minutes?|seconds?)\s*ago/gi, ''); // Loại bỏ thời gian
      content = content.replace(/View\s+\d+\s+repl(y|ies)/gi, ''); // Loại bỏ "View X replies"
      content = content.replace(/Reply/gi, ''); // Loại bỏ "Reply"
      content = content.trim();
    }

    // Extract author information bằng nhiều cách khác nhau
    let author = '';
    let authorProfile = '';

    // Cách 1: Tìm theo selector từ ví dụ mới nhất
    const usernameElement = $(element).find('.css-13x3qpp-DivUsernameContentWrapper a p');
    if (usernameElement.length > 0) {
      author = usernameElement.text().trim();
      authorProfile = usernameElement.closest('a').attr('href');
    }

    // Cách 2: Tìm theo data-e2e attribute
    if (!author) {
      const authorDataElement = $(element).find('[data-e2e="comment-username-1"]');
      if (authorDataElement.length > 0) {
        author = authorDataElement.text().trim();
        authorProfile = authorDataElement.closest('a').attr('href');
      }
    }

    // Cách 3: Tìm theo class cụ thể
    if (!author) {
      const authorElement = $(element).find('div[class*="DivUsernameWrapper"] a, div[class*="UsernameWrapper"] a, div[class*="DivUsernameContentWrapper"] a');
      if (authorElement.length > 0) {
        author = authorElement.find('p, span').text().trim();
        authorProfile = authorElement.attr('href');
      }
    }

    // Cách 3: Tìm theo @ pattern
    if (!author) {
      const text = $(element).text();
      const match = text.match(/@([\w.]+)/);
      if (match && match[1]) {
        author = '@' + match[1];
        authorProfile = `/@${match[1]}`;
      }
    }

    // Cách 4: Tìm theo thẻ a có chứa avatar
    if (!author) {
      const avatarLink = $(element).find('a').filter(function() {
        return $(this).find('img[class*="avatar"], img[class*="Avatar"]').length > 0;
      });

      if (avatarLink.length > 0) {
        authorProfile = avatarLink.attr('href');
        if (authorProfile) {
          const match = authorProfile.match(/@([\w.]+)/);
          if (match && match[1]) {
            author = '@' + match[1];
          }
        }
      }
    }

    // Extract likes count bằng nhiều cách khác nhau
    let likesText = '0';

    // Cách 1: Tìm theo selector từ ví dụ mới nhất
    const likesElement = $(element).find('.css-1nd5cw-DivLikeContainer span');
    if (likesElement.length > 0) {
      likesText = likesElement.text().trim();
    }

    // Cách 2: Tìm theo class cụ thể
    if (likesText === '0') {
      const likesClassElement = $(element).find('div[class*="DivLikeContainer"] span, div[class*="LikeContainer"] span, div[class*="DivLikeWrapper"] span, div[class*="LikeWrapper"] span');
      if (likesClassElement.length > 0) {
        likesText = likesClassElement.text().trim();
      }
    }

    // Cách 3: Tìm theo data-e2e attribute
    if (likesText === '0') {
      const likesDataElement = $(element).find('[data-e2e="comment-like-count"]');
      if (likesDataElement.length > 0) {
        likesText = likesDataElement.text().trim();
      }
    }

    // Cách 3: Tìm theo pattern
    if (likesText === '0') {
      const text = $(element).text();
      const match = text.match(/(\d+[KMB]?)\s*likes?/i);
      if (match && match[1]) {
        likesText = match[1];
      }
    }

    // Cách 4: Tìm theo aria-label
    if (likesText === '0') {
      const likeButton = $(element).find('[aria-label*="Like"]');
      if (likeButton.length > 0) {
        const ariaLabel = likeButton.attr('aria-label');
        if (ariaLabel) {
          const match = ariaLabel.match(/(\d+[KMB]?)\s*likes?/i);
          if (match && match[1]) {
            likesText = match[1];
          }
        }
      }
    }

    // Extract date bằng nhiều cách khác nhau
    let date = '';

    // Cách 1: Tìm theo selector từ ví dụ mới nhất
    const dateElement = $(element).find('.css-njhskk-DivCommentSubContentWrapper span').first();
    if (dateElement.length > 0) {
      date = dateElement.text().trim();
    }

    // Cách 2: Tìm theo class cụ thể
    if (!date) {
      const dateClassElement = $(element).find('div[class*="DivCommentSubContent"] span, div[class*="CommentSubContent"] span, div[class*="CommentSubContentWrapper"] span').first();
      if (dateClassElement.length > 0) {
        date = dateClassElement.text().trim();
      }
    }

    // Cách 2: Tìm theo pattern
    if (!date) {
      const text = $(element).text();
      const match = text.match(/(\d+[dhm]|\d+\s*(days?|hours?|minutes?|seconds?)\s*ago|\d{4}-\d{1,2}-\d{1,2})/i);
      if (match && match[1]) {
        date = match[1];
      }
    }

    // Check if this comment has replies bằng nhiều cách khác nhau
    let hasReplies = false;

    // Cách 1: Tìm theo selector từ ví dụ mới nhất
    hasReplies = $(element).find('.css-9kgp5o-DivReplyContainer, .css-1idgi02-DivViewRepliesContainer').length > 0;

    // Cách 2: Tìm theo class cụ thể
    if (!hasReplies) {
      hasReplies = $(element).find('div[class*="DivReplyContainer"], div[class*="ReplyContainer"], div[class*="ViewRepliesContainer"], [data-e2e="view-more-replies"]').length > 0;
    }

    // Cách 3: Tìm theo text
    if (!hasReplies) {
      const text = $(element).text();
      hasReplies = text.includes('View replies') || text.includes('View more replies');
    }

    // Chuyển đổi likes thành số
    let likes = 0;
    if (likesText.includes('K')) {
      likes = parseFloat(likesText.replace('K', '')) * 1000;
    } else if (likesText.includes('M')) {
      likes = parseFloat(likesText.replace('M', '')) * 1000000;
    } else if (likesText.includes('B')) {
      likes = parseFloat(likesText.replace('B', '')) * 1000000000;
    } else {
      likes = parseInt(likesText.replace(/[^0-9]/g, '')) || 0;
    }

    // Kiểm tra xem comment có phải là reply hay không
    const isReply = $(element).closest('.css-9kgp5o-DivReplyContainer').length > 0 ||
                   $(element).closest('div[class*="DivReplyContainer"]').length > 0 || 
                   $(element).closest('div[class*="ReplyContainer"]').length > 0;
    
    // Nếu là reply, tìm parent comment
    let parentCommentId = null;
    if (isReply) {
      // Tìm parent comment container gần nhất
      const parentContainer = $(element).closest('.css-13wx63w-DivCommentObjectWrapper, div[class*="DivCommentObjectWrapper"]').prev();
      if (parentContainer.length > 0) {
        // Lưu relationship vào map để xử lý sau
        const parentContent = parentContainer.find('p').text().trim();
        if (parentContent) {
          parentCommentId = parentCommentMap.get(parentContent);
        }
      }
    }

    // Chỉ thêm comment nếu có nội dung
    if (content && content.length > 1) {
      // Lưu comment vào danh sách
      const commentObj = {
        id: commentId,
        content,
        author: author || 'Unknown',
        author_profile: authorProfile ? (authorProfile.startsWith('http') ? authorProfile : `https://www.tiktok.com${authorProfile}`) : '',
        likes,
        date: date || 'Unknown',
        has_replies: hasReplies,
        is_reply: isReply,
        parent_comment_id: parentCommentId
      };
      
      comments.push(commentObj);
      
      // Lưu vào map để xử lý các reply sau này
      parentCommentMap.set(content, commentId);
    }

    // Xử lý các reply comments (nếu đã được mở)
    const replyContainer = $(element).next('.css-9kgp5o-DivReplyContainer');
    if (replyContainer.length > 0) {
      const replyComments = replyContainer.find('.css-1gstnae-DivCommentItemWrapper, div[class*="DivCommentItemWrapper"]');
      
      replyComments.each((replyIndex, replyElement) => {
        // Xử lý tương tự như comment chính nhưng đánh dấu là reply
        const replyCommentId = `comment_${commentCounter++}`;
        let replyContent = '';
        
        // Extract reply content (tương tự như comment chính)
        const replyContentElement = $(replyElement).find('span[data-e2e="comment-level-1"] p, [data-e2e="comment-text"] p');
        if (replyContentElement.length > 0) {
          replyContent = replyContentElement.text().trim();
        } else {
          const contentDiv = $(replyElement).find('div[class*="DivCommentText"], div[class*="CommentText"], p');
          if (contentDiv.length > 0) {
            replyContent = contentDiv.text().trim();
          } else {
            replyContent = $(replyElement).text().trim();
            // Làm sạch nội dung
            replyContent = replyContent.replace(/@[\w.]+/g, '');
            replyContent = replyContent.replace(/\d+[KMB]?\s*likes?/gi, '');
            replyContent = replyContent.replace(/\d+[dhm]|\d+\s*(days?|hours?|minutes?|seconds?)\s*ago/gi, '');
            replyContent = replyContent.replace(/Reply/gi, '');
            replyContent = replyContent.trim();
          }
        }
        
        // Extract reply author (tương tự như comment chính)
        let replyAuthor = '';
        let replyAuthorProfile = '';
        
        const replyUsernameElement = $(replyElement).find('div[class*="DivUsernameWrapper"] a, div[class*="UsernameWrapper"] a, [data-e2e="comment-username-1"] a');
        if (replyUsernameElement.length > 0) {
          replyAuthor = replyUsernameElement.text().trim();
          replyAuthorProfile = replyUsernameElement.attr('href');
        } else {
          const text = $(replyElement).text();
          const match = text.match(/@([\w.]+)/);
          if (match && match[1]) {
            replyAuthor = '@' + match[1];
            replyAuthorProfile = `/@${match[1]}`;
          }
        }
        
        // Extract reply likes
        let replyLikesText = '0';
        const replyLikesElement = $(replyElement).find('div[class*="DivLikeContainer"] span, [data-e2e="comment-like-count"]');
        if (replyLikesElement.length > 0) {
          replyLikesText = replyLikesElement.text().trim();
        }
        
        // Chuyển đổi likes thành số
        let replyLikes = 0;
        if (replyLikesText.includes('K')) {
          replyLikes = parseFloat(replyLikesText.replace('K', '')) * 1000;
        } else if (replyLikesText.includes('M')) {
          replyLikes = parseFloat(replyLikesText.replace('M', '')) * 1000000;
        } else if (replyLikesText.includes('B')) {
          replyLikes = parseFloat(replyLikesText.replace('B', '')) * 1000000000;
        } else {
          replyLikes = parseInt(replyLikesText.replace(/[^0-9]/g, '')) || 0;
        }
        
        // Extract date
        let replyDate = '';
        const replyDateElement = $(replyElement).find('div[class*="DivCommentSubContent"] span, div[class*="CommentSubContent"] span').first();
        if (replyDateElement.length > 0) {
          replyDate = replyDateElement.text().trim();
        }
        
        // Nếu reply có nội dung, thêm vào danh sách comments
        if (replyContent && replyContent.length > 1) {
          comments.push({
            id: replyCommentId,
            content: replyContent,
            author: replyAuthor || 'Unknown',
            author_profile: replyAuthorProfile ? (replyAuthorProfile.startsWith('http') ? replyAuthorProfile : `https://www.tiktok.com${replyAuthorProfile}`) : '',
            likes: replyLikes,
            date: replyDate || 'Unknown',
            has_replies: false,
            is_reply: true,
            parent_comment_id: commentId
          });
        }
      });
    }
  });

  console.log(`Successfully extracted ${comments.length} comments`);
  return comments;
};

module.exports = {
  extractVideoUrls,
  extractVideoDetails,
  extractComments
};
