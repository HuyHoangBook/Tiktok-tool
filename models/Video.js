const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  url_source: {
    type: String
  },
  channel: {
    type: String,
    required: true
  },
  likes: {
    type: Number,
    default: 0
  },
  comments_count: {
    type: Number,
    default: 0
  },
  saved: {
    type: Number,
    default: 0
  },
  shared: {
    type: Number,
    default: 0
  },
  hashtags: {
    type: [String],
    default: []
  },
  // Thông tin Google Drive
  drive_file_id: {
    type: String,
    default: null
  },
  drive_view_link: {
    type: String,
    default: null
  },
  drive_direct_link: {
    type: String,
    default: null
  },
  download_error: {
    type: String,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Video', VideoSchema);
