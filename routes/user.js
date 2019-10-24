var express = require('express');
var router = express.Router();
var async = require('async');
var rp = require('request-promise');
var auth = require('../firebase').auth;
var db = require('../firebase').db;
var FIREBASE_API_KEY = require('../secrets').FIREBASE_API_KEY;
var processReviewData = require('./review').professReviewData;

router.post('/', function (req, res) {
  var token, expirationTime, refreshToken;
  rp.post({
    uri: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FIREBASE_API_KEY,
    form: {
      email: req.body.email,
      password: req.body.password,
      returnSecureToken: true
    },
    json: true
  }).then(function (payload) {
    token = payload.idToken;
    expirationTime = Date.now() + Number(payload.expiresIn) * 1000;
    refreshToken = payload.refreshToken;
    return db.collection('user').doc(payload.localId).set({
      firstName: req.body.firstName,
      lastName: req.body.lastName
    });
  }).then(function () {
    res.json({
      token: token,
      expirationTime: expirationTime,
      refreshToken: refreshToken
    });
  }).catch(function (err) {
    res.status(400).json(err);
  });
});

router.post('/signin', function (req, res) {
  rp.post({
    uri: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY,
    form: {
      email: req.body.email,
      password: req.body.password,
      returnSecureToken: true
    },
    json: true
  }).then(function (payload) {
    var expirationTime = Date.now() + Number(payload.expiresIn) * 1000;
    res.json({ 
      token: payload.idToken,
      expirationTime: expirationTime,
      refreshToken: payload.refreshToken
    });
  }).catch(function (err) {
    res.status(401).json(err);
  });
});

router.post('/refresh', function (req, res) {
  rp.post({
    uri: 'https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY,
    form: {
      grant_type: 'refresh_token',
      refresh_token: req.body.refreshToken,
    },
    json: true
  }).then(function (payload) {
    res.json({
      token: payload.access_token,
      expirationTime: Date.now() + Number(payload.expires_in) * 1000,
      refreshToken: payload.refresh_token
    });
  }).catch(function (err) {
    console.log(err);
  })
});

router.get('/profile/:userId', function (req, res) {
  getUser(req.params.userId, function (err, result) {
    if (err) {
      return res.status(400).json(err);
    }
    res.json(result);
  });
});

router.put('/:userId', function (req, res) {
  var updates = {};
  updates.firstName = req.body.firstName;
  updates.lastName = req.body.lastName;
  updates.profilePic = req.body.profilePic;
  Object.keys(updates).forEach(function (key) {
    if (!updates[key]) {
      delete updates[key];
    }
  });
  db.collection('user').doc(req.params.userId).update(updates).then(function () {
    res.status(201).json({message: 'updated'});
  }).catch(res.status(400).json);
})

router.get('/', function (req, res) {
  auth.verifyIdToken(req.headers.authorization).then(function (result) {
    const uid = result.uid;
    getUser(uid, function (err, result) {
      if (err) {
        return res.status(400).json(err);
      }
      res.json(result);
    });
  }).catch(function (err) {
    res.status(401).json(err);
  });
});

var getUser = function (uid, callback) {
  var parallelFunctions = {
    profile: function (callback) {
      db.doc(`user/${uid}`).get().then(function (docSnapshot) {
        if (docSnapshot.exists) {
          callback(null, {
            ...docSnapshot.data(),
            id: uid,
          });
        }
      }).catch(callback);
    },
    reviews: function (callback) {
      db.collection('review').where('author', '==', uid).get().then(function (querySnapshot) {
        var stadiums = Array.from(new Set(querySnapshot.docs.map(function (doc) {
          return doc.data().stadiumId;
        })));
        var parallelFunctions = {};
        stadiums.forEach(function (stadiumId) {
          parallelFunctions[stadiumId] = function (callback) {
            db.doc('stadium/' + stadiumId).get().then(function (docSnapshot) {
              callback(null, docSnapshot.data());
            }).catch(function (err) {
              callback(err);
            }); 
          }
        });
        async.parallel(parallelFunctions, function (err, stadiumData) {
          if (err) {
            throw err;
          }
          var reviews = querySnapshot.docs.map(function (doc) {
            return processReviewData(doc, { stadiumData: stadiumData });
          });
          callback(null, reviews);
        });
      }).catch(function (err) {
        console.log(err);
        callback(err);
      });
    }
  }
  async.parallel(parallelFunctions, function (err, result) {
    if (err) {
      return callback(err);
    }
    callback(null, result);
  });
}

module.exports = router;
