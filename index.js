const functions = require('firebase-functions');
const admin = require("firebase-admin");
const serviceAccount = require('./secrets').firebaseAdmin;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stadiumer-a6302.firebaseio.com",
  storageBucket: 'stadiumer-a6302.appspot.com'
});
const firestore = admin.firestore;
const db = firestore();
const app = require('./api/app');

exports.api = functions.https.onRequest(app);

exports.stadiumWriteListener = functions.firestore.document('stadium/{stadiumId}').onWrite(async (change, context) => {

  if (!change.before.exists || !change.after.exists) {
    const querySnapshot = await db.collection('stadium').get();
    return db.collection('counter').doc('stadium').update({
      count: querySnapshot.size
    });
  }
  return 0;
});

exports.reviewWriteListener = functions.firestore.document('review/{reviewId}').onWrite((change, context) => {

  if (!change.before.exists) {
    const data = change.after.data();
    const { stadiumId } = data;
    return db.collection('rating').doc(stadiumId).get().then((docSnapshot) => {
      if (docSnapshot.exists) {
        return db.collection('rating').doc(stadiumId).update({
          rating: firestore.FieldValue.increment(data.rating),
          count: firestore.FieldValue.increment(1)
        })
      }
      return db.collection('rating').doc(stadiumId).set({
        rating: data.rating,
        count: 1
      })
    });

  } else if (change.before.exists && change.after.exists) {
    // Updating existing document : Do nothing

  } else if (!change.after.exists) {
    const data = change.before.data();
    const { stadiumId } = data;
    return db.collection('rating').doc(stadiumId).get().then((docSnapshot) => {
      if (docSnapshot.exists) {
        return db.collection('rating').doc(stadiumId).update({
          rating: firestore.FieldValue.increment(-data.rating),
          count: firestore.FieldValue.increment(-1)
        })
      }
      return 0;
    });
  }
  return 0;
});