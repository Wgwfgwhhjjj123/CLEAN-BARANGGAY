# Password reset email setup

Password-reset and resident-login codes are sent through Brevo's HTTPS API.
They do not use Gmail SMTP, which is commonly blocked by hosting platforms.

## Configure local development

1. In Brevo, create an API key under **SMTP & API → API keys** and verify the
   sender email address (or its domain).
2. Set `BREVO_API_KEY` and `MAIL_DEFAULT_SENDER` in the project-root `.env`
   file. The sender must exactly match the email verified in Brevo.
3. Restart the Flask app after changing `.env`. Keep the API key private and
   do not commit or share the `.env` file.

## Configure the Render web service

1. In Brevo, create an API key under **SMTP & API → API keys**. Use an API
   key, not an SMTP key.
2. Verify the sender email address (or its domain) in Brevo.
3. In Render, open the web service and go to **Environment**. Add:

   | Key | Value |
   | --- | --- |
   | `BREVO_API_KEY` | The Brevo API key; keep it secret |
   | `MAIL_DEFAULT_SENDER` | The exact email address verified in Brevo |
   | `MAIL_SENDER_NAME` | Optional; for example, `BasuReport` |

4. Save the changes and redeploy the service.
5. Check the Render service logs after requesting a reset code. Missing
   variables are logged as `Password reset email service is not configured`;
   provider errors are logged as `Could not send password reset OTP`. Never
   publish the API key or paste it into source code.

The `.env` file on your computer is not automatically available to a Render
service. Configure these variables in Render's Environment settings.
