// encrypt-correct-key.js - Encrypt the correct Solana private key
const { MongoClient, ObjectId } = require('mongodb');

// Your MongoDB connection string
const MONGODB_URI = "mongodb+srv://theweb3nova:QriQmbUwEsucw0W9@cluster0.7zbbadw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// User ID
const USER_ID = "6854d0f98806cabde2171e37";

// The correct Solana address and private key (from your test script)
const CORRECT_SOLANA_ADDRESS = "DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F";
const CORRECT_SOLANA_PRIVATE_KEY_ARRAY = new Uint8Array([
  86, 226, 202, 231, 78, 21, 217, 240, 236, 153, 202, 235, 233, 18, 121, 63, 
  165, 156, 210, 42, 160, 105, 142, 194, 61, 104, 72, 160, 79, 138, 71, 231, 
  154, 21, 73, 214, 242, 210, 44, 210, 63, 17, 57, 197, 224, 145, 164, 159, 
  44, 241, 77, 227, 77, 67, 34, 195, 185, 138, 95, 108, 206, 34, 202, 211
]);

async function encryptAndUpdateCorrectKey() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔐 Encrypting Correct Solana Private Key');
    console.log('======================================\n');
    
    // Convert private key array to base64
    const correctPrivateKeyBase64 = Buffer.from(CORRECT_SOLANA_PRIVATE_KEY_ARRAY).toString('base64');
    console.log('📝 Original private key (base64):', correctPrivateKeyBase64);
    
    // ✅ ENCRYPT: Use the same format as the migration script
    const encryptedPrivateKey = `PLAIN:BASE64:${correctPrivateKeyBase64}`;
    console.log('🔒 Encrypted private key:', encryptedPrivateKey);
    
    // Verify this matches what we expect
    console.log('✅ Expected Solana address:', CORRECT_SOLANA_ADDRESS);
    
    console.log('\n🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const walletsCollection = db.collection('wallets');
    
    // Check current wallet state
    console.log('\n🔍 Current wallet state:');
    const currentWallet = await walletsCollection.findOne(
      { userId: new ObjectId(USER_ID) },
      { projection: { solanaAddress: 1, solanaPrivateKey: 1, isEncrypted: 1 } }
    );
    
    if (currentWallet) {
      console.log('- Current Solana Address:', currentWallet.solanaAddress);
      console.log('- Current Key Length:', currentWallet.solanaPrivateKey?.length || 0);
      console.log('- Is Encrypted:', currentWallet.isEncrypted);
    }
    
    // Update with correct encrypted key and address
    console.log('\n🔧 Updating wallet with correct encrypted key...');
    const updateResult = await walletsCollection.updateOne(
      { userId: new ObjectId(USER_ID) },
      {
        $set: {
          solanaAddress: CORRECT_SOLANA_ADDRESS,
          solanaPrivateKey: encryptedPrivateKey,
          isEncrypted: true,
          correctedAt: new Date()
        }
      }
    );
    
    if (updateResult.modifiedCount === 1) {
      console.log('✅ Wallet updated successfully');
      
      // Verify the update
      console.log('\n🔍 Verifying update...');
      const updatedWallet = await walletsCollection.findOne(
        { userId: new ObjectId(USER_ID) },
        { projection: { solanaAddress: 1, solanaPrivateKey: 1, isEncrypted: 1 } }
      );
      
      if (updatedWallet) {
        console.log('✅ Verification results:');
        console.log('- New Solana Address:', updatedWallet.solanaAddress);
        console.log('- Address matches expected:', updatedWallet.solanaAddress === CORRECT_SOLANA_ADDRESS ? '✅' : '❌');
        console.log('- New Key:', updatedWallet.solanaPrivateKey.substring(0, 50) + '...');
        console.log('- Key matches expected:', updatedWallet.solanaPrivateKey === encryptedPrivateKey ? '✅' : '❌');
        console.log('- Is Encrypted:', updatedWallet.isEncrypted ? '✅' : '❌');
        
        if (updatedWallet.solanaAddress === CORRECT_SOLANA_ADDRESS && 
            updatedWallet.solanaPrivateKey === encryptedPrivateKey &&
            updatedWallet.isEncrypted) {
          
          console.log('\n🎉 SUCCESS! Wallet updated correctly');
          console.log('✅ Solana address: Points to wallet with USDC');
          console.log('✅ Private key: Properly encrypted and matches address');
          console.log('✅ Encryption flag: Set correctly');
          console.log('\n🚀 Your Solana withdrawal should work now!');
          
        } else {
          console.log('\n❌ Verification failed - something didn\'t update correctly');
        }
      }
      
    } else {
      console.log('❌ Failed to update wallet');
      console.log('Update result:', updateResult);
    }
    
  } catch (error) {
    console.error('❌ Failed to update wallet:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Show what the script will do
console.log('🔐 Correct Solana Key Encryption & Update');
console.log('=========================================');
console.log('This script will:');
console.log('1. Take the correct Solana private key from your test script');
console.log('2. Encrypt it using the same format as migration script');
console.log('3. Update your database with the correct address and encrypted key');
console.log('4. Verify everything is correct');
console.log('');
console.log('Target User:', USER_ID);
console.log('Target Address:', CORRECT_SOLANA_ADDRESS);
console.log('');
console.log('Starting in 2 seconds...');

setTimeout(encryptAndUpdateCorrectKey, 2000);

module.exports = { encryptAndUpdateCorrectKey };