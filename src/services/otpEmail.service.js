const {sendEmail} = require('./email.service')
const {otpEmailTemplate} = require('../templates/otpEmail.template')

const sendOtpEmail = async ({email, first_name, otp, id_card, password}) => {
    const html = otpEmailTemplate({
        name: first_name,
        otp,
        id_card,
        password
    })

    await sendEmail({
        to: email,
        subject: 'Your Account Details - Daily Monitoring System',
        html
    })
}

module.exports = {
    sendOtpEmail
};