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

    // Format comment details as a string
    const commentDetails = comments.map(comment => {
      const prefix = comment.is_reply ? '    ↳ ' : '';
      return `${prefix}${comment.author}: ${comment.content} (👍 ${comment.likes})`;
    }).join('\n');

    // Prepare row data
    const rowData = [
      video.channel,
      video.title,
      video.hashtags.join(', '),
      video.url,
      video.likes.toString(),
      video.shared.toString(),
      video.saved.toString(),
      video.comments_count.toString(),
      commentDetails
    ];

    // Append data to the sheet
    await sheetsApi.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Trang tính1!A:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [rowData]
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
      range: 'Trang tính1!A2:I',
    });

    // Add header row
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Trang tính1!A1:I1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [['Channel', 'Title', 'Hashtags', 'Link Video', 'Likes', 'Shares', 'Saved', 'Comments', 'Comment Details']]
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

    // Prepare batch data
    const rows = [];
    
    for (const video of videos) {
      // Fetch comments for the video
      const comments = await Comment.find({ video_id: video._id });
      console.log(`Found ${comments.length} comments for video ${video.url}`);

      // Format comment details as a string
      const commentDetails = comments.map(comment => {
        const prefix = comment.is_reply ? '    ↳ ' : '';
        return `${prefix}${comment.author}: ${comment.content} (👍 ${comment.likes})`;
      }).join('\n');

      // Add row data
      rows.push([
        video.channel,
        video.title,
        video.hashtags.join(', '),
        video.url,
        video.likes.toString(),
        video.shared.toString(),
        video.saved.toString(),
        video.comments_count.toString(),
        commentDetails
      ]);
    }

    // Append all data to the sheet
    if (rows.length > 0) {
      await sheetsApi.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Trang tính1!A2:I',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: rows
        }
      });
    }

    console.log(`Successfully exported ${rows.length} videos to Google Sheet`);
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