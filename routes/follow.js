var express = require('express');
var router = express.Router();
var async = require('async');
var firestore = require('firebase-admin').firestore;
var parallel = require('async').parallel;
var auth = require('../firebase').auth;
var db = require('../firebase').db;
var processReviewData = require('./review').professReviewData;

router.post('/', function (req, res) {
  auth.verifyIdToken(req.headers.authorization || '').then(function (result) {
    if (result.uid === req.body.uid) {
      return res.status(400).json({message: 'You are already following yourself.'});
    }
    var uid = result.uid;
    var parallelFunctions = {
      followed: function (callback) {
        var followedRef = db.collection('follow').doc(req.body.uid);
        followedRef.get().then(function (docSnapshot) {
          if (docSnapshot.exists) {
            var update = {};
            update[`follower.${uid}`] = true;
            return followedRef.update(update);
          } else {
            return followedRef.set({ follower: { [uid]: true } })
          }
        }).then(function () {
          callback(null);
        }).catch(function (err) {
          callback(err);
        });
      },
      follow: function (callback) {
        var followRef = db.collection('follow').doc(uid);
        followRef.get().then(function (docSnapshot) {
          if (docSnapshot.exists) {
            var update = {};
            update[`following.${req.body.uid}`] = true;
            return followRef.update(update);
          } else {
            return followRef.set({ following: { [req.body.uid]: true } })
          }
        }).then(function () {
          callback(null);
        }).catch(function (err) {
          callback(err);
        });
      }
    }
    parallel(parallelFunctions, function (err, results) {
      if (!err) {
        res.json(results);
      } else {
        res.status(400).json(err);
      }
    });
  }).catch(function (err) {
    console.log(err)
    res.status(401).json(err);
  });
});

router.post('/unfollow', function (req, res) {
  auth.verifyIdToken(req.headers.authorization || '').then(function (decodedIdToken) {
    if (decodedIdToken.uid === req.body.uid) {
      return res.status(400).json({ message: 'Cannot unfollow yourself.' });
    }
    var parallelFunctions = {
      unfollower: function (callback) {
        var docRef = db.collection('follow').doc(decodedIdToken.uid);
        docRef.get().then(function (docSnapshot) {
          if (docSnapshot.exists) {
            var update = {};
            update[`following.${req.body.uid}`] = firestore.FieldValue.delete();
            return docRef.update(update);
          }
        }).then(function () {
          callback(null, 'Successfully update unfollower.');
        }).catch(function (err) {
          callback(err);
        });
      },
      unfollowee: function (callback) {
        var docRef = db.collection('follow').doc(req.body.uid);
        docRef.get().then(function (docSnapshot) {
          if (docSnapshot.exists) {
            var update = {};
            update[`follower.${decodedIdToken.uid}`] = firestore.FieldValue.delete();
            docRef.update(update);
          }
        }).then(function () {
          callback(null, 'Successfully update unfollowee.');
        }).catch(function (err) {
          callback(err);
        });
      }
    }
    parallel(parallelFunctions, function (err, results) {
      if (!err) {
        res.json(results);
      } else {
        res.status(400).json(err);
      }
    })
  }).catch(function (err) {
    res.status(401).json(err);
  });
});

router.get('/reviews', function (req, res) {
  auth.verifyIdToken(req.headers.authorization || '').then(function (decodedIdToken) {
    db.collection('follow').doc(decodedIdToken.uid).get().then(function (docSnapshot) {
      if (docSnapshot.exists) {
        var data = docSnapshot.data();
        var followinguids = Object.keys(data.following || {});
        var parallelFunctions = followinguids.map(function (uid) {
          return function (callback) {
            db.collection('review').where('author', '==', uid).orderBy('timestamp', 'desc').get().then(function (querySnapshot) {
              callback(null, querySnapshot.docs);
            }).catch(function (err) {
              console.log(err);
              callback(err);
            });
          }
        });
        async.parallel(parallelFunctions, function (err, results) {
          if (!err) {
            var reviewSnapshots = results.flat(1);
            var sids = Array.from(new Set(reviewSnapshots.map(function (doc) {
              return doc.data().stadiumId;
            })));
            var uids = Array.from(new Set(reviewSnapshots.map(function (doc) {
              return doc.data().author;
            })));
            var parallelFunctions = {};
            sids.forEach(function (sid) {
              parallelFunctions[sid] = function (cb) {
                db.doc('stadium/' + sid).get().then(function (docSnapshot) {
                  cb(null, docSnapshot.data());
                }).catch(function (err) {
                  cb(err);
                }); 
              }
            });
            uids.forEach(function (uid) {
              parallelFunctions[uid] = function (cb) {
                db.doc('user/' + uid).get().then(function (docSnapshot) {
                  cb(null, docSnapshot.data());
                }).catch(function (err) {
                  cb(err);
                }); 
              }
            });
            async.parallel(parallelFunctions, function (err, results) {
              if (err) {
                throw err;
              }
              var reviews = reviewSnapshots.map(function (doc) {
                var data = doc.data();
                return processReviewData(doc, { stadium: results[data.stadiumId], user: results[data.author] });
              }).sort(function (a, b) {
                return b.timestamp - a.timestamp;
              });
              res.json(reviews);
            });
          } else {
            res.status(400).json(err);
          }
        });
      } else {
        res.json([]);
      }
    });
  }).catch(function (err) {
    res.status(401).json(err);
  });
});

module.exports = router;
