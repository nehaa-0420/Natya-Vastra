const path = require('path');

// On a host like Render, point UPLOAD_DIR (and DB_PATH) at a persistent disk,
// otherwise photos and the database disappear whenever the server restarts.
module.exports = {
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')
};
