const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'kb-tech-forum-encryption-key-32-chars';
const ALGORITHM = 'aes-256-cbc';

// 32바이트 키 생성 (기존 키가 32자 미만이면 패딩)
function getKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

// 암호화
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 복호화
function decrypt(encryptedText) {
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}

// QR 코드 데이터 생성 (부스코드만 포함 - 고정 QR)
function generateQRData(boothCode) {
  const data = JSON.stringify({
    boothCode
  });
  return encrypt(data);
}

// QR 코드 데이터 복호화 및 검증 (시간 제한 없음)
function verifyQRData(encryptedData) {
  try {
    const decrypted = decrypt(encryptedData);
    if (!decrypted) {
      return { valid: false, error: 'QR 코드 데이터가 유효하지 않습니다.' };
    }

    const data = JSON.parse(decrypted);
    
    // 부스 코드가 있는지 확인
    if (!data.boothCode) {
      return { valid: false, error: 'QR 코드에 부스 정보가 없습니다.' };
    }

    return { valid: true, data };
  } catch (error) {
    return { valid: false, error: 'QR 코드 데이터가 유효하지 않습니다.' };
  }
}

module.exports = {
  encrypt,
  decrypt,
  generateQRData,
  verifyQRData
};

