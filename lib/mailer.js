import nodemailer from "nodemailer";

export const sendApprovalEmail = async (userEmail, userName, isApproved, rejectionReason = "") => {
  if (!process.env.SMTP_HOST) {
    console.warn("SMTP configuration missing. Email not sent.");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: String(process.env.SMTP_PORT) === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const subject = isApproved 
      ? "Witaj w Bojar Logistic! Twoje konto zostało zaakceptowane" 
      : "Zgłoszenie do Bojar Logistic odrzucone";

    const headerBorderColor = isApproved ? "#22c55e" : "#ef4444";
    const badgeBgColor = isApproved ? "#f0fdf4" : "#fef2f2";
    const badgeBorderColor = isApproved ? "#bbf7d0" : "#fecaca";
    const badgeTextColor = isApproved ? "#16a34a" : "#dc2626";
    const badgeText = isApproved ? "Konto Aktywowane" : "Zgłoszenie Odrzucone";
      
    const baseUrl = process.env.NEXTAUTH_URL || 'https://system.vsbojarlogistic.pl';
      
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 10px;">
        <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e4e4e7;">
              
              <!-- Header (BMS Brand with Logos) -->
              <tr>
                <td style="background-color: #18181b; padding: 24px 40px; border-bottom: 4px solid ${headerBorderColor};">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="left" style="vertical-align: middle;">
                        <img src="${baseUrl}/logo.png" alt="Bojar" style="height: 36px; width: auto; vertical-align: middle; display: inline-block; margin-right: 15px;" />
                        <img src="${baseUrl}/logo-full-outline.png" alt="BMS" style="height: 30px; width: auto; vertical-align: middle; display: inline-block; border-left: 1px solid #3f3f46; padding-left: 15px;" />
                      </td>
                      <td align="right" style="vertical-align: middle; text-align: right;">
                        <span style="font-size: 14px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; display: block;">BOJAR MANAGER SYSTEM</span>
                        <span style="font-size: 11px; color: #a1a1aa; font-weight: 500;">Bojar Group</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 40px 40px 30px 40px;">
                  <!-- Status Badge -->
                  <div style="display: inline-block; background-color: ${badgeBgColor}; border: 1px solid ${badgeBorderColor}; border-radius: 6px; padding: 6px 12px; margin-bottom: 24px;">
                    <span style="color: ${badgeTextColor}; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${badgeText}</span>
                  </div>
                  
                  <h1 style="margin: 0 0 20px 0; font-size: 24px; color: #18181b; font-weight: 800; letter-spacing: -0.5px;">
                    Cześć, ${userName}!
                  </h1>
                  
                  ${isApproved ? `
                  <p style="margin: 0 0 16px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
                    Mamy przyjemność poinformować, że Twoje zgłoszenie rekrutacyjne do wirtualnej firmy transportowej <strong>Bojar Logistic</strong> zostało pomyślnie zaakceptowane przez Zarząd.
                  </p>
                  
                  <p style="margin: 0 0 16px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
                    Twoje konto kierowcy jest już aktywne w naszym systemie. Zarząd przypisał również pierwszy pojazd do Twojego profilu, dzięki czemu możesz bez przeszkód wyruszyć w trasę.
                  </p>

                  <div style="background-color: #fafafa; border-left: 4px solid #22c55e; padding: 15px 20px; margin: 25px 0; border-radius: 0 6px 6px 0;">
                    <p style="margin: 0; font-size: 14px; color: #52525b; line-height: 1.6;">
                      <strong>Co teraz?</strong> Zaloguj się do panelu kierowcy przy użyciu swoich danych rejestracyjnych. W sekcji profilu znajdziesz informacje o przypisanej ciężarówce oraz aktualnych zleceniach.
                    </p>
                  </div>
                  
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0 15px 0;">
                    <tr>
                      <td align="center">
                        <a href="${process.env.NEXTAUTH_URL || 'https://system.vsbojarlogistic.pl'}/login" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: bold; padding: 16px 32px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                          Zaloguj się do Panelu
                        </a>
                      </td>
                    </tr>
                  </table>
                  ` : `
                  <p style="margin: 0 0 16px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
                    Dziękujemy za przesłanie zgłoszenia rekrutacyjnego do wirtualnej firmy transportowej <strong>Bojar Logistic</strong>.
                  </p>
                  
                  <p style="margin: 0 0 16px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
                    Po weryfikacji Twojego zgłoszenia przez Zarząd, z przykrością informujemy, że Twoja aplikacja została odrzucona.
                  </p>

                  ${rejectionReason ? `
                  <div style="background-color: #fafafa; border-left: 4px solid #ef4444; padding: 15px 20px; margin: 25px 0; border-radius: 0 6px 6px 0;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: #71717a; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Powód decyzji Zarządu:</p>
                    <p style="margin: 0; font-size: 14px; color: #18181b; line-height: 1.6; font-style: italic;">
                      "${rejectionReason}"
                    </p>
                  </div>
                  ` : ""}
                  
                  <p style="margin: 20px 0 0 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
                    Dziękujemy za poświęcony czas oraz zainteresowanie naszą firmą. Życzymy powodzenia w dalszej karierze kierowcy na wirtualnych szlakach.
                  </p>
                  
                  <p style="margin: 15px 0 0 0; font-size: 14px; color: #71717a; line-height: 1.6;">
                    W razie pytań lub wątpliwości zapraszamy do kontaktu poprzez nasz oficjalny serwer Discord.
                  </p>
                  `}
                  
                  <p style="margin: 25px 0 0 0; font-size: 15px; color: #3f3f46; line-height: 1.6; border-top: 1px solid #f4f4f5; padding-top: 20px;">
                    Życzymy szerokiej drogi!<br>
                    <strong style="color: #18181b;">Zarząd Bojar Group</strong>
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #18181b; padding: 30px 40px; text-align: center;">
                  <p style="margin: 0; color: #a1a1aa; font-size: 13px;">
                    Wiadomość wygenerowana automatycznie przez Bojar Manager System.
                  </p>
                  <p style="margin: 5px 0 0 0; color: #52525b; font-size: 12px;">
                    © ${new Date().getFullYear()} Bojar Logistic. Wszystkie prawa zastrzeżone.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"Bojar Logistic" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject,
      html,
    });
    
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

