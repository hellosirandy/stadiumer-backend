var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

var indexRouter = require('./routes/index');
var stadiumRouter = require('./routes/stadium');
var userRouter = require('./routes/user');
var searchRouter = require('./routes/search');
var reviewRouter = require('./routes/review').router;
var followRouter = require('./routes/follow');
var app = express();

app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', indexRouter);
app.use('/stadium', stadiumRouter);
app.use('/user', userRouter);
app.use('/review', reviewRouter);
app.use('/search', searchRouter);
app.use('/follow', followRouter);

module.exports = app;
