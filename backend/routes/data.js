const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { verifyToken, extractSecret } = require('../utils/jwt');

// 인증 미들웨어
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['kb-auth'];
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: '인증 토큰이 없습니다.'
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: '인증 토큰이 만료되었습니다. 다시 로그인해주세요.'
    });
  }

  req.tokenSecret = decoded.secret;
  next();
}

// 사용자 정보 조회
router.get('/user', authenticate, (req, res) => {
  const db = getDB();

  db.get('SELECT * FROM users WHERE token_secret = ?', [req.tokenSecret], (err, user) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      user: {
        empname: user.empname,
        deptname: user.deptname,
        posname: user.posname,
        empno: user.empno
      }
    });
  });
});

// 경품 추첨 번호 조회
router.get('/lottery-number', authenticate, (req, res) => {
  const db = getDB();

  db.get(`SELECT ln.lottery_number 
           FROM lottery_numbers ln
           JOIN users u ON ln.user_id = u.id
           WHERE u.token_secret = ?`, [req.tokenSecret], (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      lotteryNumber: result ? result.lottery_number : null
    });
  });
});

module.exports = router;

