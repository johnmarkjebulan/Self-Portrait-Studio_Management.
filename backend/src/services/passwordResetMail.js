function resetConfig(env = process.env) {
  const baseUrl = env.PASSWORD_RESET_BASE_URL || env.RENDER_EXTERNAL_URL;
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return { base: url.origin, apiKey: env.BREVO_API_KEY, sender: env.BREVO_SENDER_EMAIL };
  } catch { return null; }
}
async function sendResetEmail(user, token, config) {
  const link = new URL('/reset-password', config.base);
  // Fragment is not transmitted in the web server's request URL or referrer.
  link.hash = new URLSearchParams({ token }).toString();
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'Pose and Pics Studio', email: config.sender }, to: [{email: user.email}], subject: 'Reset your Pose and Pics password', textContent: `Open this link to reset your password (valid for 15 minutes):\n${link.href}\n\nIf you did not request this, ignore this email.` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Password reset email provider returned ${response.status}`);
}
module.exports = { resetConfig, sendResetEmail };
