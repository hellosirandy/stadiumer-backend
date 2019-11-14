var express = require('express');
var router = express.Router();
var rp = require('request-promise');
const admin = require('firebase-admin');
const auth = admin.auth();
var FIREBASE_API_KEY = require('../../secrets').FIREBASE_API_KEY;
var processReviewData = require('./review').professReviewData;
const verifyIdToken = require('../middlewares').verifyIdToken;
const getThumbnail = require('../utils').getThumbnail;
const User = require('../models/user');
const Review = require('../models/review');
const Stadium = require('../models/stadium');

router.post('/', async (req, res) => {
  try {
    const payload = await rp.post({
      uri: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FIREBASE_API_KEY,
      form: {
        email: req.body.email,
        password: req.body.password,
        returnSecureToken: true
      },
      json: true
    });
    const token = payload.idToken;
    const expirationTime = Date.now() + Number(payload.expiresIn) * 1000;
    const refreshToken = payload.refreshToken;
    const user = new User(payload.localId);
    await user.create({
      firstName: req.body.firstName,
      lastName: req.body.lastName
    })
    return res.json({ token, expirationTime, refreshToken });
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.post('/signin', async (req, res) => {
  try {
    const payload = await rp.post({
      uri: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY,
      form: {
        email: req.body.email,
        password: req.body.password,
        returnSecureToken: true
      },
      json: true
    });
    return res.json({ 
      token: payload.idToken,
      expirationTime: Date.now() + Number(payload.expiresIn) * 1000,
      refreshToken: payload.refreshToken
    });
  } catch (e) {
    return res.status(401).json(e);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const payload = await rp.post({
      uri: 'https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY,
      form: {
        grant_type: 'refresh_token',
        refresh_token: req.body.refreshToken,
      },
      json: true
    });
    return res.json({
      token: payload.access_token,
      expirationTime: Date.now() + Number(payload.expires_in) * 1000,
      refreshToken: payload.refresh_token
    });
  } catch (e) {
    return res.status(401).json(e);
  }
});

router.get('/profile/:userId', (req, res) => {
  getUser(req.params.userId, async (err, result) => {
    if (err) {
      return res.status(400).json(err);
    }
    try {
      const decodedIdToken = await auth.verifyIdToken(req.headers.authorization || '');
      const user = new User(decodedIdToken.uid);
      result.following = await user.checkFollowing(req.params.userId);
      return res.json(result);
    } catch (e) {
      result.following = false;
      return res.json(result);
    }
  });
});

router.post('/batchPreview', async (req, res) => {
  try {
    const users = await Promise.all((req.body.ids || []).map(async id => {
      const user = new User(id);
      const data = await user.get();
      return {
        name: data.firstName + ' ' + data.lastName,
        profilePic: data.profilePic,
        id: data.id
      }
    }));
    return res.json(users);
  } catch (e) {
    return res.status(400).json(e);
  }
});

router.put('/', verifyIdToken, async (req, res) => {
  try {
    const user = new User(req.user.uid);
    const data = await user.update(req.body);
    return res.status(201).json(Object.assign(data, {
      profilePic: await getThumbnail(req.user.uid, data.profilePic),
    }));
  } catch (e) {
    return res.status(400).json({message: e.toString()});
  }
})

router.get('/', verifyIdToken, async (req, res) => {
  const uid = req.user.uid;
  return getUser(uid, (err, result) => {
    if (err) {
      return res.status(400).json(err);
    }
    return res.json(result);
  });
});

router.get('/resetPassword', verifyIdToken, async (req, res) => {
  try {
    await rp.post({
      uri: 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FIREBASE_API_KEY,
      form: {
        email: req.user.email,
        requestType: 'PASSWORD_RESET'
      },
      json: true
    });
    return res.json({ message: 'Success.' });
  } catch (e) {
    console.log(e);
    return res.status(401).json(e);
  }
});

const getUser = async (uid, callback) => {
  try {
    const [profile, reviews, follow] = await Promise.all([
      new Promise(async (resolve, reject) => {
        try {
          const user = new User(uid);
          const data = await user.get();
          resolve(Object.assign(data, {
            id: uid,
            profilePic: await getThumbnail(uid, data.profilePic)
          }))
        } catch (e) {
          console.log(e);
          reject(e);
        }
      }),
      new Promise(async (resolve, reject) => {
        try {
          const user = new User(uid);
          const rids = await user.getReviewsIds();
          const reviewDatas = await Promise.all(rids.map(rid => new Review(rid).get()));
          const stadiumids = Array.from(new Set(reviewDatas.map((review) => {
            return review.stadiumId;
          })));
          const stadiumsArray = await Promise.all(stadiumids.map((sid) => {
            const stadium = new Stadium(sid);
            return stadium.get();
          }));
          const stadiums = {};
          stadiumids.forEach((sid, idx) => {
            stadiums[sid] = stadiumsArray[idx];
          });
          const reviews = Promise.all(reviewDatas.map((review) => {
            return processReviewData(review, { stadium: stadiums[review.stadiumId] });
          }));
          resolve(reviews);
        } catch (e) {
          console.log(e)
          reject(e);
        }
      }),
      new Promise(async (resolve) => {
        const user = new User(uid);
        const [following, followers] = await Promise.all([
          user.getFollow('following'),
          user.getFollow('followers')
        ]);
        const uids = Array.from(new Set(following.concat(followers)));
        const usersArray = await Promise.all(uids.map(async (uid) => {
          const user = new User(uid);
          const data = await user.get();
          return {
            name: data.firstName + ' ' + data.lastName,
            profilePic: await getThumbnail(uid, data.profilePic),
            id: data.id
          };
        }));
        const users = {};
        uids.forEach((uid, idx) => {
          users[uid] = usersArray[idx];
        });
        const resultFollowing = {};
        const resultFollowers = {};
        following.forEach((uid) => {
          resultFollowing[uid] = users[uid];
        });
        followers.forEach((uid) => {
          resultFollowers[uid] = users[uid];
        });
        resolve({
          following: resultFollowing,
          followers: resultFollowers
        });
      })
    ]);
    return callback(null, { profile, reviews, follow, id: uid });
  } catch (e) {
    return callback(e);
  }
}

module.exports = router;
