# TikTok Data Crawler

A Node.js application for crawling TikTok data using Puppeteer and Cheerio, storing the data in MongoDB and exporting to Google Sheets.

## Features

- Crawls TikTok profiles to extract video URLs
- Extracts video details (title, URL source, channel, engagement metrics)
- Extracts comments and replies
- Stores all data in MongoDB
- Exports data to Google Sheets

## Requirements

- Node.js (v14 or higher)
- MongoDB

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your MongoDB connection string:
   ```
   MONGO_URI=your_mongodb_connection_string
   ```

## Usage

Run the crawler:

```
npm start
```

### Exporting to Google Sheets

The crawler can automatically export data to a Google Sheet after crawling. You can also export existing data using:

```
node export-to-sheet.js all                   # Export all videos
node export-to-sheet.js video <videoUrl>      # Export a specific video
node export-to-sheet.js videos <url1> <url2>  # Export multiple videos
```

## Project Structure

- `index.js`: Main entry point
- `config/`: Configuration files
  - `db.js`: MongoDB connection
  - `userAgents.js`: List of user agents
- `models/`: MongoDB models
  - `Video.js`: Video schema
  - `Comment.js`: Comment schema
- `utils/`: Utility functions
  - `browser.js`: Puppeteer browser setup
  - `parser.js`: HTML parsing functions using Cheerio
- `crawlers/`: Crawler modules
  - `profileCrawler.js`: Crawl profile pages to get video URLs
  - `videoCrawler.js`: Crawl individual video pages
  - `commentCrawler.js`: Crawl comments and replies
- `exportToSheet.js`: Google Sheets export functionality
- `export-to-sheet.js`: Command-line tool for exporting to Google Sheets

## Data Structure

### Video Model
- `url`: TikTok video URL
- `title`: Video title
- `url_source`: Video source URL
- `channel`: Channel name
- `channel_url`: Channel URL
- `likes`: Number of likes
- `comments_count`: Number of comments
- `saved`: Number of saves
- `shared`: Number of shares
- `crawled_at`: Timestamp when the video was crawled

### Comment Model
- `video_id`: Reference to the Video model
- `video_url`: TikTok video URL
- `content`: Comment content
- `author`: Comment author name
- `author_profile`: Author profile URL
- `likes`: Number of likes on the comment
- `date`: Comment date
- `parent_comment_id`: Reference to parent comment (for replies)
- `is_reply`: Boolean indicating if the comment is a reply
- `crawled_at`: Timestamp when the comment was crawled

## Google Sheets Export

The data exported to Google Sheets includes:
- Channel name
- Video title
- Hashtags
- Video URL
- Likes count
- Shares count
- Saved count
- Comments count
- Comment details (including replies)

To use the Google Sheets functionality:
1. Make sure you have a Google Service Account credentials JSON file
2. The file should be named `huy-hoang-book-0bf0f972303b.json` in the root directory
3. The target spreadsheet must give edit access to the service account email
