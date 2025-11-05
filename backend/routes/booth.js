const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { getDB } = require('../database');
const { verifyToken, extractSecret } = require('../utils/jwt');
const { generateQRData, verifyQRData, encrypt, decrypt } = require('../utils/encryption');

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

// 부스 QR 코드 생성 (관리자용 - 인증 없이 접근 가능하도록 임시 처리)
router.post('/generate-qr', async (req, res) => {
  try {
    const { boothCode } = req.body;

    if (!boothCode) {
      return res.status(400).json({
        success: false,
        message: '부스 코드가 필요합니다.'
      });
    }

    const encryptedData = generateQRData(boothCode);
    const qrUrl = `${req.protocol}://${req.get('host')}/app/event/?data=${encodeURIComponent(encryptedData)}`;

    // QR 코드 이미지 생성
    const qrImage = await QRCode.toDataURL(qrUrl);

    res.json({
      success: true,
      qrImage,
      qrUrl,
      encryptedData
    });
  } catch (error) {
    console.error('QR 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: 'QR 코드 생성 중 오류가 발생했습니다.'
    });
  }
});

// 부스 스캔 처리
router.post('/scan', authenticate, (req, res) => {
  try {
    const { encryptedData } = req.body;

    if (!encryptedData) {
      return res.status(400).json({
        success: false,
        message: 'QR 코드 데이터가 필요합니다.'
      });
    }

    // QR 데이터 검증 (시간 제한 없음)
    const verification = verifyQRData(encryptedData);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.error || 'QR 코드가 유효하지 않습니다.'
      });
    }

    const { boothCode } = verification.data;
    const db = getDB();

    // 사용자 정보 조회
    db.get('SELECT id FROM users WHERE token_secret = ?', [req.tokenSecret], (err, user) => {
      if (err || !user) {
        return res.status(500).json({
          success: false,
          message: '사용자를 찾을 수 없습니다.'
        });
      }

      // 이미 참여한 부스인지 확인
      db.get(`SELECT id FROM booth_participations 
              WHERE user_id = ? AND booth_code = ?`,
        [user.id, boothCode], (err, existing) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
          });
        }

        if (existing) {
          return res.json({
            success: true,
            message: '이미 참여한 부스입니다.',
            alreadyParticipated: true
          });
        }

        // 참여 기록 저장
        db.run(`INSERT INTO booth_participations (user_id, booth_code, qr_data)
                VALUES (?, ?, ?)`,
          [user.id, boothCode, encryptedData],
          function(err) {
            if (err) {
              return res.status(500).json({
                success: false,
                message: '참여 기록 저장 중 오류가 발생했습니다.'
              });
            }

            res.json({
              success: true,
              message: '부스 참여가 완료되었습니다.',
              boothCode
            });
          }
        );
      });
    });
  } catch (error) {
    console.error('부스 스캔 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 사용자 부스 참여 현황 조회
router.get('/participation', authenticate, (req, res) => {
  const db = getDB();

  db.get('SELECT id FROM users WHERE token_secret = ?', [req.tokenSecret], (err, user) => {
    if (err || !user) {
      return res.status(500).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    db.all(`SELECT booth_code, scanned_at FROM booth_participations
            WHERE user_id = ? ORDER BY scanned_at`,
      [user.id], (err, participations) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.'
          });
        }

        const boothCodes = participations.map(p => p.booth_code);
        const eligible = boothCodes.length >= 3;

        res.json({
          success: true,
          participations: boothCodes,
          count: boothCodes.length,
          eligible // 경품 지급 자격 여부
        });
      }
    );
  });
});

// 경품 수령용 QR 생성
router.post('/generate-prize-qr', authenticate, (req, res) => {
  try {
    const db = getDB();

    db.get('SELECT id FROM users WHERE token_secret = ?', [req.tokenSecret], (err, user) => {
      if (err || !user) {
        return res.status(500).json({
          success: false,
          message: '사용자를 찾을 수 없습니다.'
        });
      }

      // 참여한 부스 확인 (3개 이상)
      db.all(`SELECT booth_code FROM booth_participations WHERE user_id = ?`,
        [user.id], async (err, participations) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '서버 오류가 발생했습니다.'
            });
          }

          if (participations.length < 3) {
            return res.status(400).json({
              success: false,
              message: '경품 수령 자격이 없습니다. (3개 이상의 부스 참여 필요)'
            });
          }

          // 경품 수령용 QR 데이터 생성
          const prizeData = {
            userId: user.id,
            tokenSecret: req.tokenSecret,
            timestamp: Date.now(),
            booths: participations.map(p => p.booth_code)
          };

          const encryptedData = encrypt(JSON.stringify(prizeData));
          const qrUrl = `${req.protocol}://${req.get('host')}/app/admin/prize-claim?data=${encodeURIComponent(encryptedData)}`;

          QRCode.toDataURL(qrUrl, (err, qrImage) => {
            if (err) {
              return res.status(500).json({
                success: false,
                message: 'QR 코드 생성 중 오류가 발생했습니다.'
              });
            }

            res.json({
              success: true,
              qrImage,
              qrUrl,
              encryptedData
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('경품 QR 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;

