
const otpEmailTemplate = ({ name, otp }) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Verification - Kadick Daily Monitoring System</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: Arial, sans-serif;
          background-color: #f9f9f9;
          color: #333;
          line-height: 1.6;
        }
        
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e0e0e0;
        }
        
        .header {
          background: linear-gradient(135deg, #ec3338 0%, #d42c30 100%);
          color: white;
          padding: 25px 20px;
          text-align: center;
        }
        
        .header h1 {
          margin: 0;
          font-size: 28px;
        }
        
        .header p {
          margin: 5px 0 0 0;
          opacity: 0.9;
          font-size: 16px;
        }
        
        .content {
          padding: 30px;
        }
        
        .greeting {
          color: #ec3338;
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 24px;
        }
        
        .intro {
          font-size: 16px;
          margin-bottom: 25px;
          color: #555;
        }
        
        .otp-section {
          background-color: #f8f9fa;
          border-left: 4px solid #ec3338;
          padding: 20px;
          margin: 25px 0;
          border-radius: 0 5px 5px 0;
        }
        
        .otp-section h3 {
          margin: 0 0 15px 0;
          color: #343a40;
        }
        
        .otp-code {
          font-size: 42px;
          font-weight: bold;
          color: #ec3338;
          letter-spacing: 8px;
          text-align: center;
          padding: 15px;
          background: white;
          border-radius: 5px;
          margin: 15px 0;
          border: 2px dashed #e0e0e0;
          font-family: 'Courier New', monospace;
        }
        
        .otp-info {
          color: #6c757d;
          text-align: center;
          font-size: 14px;
          margin-top: 10px;
        }
        
        .instructions {
          background-color: #e9f7fe;
          border: 1px solid #b3e0ff;
          border-radius: 5px;
          padding: 20px;
          margin: 20px 0;
        }
        
        .instructions h3 {
          margin: 0 0 15px 0;
          color: #004085;
        }
        
        .instructions ol {
          margin: 0;
          padding-left: 20px;
        }
        
        .instructions li {
          margin-bottom: 10px;
        }
        
        .security-notice {
          background-color: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 5px;
          padding: 20px;
          margin: 20px 0;
        }
        
        .security-notice h3 {
          margin: 0 0 15px 0;
          color: #856404;
        }
        
        .security-notice ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .security-notice li {
          margin-bottom: 8px;
        }
        
        .warning-box {
          background-color: #f8f9fa;
          border: 2px solid #dc3545;
          border-radius: 5px;
          padding: 15px;
          margin: 25px 0;
        }
        
        .warning-box h3 {
          color: #dc3545;
          margin: 0 0 10px 0;
        }
        
        .warning-box ul {
          margin: 0;
          padding-left: 20px;
          color: #555;
        }
        
        .warning-box li {
          margin-bottom: 8px;
        }
        
        .login-button {
          text-align: center;
          margin: 30px 0;
        }
        
        .login-button a {
          background-color: #ec3338;
          color: white;
          padding: 14px 35px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          font-size: 16px;
          display: inline-block;
          transition: background-color 0.3s;
        }
        
        .login-button a:hover {
          background-color: #d42c30;
        }
        
        .footer-info {
          margin-top: 40px;
          padding-top: 25px;
          border-top: 1px solid #e0e0e0;
          text-align: center;
          color: #6c757d;
          font-size: 13px;
        }
        
        .contact-details {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
          font-size: 12px;
        }
        
        .contact-details p {
          margin: 5px 0;
        }
        
        .email-footer {
          background-color: #f8f9fa;
          padding: 15px;
          text-align: center;
          border-top: 1px solid #e0e0e0;
          color: #6c757d;
          font-size: 12px;
        }
        
        .company-logo {
          max-width: 120px;
          height: auto;
          margin-bottom: 15px;
        }
        
        @media (max-width: 600px) {
          .content {
            padding: 20px;
          }
          
          .otp-code {
            font-size: 32px;
            letter-spacing: 5px;
            padding: 12px;
          }
          
          .header h1 {
            font-size: 24px;
          }
          
          .header p {
            font-size: 14px;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <!-- Header -->
        <div class="header">
          <img src="https://res.cloudinary.com/kadick-integrated-limited2023/image/upload/v1743433790/KadickWeb_2023-09-29_08_55/kadicklogo_c4ydmo.png" 
               alt="Kadick Integrated Limited" 
               class="company-logo" />
          <h1>🔐 Account Verification</h1>
          <p>Kadick Daily Monitoring System - One-Time Verification</p>
        </div>
        
        <!-- Content -->
        <div class="content">
          <h2 class="greeting">Hello ${name},</h2>
          
          <p class="intro">
            Welcome to the Kadick Daily Monitoring System. To complete your account setup and ensure security, 
            please verify your email address using the verification code below.
          </p>
          
          <!-- OTP Section -->
          <div class="otp-section">
            <h3>Your Verification Code</h3>
            <div class="otp-code">${otp}</div>
            <div class="otp-info">
              ⏰ This code expires in 10 minutes<br>
              📝 Enter this code in the verification screen
            </div>
          </div>
          
          <!-- Instructions -->
          <div class="instructions">
            <h3>📋 Verification Steps</h3>
            <ol>
              <li>Return to the Daily Monitoring System login/verification page</li>
              <li>Enter your Employee ID (KE### format)</li>
              <li>Paste or type the verification code above</li>
              <li>Click "Verify Account" to complete setup</li>
              <li>Once verified, you can login with your regular credentials</li>
            </ol>
          </div>
          
          <!-- Security Notice -->
          <div class="security-notice">
            <h3>🔒 Security Information</h3>
            <ul>
              <li>This is a <strong>one-time verification</strong> for new accounts only</li>
              <li>Never share this code with anyone</li>
              <li>Kadick staff will never ask for this code</li>
              <li>If you didn't request this, contact IT immediately</li>
            </ul>
          </div>
          
          <!-- Important Warning -->
          <div class="warning-box">
            <h3>⚠️ Important Notes</h3>
            <ul>
              <li>This verification email is sent <strong>ONCE</strong> during account creation</li>
              <li>After verification, you'll use regular login credentials</li>
              <li>If the code expires, request a new one from the verification page</li>
              <li>Keep your login credentials secure and confidential</li>
            </ul>
          </div>
          
          <!-- Login Button -->
          <div class="login-button">
            <a href="${process.env.APP_URL || 'https://your-app.com'}/verify">Proceed to Verification Page</a>
          </div>
          
          <!-- Footer Information -->
          <div class="footer-info">
            <p>
              This is an automated verification email from Kadick Daily Monitoring System.<br>
              Please do not reply to this email.
            </p>
            
            <div class="contact-details">
              <p><strong>For verification assistance, contact:</strong></p>
              <p>📧 it-support@kadickintegrated.com</p>
              <p>📞 [Company Phone Number] - IT Department Extension</p>
              <p>📍 [Company Address]</p>
            </div>
            
            <p>
              System Time: ${new Date().toLocaleString()}<br>
              Email ID: ${Date.now().toString(36).toUpperCase()}
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="email-footer">
          <p>
            © ${new Date().getFullYear()} Kadick Integrated Limited. All rights reserved.<br>
            This email is intended for the recipient only. Unauthorized use is prohibited.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  otpEmailTemplate
};
