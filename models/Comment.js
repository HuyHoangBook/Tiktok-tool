const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  video_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  video_url: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  },
  author_profile: {
    type: String
  },
  likes: {
    type: Number,
    default: 0
  },
  date: {
    type: String
  },
  parent_comment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  is_reply: {
    type: Boolean,
    default: false
  },
  crawled_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Comment', CommentSchema);
