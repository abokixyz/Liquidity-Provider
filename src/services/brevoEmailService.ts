import * as SibApiV3Sdk from '@sendinblue/client';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  name?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: any;
}

class BrevoEmailService {
  private apiInstance!: SibApiV3Sdk.TransactionalEmailsApi;
  private defaultSender!: { name: string; email: string };
  private emailEnabled: boolean;

  constructor() {
    // Check if email is enabled
    this.emailEnabled = process.env.EMAIL_ENABLED !== 'false';
    
    console.log('📧 Brevo Email Service Debug:');
    console.log('- Email enabled:', this.emailEnabled);
    console.log('- BREVO_API_KEY exists:', process.env.BREVO_API_KEY ? 'YES' : 'NO');
    console.log('- BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL);
    console.log('- BREVO_SENDER_NAME:', process.env.BREVO_SENDER_NAME);

    if (!this.emailEnabled) {
      console.log('📧 Email service disabled for development');
      return;
    }

    // Initialize Brevo API client
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    
    // Configure API key
    if (process.env.BREVO_API_KEY) {
      this.apiInstance.setApiKey(
        SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
        process.env.BREVO_API_KEY
      );
    }
    
    // Default sender configuration
    this.defaultSender = {
      name: process.env.BREVO_SENDER_NAME || "ABOKI",
      email: process.env.BREVO_SENDER_EMAIL || "hello@aboki.xyz"
    };
    
    console.log('✅ Brevo Email Service initialized');
  }

  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    if (!this.emailEnabled) {
      console.log('📧 Email disabled - would have sent:', {
        to: options.to,
        subject: options.subject
      });
      return { success: true, messageId: 'disabled' };
    }

    if (!process.env.BREVO_API_KEY) {
      console.log('⚠️  BREVO_API_KEY not configured - skipping email');
      return { success: true, messageId: 'no-api-key' };
    }

    try {
      console.log(`📤 Sending email via Brevo API to: ${options.to}`);
      
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      
      sendSmtpEmail.subject = options.subject;
      sendSmtpEmail.sender = this.defaultSender;
      sendSmtpEmail.to = [{ 
        email: options.to, 
        name: options.name || options.to.split('@')[0] 
      }];
      sendSmtpEmail.htmlContent = options.html;

      const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      
      console.log(`✅ Email sent successfully to ${options.to}:`, (response as any).body?.messageId);
      
      return { 
        success: true, 
        messageId: (response as any).body?.messageId || 'sent'
      };
    } catch (error: any) {
      console.error('❌ Brevo email sending failed:', error.response?.body || error.message);
      
      // Don't throw error - just log it so auth flow continues
      console.log('⚠️  Authentication will continue without email');
      
      return { 
        success: false, 
        error: error.response?.body || error.message
      };
    }
  }

  async sendWelcomeEmail(name: string, email: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to ABOKI! 🚀</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${name}!</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            We're thrilled to have you join the ABOKI family! You've just taken the first step 
            towards smarter financial management.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Verify Email Address
            </a>
          </div>
          
          <div style="background: #e3f2fd; border: 1px solid #bbdefb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="color: #1565c0; margin: 0; font-size: 14px;">
              <strong>📋 Note:</strong> This verification link will expire in 24 hours.
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            If the button doesn't work, copy and paste this URL into your browser:<br>
            <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
          </p>
          
          <p style="color: #666;">
            Welcome to the ABOKI family!<br>
            <strong>The ABOKI Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: email,
      name: name,
      subject: 'Welcome to ABOKI - Verify Your Email 🚀',
      html
    });
  }

  async sendPasswordResetEmail(name: string, email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #FF6B6B; padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset Request 🔑</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${name}!</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            We received a request to reset your ABOKI account password. If you made this request, 
            click the button below to reset your password.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #FF6B6B; color: white; padding: 15px 30px; text-decoration: none; 
                      border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              Reset My Password
            </a>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              <strong>⚠️ Security Notice:</strong> This link will expire in 10 minutes for your security. 
              If you didn't request this password reset, please ignore this email.
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #FF6B6B; word-break: break-all;">${resetUrl}</a>
          </p>
          
          <p style="color: #666;">
            Best regards,<br>
            <strong>The ABOKI Security Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: email,
      name: name,
      subject: 'Reset Your ABOKI Password 🔑',
      html
    });
  }

  async sendPasswordResetConfirmation(name: string, email: string): Promise<void> {
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #4CAF50; padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset Successful! ✅</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${name}!</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Your ABOKI account password has been successfully reset. You can now log in 
            with your new password.
          </p>
          
          <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="color: #155724; margin: 0; font-size: 14px;">
              <strong>🔒 Security Tip:</strong> For your account security, make sure to use a strong, unique password 
              and don't share it with anyone.
            </p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${process.env.FRONTEND_URL}/login" 
               style="background: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; 
                      border-radius: 5px; font-weight: bold; display: inline-block;">
              Login to Your Account
            </a>
          </div>
          
          <p style="color: #666;">
            Welcome back to ABOKI!<br>
            <strong>The ABOKI Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: email,
      name: name,
      subject: 'Password Reset Successful - ABOKI ✅',
      html
    });
  }
}

export default new BrevoEmailService();