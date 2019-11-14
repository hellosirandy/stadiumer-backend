const firebase = require('firebase-admin');
const db = firebase.firestore();

class Review {
  constructor(rid) {
    this.rid = rid;
  }

  get id() {
    return this.rid;
  }

  async get() {
    const docSnapshot = await db.collection('reviews').doc(this.rid).get();
    if (!docSnapshot.exists) {
      return null;
    }
    return Object.assign(docSnapshot.data(), { id: this.rid });
  }

  async create(body) {
    const docRef = await db.collection('reviews').add(body);
    this.rid = docRef.id;
  }

  delete() {
    return db.collection('reviews').doc(this.rid).delete();
  }
}

module.exports = Review;