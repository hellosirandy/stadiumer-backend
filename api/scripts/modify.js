const GOOGLE_MAP_API_KEY = require('../../secrets').GOOGLE_API_KEY;
const admin = require("firebase-admin");
const serviceAccount = require('../../secrets').firebaseAdmin;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stadiumer-a6302.firebaseio.com",
  storageBucket: 'stadiumer-a6302.appspot.com'
});
const rp = require('request-promise');
const firestore = admin.firestore;
const db = firestore();

const modify = async () => {
  const reviewQuerySnapshot = await db.collection('review').get();
  await Promise.all(reviewQuerySnapshot.docs.map(async reviewDoc => {
    const reviewData = reviewDoc.data();
    await db.collection('user').doc(reviewData.author).collection('reviews').doc(reviewDoc.id).set({});
  }));
}

modify();