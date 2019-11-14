const express = require('express');
const rp = require('request-promise');
const router = express.Router();
const firestore = require('firebase-admin').firestore;
const db = require('firebase-admin').firestore();
const GOOGLE_MAP_API_KEY = require('../../secrets').GOOGLE_API_KEY;
const verifyIdToken = require('../middlewares').verifyIdToken;
const algoliasearch = require('algoliasearch');
const algoliaAPIKEY = require('../../secrets').ALGOLIA_API_KEY;
const client = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = client.initIndex('stadium');
const Stadium = require('../models/stadium');
const User = require('../models/user');
const StadiumList = require('../models/stadiumList');

const leagueSportMap = {
  MLB: 'baseball',
  NFL: 'football',
  'Premier League': 'soccer',
  'La Liga': 'soccer',
  NHL: 'hockey',
  MLS: 'soccer',
  NBA: 'basketball'
}

const tournamentSportMap = {
  'UEFA Euro 2016': 'soccer'
}

router.get('/', async (req, res) => {
  const limit = Number(req.query.limit) || 0;
  if (req.query.id) {
    const stadium = new Stadium(req.query.id);
    let data = await stadium.get();
    data = processStadium(data);
    const recommendations = await stadium.getRecommendations();
    data.recommendations = recommendations.map(r => processStadium(r));
    return res.json(data);
  } else if (req.query.league || req.query.tournament) {
    const type = decodeURIComponent(req.query.league ? 'leagues' : 'tournaments');
    const stadiumList = new StadiumList();
    const results = await stadiumList.getByLeagueOrTournament(type, req.query.league || req.query.tournament, limit);
    return res.json(results.map(processStadium));
  }
  return res.status(400).json({ message: 'Invalid request.' });
});

router.get('/detail/:sid', async (req, res) => {
  const stadium = new Stadium(req.params.sid);
  const recommendations = await stadium.getRecommendations();
  return res.json({
    recommendations: recommendations.map(r => processStadium(r))
  });
});

router.get('/firstload', async (req, res) => {
  const leagues = shuffle(Object.keys(leagueSportMap));
  const stadiumList = new StadiumList();
  const [recommended, league1, league2, count] = await Promise.all([
    stadiumList.getRecommended(),
    stadiumList.getByLeagueOrTournament('leagues', leagues[0]),
    stadiumList.getByLeagueOrTournament('leagues', leagues[1]),
    stadiumList.getCount()
  ]);
  return res.json({
    groupStadiums: {
      Recommended: recommended.map(processStadium),
      [leagues[0]]: league1.map(processStadium),
      [leagues[1]]: league2.map(processStadium),
    },
    count
  });
});

router.post('/', verifyIdToken, async (req, res) => {
  const user = new User(req.user.uid);
  const userData = await user.get();
  if (userData.role !== 'admin') {
    return res.status(401).json({ message: 'Only admin can edit stadium' });
  }
  const placeSearchUri = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=' +
      encodeURIComponent(req.body.name) + '&inputtype=textquery&fields=place_id,name&key=' + 
      GOOGLE_MAP_API_KEY + '&locationbias=circle:50@' + req.body.location.lat + ',' + req.body.location.lng;
  const placeSearchResult = await rp({ uri: placeSearchUri, json: true });
  const name = placeSearchResult.candidates[0].name;
  const placeId = placeSearchResult.candidates[0].place_id;
  const placeUri = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + 
      placeId + '&fields=formatted_address,name,website,rating,formatted_phone_number,photos&key=' + 
      GOOGLE_MAP_API_KEY;
  const localityUri = 'https://maps.googleapis.com/maps/api/geocode/json?result_type=locality&latlng=' + 
      req.body.location.lat + ',' + req.body.location.lng + '&key=' + GOOGLE_MAP_API_KEY;
  const [placeResult, localityResult] = await Promise.all([
    rp({ uri: placeUri, json: true }),
    rp({ uri: localityUri, json: true }),
  ]);
  const website = placeResult.result.website || '';
  const phone = placeResult.result.formatted_phone_number || '';
  const photoReferences = (placeResult.result.photos || []).map(photo => photo.photo_reference);
  const address = (placeResult.result.formatted_address || '').trim().replace(/-/g, '');
  const locality = localityResult.status === 'OK' ? localityResult.results[0].formatted_address.trim().replace(/-/g, '') : '';
  const leagues = [];
  const tournaments = [];
  Object.keys(req.body.sports).forEach((sport) => {
    Object.keys(req.body.sports[sport].leagues || []).forEach((league) => {
      leagues.push(league);
    });
    Object.keys(req.body.sports[sport].tournaments || []).forEach((tournament) => {
      tournaments.push(tournament);
    });
  });
  const newStadium = {
    googlePlaceId: placeId,
    name: req.body.name,
    opened: firestore.Timestamp.fromDate(new Date(req.body.opened)),
    location: new firestore.GeoPoint(req.body.location.lat, req.body.location.lng),
    locality: locality,
    address: address,
    phone: phone,
    website: website,
    sports: req.body.sports,
    architects: req.body.architects,
    leagues: leagues,
    tournaments: tournaments,
    photoReferences: photoReferences
  };
  const stadium = new Stadium();
  const docRef = await stadium.create(newStadium);
  const stadiumRecord = {
    name: stadium.name,
    league: leagues,
    tournaments: tournaments,
    objectID: docRef.id
  };
  await stadiumIndex.saveObject(stadiumRecord);
  return res.status(201).json(docRef.id);
});

router.delete('/:sid', verifyIdToken, async (req, res) => {
  const user = new User(req.user.uid);
  const userData = await user.get();
  if (userData.role !== 'admin') {
    return res.status(401).json({ message: 'Only admin can edit stadium' });
  }
  const stadium = new Stadium(req.params.sid);
  await stadium.delete();
  return res.json({ message: 'Deleted.' })
});

var processStadium = function (stadium) {
  var sports = Object.keys(stadium.sports);
  var tenants = {};
  sports.forEach((sport) => {
    Object.keys(stadium.sports[sport].leagues || {}).forEach((league) => {
      Object.keys(stadium.sports[sport].leagues[league] || {}).forEach(team => {
        tenants[team] = league;
      });
    });
  });
  var capacities = sports.map(sport => stadium.sports[sport].capacity)
  var capacity = Math.max.apply(Math, capacities);
  return Object.assign(stadium, {
    opened: stadium.opened.toDate(),
    capacity,
    location: {
      lat: stadium.location.latitude,
      lng: stadium.location.longitude
    },
    sports: sports,
    architects: Object.keys(stadium.architects),
    tenants: tenants
  })
};

var shuffle = function (array) {
  var currentIndex = array.length, temporaryValue, randomIndex;
  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
  return array;
}

module.exports = router;
