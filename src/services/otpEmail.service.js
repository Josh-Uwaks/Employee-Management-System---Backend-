
const {sendEmail} = require('./email.service')
const {otpEmailTemplate} = require('../templates/otpEmail.template')

const sendOtpEmail = async ({email, first_name, otp}) => {
    const html = otpEmailTemplate({
        name: first_name,
        otp
    })

    await sendEmail({
        to: email,
        subject: 'Verify Your Account - Daily Monitoring System',
        html
    })
}

module.exports = {
    sendOtpEmail
};