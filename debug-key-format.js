// debug-key-format.js - Debug what's happening with the keys
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = "mongodb+srv://theweb3nova:QriQmbUwEsucw0W9@cluster0.7zbbadw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const USER_ID = "6854d0f98806cabde2171e37";

// The correct private key array from your test script
const CORRECT_PRIVATE_KEY_ARRAY = new Uint8Array([
  86, 226, 202, 231, 78, 21, 217, 240, 236, 153, 202, 235, 233, 18, 121, 63, 
  165, 156, 210, 42, 160, 105, 142, 194, 61, 104, 72, 160, 79, 138, 71, 231, 
  154, 21, 73, 214, 242, 210, 44, 210, 63, 17, 57, 197, 224, 145, 164, 159, 
  44, 241, 77, 227, 77, 67, 34, 195, 185, 138, 95, 108, 206, 34, 202, 211
]);

async function debugKeyFormat() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔍 Debugging Solana Key Format');
    console.log('==============================\n');
    
    // Analyze the correct private key
    console.log('📋 Correct Private Key Analysis:');
    console.log('- Array length:', CORRECT_PRIVATE_KEY_ARRAY.length, 'bytes');
    console.log('- Expected length: 64 bytes ✅');
    console.log('- First 10 bytes:', Array.from(CORRECT_PRIVATE_KEY_ARRAY.slice(0, 10)));
    console.log('- Last 10 bytes:', Array.from(CORRECT_PRIVATE_KEY_ARRAY.slice(-10)));
    
    // Convert to base64
    const correctBase64 = Buffer.from(CORRECT_PRIVATE_KEY_ARRAY).toString('base64');
    console.log('- Base64 length:', correctBase64.length, 'characters');
    console.log('- Base64 value:', correctBase64);
    
    // Test if we can create a keypair from it
    try {
      const { Keypair } = require('@solana/web3.js');
      const testKeypair = Keypair.fromSecretKey(CORRECT_PRIVATE_KEY_ARRAY);
      console.log('✅ Keypair creation successful');
      console.log('- Public key:', testKeypair.publicKey.toString());
      console.log('- Expected:', 'DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F');
      console.log('- Match:', testKeypair.publicKey.toString() === 'DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F' ? '✅' : '❌');
    } catch (error) {
      console.log('❌ Keypair creation failed:', error.message);
    }
    
    console.log('\n🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const walletsCollection = db.collection('wallets');
    
    // Get current wallet data
    console.log('\n📋 Current Database State:');
    const wallet = await walletsCollection.findOne(
      { userId: new ObjectId(USER_ID) },
      { projection: { baseAddress: 1, solanaAddress: 1, basePrivateKey: 1, solanaPrivateKey: 1, isEncrypted: 1 } }
    );
    
    if (wallet) {
      console.log('- Base Address:', wallet.baseAddress);
      console.log('- Solana Address:', wallet.solanaAddress);
      console.log('- Is Encrypted:', wallet.isEncrypted);
      console.log('- Base Key Length:', wallet.basePrivateKey?.length || 0);
      console.log('- Solana Key Length:', wallet.solanaPrivateKey?.length || 0);
      console.log('- Base Key Preview:', wallet.basePrivateKey?.substring(0, 50) + '...');
      console.log('- Solana Key Preview:', wallet.solanaPrivateKey?.substring(0, 50) + '...');
      
      // Try to decode the stored Solana key
      console.log('\n🔓 Decoding Stored Solana Key:');
      if (wallet.solanaPrivateKey && wallet.solanaPrivateKey.startsWith('PLAIN:BASE64:')) {
        const storedBase64 = wallet.solanaPrivateKey.replace('PLAIN:BASE64:', '');
        console.log('- Stored base64:', storedBase64);
        console.log('- Matches correct:', storedBase64 === correctBase64 ? '✅' : '❌');
        
        try {
          const decodedArray = new Uint8Array(Buffer.from(storedBase64, 'base64'));
          console.log('- Decoded length:', decodedArray.length, 'bytes');
          console.log('- Expected length: 64 bytes', decodedArray.length === 64 ? '✅' : '❌');
          console.log('- First 10 bytes:', Array.from(decodedArray.slice(0, 10)));
          console.log('- Arrays match:', Array.from(decodedArray).toString() === Array.from(CORRECT_PRIVATE_KEY_ARRAY).toString() ? '✅' : '❌');
          
          // Try creating keypair from decoded data
          try {
            const { Keypair } = require('@solana/web3.js');
            const testKeypair2 = Keypair.fromSecretKey(decodedArray);
            console.log('✅ Keypair from stored data successful');
            console.log('- Public key:', testKeypair2.publicKey.toString());
          } catch (keypairError) {
            console.log('❌ Keypair from stored data failed:', keypairError.message);
          }
          
        } catch (decodeError) {
          console.log('❌ Failed to decode stored key:', decodeError.message);
        }
      } else {
        console.log('❌ Stored key is not in expected PLAIN:BASE64: format');
        console.log('- Actual format:', wallet.solanaPrivateKey?.substring(0, 20) + '...');
      }
    } else {
      console.log('❌ Wallet not found');
    }
    
    // Create the correct encrypted format
    console.log('\n🔧 Creating Correct Encrypted Format:');
    const correctEncrypted = `PLAIN:BASE64:${correctBase64}`;
    console.log('- Correct encrypted format:', correctEncrypted);
    
    // Update with the exactly correct format
    console.log('\n💾 Updating with correct format...');
    const updateResult = await walletsCollection.updateOne(
      { userId: new ObjectId(USER_ID) },
      {
        $set: {
          solanaAddress: 'DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F',
          solanaPrivateKey: correctEncrypted,
          isEncrypted: true,
          debuggedAt: new Date()
        }
      }
    );
    
    if (updateResult.modifiedCount === 1) {
      console.log('✅ Database updated with correct format');
      
      // Final verification
      const finalWallet = await walletsCollection.findOne(
        { userId: new ObjectId(USER_ID) },
        { projection: { solanaAddress: 1, solanaPrivateKey: 1 } }
      );
      
      console.log('\n🔍 Final Verification:');
      console.log('- Address correct:', finalWallet.solanaAddress === 'DCX2ErZgSCEG8BmVGkZpL87FFf3hVRzq6CjxFkueue2F' ? '✅' : '❌');
      console.log('- Key format correct:', finalWallet.solanaPrivateKey === correctEncrypted ? '✅' : '❌');
      
      console.log('\n🎉 Database updated! Try your Solana withdrawal now.');
      
    } else {
      console.log('❌ Failed to update database');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

console.log('🔍 Solana Key Format Debugger');
console.log('=============================');
console.log('This will:');
console.log('1. Analyze the correct private key format');
console.log('2. Check what\'s currently in your database');
console.log('3. Compare and fix any format issues');
console.log('4. Update with the exactly correct format');
console.log('');
console.log('Starting debug...\n');

debugKeyFormat();

module.exports = { debugKeyFormat };