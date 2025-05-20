const { navigateToUrl } = require('../utils/browser');
const Comment = require('../models/Comment');

/**
 * Crawl replies for a specific comment
 * @param {Page} page - Puppeteer page instance
 * @param {string} videoUrl - TikTok video URL
 * @param {number} commentIndex - Index of the comment in the page
 * @param {Object} parentComment - Parent comment document
 * @returns {Promise<Array<Object>>} Array of reply comments
 */
const crawlCommentReplies = async (page, videoUrl, commentIndex, parentComment) => {
  console.log(`Crawling replies for comment #${commentIndex} on video: ${videoUrl}`);
  
  try {
    // Click on "View replies" button
    const viewRepliesSelector = `.css-13wx63w-DivCommentObjectWrapper:nth-child(${commentIndex + 1}) .css-1idgi02-DivViewRepliesContainer`;
    
    // Check if the "View replies" button exists
    const viewRepliesButton = await page.$(viewRepliesSelector);
    if (!viewRepliesButton) {
      console.log(`No replies button found for comment #${commentIndex}`);
      return [];
    }
    
    // Click the button to load replies
    await page.click(viewRepliesSelector);
    
    // Wait for replies to load
    await page.waitForTimeout(2000);
    
    // Get all reply elements
    const replyElements = await page.$$('.css-9kgp5o-DivReplyContainer .css-1gstnae-DivCommentItemWrapper');
    
    const replies = [];
    
    for (let i = 0; i < replyElements.length; i++) {
      // Extract reply content
      const contentElement = await replyElements[i].$('span[data-e2e="comment-level-2"] p');
      const content = contentElement ? await page.evaluate(el => el.textContent, contentElement) : '';
      
      // Extract author information
      const authorElement = await replyElements[i].$('.css-13x3qpp-DivUsernameContentWrapper a p');
      const author = authorElement ? await page.evaluate(el => el.textContent, authorElement) : '';
      
      const authorProfileElement = await replyElements[i].$('.css-13x3qpp-DivUsernameContentWrapper a');
      const authorProfile = authorProfileElement ? 
        await page.evaluate(el => el.getAttribute('href'), authorProfileElement) : '';
      
      // Extract likes count
      const likesElement = await replyElements[i].$('.css-1nd5cw-DivLikeContainer span');
      const likesText = likesElement ? await page.evaluate(el => el.textContent, likesElement) : '0';
      const likes = parseInt(likesText.replace(/[^0-9]/g, '')) || 0;
      
      // Extract date
      const dateElement = await replyElements[i].$('.css-njhskk-DivCommentSubContentWrapper span');
      const date = dateElement ? await page.evaluate(el => el.textContent, dateElement) : '';
      
      // Create and save reply comment
      const reply = new Comment({
        video_id: parentComment.video_id,
        video_url: videoUrl,
        content: content.trim(),
        author: author.trim(),
        author_profile: authorProfile ? `https://www.tiktok.com${authorProfile}` : '',
        likes,
        date: date.trim(),
        parent_comment_id: parentComment._id,
        is_reply: true
      });
      
      await reply.save();
      replies.push(reply);
    }
    
    console.log(`Saved ${replies.length} replies for comment #${commentIndex}`);
    return replies;
    
  } catch (error) {
    console.error(`Error crawling replies for comment #${commentIndex}: ${error.message}`);
    return [];
  }
};

module.exports = {
  crawlCommentReplies
};
