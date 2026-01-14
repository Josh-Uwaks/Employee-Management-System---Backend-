const passwordResetConfirmationTemplate = ({ name }) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Successful - Kadick Daily Monitoring System</title>
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
          background: linear-gradient(135deg, #28a745 0%, #218838 100%);
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
          color: #28a745;
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 24px;
        }
        
        .intro {
          font-size: 16px;
          margin-bottom: 25px;
          color: #555;
        }
        
        .success-section {
          background-color: #f0fff4;
          border-left: 4px solid #28a745;
          padding: 25px;
          margin: 25px 0;
          border-radius: 0 5px 5px 0;
          text-align: center;
        }
        
        .success-icon {
          font-size: 48px;
          margin-bottom: 15px;
        }
        
        .success-section h3 {
          margin: 0 0 15px 0;
          color: #28a745;
        }
        
        .success-section p {
          color: #555;
          margin: 0;
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
        
        .next-steps {
          background-color: #e9f7fe;
          border: 1px solid #b3e0ff;
          border-radius: 5px;
          padding: 20px;
          margin: 20px 0;
        }
        
        .next-steps h3 {
          margin: 0 0 15px 0;
          color: #004085;
        }
        
        .next-steps ol {
          margin: 0;
          padding-left: 20px;
        }
        
        .next-steps li {
          margin-bottom: 10px;
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
          <h1>✅ Password Reset Successful</h1>
          <p>Kadick Daily Monitoring System - Account Security</p>
        </div>
        
        <!-- Content -->
        <div class="content">
          <h2 class="greeting">Hello ${name},</h2>
          
          <p class="intro">
            Your password has been successfully reset for the Daily Monitoring System.
          </p>
          
          <!-- Success Section -->
          <div class="success-section">
            <div class="success-icon">✅</div>
            <h3>Password Reset Confirmed</h3>
            <p>Your password was successfully changed at ${new Date().toLocaleTimeString()} on ${new Date().toLocaleDateString()}</p>
          </div>
          
          <!-- Next Steps -->
          <div class="next-steps">
            <h3>📋 What to Do Next</h3>
            <ol>
              <li>Login to the Daily Monitoring System with your new password</li>
              <li>Ensure you remember your new password</li>
              <li>Consider using a password manager for better security</li>
              <li>Keep your login credentials confidential</li>
            </ol>
          </div>
          
          <!-- Security Notice -->
          <div class="security-notice">
            <h3>🔒 Security Alert</h3>
            <ul>
              <li>If you did <strong>NOT</strong> reset your password, contact IT immediately</li>
              <li>Never share your password with anyone</li>
              <li>Use a strong, unique password that you don't use elsewhere</li>
              <li>Regularly update your password for better security</li>
            </ul>
          </div>
          
          <!-- Login Button -->
          <div class="login-button">
            <a href="${process.env.APP_URL || 'https://your-app.com'}/login">Login to Your Account</a>
          </div>
          
          <!-- Footer Information -->
          <div class="footer-info">
            <p>
              This is an automated confirmation email from Kadick Daily Monitoring System.<br>
              Please do not reply to this email.
            </p>
            
            <div class="contact-details">
              <p><strong>For security concerns, contact:</strong></p>
              <p>📧 it-support@kadickintegrated.com</p>
              <p>📞 [Company Phone Number] - IT Department Extension</p>
              <p>📍 [Company Address]</p>
            </div>
            
            <p>
              System Time: ${new Date().toLocaleString()}<br>
              Confirmation ID: ${Date.now().toString(36).toUpperCase()}
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
  passwordResetConfirmationTemplate
};