const { sendEmail } = require('./email.service');
const { passwordResetEmailTemplate } = require('../templates/passwordResetEmail.template');
const { passwordResetConfirmationTemplate } = require('../templates/passwordResetConfirmation.template');
const { passwordChangeConfirmationTemplate } = require('../templates/passwordChangeConfirmation.template');

const sendPasswordResetEmail = async ({ email, first_name, resetToken }) => {
    const html = passwordResetEmailTemplate({
        name: first_name,
        resetToken
    });

    await sendEmail({
        to: email,
        subject: 'Reset Your Password - Daily Monitoring System',
        html
    });
};

const sendPasswordResetConfirmationEmail = async ({ email, first_name }) => {
    const html = passwordResetConfirmationTemplate({
        name: first_name
    });

    await sendEmail({
        to: email,
        subject: 'Password Reset Successful - Daily Monitoring System',
        html
    });
};

const sendPasswordChangeConfirmationEmail = async ({ email, first_name }) => {
    const html = passwordChangeConfirmationTemplate({
        name: first_name
    });

    await sendEmail({
        to: email,
        subject: 'Password Changed Successfully - Daily Monitoring System',
        html
    });
};

module.exports = {
    sendPasswordResetEmail,
    sendPasswordResetConfirmationEmail,
    sendPasswordChangeConfirmationEmail
};