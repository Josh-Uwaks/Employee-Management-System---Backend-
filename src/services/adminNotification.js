
// services/adminNotification.service.js
const nodemailer = require('nodemailer');

// Use the same transporter configuration as email.service.js
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send account locked notification to admins
 */
const sendAccountLockedNotification = async (user, adminEmails) => {
  try {
    if (!adminEmails || adminEmails.length === 0) {
      console.log('[ADMIN] No admin emails configured for notifications');
      return;
    }

    const mailOptions = {
      from: `"Kadick Security System" <${process.env.SMTP_USER}>`,
      to: adminEmails.join(', '),
      subject: `🔒 Account Locked: ${user.id_card} - ${user.first_name} ${user.last_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🔒 Account Locked</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Security Alert - Immediate Attention Required</p>
          </div>
          
          <div style="padding: 25px;">
            <h2 style="color: #dc3545; margin-top: 0;">Account Security Alert</h2>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #343a40;">Locked User Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 150px;">Employee ID:</td>
                  <td style="padding: 8px 0;"><strong>${user.id_card}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Name:</td>
                  <td style="padding: 8px 0;">${user.first_name} ${user.last_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Email:</td>
                  <td style="padding: 8px 0;">${user.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Region/Branch:</td>
                  <td style="padding: 8px 0;">${user.region} / ${user.branch}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Locked At:</td>
                  <td style="padding: 8px 0;">${new Date(user.lockedAt).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Reason:</td>
                  <td style="padding: 8px 0; color: #dc3545;">${user.lockedReason || '3 consecutive failed login attempts'}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #856404;">⚠️ Security Information</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Account was automatically locked after 3 consecutive failed login attempts</li>
                <li>User cannot login until account is unlocked by an administrator</li>
                <li>This could indicate a security breach attempt</li>
                <li>Please investigate and contact the user if necessary</li>
              </ul>
            </div>
            
            <div style="background-color: #e9f7fe; border: 1px solid #b3e0ff; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #004085;">🛠️ Required Action</h3>
              <ol style="margin: 0; padding-left: 20px;">
                <li>Review the failed login attempts</li>
                <li>Contact the user to verify if they were attempting to login</li>
                <li>Unlock the account through the admin panel if authorized</li>
                <li>Consider resetting the user's password for security</li>
              </ol>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center;">
              <p style="color: #6c757d; font-size: 12px;">
                This is an automated security notification from Kadick Daily Monitoring System.<br>
                Please do not reply to this email.
              </p>
              <p style="color: #6c757d; font-size: 12px;">
                System Time: ${new Date().toLocaleString()}<br>
                IP Address: ${process.env.SERVER_IP || 'N/A'}
              </p>
            </div>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #6c757d; font-size: 12px;">
              © ${new Date().getFullYear()} Kadick Integrated Limited. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[ADMIN] Account locked notification sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('[ADMIN] Failed to send locked account notification:', error.message);
    throw error;
  }
};

/**
 * Send account unlocked notification to user
 */
const sendAccountUnlockedNotification = async (user, unlockedByAdmin) => {
  try {
    const mailOptions = {
      from: `"Kadick Support" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `🔓 Your Account Has Been Unlocked`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🔓 Account Unlocked</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">You can now access your account</p>
          </div>
          
          <div style="padding: 25px;">
            <h2 style="color: #28a745; margin-top: 0;">Dear ${user.first_name},</h2>
            
            <p>Your account has been successfully unlocked by the system administrator.</p>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #343a40;">Account Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 150px;">Employee ID:</td>
                  <td style="padding: 8px 0;"><strong>${user.id_card}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Unlocked By:</td>
                  <td style="padding: 8px 0;">${unlockedByAdmin}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Unlocked At:</td>
                  <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #e9f7fe; border: 1px solid #b3e0ff; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #004085;">📝 Next Steps</h3>
              <ol style="margin: 0; padding-left: 20px;">
                <li>You can now login with your credentials</li>
                <li>If you forgot your password, contact support</li>
                <li>Ensure you're using the correct Employee ID format (KE175)</li>
                <li>Contact IT support if you experience any issues</li>
              </ol>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #856404;">🔒 Security Tips</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Use a strong, unique password</li>
                <li>Never share your credentials with anyone</li>
                <li>Log out from shared computers</li>
                <li>Contact support immediately if you suspect unauthorized access</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.APP_URL || 'https://kadick-daily-log-ef17f6711eae.herokuapp.com'}" 
                 style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Login to Your Account
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center;">
              <p style="color: #6c757d; font-size: 12px;">
                This is an automated notification from Kadick Daily Monitoring System.<br>
                Please contact support if you did not request this unlock.
              </p>
            </div>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #6c757d; font-size: 12px;">
              © ${new Date().getFullYear()} Kadick Integrated Limited. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[ADMIN] Account unlocked notification sent to user:', user.email);
    return info;
  } catch (error) {
    console.error('[ADMIN] Failed to send unlocked notification:', error.message);
    throw error;
  }
};

module.exports = {
  sendAccountLockedNotification,
  sendAccountUnlockedNotification
};
