/* global console */
import express from 'express';
import morgan from 'morgan';
import http from 'http';
// @ifdef PRODUCTION
import serveStatic from 'serve-static';
// @endif

var app = express();
// @ifdef DEVELOPMENT
app.use(morgan('dev'));
// @endif

// @ifdef PRODUCTION
app.use(serveStatic('app', {
  index: ['index.html']
}));
// @endif

app.get('/hello', function(req, res) {
  'use strict';
  res.json({ hello: 'world' });
});

http.createServer(app).listen(3000, function() {
  'use strict';
  console.log('Express server started!');
});

