var express = require('express');
var router = express.Router();
var auth = require('../firebase').auth;
var db = require('../firebase').db;
var firestore = require('firebase-admin').firestore;

router.post('/', function (req, res) {
  auth.verifyIdToken(req.headers.authorization).then(function (result) {
    const uid = result.uid;
    var newReview = {
      rating: req.body.rating,
      review: req.body.review,
      timestamp: firestore.FieldValue.serverTimestamp(),
      author: uid,
      stadiumId: req.body.stadiumId
    };
    return db.collection('review').add(newReview);
  }).then(function (result) {
    res.status(201).json(result.id);
  }).catch(function (err) {
    res.status(401).json(err);
  });
});

router.get('/', function (req, res) {
  var stadiumId = req.query.stadiumId;
  var reviewId = req.query.reviewId;

  if (reviewId) {
    db.doc(`/review/${reviewId}`).get().then(function (querySnapshot) {
      res.json(processData(querySnapshot));
    }).catch(function (err) {
      res.status(400).json(err);
    });
  } else if (stadiumId) {
    db.collection('/review').where('stadiumId','==', stadiumId).get().then(function (querySnapshot) {
      var result = querySnapshot.docs.map(function (doc) {
        return processData(doc);
      });
      res.json(result);
    }).catch(function (err) {
      res.status(400).json(err);
    });
  }
  return;
});

var processData = function (snapshot) {
  var data = snapshot.data();
  return {
    ...data,
    timestamp: data.timestamp.toDate(),
    id: snapshot.id
  };
}

module.exports = router;