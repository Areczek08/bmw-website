const { dbSession } = require('../lib/db.js');

async function test() {
  const t0 = performance.now();
  const result = await dbSession(async (db) => {
    const drivers = await db.all(`
      SELECT id, name, firstName, discordNick, 
             IF(image IS NOT NULL AND image != '', 
                IF(image LIKE 'http%', image, CONCAT('/api/user/', id, '/avatar')), 
                NULL) AS image
      FROM User
      WHERE role IN ('DRIVER', 'DISPATCHER', 'BOARD', 'OWNER')
        AND driverStatus NOT IN ('WAITING_FOR_APPROVAL', 'INACTIVE')
    `);

    if (drivers.length === 0) return [];
    const driverIds = drivers.map(d => d.id);
    const idsStr = driverIds.map(() => '?').join(',');

    const latestJobs = await db.all(`
      SELECT j.userId, j.endCity, j.date
      FROM Job j
      INNER JOIN (
        SELECT userId, MAX(date) AS maxDate
        FROM Job
        WHERE status = 'APPROVED' AND userId IN (${idsStr})
        GROUP BY userId
      ) latest ON j.userId = latest.userId AND j.date = latest.maxDate
      WHERE j.status = 'APPROVED'
    `, driverIds);

    const trucks = await db.all(`
      SELECT id, assignedDriverId, brand, model, plate, fuelLevel, mileage, location, attachedTrailerId
      FROM Truck
      WHERE assignedDriverId IN (${idsStr})
    `, driverIds);

    const trailerIds = [...new Set(trucks.map(t => t.attachedTrailerId).filter(Boolean))];
    let trailers = [];
    if (trailerIds.length > 0) {
      const trIdsStr = trailerIds.map(() => '?').join(',');
      trailers = await db.all(`
        SELECT id, brand, model, plate
        FROM Trailer
        WHERE id IN (${trIdsStr})
      `, trailerIds);
    }

    return { 
      driversCount: drivers.length, 
      jobsCount: latestJobs.length, 
      trucksCount: trucks.length, 
      trailersCount: trailers.length, 
      sampleDriver: drivers[0],
      sampleJob: latestJobs[0]
    };
  });
  const tDuration = performance.now() - t0;
  console.log(`Optimized map query test completed in ${tDuration.toFixed(2)}ms:`);
  console.log(result);
}
test().catch(console.error);
