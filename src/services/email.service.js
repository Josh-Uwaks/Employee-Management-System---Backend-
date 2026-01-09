const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
})

const sendEmail = async ({to, subject, html}) => {
    const mailOptions = {
        from: `"Daily Monitoring System" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html
    };
    
    try {  
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
    }
}

module.exports = {
    sendEmail
};