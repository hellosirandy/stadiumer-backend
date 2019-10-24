var express = require('express');
var rp = require('request-promise');
var router = express.Router();
var firestore = require('firebase-admin').firestore;
var async = require('async');
var algoliasearch = require('algoliasearch');
var db = require('../firebase').db;
var GOOGLE_MAP_API_KEY = require('../secrets').GOOGLE_API_KEY;
var algoliaAPIKEY = require('../secrets').ALGOLIA_API_KEY;
var algoliaClient = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = algoliaClient.initIndex('stadium');

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

router.get('/', function(req, res) {
  var limit = Number(req.query.limit) || 0;
  if (req.query.id) {
    var stadium;
    db.collection('stadium').doc(req.query.id).get().then(function (docSnapshot) {
      stadium = processStadium(docSnapshot);
      return getRecommendation(stadium);
    }).then(function (recommendations) {
      stadium.recommendations = recommendations;
      return getRating(req.query.id);
    }).then(function (rating) {
      stadium.rating = rating;
      res.json(stadium);
    });
    return;
  } else if (req.query.league || req.query.tournament) {
    var type = req.query.league ? 'leagues' : 'tournaments';
    type = decodeURIComponent(type);
    getByLeagueOrTournament(type, req.query.league || req.query.tournament, limit).then(function (results) {
      res.json(results);
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

var getRecommendation = function (stadium) {
  return db.collection('stadium').limit(6).where(`sports.${stadium.sports[0]}.capacity`, '>', 0).get().then(function (querySnapshot) {
    var recommendations = querySnapshot.docs.filter(function (doc) {
      return doc.id !== stadium.id;
    }).map(processStadium);
    return recommendations;
  });
}

router.get('/detail/:stadiumId', function (req, res) {
  db.collection('stadium').doc(req.params.stadiumId).get().then(function (docSnapshot) {
    var stadium = processStadium(docSnapshot);
    var parallelFunctions = {
      rating: function (callback) {
        getRating(req.params.stadiumId).then(function (rating) {
          callback(null, rating);
        }).catch(callback);
      },
      recommendations: function (callback) {
        getRecommendation(stadium).then(function (recommendations) {
          callback(null, recommendations);
        }).catch(callback);
      }
    }
    async.parallel(parallelFunctions, function (err, results) {
      res.json(results);
    });
  });
});

router.get('/firstload', function (req, res) {
  var results = {};
  var leagues = shuffle(Object.keys(leagueSportMap));
  async.parallel({
    Recommended: function (callback) {
      db.collection('stadium').limit(12).get().then(function (querySnapshot) {
        callback(null, querySnapshot.docs.map(function (doc) {
          return processStadium(doc);
        })); 
      }).catch(function (err) {
        callback(err);
      });
    },
    [leagues[0]]: function (callback) {
      getByLeagueOrTournament('leagues', leagues[0]).then(function (result) {
        callback(null, result);
      }).catch(function (err) {
        callback(err);
      });;
    },
    [leagues[1]]: function (callback) {
      getByLeagueOrTournament('leagues', leagues[1]).then(function (result) {
        callback(null, result);
      }).catch(function (err) {
        callback(err);
      });;
    }
  }, function (err, result) {
    if (err) {
      return res.status(400).json(err);
    }
    res.json(result);
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
    var tournaments = [];
    Object.keys(req.body.sports).forEach(function (sport) {
      Object.keys(req.body.sports[sport].leagues || []).forEach(function (league) {
        leagues.push(league);
      });
      Object.keys(req.body.sports[sport].tournaments || []).forEach(function (tournament) {
        tournaments.push(tournament);
      });
    });
    var stadium = {
      name: req.body.name,
      opened: firestore.Timestamp.fromDate(new Date(req.body.opened)),
      location: new firestore.GeoPoint(req.body.location.lat, req.body.location.lon),
      locality: locality,
      address: address,
      phone: phone,
      website: website,
      sports: req.body.sports,
      architects: req.body.architects,
      cover: req.body.cover,
      leagues: leagues,
      tournaments: tournaments
    };
    return db.collection('stadium').add(stadium).then();
  }).then(function (docRef) {
    res.status(201).json(docRef.id);
  }).catch(function (err) {
    console.log(err);
  });
});

router.delete('/:stadiumId', function (req, res) {
  db.collection('stadium').doc(req.params.stadiumId).delete().then(function (writeResult) {
    res.json(writeResult);
  }).catch(function (err) {
    res.status(400).json(err);
  })
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
    opened: data.opened.toDate(),
    capacity,
    location: {
      lat: data.location.latitude,
      lon: data.location.longitude
    },
    sports: sports,
    architects: Object.keys(data.architects),
    tenants: tenants
  }
};

router.get('/search', function (req, res) {
  stadiumIndex.search({ query: req.query.value }).then(function (response) {
    res.json(response.hits.map(function (stadium) {
      return {
        name: stadium.name,
        id: stadium.objectID
      };
    }));
  });
});

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

var getByLeagueOrTournament = function (type, value, limit=6) {
  return db.collection('stadium').limit(limit).where(type, 'array-contains', value).get()
  .then(function (querySnapshot) {
    return querySnapshot.docs.map(function (doc) {
      return processStadium(doc);
    });
  });
}

var getRating = function (stadiumId) {
  return db.collection('rating').doc(stadiumId).get().then(function (docSnapshot) {
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
