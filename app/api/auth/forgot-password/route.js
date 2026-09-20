import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../lib/db";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../../../../lib/mailer";

export async function POST(req) {
  try {
    const { email } = await req.json();

    if (!email || !email.trim()) {
      return NextResponse.json({ message: "Wymagany adres e-mail lub login." }, { status: 400 });
    }

    const input = email.trim();
    const cleanInput = input.toLowerCase();

    const user = await dbOne(`
      SELECT * FROM User 
      WHERE email = ? OR email = ? OR name = ? OR discordNick = ? OR name = ? OR discordNick = ?
      LIMIT 1
    `, [cleanInput, input, input, input, cleanInput, cleanInput]);

    if (!user || !user.email) {
      return NextResponse.json({ 
        message: "Nie znaleziono konta przypisanego do podanego adresu e-mail lub loginu. Upewnij się, że posiadasz założone konto w systemie BMS." 
      }, { status: 404 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); 

    await dbRun("DELETE FROM PasswordResetToken WHERE email = ?", [user.email]);

    const id = generateId();
    await dbRun(`
      INSERT INTO PasswordResetToken (id, email, token, expires, createdAt) 
      VALUES (?, ?, ?, ?, NOW())
    `, [id, user.email, token, expires]);

    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const origin = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL || "https://system.vsbojarlogistic.pl");
    
    const resetLink = `${origin}/reset-password?token=${token}`;
    const userName = user.firstName || user.name || user.email.split("@")[0];

    sendPasswordResetEmail(user.email, resetLink, userName).catch(e => console.error("Forgot password email error:", e));

    return NextResponse.json({ 
      message: "Link został pomyślnie wysłany na Twój adres e-mail.",
      targetEmail: user.email
    }, { status: 200 });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ message: `Wystąpił błąd: ${error.message}` }, { status: 500 });
  }
}
