var express = require('express');
var router = express.Router();
var algoliasearch = require('algoliasearch');
var algoliaAPIKEY = require('../../secrets').ALGOLIA_API_KEY;
var algoliaClient = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = algoliaClient.initIndex('stadium');
const userIndex = algoliaClient.initIndex('user');

router.get('/', async (req, res) => {
  var type = req.query.type || 'stadium';
  var index = stadiumIndex;
  if (type === 'user') {
    index = userIndex;
  }
  const response = await index.search({ query: req.query.value });
  return res.json(response.hits.map(obj => {
    return {
      name: obj.name,
      id: obj.objectID
    };
  }));
});

module.exports = router;
