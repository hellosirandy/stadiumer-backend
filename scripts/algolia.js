const algoliasearch = require('algoliasearch');
const db = require('../firebase').db;
const async = require('async');
const algoliaAPIKEY = require('../secrets').ALGOLIA_API_KEY;

const client = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = client.initIndex('stadium');
const userIndex = client.initIndex('user');

// db.collection('stadium').get().then(querySnapshot => {
//   const stadiumRecords = querySnapshot.docs.map(doc => {
//     const data = doc.data();
//     return {
//       name: data.name,
//       league: data.leagues || [],
//       objectID: doc.id
//     };
//   });
//   return stadiumIndex.saveObjects(stadiumRecords);
// }).then(({objectIDs}) => {
//   console.log(objectIDs);
// }).catch(err => {
//   console.log(err);
// });

db.collection('user').get().then(querySnapshot => {
  const userRecords = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      name: `${data.firstName} ${data.lastName}`,
      objectID: doc.id
    };
  });
  return userIndex.saveObjects(userRecords);
}).then(({objectIDs}) => {
  console.log(objectIDs);
}).catch(err => {
  console.log(err);
});