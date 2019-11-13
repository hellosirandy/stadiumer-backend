var express = require('express');
var rp = require('request-promise');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
const db = require('firebase-admin').firestore();
const GOOGLE_MAP_API_KEY = require('../../secrets').GOOGLE_API_KEY;
const verifyIdToken = require('../middlewares').verifyIdToken;
const algoliasearch = require('algoliasearch');
const algoliaAPIKEY = require('../../secrets').ALGOLIA_API_KEY;
const client = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = client.initIndex('stadium');

var leagueSportMap = {
  MLB: 'baseball',
  NFL: 'football',
  'Premier League': 'soccer',
  'La Liga': 'soccer',
  NHL: 'hockey',
  MLS: 'soccer',
  NBA: 'basketball'
}

var tournamentSportMap = {
  'UEFA Euro 2016': 'soccer'
}

router.get('/', async (req, res) => {
  const limit = Number(req.query.limit) || 0;
  if (req.query.id) {
    const docSnapshot = await db.collection('stadium').doc(req.query.id).get();
    const stadium = processStadium(docSnapshot);
    stadium.recommendations = await getRecommendation(stadium);
    stadium.rating = await getRating(req.query.id);
    return res.json(stadium);
  } else if (req.query.league || req.query.tournament) {
    const type = decodeURIComponent(req.query.league ? 'leagues' : 'tournaments');
    const results = await getByLeagueOrTournament(type, req.query.league || req.query.tournament, limit);
    return res.json(results);
  }
  return res.status(400).json({ message: 'Invalid request.' });
});

var getRecommendation = (stadium) => {
  return db.collection('stadium').limit(6).where(`sports.${stadium.sports[0]}.capacity`, '>', 0).get().then((querySnapshot) => {
    var recommendations = querySnapshot.docs.filter((doc) => {
      return doc.id !== stadium.id;
    }).map(processStadium);
    return recommendations;
  });
}

router.get('/detail/:stadiumId', async (req, res) => {
  console.log(req.params.stadiumId);
  const docSnapshot = await db.collection('stadium').doc(req.params.stadiumId).get();
  const stadium = processStadium(docSnapshot);
  const [rating, recommendations] = await Promise.all([
    getRating(req.params.stadiumId),
    getRecommendation(stadium)
  ]);
  return res.json({
    rating,
    recommendations
  });
});

router.get('/firstload', async (req, res) => {
  const leagues = shuffle(Object.keys(leagueSportMap));
  const [recommended, league1, league2, count] = await Promise.all([
    new Promise(async (resolve) => {
      const querySnapshot = await db.collection('stadium').limit(8).get()
      resolve(querySnapshot.docs.map((doc) => {
        return processStadium(doc);
      }));
    }),
    getByLeagueOrTournament('leagues', leagues[0]),
    getByLeagueOrTournament('leagues', leagues[1]),
    new Promise(async (resolve) => {
      const docSnapshot = await db.collection('counter').doc('stadium').get();
      resolve(docSnapshot.data().count);
    })
  ]);
  return res.json({
    groupStadiums: {
      Recommended: recommended,
      [leagues[0]]: league1,
      [leagues[1]]: league2,
    },
    count
  });
});

router.post('/', verifyIdToken, async (req, res) => {
  const docSnapshot = await db.collection('user').doc(req.user.uid).get();
  if (docSnapshot.data().role !== 'admin') {
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
  const stadium = {
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
  const docRef = await db.collection('stadium').add(stadium);
  const stadiumRecord = {
    name: stadium.name,
    league: leagues,
    tournaments: tournaments,
    objectID: docRef.id
  };
  await stadiumIndex.saveObject(stadiumRecord);
  return res.status(201).json(docRef.id);
});

router.delete('/:stadiumId', verifyIdToken, async (req, res) => {
  const docSnapshot = await db.collection('user').doc(req.user.uid).get();
  if (docSnapshot.data().role !== 'admin') {
    return res.status(401).json({ message: 'Only admin can edit stadium' });
  }
  await db.collection('stadium').doc(req.params.stadiumId).delete();
  return res.json({ message: 'Deleted.' })
});

var processStadium = function (doc) {
  var data = doc.data();
  var sports = Object.keys(data.sports);
  var tenants = {};
  sports.forEach((sport) => {
    Object.keys(data.sports[sport].leagues || {}).forEach((league) => {
      Object.keys(data.sports[sport].leagues[league] || {}).forEach(team => {
        tenants[team] = league;
      });
    });
  });
  var capacities = sports.map(sport => data.sports[sport].capacity)
  var capacity = Math.max.apply(Math, capacities);
  return Object.assign(data, {
    id: doc.id,
    opened: data.opened.toDate(),
    capacity,
    location: {
      lat: data.location.latitude,
      lng: data.location.longitude
    },
    sports: sports,
    architects: Object.keys(data.architects),
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

var getByLeagueOrTournament = function (type, value, limit=8) {
  return db.collection('stadium').limit(limit).where(type, 'array-contains', value).get()
  .then((querySnapshot) => {
    return querySnapshot.docs.map((doc) => {
      return processStadium(doc);
    });
  });
}

var getRating = function (stadiumId) {
  return db.collection('rating').doc(stadiumId).get().then((docSnapshot) => {
    if (docSnapshot.exists) {
      var data = docSnapshot.data();
      return {
        rating: data.rating / data.count,
        count: data.count
      };
    }
    return {
      rating: 0,
      count: 0
    };
  });
}

module.exports = router;
