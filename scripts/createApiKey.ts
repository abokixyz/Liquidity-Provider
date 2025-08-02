// scripts/createApiKey.ts - Simple API key creation script
import mongoose from 'mongoose';
import { ApiKey } from '../src/models/ApiKey';
import { User } from '../src/models/User';
import dotenv from 'dotenv';

dotenv.config();

interface CreateApiKeyOptions {
  userEmail: string;
  name: string;
  service: 'liquidity' | 'trading' | 'admin' | 'analytics';
  permissions: string[];
  expiresIn?: number; // days
}

async function createApiKey(options: CreateApiKeyOptions) {
  try {
    // Connect to database
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to database');

    // Find the user
    const user = await User.findOne({ email: options.userEmail });
    if (!user) {
      throw new Error(`User with email ${options.userEmail} not found`);
    }

    // Check if user already has too many API keys
    const existingKeysCount = await ApiKey.countDocuments({ 
      userId: user._id, 
      isActive: true 
    });
    
    if (existingKeysCount >= 10) {
      throw new Error(`User already has maximum number of API keys (10)`);
    }

    // Generate API key
    const { key, hashedKey } = ApiKey.generateApiKey();
    
    const expiresAt = options.expiresIn ? 
      new Date(Date.now() + options.expiresIn * 24 * 60 * 60 * 1000) : 
      null;
    
    const apiKey = new ApiKey({
      name: options.name,
      key: key.substring(0, 16) + '...', // Store partial key for display
      hashedKey,
      userId: user._id,
      service: options.service,
      permissions: options.permissions,
      expiresAt,
      isActive: true
    });
    
    await apiKey.save();
    
    console.log('\n✅ API Key created successfully!');
    console.log('🔑 API Key:', key);
    console.log('👤 User:', user.email);
    console.log('📛 Name:', options.name);
    console.log('🏷️ Service:', options.service);
    console.log('🛡️ Permissions:', options.permissions.join(', '));
    
    if (expiresAt) {
      console.log('⏰ Expires:', expiresAt.toISOString());
      console.log('📅 Days until expiration:', Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    } else {
      console.log('⏰ Expires: Never');
    }
    
    console.log('\n⚠️  Save this API key securely - it won\'t be shown again!');
    console.log('\n📖 Usage Examples:');
    console.log('Header: X-API-Key:', key);
    console.log('Header: Authorization: ApiKey', key);
    console.log('Query: ?apiKey=' + key);
    
    return {
      success: true,
      apiKey: key,
      id: apiKey._id,
      user: user.email
    };
    
  } catch (error) {
    console.error('❌ Error creating API key:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Export for use in other scripts
export { createApiKey };

// If running directly from command line
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: npm run create-api-key <userEmail> <name> <service> <permissions> [expiresIn]');
    console.log('');
    console.log('Examples:');
    console.log('npm run create-api-key admin@company.com "Admin Key" admin "admin" 365');
    console.log('npm run create-api-key user@company.com "Trading Bot" liquidity "read,write,withdraw" 30');
    console.log('npm run create-api-key analytics@company.com "Analytics Dashboard" analytics "read" 0');
    console.log('');
    console.log('Services: liquidity, trading, admin, analytics');
    console.log('Permissions: read, write, admin, withdraw, create, delete');
    console.log('ExpiresIn: number of days (0 or omit for no expiration)');
    process.exit(1);
  }

  const [userEmail, name, service, permissionsStr, expiresInStr] = args;
  const permissions = permissionsStr.split(',').map(p => p.trim());
  const expiresIn = expiresInStr && expiresInStr !== '0' ? parseInt(expiresInStr) : undefined;

  createApiKey({
    userEmail,
    name,
    service: service as any,
    permissions,
    expiresIn
  }).catch(error => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}