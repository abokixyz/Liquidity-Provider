import crypto from 'crypto';

class CryptoService {
  private algorithm = 'aes-256-gcm';
  private secretKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY not found in environment variables');
    }
    this.secretKey = crypto.scryptSync(key, 'salt', 32);
  }

  // Encrypt sensitive data like private keys
  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv) as crypto.CipherGCM;
      cipher.setAAD(Buffer.from('wallet-encryption', 'utf8'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv) as crypto.DecipherGCM;
      decipher.setAAD(Buffer.from('wallet-encryption', 'utf8'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  // Generate secure random private key for testing
  generateSecureHex(length: number = 64): string {
    return crypto.randomBytes(length / 2).toString('hex');
  }

  // Hash sensitive data for comparison
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

export default new CryptoService();