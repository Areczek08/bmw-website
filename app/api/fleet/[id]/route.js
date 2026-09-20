import { NextResponse } from "next/server";
import { dbOne, dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getBaseDetails } from "../../../../lib/bases";

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { id } = await params;

    let vehicle = await dbOne("SELECT * FROM Truck WHERE id = ?", [id]);
    let vehicleType = "truck";

    if (vehicle) {
      if (vehicle.companyId) {
        const base = await dbOne("SELECT * FROM Company WHERE id = ?", [vehicle.companyId]);
        vehicle.companyBase = base;
      }
      if (vehicle.assignedDriverId) {
        const driver = await dbOne("SELECT id, name FROM User WHERE id = ?", [vehicle.assignedDriverId]);
        if (driver) {
          const jobs = await dbAll("SELECT endCity FROM Job WHERE userId = ? AND status = 'APPROVED' ORDER BY date DESC LIMIT 1", [driver.id]);
          driver.jobs = jobs;
        }
        vehicle.assignedDriver = driver || null;
      }
      if (vehicle.attachedTrailerId) {
        vehicle.attachedTrailer = await dbOne("SELECT * FROM Trailer WHERE id = ?", [vehicle.attachedTrailerId]);
      }
      vehicle.history = await dbAll("SELECT * FROM VehicleHistory WHERE truckId = ? ORDER BY date DESC", [id]);
    } else {
      vehicle = await dbOne("SELECT * FROM Trailer WHERE id = ?", [id]);
      if (vehicle) {
        vehicleType = "trailer";
        const attachedTruck = await dbOne("SELECT id, fleetNumber, plate, assignedDriverId FROM Truck WHERE attachedTrailerId = ?", [id]);
        if (attachedTruck) {
          if (attachedTruck.assignedDriverId) {
            const driver = await dbOne("SELECT id, name FROM User WHERE id = ?", [attachedTruck.assignedDriverId]);
            if (driver) {
              const jobs = await dbAll("SELECT endCity FROM Job WHERE userId = ? AND status = 'APPROVED' ORDER BY date DESC LIMIT 1", [driver.id]);
              driver.jobs = jobs;
            }
            attachedTruck.assignedDriver = driver || null;
          }
          vehicle.attachedTruck = attachedTruck;
        }
        vehicle.history = await dbAll("SELECT * FROM VehicleHistory WHERE trailerId = ? ORDER BY date DESC", [id]);
      }
    }

    if (!vehicle) {
      return NextResponse.json({ error: "Nie znaleziono pojazdu" }, { status: 404 });
    }

    if (vehicle.companyBase) {
      const details = getBaseDetails(vehicle.companyBase.id);
      vehicle.companyBase = {
        ...vehicle.companyBase,
        imageUrl: details.imageUrl,
        description: details.description,
        amenities: details.amenities
      };
    }

    return NextResponse.json({ vehicle, vehicleType });
  } catch (error) {
    console.error("Błąd podczas pobierania pojazdu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania pojazdu." }, { status: 500 });
  }
}
