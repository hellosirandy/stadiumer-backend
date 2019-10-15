var express = require('express');
var rp = require('request-promise');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
// var firestore = require('firebase').firestore;
var db = require('../firebase').db;
var GOOGLE_MAP_API_KEY = require('../secrets').GOOGLE_API_KEY;

var leagueSportMap = {
  MLB: 'baseball',
  NFL: 'football',
  'Premier League': 'soccer',
  'La Liga': 'soccer',
  NHL: 'hockey',
  MLS: 'soccer',
  NBA: 'basketball'
}

router.get('/', function(req, res) {
  var limit = Number(req.query.limit) || 0;
  if (req.query.id) {
    var stadium;
    db.collection('stadium').doc(req.query.id).get().then(querySnapshot => {
      stadium = processStadium(querySnapshot);
      return db.collection('stadium').limit(6).where(`sports.${stadium.sports[0]}.capacity`, '>', 0).get();
    }).then(querySnapshot => {
      var recommendations = querySnapshot.docs.filter(doc => doc.id !== stadium.id).map(doc => processStadium(doc));
      stadium.recommendations = recommendations;
      res.json(stadium);
    });
    return;
  } else if (req.query.league) {
    var league = decodeURIComponent(req.query.league);
    db.collection('stadium').limit(limit).where('leagues', 'array-contains', league).get()
    .then(querySnapshot => {
      var result = querySnapshot.docs.map(function (doc) {
        return processStadium(doc);
      });
      res.json(result);
    });
    return;
  }
  db.collection('stadium').limit(12).get().then(function (querySnapshot) {
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

router.post('/', function (req, res) {
  var locality = '';
  var website = '';
  var phone = '';
  var geoUri = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + 
      encodeURIComponent(req.body.name) + '&types=establishment&location=' + 
      req.body.location.lat + ',' + req.body.location.lon + 
      '&radius=50&key=' + GOOGLE_MAP_API_KEY;
  rp({ uri: geoUri, json: true }).then(function (result) {
    var placeId = result.predictions[0].place_id;
    var placeUri = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + 
      placeId + '&fields=formatted_address,name,website,rating,formatted_phone_number&key=' + 
      GOOGLE_MAP_API_KEY;
    return rp({ uri: placeUri, json: true })
  }).then(function (result) {
    var localityUri = 'https://maps.googleapis.com/maps/api/geocode/json?result_type=locality&latlng=' + req.body.location.lat + ',' + req.body.location.lon + '&key=' + GOOGLE_MAP_API_KEY;
    website = result.result.website || '';
    phone = result.result.formatted_phone_number || '';
    address = (result.result.formatted_address || '').trim().replace(/-/g, '');
    return rp({ uri: localityUri, json: true });
  }).then(function (result) {
    locality = result.status === 'OK' ? result.results[0].formatted_address.trim().replace(/-/g, '') : '';
    var leagues = [];
    Object.keys(req.body.sports).forEach(function (sport) {
      Object.keys(req.body.sports[sport].leagues).forEach(function (league) {
        leagues.push(league);
      });
    });
    var stadium = {
      name: req.body.name,
      // opened: firestore.Timestamp.fromDate(new Dat),
      opened: firestore.Timestamp.fromDate(new Date(req.body.opened)),
      // locaiton: {
      //   latitude: req.body.location.lat,
      //   longitude: req.body.location.lon
      // },
      location: new firestore.GeoPoint(req.body.location.lat, req.body.location.lon),
      locality: locality,
      address: address,
      phone: phone,
      website: website,
      sports: req.body.sports,
      architects: req.body.architects,
      cover: req.body.cover,
      leagues: leagues,
    };
    return db.collection('stadium').add(stadium).then();
  }).then(function (docRef) {
    res.status(201).json(docRef.id);
  }).catch(function (err) {
    console.log(err);
  });
});

var processStadium = function (doc) {
  var data = doc.data();
  var sports = Object.keys(data.sports);
  var tenants = {};
  sports.forEach(function (sport) {
    Object.keys(data.sports[sport].leagues || {}).forEach(function (league) {
      Object.keys(data.sports[sport].leagues[league] || {}).forEach(team => {
        tenants[team] = league;
      });
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
    sports: sports,
    architects: Object.keys(data.architects),
    tenants: tenants
  }
};

module.exports = router;
