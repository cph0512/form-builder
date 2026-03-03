const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendPasswordResetEmail = async (to, name, resetLink) => {
  await transporter.sendMail({
    from: `"VeloPulse" <${process.env.SMTP_USER}>`,
    to,
    subject: '密碼重設請求',
    html: `
      <div style="font-family:'Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:#1a56db;padding:12px 24px;border-radius:8px;">
            <span style="color:#fff;font-size:20px;font-weight:700;">VeloPulse</span>
          </div>
        </div>
        <div style="background:#fff;padding:32px;border-radius:8px;border:1px solid #e2e8f0;">
          <h2 style="color:#1e293b;margin:0 0 16px;">密碼重設</h2>
          <p style="color:#475569;line-height:1.6;">您好，${name}，</p>
          <p style="color:#475569;line-height:1.6;">我們收到您的密碼重設請求。請點擊下方按鈕重設密碼：</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetLink}"
              style="display:inline-block;padding:14px 32px;background:#1a56db;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
              重設密碼
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;">此連結將在 <strong>30 分鐘</strong>後失效。</p>
          <p style="color:#94a3b8;font-size:13px;line-height:1.6;">如果您沒有發出此請求，請忽略此信件，您的密碼不會被更改。</p>
        </div>
        <p style="color:#cbd5e1;font-size:12px;text-align:center;margin-top:20px;">
          © ${new Date().getFullYear()} VeloPulse 智慧表單平台
        </p>
      </div>
    `,
  });
};

module.exports = { sendPasswordResetEmail };
