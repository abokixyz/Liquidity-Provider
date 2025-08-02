// scripts/createAdminApiKey.ts - Specialized script for admin API keys
import mongoose from 'mongoose';
import { ApiKey } from '../src/models/ApiKey';
import { User } from '../src/models/User';
import dotenv from 'dotenv';

dotenv.config();

async function createAdminApiKey() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to database');

    // Get admin email from environment or prompt
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error('❌ ADMIN_EMAIL not set in environment variables');
      console.log('Please set ADMIN_EMAIL in your .env file');
      process.exit(1);
    }

    const adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      console.error(`❌ Admin user with email ${adminEmail} not found`);
      console.log('Please create an admin user first or update ADMIN_EMAIL');
      process.exit(1);
    }

    // Generate admin API key
    const { key, hashedKey } = ApiKey.generateApiKey();
    
    const apiKey = new ApiKey({
      name: 'Super Admin API Key',
      key: key.substring(0, 16) + '...',
      hashedKey,
      userId: adminUser._id,
      service: 'admin',
      permissions: ['read', 'write', 'admin', 'withdraw', 'create', 'delete'],
      isActive: true
      // No expiration for admin keys
    });
    
    await apiKey.save();
    
    console.log('\n🔥 SUPER ADMIN API KEY CREATED!');
    console.log('🔑 API Key:', key);
    console.log('👤 Admin User:', adminUser.email);
    console.log('🛡️ Permissions: ALL (admin, read, write, withdraw, create, delete)');
    console.log('⏰ Expires: NEVER');
    
    console.log('\n⚠️  CRITICAL: Save this API key securely!');
    console.log('This key has FULL ADMIN ACCESS to your system.');
    console.log('\n🚀 This key can access:');
    console.log('- All liquidity management functions');
    console.log('- All admin endpoints');
    console.log('- Create/revoke other API keys');
    console.log('- Manage user accounts');
    console.log('- Execute withdrawals');
    
    return key;
    
  } catch (error) {
    console.error('❌ Error creating admin API key:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

export { createAdminApiKey };

// If running directly
if (require.main === module) {
  createAdminApiKey().catch(error => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}