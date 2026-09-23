/**
 * Jobs module SQL queries
 */

export const JobQueries = {
  getLatestApprovedJobPerUser: (placeholders) => `
    SELECT j.userId, j.endCity, j.date
    FROM Job j
    INNER JOIN (
      SELECT userId, MAX(date) AS maxDate
      FROM Job
      WHERE status = 'APPROVED' AND userId IN (${placeholders})
      GROUP BY userId
    ) latest ON j.userId = latest.userId AND j.date = latest.maxDate
    WHERE j.status = 'APPROVED'
  `,

  getMonthlyDistancePerUser: `
    SELECT userId, SUM(distance) AS totalDistance
    FROM Job
    WHERE status = 'APPROVED' AND date >= ?
    GROUP BY userId
  `
};
