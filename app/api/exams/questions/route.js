import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { licenseQuestions, medicalQuestions } from "./questionsDB";
import { dbOne } from "../../../../lib/db";

function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const user = await dbOne("SELECT * FROM User WHERE id = ?", [session.user.id]);

    if (!user) return NextResponse.json({ error: "Brak użytkownika" }, { status: 404 });

    const requiredAmount = type === "license" ? 250 : 150;

    if (user.accountBalance < requiredAmount) {
      return NextResponse.json({ error: `Niewystarczające środki na koncie. Wymagane: ${requiredAmount} PLN` }, { status: 400 });
    }

    let questions = [];
    if (type === "license") {
      const basicQuestions = licenseQuestions.filter(q => q.type === "basic");
      const specialistQuestions = licenseQuestions.filter(q => q.type === "specialist");
      
      const selectedBasic = shuffle([...basicQuestions]).slice(0, 6);
      const selectedSpecialist = shuffle([...specialistQuestions]).slice(0, 4);
      
      questions = [...selectedBasic, ...selectedSpecialist];
    } else if (type === "medical") {
      questions = shuffle([...medicalQuestions]).slice(0, 10);
    } else {
      return NextResponse.json({ error: "Nieznany typ egzaminu" }, { status: 400 });
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Błąd podczas pobierania pytań:", error);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
