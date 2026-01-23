import { chromium } from 'playwright';

async function testAgentChat() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Intercept and log all network responses
  page.on('response', response => {
    if (response.url().includes('/api/chat')) {
      console.log('📡 API Response:', response.status(), response.url());
    }
  });

  try {
    // Navigate to agent details page (using the agent from backend logs)
    const agentId = 'e4432c6d-a99b-41de-a322-5cc2fcef955c';
    console.log(`\n🚀 Opening agent chat for: ${agentId}\n`);

    await page.goto(`http://localhost:5173/agent/${agentId}`, {
      waitUntil: 'networkidle'
    });

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Find and click Chat button
    const chatButton = await page.$('button:has-text("Chat")');
    if (chatButton) {
      console.log('✅ Found Chat button, clicking...');
      await chatButton.click();
      await page.waitForTimeout(1000);
    }

    // Find chat input
    const chatInput = await page.$('input[placeholder*="message"], textarea[placeholder*="message"], input[type="text"]');
    if (chatInput) {
      console.log('✅ Found chat input');

      // Type message
      const message = 'Get me the dummy GitHub users';
      console.log(`📝 Sending message: "${message}"\n`);
      await chatInput.fill(message);

      // Press Enter or find Send button
      const sendButton = await page.$('button:has-text("Send")');
      if (sendButton) {
        await sendButton.click();
      } else {
        await chatInput.press('Enter');
      }

      // Wait for response
      console.log('⏳ Waiting for response...\n');
      await page.waitForTimeout(5000);

      // Get all messages displayed
      const messages = await page.$$eval(
        '[role="article"], .message, .chat-message, [class*="message"]',
        els => els.map(el => ({
          text: el.textContent?.substring(0, 200),
          html: el.innerHTML?.substring(0, 300)
        }))
      );

      console.log('\n📋 Messages in UI:');
      messages.forEach((msg, i) => {
        console.log(`\n[${i}] Text: ${msg.text}`);
      });

      // Look for specific tool-related content
      const pageText = await page.textContent('body');
      console.log('\n\n🔍 Looking for tool-related content...');
      console.log('Tool call mentions:', (pageText.match(/🔧|Calling|tool/gi) || []).length);
      console.log('Tool result mentions:', (pageText.match(/✅|tool result|Tool executed/gi) || []).length);
      console.log('Blank/empty mentions:', (pageText.match(/\[\s*\]|empty|blank/gi) || []).length);

      // Screenshot
      await page.screenshot({ path: '/tmp/agent-chat.png' });
      console.log('\n📸 Screenshot saved to /tmp/agent-chat.png');

    } else {
      console.log('❌ Could not find chat input');
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await browser.close();
  }
}

testAgentChat();
