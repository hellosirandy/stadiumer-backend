var express = require('express');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
var db = require('firebase-admin').firestore();
const verifyIdToken = require('../middlewares').verifyIdToken;
const getThumbnail = require('../utils').getThumbnail;
const Review = require('../models/review');
const User = require('../models/user');
const Stadium = require('../models/stadium');

router.post('/', verifyIdToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const timestamp = firestore.FieldValue.serverTimestamp();
    var newReview = {
      rating: req.body.rating,
      review: req.body.review,
      timestamp,
      author: uid,
      stadiumId: req.body.stadiumId
    };
    const review = new Review();
    const user = new User(uid);
    const stadium = new Stadium(req.body.stadiumId);
    const [createdReview, stadiumData, userData] = await Promise.all([
      review.create(newReview),
      stadium.get(),
      user.get()
    ]);
    await Promise.all([
      user.addReview(review.id, timestamp),
      stadium.addReview(review.id, timestamp)
    ]);
    return res.status(201).json(await processReviewData(createdReview, { stadium: stadiumData, user: userData }));
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: 'Failed to leave review.' });
  }
});

router.get('/', async (req, res) => {
  var stadiumId = req.query.stadiumId;
  var reviewId = req.query.reviewId;

  if (reviewId) {
    try {
      return res.json(await processReviewData(new Review(reviewId).get()));
    } catch (e) {
      return res.status(400).json(e);
    }
  } else if (stadiumId) {
    try {
      const stadium = new Stadium(stadiumId);
      const rids = await stadium.getReviewsIds();
      let reviews = await Promise.all(rids.map(rid => new Review(rid).get()));
      reviews = reviews.filter(review => review);
      const authorids = Array.from(new Set(reviews.map(review => review.author)));
      const authorsArray = await Promise.all(authorids.map(async uid => new User(uid).get()));
      const authors = {};
      authorids.forEach((uid, idx) => {
        authors[uid] = authorsArray[idx];
      });
      return res.json(await Promise.all(reviews.map(review => processReviewData(review, { user: authors[review.author] }))));
    } catch (e) {
      console.log(e);
      return res.status(400).json({message: e.toString()});
    }
  }
  return res.json([]);
});

router.delete('/:rid', verifyIdToken, async (req, res) => {
  const review = new Review(req.params.rid);
  const data = await review.get();
  if (!data) {
    return res.status(404).json({ message: 'Review not found.' });
  }
  if (data.author !== req.user.uid) {
    return res.status(401).json({ message: 'You are not authorized to delete this review.' });
  }
  try {
    const user = new User(req.user.uid);
    const stadium = new Stadium(data.stadiumId);
    await Promise.all([
      review.delete(),
      user.removeReview(req.params.rid),
      stadium.removeReview(req.params.rid),
    ]);
    return res.json({ message: 'Deleted.' });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ message: 'Failed to delete review.' });
  }
});

router.post('/like', verifyIdToken, (req, res) => {
  const rid = req.body.rid;
  const review = new Review(rid);
  const uid = req.user.uid;
  const user = new User(uid);
  
});

const processReviewData = async (data, additionalData) => {
  const result = Object.assign(data, {
    timestamp: data.timestamp.toDate(),
  });
  if (additionalData && additionalData.user) {
    result.author = {
      id: data.author,
      name: additionalData.user.firstName + ' ' + additionalData.user.lastName,
      profilePic: await getThumbnail(data.author, additionalData.user.profilePic)
    }
  }
  if (additionalData && additionalData.stadium) {
    result.stadium = {
      id: data.stadiumId,
      name: additionalData.stadium.name,
      locality: additionalData.stadium.locality,
      cover: additionalData.stadium.photoReferences[0]
    }
  }
  return result;
}

exports.router = router;
exports.professReviewData = processReviewData;