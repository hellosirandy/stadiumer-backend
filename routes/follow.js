var express = require('express');
var router = express.Router();
var parallel = require('async').parallel;
var auth = require('../firebase').auth;
var db = require('../firebase').db;

router.post('/', function (req, res) {
  var userFollowRef;
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

module.exports = router;
