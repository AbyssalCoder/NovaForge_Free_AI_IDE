/**
 * CodeAbyss Cold Outreach Script
 * Sends personalized emails to companies and influencers about CodeAbyss
 * 
 * Setup:
 * 1. Enable 2FA on your Gmail: myaccount.google.com/security
 * 2. Create App Password: myaccount.google.com/apppasswords
 *    - Select "Mail" → "Windows Computer" → Generate
 *    - Copy the 16-char password
 * 3. Run: npm install nodemailer
 * 4. Set env: set GMAIL_APP_PASSWORD=your-16-char-app-password
 * 5. Run: node scripts/outreach.mjs
 */

import nodemailer from 'nodemailer';

// ============ CONFIG ============
const SENDER_EMAIL = 'aniketsupermails2005@gmail.com';
const SENDER_NAME = 'Aniket - CodeAbyss';
const APP_PASSWORD = process.env.GMAIL_APP_PASSWORD; // Set this as env var, never hardcode

if (!APP_PASSWORD) {
  console.error('❌ Set GMAIL_APP_PASSWORD env variable first!');
  console.error('   Run: $env:GMAIL_APP_PASSWORD = "your-app-password"');
  process.exit(1);
}

// ============ CONTACTS ============
const contacts = [
  // EdTech - most likely to respond
  { name: "freeCodeCamp Team", email: "team@freecodecamp.org", type: "edtech", personalized: "Your mission to make coding education free aligns perfectly with what we're building." },
  { name: "GeeksforGeeks Team", email: "feedback@geeksforgeeks.org", type: "edtech", personalized: "Your online compiler is used by millions of students - CodeAbyss adds an AI agent on top of the same concept." },
  { name: "HackerRank Team", email: "sales@hackerrank.com", type: "edtech", personalized: "Your coding assessment platform could integrate a free AI IDE for candidates to practice." },
  { name: "Codecademy Team", email: "press@codecademy.com", type: "edtech", personalized: "Your students could benefit from a free browser IDE with AI assistance for practice outside lessons." },
  
  // Online Compiler companies
  { name: "JDoodle Team", email: "contact@jdoodle.com", type: "compiler", personalized: "As fellow online compiler builders, I'd love to explore potential collaboration or integration opportunities." },
  { name: "Judge0 Team", email: "contact@judge0.com", type: "compiler", personalized: "Your open-source code execution engine is brilliant. CodeAbyss takes a similar open-source approach but adds an AI agent layer." },
  
  // Browser IDE companies
  { name: "CodeSandbox Team", email: "community@codesandbox.io", type: "ide", personalized: "Your browser IDE inspired parts of CodeAbyss. We're taking a different angle with AI-first + fully free approach." },
  { name: "Gitpod Team", email: "contact@gitpod.io", type: "ide", personalized: "Your cloud dev environments are industry-leading. CodeAbyss takes a lighter approach - zero config, instant coding." },
  
  // EdTech India
  { name: "Unacademy Partnerships", email: "partnerships@unacademy.com", type: "edtech-india", personalized: "CodeAbyss could serve your programming students with a free AI-powered IDE - no hardware requirements." },
  
  // Potential partners
  { name: "Coursera Partners", email: "partners@coursera.org", type: "edtech", personalized: "Online coding courses on Coursera could embed CodeAbyss as a free practice environment with AI tutoring." },
  { name: "Udemy Business", email: "business@udemy.com", type: "edtech", personalized: "Udemy coding courses could link to CodeAbyss as a free companion IDE with AI assistance." },
];

// ============ EMAIL TEMPLATES ============
function getSubject(contact) {
  const subjects = {
    'edtech': `Free AI IDE for your students - CodeAbyss (open source)`,
    'edtech-india': `Free AI-Powered IDE for Indian Students - CodeAbyss`,
    'compiler': `Fellow online compiler builder - let's connect`,
    'ide': `Open-source AI IDE - CodeAbyss (community project)`,
  };
  return subjects[contact.type] || `Free AI IDE - CodeAbyss (open source)`;
}

function getBody(contact) {
  return `Hi ${contact.name.split(' ')[0]},

I'm Aniket, a developer who built CodeAbyss - a free, open-source AI-powered IDE that runs entirely in the browser.

${contact.personalized}

What CodeAbyss does:
• AI coding agent that writes, debugs, and explains code
• 8 languages: Python, JavaScript, TypeScript, Java, C, C++, Rust, HTML/CSS
• Built-in terminal + live preview
• Zero signup, zero cost, zero downloads
• Fully open source (MIT license)

Live: https://codeabyss.vercel.app
Source: https://github.com/AbyssalCoder/CodeAbyss_AI_IDE

I'd love to hear your thoughts or explore how this could be useful for your community/platform.

Best regards,
Aniket
Developer, CodeAbyss
GitHub: github.com/AbyssalCoder
Email: aniketsupermails2005@gmail.com

---
P.S. This is a one-time personal email. No mailing list, no follow-ups unless you reply.`;
}

// ============ SEND LOGIC ============
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SENDER_EMAIL,
    pass: APP_PASSWORD,
  },
});

async function sendEmail(contact, index) {
  const mailOptions = {
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: contact.email,
    subject: getSubject(contact),
    text: getBody(contact),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ [${index + 1}/${contacts.length}] Sent to ${contact.name} (${contact.email})`);
  } catch (error) {
    console.error(`❌ [${index + 1}/${contacts.length}] Failed: ${contact.name} - ${error.message}`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n📧 CodeAbyss Outreach - Sending ${contacts.length} emails\n`);
  console.log(`From: ${SENDER_EMAIL}`);
  console.log(`Delay: 60 seconds between emails (to avoid Gmail rate limits)\n`);
  console.log('─'.repeat(60));

  // Verify connection
  try {
    await transporter.verify();
    console.log('✅ Gmail connection verified\n');
  } catch (err) {
    console.error('❌ Gmail connection failed:', err.message);
    console.error('   Make sure your App Password is correct.');
    process.exit(1);
  }

  for (let i = 0; i < contacts.length; i++) {
    await sendEmail(contacts[i], i);
    
    // Wait 60 seconds between emails to avoid being flagged
    if (i < contacts.length - 1) {
      console.log(`   ⏳ Waiting 60s before next email...`);
      await delay(60000);
    }
  }

  console.log('\n─'.repeat(60));
  console.log(`\n✅ Done! ${contacts.length} emails sent.`);
  console.log('📌 Check your Gmail "Sent" folder to confirm.');
}

main();
