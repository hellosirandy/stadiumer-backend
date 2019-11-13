var express = require('express');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
var db = firestore();
var processReviewData = require('./review').professReviewData;
const verifyIdToken = require('../middlewares').verifyIdToken;

router.post('/', verifyIdToken, async (req, res) => {
  const uid = req.user.uid;
  if (uid === req.body.uid) {
    return res.status(400).json({message: 'You are already following yourself.'});
  }
  try {
    await Promise.all([
      db.collection('follow').doc(req.body.uid).collection('followers').doc(uid).set({}),
      db.collection('follow').doc(uid).collection('following').doc(req.body.uid).set({})
    ]);
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
    await Promise.all([
      db.collection('follow').doc(req.body.uid).collection('followers').doc(uid).delete(),
      db.collection('follow').doc(uid).collection('following').doc(req.body.uid).delete()
    ]);
    return res.json({
      message: 'success'
    });
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.get('/reviews', verifyIdToken, async (req, res) => {
  try {
    const querySnapshot = await db.collection('follow').doc(req.user.uid).collection('following').get();
    const followinguids = querySnapshot.docs.map(doc => doc.id);
    followinguids.push(req.user.uid);
    try {
      let reviewids = await Promise.all(followinguids.map(async uid => {
        const querySnapshot = await db.collection('user').doc(uid).collection('reviews').get();
        return querySnapshot.docs.map(doc => doc.id);
      }));
      reviewids = reviewids.flat(1);
      const reviewSnapshots = await Promise.all(reviewids.map(rid => db.collection('review').doc(rid).get()));
      const sids = Array.from(new Set(reviewSnapshots.map((doc) => {
        return doc.data().stadiumId;
      })));
      const uids = Array.from(new Set(reviewSnapshots.map((doc) => {
        return doc.data().author;
      })));
      const stadiumPromise = Promise.all(sids.map(async sid => {
        const docSnapshot = await db.collection('stadium').doc(sid).get();
        return docSnapshot.data();
      }));
      const userPromise = Promise.all(uids.map(async uid => {
        const docSnapshot = await db.collection('user').doc(uid).get();
        return docSnapshot.data();
      }));
      const [stadiums, users] = await Promise.all([stadiumPromise, userPromise]);
      const results = {};
      sids.forEach((sid, idx) => {
        results[sid] = stadiums[idx];
      });
      uids.forEach((uid, idx) => {
        results[uid] = users[idx];
      });
      const reviews = (await Promise.all(reviewSnapshots.map((doc) => {
        var data = doc.data();
        return processReviewData(Object.assign(data, {id: doc.id}), { stadium: results[data.stadiumId], user: results[data.author] });
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
