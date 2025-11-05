const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'kb-tech-forum-secret-key-change-in-production';
const TOKEN_EXPIRY = '90d'; // 3개월

// JWT 토큰 생성 (userid 등 정보 포함하지 않음)
function generateToken(userId) {
  // 토큰에는 사용자 정보를 포함하지 않고, 랜덤한 secret만 저장
  const tokenSecret = crypto.randomBytes(32).toString('hex');
  
  // DB에 token_secret 저장은 별도로 처리
  return {
    token: jwt.sign({ secret: tokenSecret }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }),
    secret: tokenSecret
  };
}

// JWT 토큰 검증
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// 토큰에서 secret 추출
function extractSecret(token) {
  const decoded = verifyToken(token);
  return decoded ? decoded.secret : null;
}

module.exports = {
  generateToken,
  verifyToken,
  extractSecret,
  TOKEN_EXPIRY
};

