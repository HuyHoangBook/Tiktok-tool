const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Models
const Video = require('./models/Video');
const Comment = require('./models/Comment');
const mongoose = require('mongoose');
require('dotenv').config();

// Spreadsheet ID from the URL
const SPREADSHEET_ID = '1RdAekQP2wZyaQd-Z_XP1BZIXCwuOUojtt9YyYH-r1Vg';
const CREDENTIALS_PATH = path.join(__dirname, 'huy-hoang-book-0bf0f972303b.json');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

/**
 * Get Google Sheets API client
 * @returns {Promise<sheets_v4.Sheets>} Google Sheets API client
 */
async function getGoogleSheetsClient() {
  try {
    // Check if credentials file exists
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error(`Credentials file not found at ${CREDENTIALS_PATH}`);
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
  } catch (error) {
    console.error('Error creating Google Sheets client:', error.message);
    throw error;
  }
}

/**
 * Export video data to Google Sheets
 * @param {string} videoUrl - URL of the TikTok video
 */
async function exportVideoToSheet(videoUrl) {
  try {
    await connectDB();
    const sheetsApi = await getGoogleSheetsClient();

    // Fetch video data from database
    const video = await Video.findOne({ url: videoUrl });
    if (!video) {
      throw new Error(`Video not found in database: ${videoUrl}`);
    }

    // Fetch comments for the video
    const comments = await Comment.find({ video_id: video._id });
    console.log(`Found ${comments.length} comments for video ${videoUrl}`);

    // Prepare rows data - one row per comment
    const rows = [];
    
    // If no comments, create at least one row with video data
    if (comments.length === 0) {
      rows.push([
        video.url,                     // URL
        video.channel,                 // Channel URL
        video.hashtags.join(', '),     // Hashtags
        video.title,                   // Title
        video.likes.toString(),        // Likes
        video.comments_count.toString(), // Comments
        '',                            // Comment Author (empty)
        '',                            // Comment Text (empty)
        '',                            // Comment Likes (empty)
        ''                             // Comment Date (empty)
      ]);
    } else {
      // Add rows for comments
      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        
        if (i === 0) {
          // First comment row includes all video data
          rows.push([
            video.url,                     // URL
            video.channel,                 // Channel URL
            video.hashtags.join(', '),     // Hashtags
            video.title,                   // Title
            video.likes.toString(),        // Likes
            video.comments_count.toString(), // Comments
            comment.author,                // Comment Author
            comment.content,               // Comment Text
            comment.likes.toString(),      // Comment Likes
            comment.date                   // Comment Date
          ]);
        } else {
          // Subsequent comment rows have empty video data
          rows.push([
            '',                            // URL (empty for subsequent comments)
            '',                            // Channel URL (empty for subsequent comments)
            '',                            // Hashtags (empty for subsequent comments)
            '',                            // Title (empty for subsequent comments)
            '',                            // Likes (empty for subsequent comments)
            '',                            // Comments (empty for subsequent comments)
            comment.author,                // Comment Author
            comment.content,               // Comment Text
            comment.likes.toString(),      // Comment Likes
            comment.date                   // Comment Date
          ]);
        }
      }
    }

    // Append data to the sheet
    await sheetsApi.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Trang tính1!A:J',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: rows
      }
    });

    console.log(`Successfully exported video data to Google Sheet: ${video.title}`);
  } catch (error) {
    console.error('Error exporting to Google Sheet:', error.message);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

/**
 * Export multiple videos to Google Sheets
 * @param {Array<string>} videoUrls - Array of TikTok video URLs
 */
async function exportMultipleVideos(videoUrls) {
  try {
    await connectDB();
    const sheetsApi = await getGoogleSheetsClient();

    // Clear the sheet first
    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Trang tính1!A2:J',
    });

    // Add header row
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Trang tính1!A1:J1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [['URL', 'Channel URL', 'Hashtag', 'Title', 'Likes', 'Comments', 'Comment Author', 'Comment Text', 'Comment Likes', 'Comment Date']]
      }
    });

    // Fetch all videos if no URLs provided
    let videos = [];
    if (!videoUrls || videoUrls.length === 0) {
      videos = await Video.find({}).sort({ created_at: -1 });
      console.log(`Exporting all ${videos.length} videos from database`);
    } else {
      videos = await Video.find({ url: { $in: videoUrls } });
      console.log(`Exporting ${videos.length} specified videos`);
    }

    // Prepare all rows
    const allRows = [];
    
    for (const video of videos) {
      // Fetch comments for the video
      const comments = await Comment.find({ video_id: video._id });
      console.log(`Found ${comments.length} comments for video ${video.url}`);
      
      // If no comments, create at least one row with video data
      if (comments.length === 0) {
        allRows.push([
          video.url,                     // URL
          video.channel,                 // Channel URL
          video.hashtags.join(', '),     // Hashtags
          video.title,                   // Title
          video.likes.toString(),        // Likes
          video.comments_count.toString(), // Comments
          '',                            // Comment Author (empty)
          '',                            // Comment Text (empty)
          '',                            // Comment Likes (empty)
          ''                             // Comment Date (empty)
        ]);
      } else {
        // Add rows for comments
        for (let i = 0; i < comments.length; i++) {
          const comment = comments[i];
          
          if (i === 0) {
            // First comment row includes all video data
            allRows.push([
              video.url,                     // URL
              video.channel,                 // Channel URL
              video.hashtags.join(', '),     // Hashtags
              video.title,                   // Title
              video.likes.toString(),        // Likes
              video.comments_count.toString(), // Comments
              comment.author,                // Comment Author
              comment.content,               // Comment Text
              comment.likes.toString(),      // Comment Likes
              comment.date                   // Comment Date
            ]);
          } else {
            // Subsequent comment rows have empty video data
            allRows.push([
              '',                            // URL (empty for subsequent comments)
              '',                            // Channel URL (empty for subsequent comments)
              '',                            // Hashtags (empty for subsequent comments)
              '',                            // Title (empty for subsequent comments)
              '',                            // Likes (empty for subsequent comments)
              '',                            // Comments (empty for subsequent comments)
              comment.author,                // Comment Author
              comment.content,               // Comment Text
              comment.likes.toString(),      // Comment Likes
              comment.date                   // Comment Date
            ]);
          }
        }
      }
    }

    // Append all data to the sheet
    if (allRows.length > 0) {
      await sheetsApi.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Trang tính1!A2:J',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: allRows
        }
      });
    }

    console.log(`Successfully exported ${allRows.length} rows to Google Sheet`);
  } catch (error) {
    console.error('Error exporting to Google Sheet:', error.message);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'single' && args[1]) {
    // Export a single video
    exportVideoToSheet(args[1])
      .catch(err => console.error(err));
  } else if (command === 'multiple' && args.length > 1) {
    // Export multiple specific videos
    exportMultipleVideos(args.slice(1))
      .catch(err => console.error(err));
  } else if (command === 'all') {
    // Export all videos
    exportMultipleVideos([])
      .catch(err => console.error(err));
  } else {
    console.log('Usage:');
    console.log('  node exportToSheet.js single <videoUrl>');
    console.log('  node exportToSheet.js multiple <videoUrl1> <videoUrl2> ...');
    console.log('  node exportToSheet.js all');
  }
}

module.exports = {
  exportVideoToSheet,
  exportMultipleVideos
}; 