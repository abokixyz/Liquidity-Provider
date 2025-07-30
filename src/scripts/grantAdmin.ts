#!/usr/bin/env node

/**
 * ABOKI Liquidity Provider - Grant Admin Rights Script
 * 
 * This script allows you to grant admin rights to users in multiple ways:
 * 1. Add user email to environment variables (recommended for production)
 * 2. Add role field to user document in database (if using role-based system)
 * 3. Interactive mode to select users and grant rights
 * 
 * Usage:
 * npm run grant-admin -- --email user@example.com --role admin
 * npm run grant-admin -- --interactive
 * npm run grant-admin -- --list-admins
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import { User } from '../models/User'; // Adjust path as needed

// Load environment variables
dotenv.config();

interface AdminUser {
  email: string;
  role: 'admin' | 'superadmin';
  grantedAt: Date;
  grantedBy?: string;
}

// Command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

// Database connection
const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoURI) {
      throw new Error('MONGODB_URI or DATABASE_URL not found in environment variables');
    }
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Method 1: Environment Variable Approach (Recommended)
const grantAdminViaEnv = async (email: string, role: 'admin' | 'superadmin'): Promise<void> => {
  console.log(`\n🔧 ENVIRONMENT VARIABLE METHOD`);
  console.log(`📝 To grant ${role} rights to ${email}, add this to your .env file:\n`);
  
  const currentAdminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  const currentSuperAdminEmails = process.env.SUPER_ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  
  if (role === 'admin') {
    if (!currentAdminEmails.includes(email)) {
      currentAdminEmails.push(email);
    }
    console.log(`ADMIN_EMAILS=${currentAdminEmails.join(',')}`);
  } else {
    if (!currentSuperAdminEmails.includes(email)) {
      currentSuperAdminEmails.push(email);
    }
    console.log(`SUPER_ADMIN_EMAILS=${currentSuperAdminEmails.join(',')}`);
  }
  
  console.log(`\n⚠️  Remember to restart your server after updating the .env file!`);
  console.log(`🔄 Server restart command: npm run dev (or your start command)`);
};

// Method 2: Database Role Field Approach
const grantAdminViaDB = async (email: string, role: 'admin' | 'superadmin'): Promise<void> => {
  try {
    console.log(`\n💾 DATABASE METHOD`);
    console.log(`🔍 Looking for user with email: ${email}`);
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      console.log(`💡 Make sure the user has registered first`);
      return;
    }
    
    console.log(`✅ User found: ${user.name} (${user.email})`);
    
    // Add role field to user (you may need to update your User model schema)
    (user as any).role = role;
    (user as any).adminGrantedAt = new Date();
    
    await user.save();
    
    console.log(`✅ ${role} rights granted to ${user.name} (${user.email})`);
    console.log(`📅 Granted at: ${new Date().toISOString()}`);
    
  } catch (error) {
    console.error('❌ Error granting admin via database:', error);
  }
};

// Method 3: Create Admin User if doesn't exist
const createAdminUser = async (name: string, email: string, password: string, role: 'admin' | 'superadmin'): Promise<void> => {
  try {
    console.log(`\n👤 CREATE ADMIN USER METHOD`);
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log(`⚠️  User already exists: ${existingUser.name} (${existingUser.email})`);
      const updateExisting = await askQuestion('Do you want to update their role? (y/n): ');
      if (updateExisting.toLowerCase() === 'y') {
        await grantAdminViaDB(email, role);
      }
      return;
    }
    
    // Create new admin user
    const adminUser = await User.create({
      name,
      email: email.toLowerCase(),
      password, // Will be hashed by the User model
      isEmailVerified: true, // Auto-verify admin accounts
      role: role,
      adminGrantedAt: new Date()
    });
    
    console.log(`✅ Admin user created successfully:`);
    console.log(`   Name: ${adminUser.name}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Role: ${role}`);
    console.log(`   ID: ${adminUser._id}`);
    
    // Also add to environment variables
    await grantAdminViaEnv(email, role);
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
};

// List current admins
const listAdmins = async (): Promise<void> => {
  try {
    console.log(`\n📋 CURRENT ADMIN USERS\n`);
    
    // From environment variables
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e);
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e);
    
    console.log(`🔧 Environment Variable Admins:`);
    console.log(`   Regular Admins: ${adminEmails.length > 0 ? adminEmails.join(', ') : 'None'}`);
    console.log(`   Super Admins: ${superAdminEmails.length > 0 ? superAdminEmails.join(', ') : 'None'}`);
    
    // From database (if role field exists)
    console.log(`\n💾 Database Role Admins:`);
    const dbAdmins = await User.find({ 
      $or: [
        { role: 'admin' },
        { role: 'superadmin' }
      ]
    }).select('name email role adminGrantedAt createdAt');
    
    if (dbAdmins.length > 0) {
      dbAdmins.forEach(admin => {
        console.log(`   ${admin.name} (${admin.email}) - ${(admin as any).role} - Granted: ${(admin as any).adminGrantedAt || admin.createdAt}`);
      });
    } else {
      console.log(`   None found (role field may not exist in User model)`);
    }
    
    // All registered users (for reference)
    const totalUsers = await User.countDocuments();
    console.log(`\n👥 Total registered users: ${totalUsers}`);
    
  } catch (error) {
    console.error('❌ Error listing admins:', error);
  }
};

// Interactive mode
const interactiveMode = async (): Promise<void> => {
  try {
    console.log(`\n🎯 INTERACTIVE ADMIN GRANT MODE\n`);
    
    // Show current admins first
    await listAdmins();
    
    console.log(`\n🔧 Grant Admin Rights Options:`);
    console.log(`1. Grant admin rights to existing user`);
    console.log(`2. Create new admin user`);
    console.log(`3. List all users`);
    console.log(`4. Remove admin rights`);
    console.log(`5. Exit`);
    
    const choice = await askQuestion('\nSelect option (1-5): ');
    
    switch (choice) {
      case '1':
        const email = await askQuestion('Enter user email: ');
        const role = await askQuestion('Enter role (admin/superadmin): ') as 'admin' | 'superadmin';
        
        if (!['admin', 'superadmin'].includes(role)) {
          console.log('❌ Invalid role. Must be "admin" or "superadmin"');
          break;
        }
        
        const method = await askQuestion('Method (env/db/both): ');
        
        if (method === 'env' || method === 'both') {
          await grantAdminViaEnv(email, role);
        }
        if (method === 'db' || method === 'both') {
          await grantAdminViaDB(email, role);
        }
        break;
        
      case '2':
        const name = await askQuestion('Enter admin name: ');
        const newEmail = await askQuestion('Enter admin email: ');
        const password = await askQuestion('Enter admin password: ');
        const newRole = await askQuestion('Enter role (admin/superadmin): ') as 'admin' | 'superadmin';
        
        if (!['admin', 'superadmin'].includes(newRole)) {
          console.log('❌ Invalid role. Must be "admin" or "superadmin"');
          break;
        }
        
        await createAdminUser(name, newEmail, password, newRole);
        break;
        
      case '3':
        const users = await User.find({}).select('name email role createdAt').limit(20);
        console.log(`\n👥 Recent Users (showing last 20):`);
        users.forEach(user => {
          console.log(`   ${user.name} (${user.email}) - ${(user as any).role || 'user'} - Joined: ${user.createdAt}`);
        });
        break;
        
      case '4':
        const removeEmail = await askQuestion('Enter email to remove admin rights from: ');
        await removeAdminRights(removeEmail);
        break;
        
      case '5':
        console.log('👋 Goodbye!');
        break;
        
      default:
        console.log('❌ Invalid option');
    }
    
  } catch (error) {
    console.error('❌ Error in interactive mode:', error);
  }
};

// Remove admin rights
const removeAdminRights = async (email: string): Promise<void> => {
  try {
    console.log(`\n🗑️ REMOVING ADMIN RIGHTS`);
    
    // Remove from database
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      (user as any).role = 'user';
      await user.save();
      console.log(`✅ Removed database admin rights from ${email}`);
    }
    
    // Show how to remove from environment
    console.log(`\n📝 To remove from environment variables, update your .env file:`);
    
    const currentAdminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e && e !== email);
    const currentSuperAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e && e !== email);
    
    console.log(`ADMIN_EMAILS=${currentAdminEmails.join(',')}`);
    console.log(`SUPER_ADMIN_EMAILS=${currentSuperAdminEmails.join(',')}`);
    
  } catch (error) {
    console.error('❌ Error removing admin rights:', error);
  }
};

// Main function
const main = async (): Promise<void> => {
  console.log(`🚀 ABOKI Admin Rights Grant Script\n`);
  
  await connectDB();
  
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  npm run grant-admin -- --email user@example.com --role admin
  npm run grant-admin -- --email user@example.com --role superadmin --method db
  npm run grant-admin -- --interactive
  npm run grant-admin -- --list-admins
  npm run grant-admin -- --create-admin --name "Admin User" --email admin@example.com --password password123 --role admin

Options:
  --email <email>     User email to grant admin rights
  --role <role>       Role to grant (admin or superadmin)
  --method <method>   Method to use (env, db, or both) - default: both
  --interactive       Run in interactive mode
  --list-admins       List current admin users
  --create-admin      Create new admin user
  --name <name>       Name for new admin user (use with --create-admin)
  --password <pass>   Password for new admin user (use with --create-admin)
  --remove <email>    Remove admin rights from user
`);
    process.exit(0);
  }
  
  if (args.includes('--list-admins')) {
    await listAdmins();
  } else if (args.includes('--interactive')) {
    await interactiveMode();
  } else if (args.includes('--create-admin')) {
    const nameIndex = args.indexOf('--name');
    const emailIndex = args.indexOf('--email');
    const passwordIndex = args.indexOf('--password');
    const roleIndex = args.indexOf('--role');
    
    if (nameIndex === -1 || emailIndex === -1 || passwordIndex === -1 || roleIndex === -1) {
      console.log('❌ Missing required arguments for --create-admin');
      console.log('Required: --name, --email, --password, --role');
      process.exit(1);
    }
    
    const name = args[nameIndex + 1];
    const email = args[emailIndex + 1];
    const password = args[passwordIndex + 1];
    const role = args[roleIndex + 1] as 'admin' | 'superadmin';
    
    await createAdminUser(name, email, password, role);
  } else if (args.includes('--remove')) {
    const removeIndex = args.indexOf('--remove');
    const email = args[removeIndex + 1];
    await removeAdminRights(email);
  } else if (args.includes('--email')) {
    const emailIndex = args.indexOf('--email');
    const roleIndex = args.indexOf('--role');
    const methodIndex = args.indexOf('--method');
    
    const email = args[emailIndex + 1];
    const role = (args[roleIndex + 1] || 'admin') as 'admin' | 'superadmin';
    const method = args[methodIndex + 1] || 'both';
    
    if (!email) {
      console.log('❌ Email is required');
      process.exit(1);
    }
    
    if (!['admin', 'superadmin'].includes(role)) {
      console.log('❌ Invalid role. Must be "admin" or "superadmin"');
      process.exit(1);
    }
    
    if (method === 'env' || method === 'both') {
      await grantAdminViaEnv(email, role);
    }
    if (method === 'db' || method === 'both') {
      await grantAdminViaDB(email, role);
    }
  } else {
    console.log('❌ No valid arguments provided. Use --help for usage information.');
    await interactiveMode(); // Default to interactive mode
  }
  
  rl.close();
  mongoose.connection.close();
  console.log('\n✅ Script completed successfully!');
};

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run the script
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});