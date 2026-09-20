import { dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import ApprovalsClient from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
    redirect("/dashboard");
  }

  let pendingUsers = [];
  let availableTrucks = [];
  
  try {
    pendingUsers = await dbAll(
      "SELECT id, name, email, createdAt, discordNick, firstName FROM User WHERE driverStatus = ? ORDER BY createdAt DESC",
      ["WAITING_FOR_APPROVAL"]
    );

    availableTrucks = await dbAll(
      "SELECT id, brand, model, plate FROM Truck WHERE assignedDriverId IS NULL"
    );
  } catch (error) {
    console.error("Błąd pobierania danych akceptacji:", error);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Akceptacja Kont</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">Zarządzaj nowymi profilami kierowców oczekującymi na dołączenie do firmy.</p>
      </div>
      
      <ApprovalsClient pendingUsers={pendingUsers} availableTrucks={availableTrucks} />
    </div>
  );
}
