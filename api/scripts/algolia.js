const algoliasearch = require('algoliasearch');
const admin = require("firebase-admin");
const serviceAccount = require('../../secrets').firebaseAdmin;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stadiumer-a6302.firebaseio.com",
  storageBucket: 'stadiumer-a6302.appspot.com'
});
const firestore = admin.firestore;
const db = firestore();
const algoliaAPIKEY = require('../../secrets').ALGOLIA_API_KEY;

const client = algoliasearch('U596FP80VW', algoliaAPIKEY);
const stadiumIndex = client.initIndex('stadium');
const userIndex = client.initIndex('user');

new Promise(async () => {
  const querySnapshot = await db.collection('stadium').get();
  const stadiumRecords = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      name: data.name,
      league: data.leagues || [],
      tournaments: data.tournaments || [],
      objectID: doc.id
    };
  });
  const {objectIDs} = await stadiumIndex.saveObjects(stadiumRecords);
});

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

// db.collection('user').get().then(querySnapshot => {
//   const userRecords = querySnapshot.docs.map(doc => {
//     const data = doc.data();
//     return {
//       name: `${data.firstName} ${data.lastName}`,
//       objectID: doc.id
//     };
//   });
//   return userIndex.saveObjects(userRecords);
// }).then(({objectIDs}) => {
//   console.log(objectIDs);
// }).catch(err => {
//   console.log(err);
// });