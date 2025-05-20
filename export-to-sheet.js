/**
 * Script to export TikTok crawler data to Google Sheets
 * This script is used to export data from MongoDB to a Google Sheet
 */

const { exportMultipleVideos, exportVideoToSheet } = require('./exportToSheet');

// Command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Display help message if no command provided
if (!command) {
  console.log('TikTok Crawler - Google Sheets Exporter');
  console.log('----------------------------------------');
  console.log('Usage:');
  console.log('  node export-to-sheet.js all                   - Export all videos to Google Sheet');
  console.log('  node export-to-sheet.js video <videoUrl>      - Export a specific video to Google Sheet');
  console.log('  node export-to-sheet.js videos <videoUrl1> <videoUrl2> ... - Export specific videos to Google Sheet');
  console.log('');
  console.log('Example:');
  console.log('  node export-to-sheet.js video https://www.tiktok.com/@user/video/1234567890');
  process.exit(0);
}

// Main function
async function main() {
  try {
    console.log('TikTok Crawler - Google Sheets Exporter');
    console.log('----------------------------------------');

    if (command === 'all') {
      console.log('Exporting all videos to Google Sheet...');
      await exportMultipleVideos([]);
      console.log('Export completed successfully!');
    } 
    else if (command === 'video' && args[1]) {
      console.log(`Exporting video: ${args[1]}`);
      await exportVideoToSheet(args[1]);
      console.log('Export completed successfully!');
    } 
    else if (command === 'videos' && args.length > 1) {
      const videoUrls = args.slice(1);
      console.log(`Exporting ${videoUrls.length} videos to Google Sheet...`);
      await exportMultipleVideos(videoUrls);
      console.log('Export completed successfully!');
    } 
    else {
      console.log('Invalid command or missing arguments. Use the command without arguments for help.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during export:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 