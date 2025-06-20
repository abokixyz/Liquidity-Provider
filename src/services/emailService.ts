import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Debug Brevo credentials
    console.log('📧 Email Service Debug:');
    console.log('- BREVO_API_KEY exists:', process.env.BREVO_API_KEY ? 'YES' : 'NO');
    console.log('- BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL);
    console.log('- BREVO_SENDER_NAME:', process.env.BREVO_SENDER_NAME);

    this.transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.BREVO_SENDER_EMAIL,
        pass: process.env.BREVO_API_KEY
      },
      debug: process.env.NODE_ENV === 'development', // Enable debug in development
      logger: process.env.NODE_ENV === 'development'
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      console.log(`📤 Attempting to send email to: ${options.to}`);
      
      const mailOptions = {
        from: `${process.env.BREVO_SENDER_NAME} <${process.env.BREVO_SENDER_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        html: options.html
      };

      console.log('📋 Email config:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${options.to}:`, result.messageId);
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendWelcomeEmail(name: string, email: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #333; text-align: center;">Welcome to ABOKI!</h2>
        <p>Hi ${name},</p>
        <p>Thank you for registering with ABOKI. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>If the button doesn't work, you can copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">
          If you didn't create an account with ABOKI, please ignore this email.
        </p>
      </div>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Welcome to ABOKI - Verify Your Email',
      html
    });
  }

  async sendPasswordResetEmail(name: string, email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>You requested to reset your password for your ABOKI account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>If the button doesn't work, you can copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p><strong>This link will expire in 10 minutes for security reasons.</strong></p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">
          If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset Request - ABOKI',
      html
    });
  }

  async sendPasswordResetConfirmation(name: string, email: string): Promise<void> {
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #28a745; text-align: center;">Password Reset Successful</h2>
        <p>Hi ${name},</p>
        <p>Your password has been successfully reset for your ABOKI account.</p>
        <p>If you didn't make this change, please contact our support team immediately.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">
          This is an automated message from ABOKI.
        </p>
      </div>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset Successful - ABOKI',
      html
    });
  }
}

export default new EmailService();