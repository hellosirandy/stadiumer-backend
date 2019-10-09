var express = require('express');
var rp = require('request-promise');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
var db = require('../firestore').db;
var GOOGLE_MAP_API_KEY = require('../secrets').GOOGLE_API_KEY;

router.get('/stadium', function(req, res) {
  if (req.query.id) {
    var stadium;
    db.collection('stadium').doc(req.query.id).get().then(querySnapshot => {
      stadium = processStadium(querySnapshot);
      var sports = Object.keys(stadium.sports);
      console.log(sports);
      return db.collection('stadium').where(`sports.${sports[0]}.capacity`, '>', 0).get();
    }).then(querySnapshot => {
      var recommendations = querySnapshot.docs.filter(doc => doc.id !== stadium.id).map(doc => processStadium(doc));
      stadium.recommendations = recommendations;
      res.json(stadium);
    });
    return;
  }
  db.collection('stadium').get().then(function (querySnapshot) {
    var result = querySnapshot.docs.map(function (doc) {
      return processStadium(doc);
    });
    res.json(result);
  }).catch(function (error) {
    res.status(400).json({
      message: error.toString()
    });
  });
});

router.post('/stadium', function (req, res) {
  var localityUri = 'https://maps.googleapis.com/maps/api/geocode/json?result_type=locality&latlng=' + req.body.location.lat + ',' + req.body.location.lon + '&key=' + GOOGLE_MAP_API_KEY;
  var uri = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + req.body.location.lat + ',' + req.body.location.lon + '&key=' + GOOGLE_MAP_API_KEY;
  var locality = '';
  rp({ uri: localityUri, json: true }).then(function (result) {
    locality = result.results[0].formatted_address.trim().replace(/-/g, '');
    return rp({ uri: uri, json: true });
  }).then(function (result) {
    var stadium = {
      name: req.body.name,
      opened: firestore.Timestamp.fromDate(new Date(req.body.opened)),
      location: new firestore.GeoPoint(req.body.location.lat, req.body.location.lon),
      locality: locality,
      address: result.results[0].formatted_address.trim().replace(/-/g, ''),
      sports: req.body.sports,
      architects: req.body.architects,
      cover: req.body.cover,
    };
    return db.collection('stadium').add(stadium).then();
  }).then(function (docRef) {
    res.json(docRef.id);
  }).catch(function (err) {
    console.log(err);
  });
});

var processStadium = function (doc) {
  var data = doc.data();
  var sports = Object.keys(data.sports);
  var leagues = [];
  sports.forEach(function (sport) {
    Object.keys(data.sports[sport].leagues || []).forEach(function (league) {
      leagues.push(league);
    });
  });
  var capacities = sports.map(sport => data.sports[sport].capacity)
  var capacity = Math.max.apply(Math, capacities);
  return {
    ...data,
    id: doc.id,
    name: data.name,
    opened: data.opened.toDate(),
    capacity,
    location: {
      lat: data.location.latitude,
      lon: data.location.longitude
    },
    cover: data.cover,
    locality: data.locality,
    leagues: leagues,
  }
};

module.exports = router;
