var express = require('express');
var router = express.Router();
var async = require('async');
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
      res.json(processReviewData(querySnapshot));
    }).catch(function (err) {
      res.status(400).json(err);
    });
  } else if (stadiumId) {
    db.collection('/review').where('stadiumId', '==', stadiumId).get().then(function (querySnapshot) {
      var authors = Array.from(new Set(querySnapshot.docs.map(function (doc) {
        return doc.data().author;
      })));
      var parallelFunctions = {};
      authors.forEach(function (author) {
        parallelFunctions[author] = function (callback) {
          db.doc('user/' + author).get().then(function (docSnapshot) {
            callback(null, docSnapshot.data());
          }).catch(function (err) {
            console.log(err)
            callback(err);
          }); 
        }
      });
      async.parallel(parallelFunctions, function (err, userData) {
        if (err) {
          throw err;
        }
        var reviews = querySnapshot.docs.map(function (doc) {
          return processReviewData(doc, { user: userData[doc.data().author] });
        });
        res.json(reviews);
      });
      
    }).catch(function (err) {
      console.log(err);
      res.status(400).json({message: err});
    });
  }
  return;
});

var processReviewData = function (snapshot, additionalData) {
  var data = snapshot.data();
  var result = {
    ...data,
    timestamp: data.timestamp.toDate(),
    id: snapshot.id,
  };
  if (additionalData && additionalData.user) {
    result.author = {
      id: data.author,
      name: additionalData.user.firstName + ' ' + additionalData.user.lastName,
      profilePic: additionalData.user.profilePic
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