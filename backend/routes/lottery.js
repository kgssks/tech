const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const crypto = require('crypto');
const { getDB } = require('../database');
const { verifyToken } = require('../utils/jwt');
const { encrypt, decrypt } = require('../utils/encryption');

// 사용자 인증 미들웨어
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['kb-auth'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: '인증 토큰이 필요합니다.'
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
  req.userRole = decoded.role || 'user';
  next();
}

// 관리자 인증 미들웨어
function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['kb-auth'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: '관리자 토큰이 필요합니다.'
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'kb-tech-forum-secret-key-change-in-production';

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '유효하지 않은 관리자 토큰입니다.'
    });
  }
}

// 현장 참여 QR 생성 (관리자 전용)
router.post('/generate-qr', verifyAdmin, async (req, res) => {
  try {
    const validMinutes = parseInt(req.body?.validMinutes, 10);
    const now = Date.now();
    const expiresAt = now + (isNaN(validMinutes) || validMinutes <= 0 ? 1000 * 60 * 60 * 12 : validMinutes * 60 * 1000);

    const payload = {
      type: 'lottery_access',
      issuedAt: now,
      expiresAt,
      nonce: crypto.randomBytes(12).toString('hex')
    };

    const encryptedData = encrypt(JSON.stringify(payload));
    if (!encryptedData) {
      throw new Error('QR 데이터 생성에 실패했습니다.');
    }

    const qrUrl = `${req.protocol}://${req.get('host')}/app/event/lottery/?data=${encodeURIComponent(encryptedData)}`;
    const qrImage = await QRCode.toDataURL(qrUrl);

    res.json({
      success: true,
      qrImage,
      qrUrl,
      encryptedData,
      payload
    });
  } catch (error) {
    console.error('현장 참여 QR 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '현장 참여 QR 생성 중 오류가 발생했습니다.'
    });
  }
});

// 추첨번호 발급 (현장 참여 QR을 스캔한 사용자가 호출)
router.post('/issue', authenticate, (req, res) => {
  const db = getDB();
  const { qrData } = req.body || {};

  if (!qrData) {
    return res.status(400).json({
      success: false,
      message: 'QR 데이터가 필요합니다.'
    });
  }

  let payload = null;
  try {
    const decrypted = decrypt(qrData);
    if (!decrypted) {
      throw new Error('QR 데이터 복호화 실패');
    }
    payload = JSON.parse(decrypted);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: '유효하지 않은 QR 코드입니다.'
    });
  }

  if (!payload || payload.type !== 'lottery_access') {
    return res.status(400).json({
      success: false,
      message: '유효하지 않은 QR 코드입니다.'
    });
  }

  if (payload.expiresAt && Date.now() > payload.expiresAt) {
    return res.status(400).json({
      success: false,
      message: 'QR 코드 유효 기간이 만료되었습니다.'
    });
  }

  db.serialize(() => {
    db.get(`SELECT id, empname, deptname, posname FROM users WHERE token_secret = ?`,
      [req.tokenSecret],
      (err, user) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: '사용자 조회 중 오류가 발생했습니다.'
          });
        }

        if (!user) {
          return res.status(404).json({
            success: false,
            message: '사용자 정보를 찾을 수 없습니다.'
          });
        }

        db.get('SELECT lottery_number FROM lottery_numbers WHERE user_id = ?', [user.id], (err, existing) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '추첨번호 조회 중 오류가 발생했습니다.'
            });
          }

          if (existing) {
            return res.json({
              success: true,
              alreadyIssued: true,
              lotteryNumber: existing.lottery_number,
              user: {
                empname: user.empname,
                deptname: user.deptname,
                posname: user.posname
              }
            });
          }

          db.get('SELECT MAX(lottery_number) as maxNumber FROM lottery_numbers', (err, result) => {
            if (err) {
              return res.status(500).json({
                success: false,
                message: '추첨번호 생성 중 오류가 발생했습니다.'
              });
            }

            const nextNumber = (result && result.maxNumber ? result.maxNumber : 0) + 1;

            db.run('INSERT INTO lottery_numbers (user_id, lottery_number) VALUES (?, ?)',
              [user.id, nextNumber],
              function (insertErr) {
                if (insertErr) {
                  return res.status(500).json({
                    success: false,
                    message: '추첨번호 저장 중 오류가 발생했습니다.'
                  });
                }

                res.json({
                  success: true,
                  alreadyIssued: false,
                  lotteryNumber: nextNumber,
                  user: {
                    empname: user.empname,
                    deptname: user.deptname,
                    posname: user.posname
                  }
                });
              }
            );
          });
        });
      }
    );
  });
});

module.exports = router;


