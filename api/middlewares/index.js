const auth = require('firebase-admin').auth();

exports.verifyIdToken = async (req, res, next) => {
  try {
    req.user = await auth.verifyIdToken(req.headers.authorization || '');
    return next();
  } catch (e) {
    return res.status(401).json(e);
  }
}