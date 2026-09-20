import { NextResponse } from "next/server";

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_CONTACT_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1397705505576845323/QjcdqLvfba4YPCbGFvBukXPh6bAfAw6NeUXxmbqXDFvWgZIi6RIlCdmNv5BC7SfUitMI";

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "Wszystkie pola (imię i nazwisko, email, treść) są wymagane." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Podano niepoprawny adres e-mail." },
        { status: 400 }
      );
    }

    const discordPayload = {
      username: "Bojar Logistic • Formularz",
      avatar_url: "https://vsbojarlogistic.pl/images/logo.png",
      embeds: [
        {
          title: "📬 Nowa wiadomość z formularza kontaktowego",
          color: 0x3b82f6, // Niebieski akcent (Tailwind blue-500)
          fields: [
            {
              name: "👤 Imię i nazwisko",
              value: name.trim(),
              inline: true,
            },
            {
              name: "📧 Adres e-mail",
              value: email.trim(),
              inline: true,
            },
            {
              name: "💬 Wiadomość",
              value: message.trim().slice(0, 1024), // Discord embed field limit
            },
          ],
          footer: {
            text: "Formularz kontaktowy • Bojar Logistic",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

    if (!discordRes.ok) {
      const errorText = await discordRes.text();
      console.error("Błąd wysyłania do webhooka Discord:", discordRes.status, errorText);
      return NextResponse.json(
        { error: "Nie udało się przesłać formularza do Discorda." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Wiadomość została wysłana!",
    });
  } catch (error) {
    console.error("Błąd w obsłudze formularza kontaktowego:", error);
    return NextResponse.json(
      { error: "Wystąpił wewnętrzny błąd serwera." },
      { status: 500 }
    );
  }
}
