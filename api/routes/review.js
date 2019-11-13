var express = require('express');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
var db = require('firebase-admin').firestore();
const verifyIdToken = require('../middlewares').verifyIdToken;
const getThumbnail = require('../utils').getThumbnail;

router.post('/', verifyIdToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    var newReview = {
      rating: req.body.rating,
      review: req.body.review,
      timestamp: firestore.FieldValue.serverTimestamp(),
      author: uid,
      stadiumId: req.body.stadiumId
    };
    const reviewDocData = await db.collection('review').add(newReview);
    await Promise.all([
      db.collection('stadium').doc(req.body.stadiumId).collection('reviews').doc(reviewDocData.id).set({}),
      db.collection('user').doc(uid).collection('reviews').doc(reviewDocData.id).set({})
    ]);
    return res.status(201).json({ message: 'Success.' });
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.get('/', async (req, res) => {
  var stadiumId = req.query.stadiumId;
  var reviewId = req.query.reviewId;

  if (reviewId) {
    try {
      const querySnapshot = await db.doc(`/review/${reviewId}`).get();
      return res.json(await processReviewData(Object.assign(querySnapshot.data, { id: querySnapshot.id })));
    } catch (e) {
      return res.status(400).json(e);
    }
  } else if (stadiumId) {
    try {
      const querySnapshot = await db.collection('stadium').doc(stadiumId).collection('reviews').get();
      const rids = querySnapshot.docs.map(doc => doc.id);
      let reviews = await Promise.all(rids.map(rid => db.collection('review').doc(rid).get()));
      reviews = reviews.filter(review => review.exists).map(review => Object.assign(review.data(), { id: review.id }));
      const authorids = Array.from(new Set(reviews.map(review => review.author)));
      const authorsArray = await Promise.all(authorids.map(async uid => {
        const docSnapshot = await db.collection('user').doc(uid).get();
        return docSnapshot.data();
      }));
      const authors = {};
      authorids.forEach((uid, idx) => {
        authors[uid] = authorsArray[idx];
      });
      return res.json(await Promise.all(reviews.map(review => processReviewData(review, { user: authors[review.author] }))));
    } catch (e) {
      return res.status(400).json({message: e.toString()});
    }
  }
  return res.json([]);
});

router.delete('/:rid', verifyIdToken, async (req, res) => {
  const docSnapshot = await db.collection('review').doc(req.params.rid).get();
  if (!docSnapshot.exists) {
    return res.status(404).json({ message: 'Review not found.' });
  }
  const data = docSnapshot.data();
  if (data.author !== req.user.uid) {
    return res.status(401).json({ message: 'You are not authorized to delete this review.' });
  }
  try {
    await db.collection('review').doc(req.params.rid).delete();
    return res.json({ message: 'Deleted.' });
  } catch (e) {
    return res.status(400).json(e);
  }
});

const processReviewData = async (data, additionalData) => {
  // const data = snapshot.data();
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