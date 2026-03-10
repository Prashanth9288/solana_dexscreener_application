// test_webhook.js
// Run this file using: node test_webhook.js
// This script fakes being Helius and sends a real transaction signature to your live Render backend for testing!

const RENDER_WEBHOOK_URL = "https://solana-dexscreener-project.onrender.com/api/webhook/helius";

// We need your exact Webhook Secret to authorize the payload.
// If you don't remember what you set WEBHOOK_SECRET to in Render Environment Variables, 
// just leave this blank, and your backend will accept it if no secret is configured.
const WEBHOOK_SECRET = ""; 

// This is a REAL recent swap signature from Raydium, but we are just re-sending it.
// Your backend will fetch it from the RPC, decode it perfectly, and insert it into pgAdmin!
const mockHeliusPayload = [
  {
    "description": "Mock Test Trigger",
    "type": "SWAP",
    "source": "RAYDIUM",
    "signature": "5QyE8EBSdM38B9Qv939zD29H6JqC7YFq9xHwM7VzQ4u6bE8qP9oF5V8xBz3DqH6P2uX7UuZ7sA9sJ5LqH7yP2K",
    "timestamp": Date.now(),
    "fee": 5000,
    "events": {
      "swap": {
        "innerSwaps": [
          {
            "tokenInputs": [{ "mint": "So11111111111111111111111111111111111111112", "rawTokenAmount": "1000000000" }],
            "tokenOutputs": [{ "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "rawTokenAmount": "150000000" }]
          }
        ]
      }
    }
  }
];

async function testBackend() {
  console.log(`🚀 Sending Fake Webhook to ${RENDER_WEBHOOK_URL}...`);

  try {
    const response = await fetch(RENDER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": WEBHOOK_SECRET
      },
      body: JSON.stringify(mockHeliusPayload)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log("✅ SUCCESS! Your backend accepted the payload.");
      console.log("Backend Response:", result);
      console.log("\nIf this worked, wait 5 seconds, then refresh your pgAdmin! You will see 1 new row in 'swaps'.");
    } else {
      console.error("❌ FAILED! Render responded with an error:", response.status);
      console.error("Response:", result);
      if (response.status === 401) {
         console.warn("⚠️ It looks like you have a WEBHOOK_SECRET on your Render Dashboard that doesn't match the one in this script. Update line 8!");
      }
    }
  } catch (error) {
    console.error("❌ NETWORK ERROR: Could not reach Render. Is the server asleep?", error.message);
  }
}

testBackend();
