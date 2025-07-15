// fix-wallet-address.js - Update database to use correct wallet address
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = "mongodb+srv://theweb3nova:QriQmbUwEsucw0W9@cluster0.7zbbadw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const USER_ID = "6854d0f98806cabde2171e37";

// The working wallet address (matches your private key)
const WORKING_SOLANA_ADDRESS = "BNUcZKbFFaEqNCUzm9u6zBoZKsW1x57JY9TJYfDoenZQ";

async function fixWalletAddress() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔧 Fixing Wallet Address Mismatch');
    console.log('================================\n');
    
    console.log('📋 Issue Summary:');
    console.log('- Private key in database generates: BNUcZKbFFaEqNCUzm9u6zBoZKsW1x57JY9TJYfDoenZQ');
    console.log('- Database currently points to: DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F');
    console.log('- Solution: Update database to use the correct address');
    
    console.log('\n🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const walletsCollection = db.collection('wallets');
    
    // Check current state
    console.log('\n🔍 Current Wallet State:');
    const currentWallet = await walletsCollection.findOne(
      { userId: new ObjectId(USER_ID) },
      { projection: { solanaAddress: 1, baseAddress: 1 } }
    );
    
    if (currentWallet) {
      console.log('- Current Solana Address:', currentWallet.solanaAddress);
      console.log('- Current Base Address:', currentWallet.baseAddress);
    }
    
    // Update to use the working address
    console.log('\n🔧 Updating to working address...');
    const updateResult = await walletsCollection.updateOne(
      { userId: new ObjectId(USER_ID) },
      {
        $set: {
          solanaAddress: WORKING_SOLANA_ADDRESS,
          addressFixedAt: new Date(),
          note: 'Updated to match private key'
        }
      }
    );
    
    if (updateResult.modifiedCount === 1) {
      console.log('✅ Database updated successfully');
      
      // Verify the update
      const updatedWallet = await walletsCollection.findOne(
        { userId: new ObjectId(USER_ID) },
        { projection: { solanaAddress: 1, baseAddress: 1 } }
      );
      
      console.log('\n🔍 Updated Wallet State:');
      console.log('- New Solana Address:', updatedWallet.solanaAddress);
      console.log('- Base Address (unchanged):', updatedWallet.baseAddress);
      console.log('- Address matches private key:', updatedWallet.solanaAddress === WORKING_SOLANA_ADDRESS ? '✅' : '❌');
      
      if (updatedWallet.solanaAddress === WORKING_SOLANA_ADDRESS) {
        console.log('\n🎉 SUCCESS! Wallet address fixed!');
        console.log('\n📋 Next Steps:');
        console.log('1. ✅ Private key and address now match');
        console.log('2. 🔄 Transfer 1 USDC to the new address:');
        console.log(`   ${WORKING_SOLANA_ADDRESS}`);
        console.log('3. 🚀 Then try your withdrawal again');
        
        console.log('\n💰 USDC Transfer Details:');
        console.log('FROM (old): DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F');
        console.log('TO (new):  ', WORKING_SOLANA_ADDRESS);
        console.log('AMOUNT:     1 USDC');
        console.log('\nYou can do this transfer using Phantom wallet or any Solana wallet app.');
        
      } else {
        console.log('\n❌ Update verification failed');
      }
      
    } else {
      console.log('❌ Failed to update database');
      console.log('Update result:', updateResult);
    }
    
  } catch (error) {
    console.error('❌ Failed to fix wallet address:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

console.log('🔧 Wallet Address Fix');
console.log('====================');
console.log('This will update your database to use the wallet address');
console.log('that matches your private key, fixing the mismatch.');
console.log('');
console.log('After this, you\'ll need to transfer your USDC to the new address.');
console.log('');
console.log('Starting fix...\n');

fixWalletAddress();

module.exports = { fixWalletAddress };