export const sendRegistrationEmail = async (userEmail, userName) => {
  if (!process.env.SMTP_HOST) {
    console.warn("SMTP configuration missing. Email not sent.");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: String(process.env.SMTP_PORT) === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
              
              <!-- Hero Banner Image -->
              <tr>
                <td>
                  <img src="${process.env.NEXTAUTH_URL || 'https://system.vsbojarlogistic.pl'}/emails/welcome_banner_new.png" alt="Witamy w systemie" width="600" style="display: block; width: 100%; height: auto;" />
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
                  <h1 style="margin: 0 0 20px 0; font-size: 24px; color: #18181b; font-weight: 800; letter-spacing: -0.5px;">
                    Witaj w zespole, ${userName}!
                  </h1>
                  
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #52525b; line-height: 1.6;">
                    Dziękujemy za rejestrację w wirtualnej firmie transportowej <strong>Bojar Logistic</strong>. Twoje konto zostało pomyślnie utworzone.
                  </p>
                  
                  <div style="background-color: #fafafa; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 25px 0;">
                    <p style="margin: 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
                      Obecnie Twój profil oczekuje na weryfikację przez nasz Zarząd. Gdy Twoje podanie zostanie zaakceptowane, otrzymasz kolejną wiadomość e-mail z potwierdzeniem aktywacji konta.
                    </p>
                  </div>
                  
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 35px;">
                    <tr>
                      <td align="center">
                        <a href="${process.env.NEXTAUTH_URL || 'https://system.vsbojarlogistic.pl'}/login" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; padding: 16px 32px; border-radius: 8px; text-transform: uppercase; letter-spacing: 1px;">
                          Zaloguj się do systemu
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #18181b; padding: 30px 40px; text-align: center;">
                  <p style="margin: 0; color: #a1a1aa; font-size: 13px;">
                    Wiadomość wygenerowana automatycznie przez Bojar Manager System.
                  </p>
                  <p style="margin: 5px 0 0 0; color: #52525b; font-size: 12px;">
                    © ${new Date().getFullYear()} Bojar Logistic. Wszystkie prawa zastrzeżone.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"Bojar Logistic" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject: "Witamy w Bojar Logistic! Potwierdzenie rejestracji",
      html,
    });
    
    return true;
  } catch (error) {
    console.error("Error sending registration email:", error);
    return false;
  }
};

