const firebase = require('firebase-admin');
const db = firebase.firestore();

class Stadium {
  constructor(sid) {
    this.sid = sid;
    this.leagues = null;
    this.tournaments = null;
  }

  async get() {
    const docSnapshot = await db.collection('stadiums').doc(this.sid).get();
    if (!docSnapshot.exists) {
      throw String('Invalid Stadium ID');
    }
    const data = docSnapshot.data();
    this.leagues = data.leagues;
    this.tournaments = data.tournaments;
    return Object.assign(data, { id: this.sid });
  }

  create(data) {
    return db.collection('stadiums').add(data);
  }

  delete() {
    return db.collection('stadiums').doc(this.sid).delete();
  }

  addReview(rid, timestamp) {
    return db.collection('stadiums').doc(this.sid).collection('reviews').doc(rid).set({ timestamp });
  }

  removeReview(rid) {
    return db.collection('stadiums').doc(this.sid).collection('reviews').doc(rid).delete();
  }

  async getReviewsIds() {
    const querySnapshot = await db.collection('stadiums').doc(this.sid).collection('reviews').get();
    return querySnapshot.docs.map(doc => doc.id);
  }

  async getRecommendations() {
    if (!this.leagues) {
      await this.get();
    }
    if (this.leagues.length > 0) {
      const querySnapshot = await db.collection('stadiums').limit(6).where('leagues', 'array-contains', this.leagues[0]).get();
      return querySnapshot.docs.map(doc => Object.assign(doc.data(), { id: doc.id }));
    } else if (this.tournaments.length > 0) {
      const querySnapshot = await db.collection('stadiums').limit(6).where('tournaments', 'array-contains', this.tournaments[0]).get();
      return querySnapshot.docs.map(doc => Object.assign(doc.data(), { id: doc.id }));
    }
    return [];
  }
}

module.exports = Stadium;