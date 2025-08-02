// scripts/listApiKeys.ts - List all API keys for debugging
import mongoose from 'mongoose';
import { ApiKey } from '../src/models/ApiKey';
import { User } from '../src/models/User';
import dotenv from 'dotenv';

dotenv.config();

async function listApiKeys() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to database');

    const apiKeys = await ApiKey.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    if (apiKeys.length === 0) {
      console.log('📭 No API keys found');
      return;
    }

    console.log(`\n📋 Found ${apiKeys.length} API keys:\n`);

    apiKeys.forEach((key, index) => {
      const user = key.userId as any;
      const daysUntilExpiration = key.getDaysUntilExpiration();
      
      console.log(`${index + 1}. ${key.name}`);
      console.log(`   User: ${user.email} (${user.name})`);
      console.log(`   Service: ${key.service}`);
      console.log(`   Permissions: ${key.permissions.join(', ')}`);
      console.log(`   Status: ${key.isActive ? '🟢 Active' : '🔴 Inactive'}`);
      console.log(`   Display Key: ${key.displayKey}`);
      console.log(`   Last Used: ${key.lastUsed || 'Never'}`);
      
      if (key.expiresAt) {
        if (daysUntilExpiration !== null) {
          if (daysUntilExpiration <= 0) {
            console.log(`   Expires: ⚠️ EXPIRED on ${key.expiresAt.toISOString()}`);
          } else if (daysUntilExpiration <= 7) {
            console.log(`   Expires: ⚠️ ${daysUntilExpiration} days (${key.expiresAt.toISOString()})`);
          } else {
            console.log(`   Expires: ${daysUntilExpiration} days (${key.expiresAt.toISOString()})`);
          }
        }
      } else {
        console.log(`   Expires: Never`);
      }
      
      console.log(`   Created: ${key.createdAt.toISOString()}`);
      console.log('');
    });

    // Summary statistics
    const stats = {
      total: apiKeys.length,
      active: apiKeys.filter(k => k.isActive).length,
      expired: apiKeys.filter(k => k.isExpired()).length,
      byService: {} as Record<string, number>
    };

    apiKeys.forEach(key => {
      stats.byService[key.service] = (stats.byService[key.service] || 0) + 1;
    });

    console.log('📊 Summary:');
    console.log(`   Total Keys: ${stats.total}`);
    console.log(`   Active: ${stats.active}`);
    console.log(`   Inactive: ${stats.total - stats.active}`);
    console.log(`   Expired: ${stats.expired}`);
    console.log(`   By Service:`, stats.byService);

  } catch (error) {
    console.error('❌ Error listing API keys:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

export { listApiKeys };

// If running directly
if (require.main === module) {
  listApiKeys().catch(error => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}