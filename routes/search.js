var express = require('express');
var router = express.Router();
var algoliasearch = require('algoliasearch');
var algoliaAPIKEY = require('../secrets').ALGOLIA_API_KEY;
var algoliaClient = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = algoliaClient.initIndex('stadium');
const userIndex = algoliaClient.initIndex('user');

router.get('/', function (req, res) {
  var type = req.query.type || 'stadium';
  var index = stadiumIndex;
  if (type === 'user') {
    index = userIndex;
  }
  index.search({ query: req.query.value }).then(function (response) {
    res.json(response.hits.map(function (obj) {
      return {
        name: obj.name,
        id: obj.objectID
      };
    }));
  });
});

module.exports = router;
