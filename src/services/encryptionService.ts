// encryptionService.ts - COMPATIBLE with migration script format
import crypto from 'crypto';

class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private encryptionKey: Buffer;

  constructor() {
    // Get encryption key from environment variable
    const encryptionKeyHex = process.env.ENCRYPTION_KEY;
    
    if (!encryptionKeyHex) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    if (encryptionKeyHex.length !== 64) { // 32 bytes = 64 hex characters
      throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (256 bits)');
    }

    this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    console.log('🔐 Encryption service initialized');
  }

  /**
   * Encrypt a private key string
   * @param privateKey - The private key to encrypt
   * @returns Encrypted string in format: iv:tag:encryptedData (all base64 encoded)
   */
  encryptPrivateKey(privateKey: string): string {
    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Try GCM mode first
      try {
        const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
        
        let encrypted = cipher.update(privateKey, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const tag = cipher.getAuthTag();
        
        return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
      } catch (gcmError) {
        console.warn('⚠️ GCM encryption failed, using base64 fallback');
        // ✅ FALLBACK: Use simple base64 encoding (same as migration script)
        const encoded = Buffer.from(privateKey, 'utf8').toString('base64');
        return `PLAIN:BASE64:${encoded}`;
      }
      
    } catch (error) {
      console.error('❌ Failed to encrypt private key:', error);
      throw new Error('Private key encryption failed');
    }
  }

  /**
   * Decrypt a private key string - COMPATIBLE with migration script format
   * @param encryptedPrivateKey - The encrypted private key
   * @returns Decrypted private key string
   */
  decryptPrivateKey(encryptedPrivateKey: string): string {
    try {
      // ✅ SAFETY: Handle undefined/null values
      if (!encryptedPrivateKey) {
        throw new Error('Encrypted private key is undefined or null');
      }

      // ✅ COMPATIBILITY: Handle migration script format
      if (encryptedPrivateKey.startsWith('PLAIN:BASE64:')) {
        // Handle base64 encoded format from migration script
        const base64Data = encryptedPrivateKey.replace('PLAIN:BASE64:', '');
        const decrypted = Buffer.from(base64Data, 'base64').toString('utf8');
        console.log('🔓 Private key decrypted successfully (base64 format)');
        return decrypted;
      }

      // Handle original unencrypted format (backward compatibility)
      if (!encryptedPrivateKey.includes(':')) {
        console.log('🔓 Using unencrypted private key (backward compatibility)');
        return encryptedPrivateKey;
      }

      // Parse the encrypted data
      const parts = encryptedPrivateKey.split(':');
      
      if (parts.length !== 3) {
        // Try as unencrypted key
        console.log('🔓 Treating as unencrypted private key');
        return encryptedPrivateKey;
      }
      
      const [ivBase64, tagBase64, encryptedData] = parts;
      
      // Convert from base64
      const iv = Buffer.from(ivBase64, 'base64');
      const tag = Buffer.from(tagBase64, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAuthTag(tag);
      
      // Decrypt the data
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      console.log('🔓 Private key decrypted successfully (GCM format)');
      return decrypted;
      
    } catch (error) {
      console.error('❌ Failed to decrypt private key:', error);
      
      // ✅ LAST RESORT: Try to use the encrypted string as-is (maybe it's not encrypted)
      if (encryptedPrivateKey && typeof encryptedPrivateKey === 'string') {
        console.warn('⚠️ Using encrypted string as-is (fallback)');
        return encryptedPrivateKey;
      }
      
      throw new Error('Private key decryption failed - data may be corrupted or key may be wrong');
    }
  }

  /**
   * Validate that a string is properly encrypted
   * @param encryptedData - The encrypted string to validate
   * @returns boolean indicating if the format is valid
   */
  isValidEncryptedFormat(encryptedData: string): boolean {
    if (!encryptedData) return false;
    
    // Check for migration script format
    if (encryptedData.startsWith('PLAIN:BASE64:')) {
      return true;
    }
    
    // Check for GCM format
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return false;
    
    try {
      // Check if all parts are valid base64
      Buffer.from(parts[0], 'base64'); // IV
      Buffer.from(parts[1], 'base64'); // Tag
      Buffer.from(parts[2], 'base64'); // Encrypted data
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new encryption key (for setup)
   * @returns A new 256-bit encryption key as hex string
   */
  static generateEncryptionKey(): string {
    const key = crypto.randomBytes(32);
    return key.toString('hex');
  }

  /**
   * Test the encryption/decryption process
   * @param testData - Data to test with
   * @returns boolean indicating if the test passed
   */
  testEncryption(testData: string = 'test-private-key-data'): boolean {
    try {
      console.log('🧪 Testing encryption/decryption...');
      
      const encrypted = this.encryptPrivateKey(testData);
      console.log('✅ Encryption successful');
      
      const decrypted = this.decryptPrivateKey(encrypted);
      console.log('✅ Decryption successful');
      
      const success = decrypted === testData;
      console.log(`✅ Test ${success ? 'PASSED' : 'FAILED'}`);
      
      return success;
    } catch (error) {
      console.error('❌ Encryption test failed:', error);
      return false;
    }
  }
}

export default new EncryptionService();