#!/usr/bin/env node

/**
 * Simple Admin Grant Script
 * Quick and easy way to grant admin rights
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User'; // Adjust path as needed

dotenv.config();

// Simple function to grant admin rights
const grantAdmin = async (email: string, role: 'admin' | 'superadmin' = 'admin') => {
  try {
    // Connect to database
    const mongoURI = process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoURI) {
      throw new Error('MongoDB URI not found in environment variables');
    }
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to database');
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      console.log('💡 Make sure the user has registered first');
      process.exit(1);
    }
    
    // Grant admin rights (database method)
    (user as any).role = role;
    (user as any).adminGrantedAt = new Date();
    await user.save();
    
    console.log(`✅ ${role} rights granted to: ${user.name} (${email})`);
    
    // Show environment variable method
    console.log('\n📝 Also add this to your .env file:');
    if (role === 'admin') {
      console.log(`ADMIN_EMAILS=${process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS + ',' + email : email}`);
    } else {
      console.log(`SUPER_ADMIN_EMAILS=${process.env.SUPER_ADMIN_EMAILS ? process.env.SUPER_ADMIN_EMAILS + ',' + email : email}`);
    }
    
    console.log('\n⚠️  Remember to restart your server after updating .env!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Get command line arguments
const email = process.argv[2];
const role = process.argv[3] as 'admin' | 'superadmin' || 'admin';

if (!email) {
  console.log(`
🚀 Simple Admin Grant Script

Usage:
  npm run simple-admin user@example.com admin
  npm run simple-admin user@example.com superadmin

Examples:
  npm run simple-admin john@aboki.com admin
  npm run simple-admin ceo@aboki.com superadmin
`);
  process.exit(1);
}

if (!['admin', 'superadmin'].includes(role)) {
  console.log('❌ Role must be "admin" or "superadmin"');
  process.exit(1);
}

// Run the script
grantAdmin(email, role);