export const sendPasswordResetEmail = async (userEmail, resetLink, userName = "Kierowco") => {
  if (!process.env.SMTP_HOST) {
    console.warn("SMTP configuration missing. Email not sent.");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_PORT) === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || 'https://system.vsbojarlogistic.pl';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Resetowanie hasła - Bojar Logistic</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #09090b; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 10px;">
        <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #18181b; border-radius: 16px; overflow: hidden; border: 1px solid #27272a; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
              
              <!-- Hero Banner Image -->
              <tr>
                <td style="background-color: #09090b; text-align: center;">
                  <img src="${baseUrl}/emails/reset_banner.png" alt="Resetowanie hasła - Bojar Logistic" width="600" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;" onError="this.style.display='none';" />
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 35px; background-color: #18181b;">
                  <h1 style="margin: 0 0 16px 0; font-size: 24px; color: #ffffff; font-weight: 800; tracking: -0.5px;">
                    Cześć, ${userName}!
                  </h1>
                  
                  <p style="margin: 0 0 20px 0; font-size: 15px; color: #a1a1aa; line-height: 1.6;">
                    Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta kierowcy w wirtualnej firmie transportowej <strong>Bojar Logistic</strong>.
                  </p>
                  
                  <!-- Warning / Info Box -->
                  <div style="background-color: #27272a; border-left: 4px solid #eab308; border-radius: 6px; padding: 18px 20px; margin: 25px 0;">
                    <p style="margin: 0; font-size: 14px; color: #f4f4f5; line-height: 1.6;">
                      <strong>⚠️ Ważne:</strong> Poniższy link jest jednorazowy i wygaśnie automatycznie po upływie <strong>1 godziny</strong> ze względów bezpieczeństwa.
                    </p>
                  </div>

                  <p style="margin: 0 0 30px 0; font-size: 14px; color: #71717a; line-height: 1.6;">
                    Kliknij w poniższy przycisk, aby przejść do formularza zmiany hasła i ustawić nowe hasło do swojego konta BMS:
                  </p>
                  
                  <!-- CTA Button -->
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 10px 0 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #ffffff; color: #09090b; text-decoration: none; font-size: 15px; font-weight: 800; padding: 16px 36px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(255,255,255,0.1);">
                          Ustaw Nowe Hasło →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Fallback Link text -->
                  <div style="margin-top: 25px; pt-20; border-t: 1px solid #27272a;">
                    <p style="margin: 15px 0 5px 0; font-size: 12px; color: #71717a;">
                      Jeśli przycisk nie działa, skopiuj poniższy link i wklej go w pasek adresu przeglądarki:
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #3b82f6; word-break: break-all;">
                      ${resetLink}
                    </p>
                  </div>

                  <p style="margin: 25px 0 0 0; font-size: 13px; color: #71717a; line-height: 1.5;">
                    Jeśli to nie Ty zgłaszałeś prośbę o zmianę hasła, zachowaj spokój – Twoje konto jest bezpieczne. Możesz zignorować tę wiadomość.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #09090b; padding: 25px 35px; border-top: 1px solid #27272a; text-align: center;">
                  <p style="margin: 0; color: #71717a; font-size: 12px; font-weight: 600;">
                    Bojar Manager System • Bojar Logistic
                  </p>
                  <p style="margin: 6px 0 0 0; color: #52525b; font-size: 11px;">
                    © ${new Date().getFullYear()} Bojar Logistic. Wszystkie prawa zastrzeżone.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"Bojar Logistic System" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject: "🔑 Zresetuj swoje hasło - Bojar Logistic",
      html,
    });
    
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
};
