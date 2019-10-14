var express = require('express');
var router = express.Router();
var rp = require('request-promise');
var FIREBASE_API_KEY = require('../secrets').FIREBASE_API_KEY;

router.post('/', function (req, res) {
  // auth.createUser({
  //   email: req.body.email,
  //   password: req.body.password
  // }).then(function (result) {
  //   res.status(201).json(result);
  // }).catch(function (err) {
  //   console.log(err)
  //   res.status(400).send(err);
  // });
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
    res.json(err);
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

module.exports = router;
