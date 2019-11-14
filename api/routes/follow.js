var express = require('express');
var router = express.Router();
var processReviewData = require('./review').professReviewData;
const verifyIdToken = require('../middlewares').verifyIdToken;
const User = require('../models/user');
const Review = require('../models/review');
const Stadium = require('../models/stadium');

router.post('/', verifyIdToken, async (req, res) => {
  const uid = req.user.uid;
  if (uid === req.body.uid) {
    return res.status(400).json({message: 'You are already following yourself.'});
  }
  try {
    const user = new User(uid);
    await user.followUser(req.body.uid);
    return res.json({
      message: 'success'
    });
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.post('/unfollow', verifyIdToken, async (req, res) => {
  const uid = req.user.uid;
  if (uid === req.body.uid) {
    return res.status(400).json({ message: 'Cannot unfollow yourself.' });
  }
  try {
    const user = new User(uid);
    await user.unFollowUser(req.body.uid);
    return res.json({
      message: 'success'
    });
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.get('/reviews', verifyIdToken, async (req, res) => {
  try {
    const user = new User(req.user.uid);
    const followinguids = await user.getFollow('following');
    followinguids.push(req.user.uid);
    try {
      let reviewids = (await Promise.all(followinguids.map(async uid => {
        const user = new User(uid);
        return user.getReviewsIds();
      }))).flat(1);
      const reviewDatas = await Promise.all(reviewids.map(rid => new Review(rid).get()));
      const sids = Array.from(new Set(reviewDatas.map((review) => {
        return review.stadiumId;
      })));
      const uids = Array.from(new Set(reviewDatas.map((review) => {
        return review.author;
      })));
      const stadiumPromise = Promise.all(sids.map(sid => new Stadium(sid).get()));
      const userPromise = Promise.all(uids.map(uid => new User(uid).get()));
      const [stadiums, users] = await Promise.all([stadiumPromise, userPromise]);
      const results = {};
      sids.forEach((sid, idx) => {
        results[sid] = stadiums[idx];
      });
      uids.forEach((uid, idx) => {
        results[uid] = users[idx];
      });
      const reviews = (await Promise.all(reviewDatas.map((review) => {
        return processReviewData(review, { stadium: results[review.stadiumId], user: results[review.author] });
      }))).sort((a, b) => {
        return b.timestamp - a.timestamp;
      });
      return res.json(reviews);
    } catch (e) {
      return res.status(400).json(e.toString());
    }
  } catch (e) {
    return res.json([]);
  }
});

module.exports = router;
