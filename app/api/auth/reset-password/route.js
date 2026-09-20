import { NextResponse } from "next/server";
import { dbOne, dbRun } from "../../../../lib/db";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ message: "Brakujące dane." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ message: "Hasło musi mieć minimum 6 znaków." }, { status: 400 });
    }

    const resetRecord = await dbOne("SELECT * FROM PasswordResetToken WHERE token = ?", [token]);

    if (!resetRecord) {
      return NextResponse.json({ message: "Nieprawidłowy lub wygasły token." }, { status: 400 });
    }

    if (new Date() > new Date(resetRecord.expires)) {
      await dbRun("DELETE FROM PasswordResetToken WHERE id = ?", [resetRecord.id]);
      return NextResponse.json({ message: "Token wygasł. Wygeneruj nowy link." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await dbRun("UPDATE User SET password = ?, updatedAt = NOW() WHERE email = ?", [hashedPassword, resetRecord.email]);

    await dbRun("DELETE FROM PasswordResetToken WHERE id = ?", [resetRecord.id]);

    return NextResponse.json({ message: "Hasło zostało pomyślnie zmienione." }, { status: 200 });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas resetowania hasła." }, { status: 500 });
  }
}
