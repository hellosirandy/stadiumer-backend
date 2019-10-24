const algoliasearch = require('algoliasearch');
const db = require('../firebase').db;
const async = require('async');
const algoliaAPIKEY = require('../secrets').ALGOLIA_API_KEY;

const client = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = client.initIndex('stadium');

const objects = [{
  objectID: 1,
  name: 'Foo'
}];

db.collection('stadium').get().then(querySnapshot => {
  const stadiumRecords = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      name: data.name,
      league: data.leagues || [],
      objectID: doc.id
    };
  });
  return stadiumIndex.saveObjects(stadiumRecords);
}).then(({objectIDs}) => {
  console.log(objectIDs);
}).catch(err => {
  console.log(err);
});