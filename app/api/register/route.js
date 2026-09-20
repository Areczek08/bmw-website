import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../lib/db";
import bcrypt from "bcryptjs";
import { sendRegistrationEmail } from "../../../lib/mailer";

export async function POST(req) {
  try {
    const { name, firstName, discordNick, email, password, recaptchaToken } = await req.json();

    if (!name || !firstName || !email || !password || !recaptchaToken) {
      return NextResponse.json({ message: "Brakujące dane lub brak weryfikacji CAPTCHA." }, { status: 400 });
    }

    // Weryfikacja reCAPTCHA u wujka Google
    const secretKey = process.env.RECAPTCHA_SECRET_KEY || "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";
    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;
    
    try {
      const captchaRes = await fetch(verificationUrl, { method: "POST" });
      const captchaData = await captchaRes.json();
      
      if (!captchaData.success) {
        return NextResponse.json({ message: "Weryfikacja reCAPTCHA nie powiodła się." }, { status: 400 });
      }
    } catch (err) {
      return NextResponse.json({ message: "Błąd serwera podczas weryfikacji CAPTCHA." }, { status: 500 });
    }

    const existingUser = await dbOne("SELECT id FROM User WHERE email = ?", [email]);

    if (existingUser) {
      return NextResponse.json({ message: "Użytkownik z tym emailem już istnieje." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = generateId();

    await dbRun(
      `INSERT INTO User (id, name, firstName, discordNick, email, password, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, name, firstName, discordNick, email, hashedPassword]
    );

    // Send registration email
    try {
      await sendRegistrationEmail(email, name);
    } catch (e) {
      console.error('Email error:', e);
    }

    return NextResponse.json({ message: "Zarejestrowano pomyślnie." }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Wystąpił błąd podczas rejestracji." }, { status: 500 });
  }
}
